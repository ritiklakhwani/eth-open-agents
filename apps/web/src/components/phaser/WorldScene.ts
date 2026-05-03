import * as Phaser from 'phaser'
import type { Zone } from 'shared-types'
import { MultiplayerClient } from './MultiplayerClient'
import { showChatBubble } from './ChatBubble'
import { isZone, onZoneEnter } from './zones'

interface ZoneData {
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
  label?: string
}

interface WorldSceneInit {
  petId: number
  socketServerUrl?: string
}

/**
 * Procedural retro arcade world scene. Renders 6 colored zones with pixel-style
 * borders + zone labels in NES font. Player sprite is a solid colored block
 * (placeholder until Replicate sprites are wired). Uses Karmanay's
 * MultiplayerClient + ChatBubble + zones helpers.
 */
export class WorldScene extends Phaser.Scene {
  private petId!: number
  private serverUrl!: string

  // Game state
  private player!: Phaser.GameObjects.Rectangle
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private otherPets = new Map<number, Phaser.GameObjects.Rectangle>()
  private petSprites = new Map<number, Phaser.GameObjects.Image>()  // overlays the rectangles
  private spriteLoadAttempted = new Set<number>()
  private currentZone: Zone = 'park'
  private zoneRects: Phaser.GameObjects.Zone[] = []
  private partnerRects: Phaser.GameObjects.Zone[] = []
  private currentPartner: string | null = null
  private isFollowingPlayer = true
  private mp!: MultiplayerClient

  // Position broadcast throttle
  private lastBroadcast = 0
  private readonly BROADCAST_HZ = 10 // 10 broadcasts per second

  // Walking polish — per-pet dust spawn timer + last-position tracker so we
  // only emit dust when a pet actually moved (not when standing still).
  private dustEmitTimers = new Map<number, number>()
  private prevPositions  = new Map<number, { x: number; y: number }>()

  // Pond ripple FX — bounds captured at scene init, per-pet emit throttle so
  // any pet (player or NPC) standing in / wading through the pond rectangle
  // sends out cyan ripple rings every ~350ms. Visible cue that the pond is
  // a real interactive water surface, not just decoration.
  private pondBounds: { x: number; y: number; w: number; h: number } | null = null
  private rippleEmitTimers = new Map<number, number>()
  // Pee FX — fires when a pet stands on the bank corner of the pond. Per-pet
  // cooldown so the same pet doesn't pee back-to-back (15s).
  private peeEmitTimers = new Map<number, number>()

  // Per-pet name label — small pixel text floated above the sprite so users
  // can identify which pet is which at a glance. Populated from the pet's
  // `name` field on the same API call that loads the sprite.
  private petLabels = new Map<number, Phaser.GameObjects.Text>()

  constructor() {
    super('WorldScene')
  }

  init(data: WorldSceneInit) {
    this.petId = data.petId
    this.serverUrl = data.socketServerUrl ?? 'http://localhost:3001'
  }

  preload() {
    this.load.json('world-map', '/world.tmj')
    this.load.tilemapTiledJSON('world-tilemap', '/world.tmj')
    this.load.image('tiny-town', '/tilesets/tiny-town/tilemap.png')
    // AI-generated cozy night-town background (1024x1024, scaled to world).
    this.load.image('world-bg', '/world-bg.png')
    // Partner logos — keyed by the `partner` property on each partner zone.
    this.load.image('logo-gensyn-axl', '/logos/gensyn.png')
    this.load.image('logo-ens',        '/logos/ens.png')
    this.load.image('logo-keeperhub',  '/logos/keeperhub.png')
    this.load.image('logo-0g',         '/logos/0g.png')
  }

  create() {
    const map = this.cache.json.get('world-map') as {
      width: number
      height: number
      tilewidth: number
      tileheight: number
      layers: Array<{ name: string; type: string; objects?: Array<{ name: string; x: number; y: number; width: number; height: number; properties?: Array<{ name: string; value: string | boolean }> }> }>
    }

    const worldW = map.width * map.tilewidth
    const worldH = map.height * map.tileheight

    // Background — deep navy from our palette
    this.cameras.main.setBackgroundColor(0x0a0c2e)

    const worldWForBg = map.width * map.tilewidth
    const worldHForBg = map.height * map.tileheight

    // AI-generated cozy night-town background. Scales 1024x1024 into world dims.
    // Sits at depth -10 so player sprites, zone labels, partner labels render on top.
    if (this.textures.exists('world-bg')) {
      this.add.image(0, 0, 'world-bg')
        .setOrigin(0, 0)
        .setDisplaySize(worldWForBg, worldHForBg)
        .setDepth(-10)
    }

    // Render zones — for the main 7 zones we now ONLY draw labels + decorative
    // overlays (the AI bg supplies the visuals). Partner sub-zones get their own
    // distinct treatment (small icon plate + label + glow).
    const zonesLayer = map.layers.find(l => l.name === 'zones' && l.type === 'objectgroup')
    if (!zonesLayer || !zonesLayer.objects) {
      console.error('[WorldScene] zones layer not found in world.tmj')
      return
    }

    const allObjects = zonesLayer.objects
    const partnerObjects = allObjects.filter(o => o.name?.startsWith('partner-'))
    const mainZones = allObjects.filter(o => !o.name?.startsWith('partner-'))

    const zoneData: ZoneData[] = mainZones.map(o => ({
      name: o.name,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      color: String(o.properties?.find(p => p.name === 'color')?.value ?? '#333333'),
      label: String(o.properties?.find(p => p.name === 'label')?.value ?? o.name.toUpperCase()),
    }))

    // Only the LABEL pass — skip procedural fills/decor since the AI bg has them.
    for (const z of zoneData) {
      this.renderZoneLabel(z)
    }

    // Partner integration buildings — labels + icons + glow.
    for (const p of partnerObjects) {
      const prop = (k: string) => String(p.properties?.find(pr => pr.name === k)?.value ?? '')
      this.renderPartnerLabel({
        name: p.name,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        color:   prop('color')   || '#888888',
        label:   prop('label')   || p.name,
        partner: prop('partner'),
        tagline: prop('tagline'),
      })
    }

    // ── Tiled tilemap overlay (Kenney Tiny Town) ────────────────────────────
    // Procedural rendering above is the fallback. As the user paints tiles in
    // Tiled, painted cells appear here at depth 1-3 and cover the procedural
    // shapes underneath. Empty cells stay transparent, so a half-painted map
    // shows tilemap where painted + procedural where not.
    const tilemap = this.make.tilemap({ key: 'world-tilemap' })
    const tileset = tilemap.addTilesetImage('tiny-town', 'tiny-town')
    let collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null
    if (tileset) {
      const mkLayer = (name: string, depth: number) => {
        const layer = tilemap.createLayer(name, tileset, 0, 0) as
          | Phaser.Tilemaps.TilemapLayer
          | null
        layer?.setDepth(depth)
        return layer
      }
      mkLayer('ground', 1)
      mkLayer('buildings', 2)
      mkLayer('decor', 3)
      collisionLayer = mkLayer('collision', 4)
      if (collisionLayer) {
        collisionLayer.setVisible(false)
        collisionLayer.setCollisionByExclusion([-1, 0])
      }
    } else {
      console.warn('[WorldScene] tiny-town tileset image missing; tilemap disabled')
    }

    // Build invisible Phaser zones for trigger overlap detection — main zones only.
    this.zoneRects = mainZones.map(o => {
      const z = this.add.zone(
        o.x + o.width / 2,
        o.y + o.height / 2,
        o.width,
        o.height,
      )
      z.setName(o.name)
      this.physics.world.enable(z)
      const body = z.body as Phaser.Physics.Arcade.Body
      body.setAllowGravity(false)
      body.moves = false
      // Capture pond rectangle bounds for the ripple-emit logic in update().
      // OVERRIDDEN below — the world.tmj rect doesn't match the AI-painted
      // pond in world-bg.png. We use a hand-tuned 142x142 box matching the
      // visible water as measured by the user.
      if (o.name === 'pond') {
        this.pondBounds = { x: o.x, y: o.y, w: o.width, h: o.height }
      }
      return z
    })

    // Hand-tuned pond bounds — 142x142 matching the visible water in
    // world-bg.png. Adjust x/y if the painted pond ever shifts.
    this.pondBounds = { x: 60, y: 595, w: 142, h: 142 }

    // Partner integration buildings — separate trigger pool, emit `partner-enter`.
    this.partnerRects = partnerObjects.map(o => {
      const z = this.add.zone(
        o.x + o.width / 2,
        o.y + o.height / 2,
        o.width,
        o.height,
      )
      z.setName(o.name)
      z.setData('partner', o.properties?.find(p => p.name === 'partner')?.value ?? '')
      z.setData('label',   o.properties?.find(p => p.name === 'label')?.value ?? o.name)
      this.physics.world.enable(z)
      const body = z.body as Phaser.Physics.Arcade.Body
      body.setAllowGravity(false)
      body.moves = false
      return z
    })

    // World boundaries
    this.physics.world.setBounds(0, 0, worldW, worldH)

    // Player — invisible physics rect; the loaded sprite Image does the
    // rendering. If no sprite is available, the rect stays invisible (no
    // box-on-screen fallback per user request — only image-backed pets show).
    this.player = this.add.rectangle(768, 600, 24, 24, 0xff1e8e, 0)
    this.player.setStrokeStyle(0)
    this.player.setDepth(40)
    this.physics.add.existing(this.player)
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.setCollideWorldBounds(true)
    if (collisionLayer) this.physics.add.collider(this.player, collisionLayer)

    // Building-body walls intentionally removed per user request — pets walk
    // freely everywhere. World bounds (set above) still keep them in the map.
    // The shared WALLS constant is preserved in packages/shared-types/walls.ts
    // for future use; re-add the static-group + collider here when reintroducing
    // collision with measured-precise rects.

    // Camera — follows player by default; trackpad two-finger / mouse-wheel
    // detaches follow and pans freely; pressing any movement key re-attaches.
    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(1.5)

    this.input.on('wheel', (
      _pointer: Phaser.Input.Pointer,
      _over: Phaser.GameObjects.GameObject[],
      deltaX: number,
      deltaY: number,
    ) => {
      const cam = this.cameras.main
      if (this.isFollowingPlayer) {
        cam.stopFollow()
        this.isFollowingPlayer = false
      }
      cam.scrollX += deltaX
      cam.scrollY += deltaY
    })

    // Right-click drag also pans (for users without trackpad).
    let dragLast: { x: number; y: number } | null = null
    this.input.mouse?.disableContextMenu()
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) dragLast = { x: pointer.x, y: pointer.y }
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!dragLast || !pointer.rightButtonDown()) return
      const cam = this.cameras.main
      if (this.isFollowingPlayer) {
        cam.stopFollow()
        this.isFollowingPlayer = false
      }
      cam.scrollX -= (pointer.x - dragLast.x) / cam.zoom
      cam.scrollY -= (pointer.y - dragLast.y) / cam.zoom
      dragLast = { x: pointer.x, y: pointer.y }
    })
    this.input.on('pointerup', () => { dragLast = null })

    // Input — arrow keys + WASD
    if (!this.input.keyboard) throw new Error('keyboard input not available')
    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

    // By default Phaser calls preventDefault() on its captured keys (WASD,
    // arrows, space) so the page doesn't scroll while you play. The side
    // effect: typing into a chat input never receives those keys because
    // Phaser ate them first. Releasing the capture lets the events bubble
    // through to the focused <input>/<textarea>; the `typing` guard in
    // update() still prevents the player from moving while you type.
    this.input.keyboard.removeCapture([
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ])

    // Multiplayer client
    this.mp = new MultiplayerClient(this.petId, this.serverUrl)
    this.mp.join()
    this.mp.onPositions((positions) => this.updateOtherPets(positions))
    this.mp.onChat((evt) => this.handleChat(evt))
    this.mp.onPetLeft((evt) => this.removeOtherPet(evt.petId))

    // Zone overlap — fire onZoneEnter when player enters a zone rect
    this.zoneRects.forEach((zoneRect) => {
      this.physics.add.overlap(this.player, zoneRect, () => {
        const zoneName = zoneRect.name
        if (isZone(zoneName) && this.currentZone !== zoneName) {
          this.currentZone = zoneName
          onZoneEnter(zoneName, this.petId)
          this.events.emit('zone-changed', zoneName)
        }
      })
    })

    // Partner overlap — emit `partner-enter` once per visit.
    // React layer can listen on this.events for an integration-checkup modal.
    this.partnerRects.forEach((rect) => {
      this.physics.add.overlap(this.player, rect, () => {
        const partnerKey = rect.getData('partner') as string
        if (partnerKey && this.currentPartner !== partnerKey) {
          this.currentPartner = partnerKey
          const label = rect.getData('label') as string
          this.events.emit('partner-enter', { partner: partnerKey, label, petId: this.petId })
        }
      })
    })
    // Reset currentPartner when player leaves the partner row.
    this.events.on('zone-changed', () => { this.currentPartner = null })

    // Cleanup on scene shutdown
    this.events.once('shutdown', () => this.mp.disconnect())

    // Post-mint breeding ceremony — fired by world/page.tsx after BreedingFlow
    // completes. Plays hearts at breeding hall → child sprite emerges → walks
    // to park → parents follow at halfway.
    this.events.on('breeding-mint-done', (data: {
      childSpriteUrl: string
      parentASpriteUrl: string | null
      parentBSpriteUrl: string | null
    }) => this.playBreedingMintAnimation(data))

    // Async-load the user's own sprite (uploaded photo → OpenAI gpt-image-1
    // pixel-art creature, persisted to /sprites/<hash>.png by the API and
    // referenced via Hub's sprite_url column). The Pet Inspector also reads
    // this; here we overlay a Phaser Image on top of the player rectangle.
    void this.loadPetSprite(this.petId)
  }

  /// Fetch a pet's sprite_url from /api/pets/[id], load the texture, and
  /// add a Phaser Image overlay synced to the rectangle each frame. Falls
  /// back to leaving the rectangle visible if no sprite is available.
  private async loadPetSprite(petId: number) {
    if (this.spriteLoadAttempted.has(petId)) return
    this.spriteLoadAttempted.add(petId)
    try {
      const res = await fetch(`/api/pets/${petId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { pet?: { spriteUrl?: string; name?: string } }
      const url  = data.pet?.spriteUrl
      const name = (data.pet?.name ?? '').trim() || `pet-${petId}`
      // Skip default archetype fallback PNGs that don't exist on disk
      if (!url || /\/sprites\/(sage|gremlin|athlete|joker|scholar)\.png$/.test(url)) return

      const key = `pet-${petId}-${url.split('/').pop()?.split('?')[0] ?? Date.now()}`

      // Phaser load can fire after create() if we call this.load.start() again
      this.load.image(key, url)
      this.load.once(`filecomplete-image-${key}`, () => {
        if (!this.scene.isActive()) return
        const rect = petId === this.petId ? this.player : this.otherPets.get(petId)
        if (!rect) return
        const sprite = this.add.image(rect.x, rect.y, key)
        sprite.setDisplaySize(42, 42)
        sprite.setDepth(50)
        this.petSprites.set(petId, sprite)
        rect.setFillStyle(0x000000, 0)        // hide rectangle fill
        rect.setStrokeStyle(0)                 // hide outline

        // Floating name tag — sits above the sprite. Pixel font, white
        // with a chunky navy outline so it reads on every backdrop.
        const label = this.add.text(rect.x, rect.y - 24, name, {
          fontFamily:  'monospace',
          fontSize:    '11px',
          color:       '#ffffff',
          stroke:      '#0a0c2e',
          strokeThickness: 3,
          resolution:  2,
        })
        label.setOrigin(0.5, 1)
        label.setDepth(51)
        this.petLabels.set(petId, label)
      })
      this.load.once(`loaderror`, (file: { key: string }) => {
        if (file.key === key) {
          console.warn(`[WorldScene] failed to load sprite ${url} for pet ${petId}`)
        }
      })
      this.load.start()
    } catch (err) {
      console.warn(`[WorldScene] sprite fetch failed for pet ${petId}:`, (err as Error).message)
    }
  }

  /// Post-mint breeding ceremony. Plays in 3 phases:
  ///   T+0     hearts burst at breeding hall (1.6s)
  ///   T+1600  child sprite appears at breeding door, walks toward park
  ///   T+5600  child arrives at park → both parents emerge together from
  ///           the breeding door and walk to the park to meet the child
  private async playBreedingMintAnimation(data: {
    childSpriteUrl:    string
    parentASpriteUrl:  string | null
    parentBSpriteUrl:  string | null
  }) {
    // Anchors — derived from world.tmj zone coords.
    // Breeding zone: (976, 83, 292, 249) — hall body. Door is bottom-center.
    // Park zone: (635, 485, 395, 283) — fountain area. Destination is the center.
    const breedingDoor = { x: 1122, y: 332 }   // bottom-center of breeding zone
    const parkCenter   = { x: 832,  y: 626 }   // center of park zone

    // ── Phase 1: hearts burst at the breeding hall ──────────────────────
    const heartCount = 14
    for (let i = 0; i < heartCount; i++) {
      this.time.delayedCall(i * 110, () => {
        if (!this.scene.isActive()) return
        const ox = (Math.random() - 0.5) * 80
        const oy = (Math.random() - 0.5) * 60
        const heart = this.add.text(breedingDoor.x + ox, breedingDoor.y - 40 + oy, '♥', {
          fontSize:  '20px',
          color:     '#ff6aa1',
          stroke:    '#0a0c2e',
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(45).setAlpha(0)
        this.tweens.add({
          targets: heart,
          alpha:   { from: 0, to: 1 },
          y:       heart.y - 50,
          scale:   { from: 0.6, to: 1.2 },
          duration: 1400,
          ease:    'Sine.Out',
          onComplete: () => {
            this.tweens.add({
              targets: heart,
              alpha:   0,
              duration: 300,
              onComplete: () => heart.destroy(),
            })
          },
        })
      })
    }

    // ── Helper: load a sprite-image from URL into Phaser, then call cb ──
    const loadSprite = (key: string, url: string, cb: () => void) => {
      if (this.textures.exists(key)) { cb(); return }
      this.load.image(key, url)
      this.load.once(`filecomplete-image-${key}`, cb)
      this.load.once('loaderror', (file: { key: string }) => {
        if (file.key === key) cb()  // proceed even on failure (texture won't render)
      })
      this.load.start()
    }

    const stamp = Date.now()
    const childKey   = `breed-child-${stamp}`
    const parentAKey = `breed-parentA-${stamp}`
    const parentBKey = `breed-parentB-${stamp}`

    // ── Phase 2: spawn child at breeding door, tween to park (1600 → 5600 ms) ──
    this.time.delayedCall(1600, () => {
      if (!this.scene.isActive()) return
      loadSprite(childKey, data.childSpriteUrl, () => {
        if (!this.scene.isActive()) return
        const child = this.add.image(breedingDoor.x, breedingDoor.y, childKey)
          .setDisplaySize(48, 48).setDepth(46)
          .setAlpha(0)
        this.tweens.add({ targets: child, alpha: 1, duration: 250 })
        this.tweens.add({
          targets:  child,
          x:        parkCenter.x,
          y:        parkCenter.y,
          duration: 4000,
          ease:     'Sine.InOut',
          onComplete: () => {
            // Child arrives — small celebratory bounce, then waits at the
            // park while the parents emerge and walk over. Fade timed so
            // child + parents leave together (~T+11100).
            this.tweens.add({
              targets: child,
              y:       child.y - 8,
              duration: 200,
              yoyo:     true,
              repeat:   2,
            })
            this.time.delayedCall(5500, () => {
              this.tweens.add({
                targets: child,
                alpha:    0,
                duration: 400,
                onComplete: () => child.destroy(),
              })
            })
          },
        })
      })
    })

    // ── Phase 3: parents emerge AFTER child arrives at park (T+5600).
    // Both come out at the same time, walk together to meet the child.
    this.time.delayedCall(5600, () => {
      if (!this.scene.isActive()) return
      const spawnParent = (
        spriteUrl: string | null,
        key:       string,
        offsetX:   number,
      ) => {
        if (!spriteUrl) return
        loadSprite(key, spriteUrl, () => {
          if (!this.scene.isActive()) return
          // Spawn just inside the breeding door with a small lateral offset
          // so the two parents don't overlap on top of each other.
          const parent = this.add.image(breedingDoor.x + offsetX * 0.4, breedingDoor.y, key)
            .setDisplaySize(42, 42).setDepth(45)
            .setAlpha(0)
          this.tweens.add({ targets: parent, alpha: 1, duration: 300 })
          this.tweens.add({
            targets:  parent,
            x:        parkCenter.x + offsetX,
            y:        parkCenter.y + 10,
            duration: 3500,
            ease:     'Sine.InOut',
            onComplete: () => {
              // Small celebratory bounce when they reach the family.
              this.tweens.add({
                targets:  parent,
                y:        parent.y - 6,
                duration: 200,
                yoyo:     true,
                repeat:   1,
              })
              this.time.delayedCall(2000, () => {
                this.tweens.add({
                  targets:  parent,
                  alpha:    0,
                  duration: 400,
                  onComplete: () => parent.destroy(),
                })
              })
            },
          })
        })
      }
      spawnParent(data.parentASpriteUrl, parentAKey, -22)
      spawnParent(data.parentBSpriteUrl, parentBKey,  22)
    })
  }

  update(_time: number, _delta: number) {
    if (!this.player) return
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const SPEED = 180

    // If the user is typing in an input/textarea (e.g. mailbox compose form),
    // ignore movement keys so WASD lands in the form, not the player.
    const focused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
    const typing = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.isContentEditable)

    let vx = 0, vy = 0
    if (!typing) {
      if (this.cursors.left.isDown  || this.wasd.A.isDown) vx = -SPEED
      if (this.cursors.right.isDown || this.wasd.D.isDown) vx = SPEED
      if (this.cursors.up.isDown    || this.wasd.W.isDown) vy = -SPEED
      if (this.cursors.down.isDown  || this.wasd.S.isDown) vy = SPEED
    }

    body.setVelocity(vx, vy)

    // Re-attach camera follow when the user starts moving the player after a pan.
    if ((vx !== 0 || vy !== 0) && !this.isFollowingPlayer) {
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
      this.isFollowingPlayer = true
    }

    // Sync sprite overlays with their underlying rectangles every frame.
    // Adds a subtle idle bob (~1.5px sine wave) so pets feel alive even when
    // standing still. Bob is universal because we don't track per-pet velocity
    // here; the amplitude is small enough not to look jittery during motion.
    const idleBob = Math.sin(this.time.now / 280) * 1.5
    for (const [petId, sprite] of this.petSprites) {
      const rect = petId === this.petId ? this.player : this.otherPets.get(petId)
      if (rect) {
        sprite.setPosition(rect.x, rect.y + idleBob)
        const label = this.petLabels.get(petId)
        if (label) label.setPosition(rect.x, rect.y - 24 + idleBob)
      }
    }

    const isMoving = vx !== 0 || vy !== 0

    // Walking polish — emit dust puffs behind ANY pet that moved this frame.
    // Detect movement by comparing each pet's current position against last
    // frame. Each pet has its own throttle timer so the cadence stays the same
    // (one puff every ~120ms per pet) regardless of how many pets are moving.
    // Skip dust for pets whose sprite failed to load — otherwise dust trails
    // appear in mid-air with no visible pet (legacy archetype fallback URLs).
    const now = this.time.now
    if (this.petSprites.has(this.petId)) {
      this.maybeEmitDust(this.petId, this.player.x, this.player.y, isMoving, now)
      // Pond ripples — fire whenever the player is inside the pond rect,
      // moving or not. Idle wading still produces gentle rings.
      this.maybeEmitRipple(this.petId, this.player.x, this.player.y, now)
      this.maybeEmitPee(this.petId, this.player.x, this.player.y, now)
    }
    for (const [otherId, rect] of this.otherPets) {
      if (!this.petSprites.has(otherId)) continue
      const prev = this.prevPositions.get(otherId)
      // Threshold tuned for the tweened-position cadence: other pets move
      // via 100ms tweens, so a 6 px/tick wander speed = ~0.7 px per 60fps
      // frame. Old 1.2 threshold filtered all of that out — only the local
      // player (raw physics velocity) was emitting dust.
      const moved = prev ? Math.hypot(rect.x - prev.x, rect.y - prev.y) > 0.3 : false
      this.maybeEmitDust(otherId, rect.x, rect.y, moved, now)
      // Same pond check for NPC pets — any pet wandering through the pond
      // sends out ripples, makes the world feel reactive even when the
      // player isn't there.
      this.maybeEmitRipple(otherId, rect.x, rect.y, now)
      this.maybeEmitPee(otherId, rect.x, rect.y, now)
    }
    // Snapshot positions for next frame's "did it move" check.
    this.prevPositions.set(this.petId, { x: this.player.x, y: this.player.y })
    for (const [otherId, rect] of this.otherPets) {
      this.prevPositions.set(otherId, { x: rect.x, y: rect.y })
    }

    // Only broadcast position when the user is ACTIVELY pressing keys.
    // When all keys release, the Hub stops getting move() events for ~2s
    // and its wander tick takes over — pet auto-wanders around the park.
    // Press a key again, manual control resumes.
    if (!isMoving) return
    if (now - this.lastBroadcast > 1000 / this.BROADCAST_HZ) {
      this.lastBroadcast = now
      this.mp.move(this.player.x, this.player.y, this.currentZone)
    }
  }

  /// Label-only render — used when AI bg supplies the visuals. Each zone has
  /// a hand-tuned anchor so labels sit on a clean part of the bg, not over a
  /// building. Adds a translucent dark pill behind the text for legibility.
  private renderZoneLabel(z: ZoneData) {
    if (z.name === 'pond') return

    const labelText = z.label ?? z.name.toUpperCase()
    // Per-zone anchor — pixel coords against the 1376x768 world-bg.png.
    // Tuned to user-measured zone rectangles (Phase 1 measurement pass).
    // Each label sits on a clean spot ABOVE or BESIDE its zone, never over a
    // building, so it stays readable. The dark backing pill makes it pop.
    const anchors: Record<string, { cx: number; cy: number }> = {
      society:  { cx: 457, cy: 240 },   // path band between partner row and civilian houses
      breeding: { cx: 1092, cy: 100 },  // above the greenhouse
      park:     { cx: 832, cy: 475 },   // just above park entry, north of fountain
      mailbox:  { cx: 538, cy: 282 },   // just above the post office building (-100 left, +34 down)
      office:   { cx: 348, cy: 526 },   // just above the marketplace stalls
      arena:    { cx: 1179, cy: 505 },  // just above battlefield top edge
    }
    const a = anchors[z.name] ?? { cx: z.x + z.width / 2, cy: z.y + 12 }

    const text = this.add.text(a.cx, a.cy, labelText, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '10px',
      color: '#f4f4ff',
      stroke: '#0a0c2e',
      strokeThickness: 4,
    }).setOrigin(0.5, 0.5).setDepth(31)

    const padX = 8, padY = 4
    const pill = this.add.rectangle(
      a.cx, a.cy,
      text.width + padX * 2,
      text.height + padY * 2,
      0x0a0c2e, 0.6,
    )
    pill.setStrokeStyle(1, 0xf4f4ff, 0.4)
    pill.setDepth(30)
  }

  /// Partner integration building — colored badge + label + soft glow ring.
  /// The AI bg already shows a building; this adds the partner identity on top
  /// and visually telegraphs that this house is interactable.
  private renderPartnerLabel(p: ZoneData & { label: string; partner: string; tagline: string }) {
    const colorNum = Number.parseInt(p.color.replace('#', ''), 16)
    // Shift partner badges + labels relative to zone center so they sit on
    // the right half of each building. Per-partner overrides for buildings
    // whose roof-decor (antennas, chimneys) shifts the visual sweet-spot.
    const PARTNER_X_OFFSET = 100
    const PARTNER_Y_OFFSET = -40
    const xOverrides: Record<string, number> = {
      'gensyn-axl': 88,  // antenna+dish on the left half pushes badge slightly back left
    }
    const xOff = xOverrides[p.partner] ?? PARTNER_X_OFFSET
    const cx = p.x + p.width / 2 + xOff
    const cy = p.y + p.height / 2 + PARTNER_Y_OFFSET

    // Soft outer glow ring
    const glow = this.add.circle(cx, cy, 28, colorNum, 0.25)
    glow.setStrokeStyle(2, colorNum, 0.6)
    glow.setDepth(20)
    this.tweens.add({
      targets: glow,
      scale: { from: 0.9, to: 1.15 },
      alpha: { from: 0.25, to: 0.05 },
      duration: 1600, yoyo: true, repeat: -1,
    })

    // Solid colored disc as the logo backdrop (gives a consistent shape so
    // each partner reads as a "badge" even if the logo PNG has irregular
    // transparency or shape).
    const disc = this.add.circle(cx, cy, 18, colorNum, 0.95)
    disc.setStrokeStyle(2, 0xffffff, 0.9)
    disc.setDepth(21)

    // Real partner logo (loaded in preload). Falls back to first letter of
    // label if the texture failed to load (offline / 404).
    const logoKey = `logo-${p.partner}`
    if (this.textures.exists(logoKey)) {
      const logo = this.add.image(cx, cy, logoKey)
      logo.setDisplaySize(26, 26)
      logo.setDepth(22)
    } else {
      const initial = (p.label.match(/[A-Z0-9]/)?.[0] ?? '?').slice(0, 1)
      this.add.text(cx, cy, initial, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5, 0.5).setDepth(22)
    }

    // Label sits 8px below the disc edge (disc radius 18 + 8px gap = cy+26 for
    // the label's top origin). Tight enough that badge + name read as one unit.
    this.add.text(cx, cy + 26, p.label, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#f4f4ff',
      stroke: '#0a0c2e',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(30)
  }

  private renderZone(z: ZoneData) {
    const colorNum = Number.parseInt(z.color.replace('#', ''), 16)
    const lighter = brighten(colorNum, 0.3)
    const brighterStill = brighten(colorNum, 0.6)

    // Solid color fill
    this.add.rectangle(z.x, z.y, z.width, z.height, colorNum, 1).setOrigin(0, 0)

    // Pixel-style border (4px, slightly brighter than fill)
    const border = this.add.rectangle(z.x, z.y, z.width, z.height)
    border.setOrigin(0, 0)
    border.setStrokeStyle(4, lighter, 1)

    // Zone label — Press Start 2P style, top-center
    this.add.text(
      z.x + z.width / 2,
      z.y + 12,
      z.name.toUpperCase(),
      {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#f4f4ff',
        stroke: '#0a0c2e',
        strokeThickness: 4,
      },
    ).setOrigin(0.5, 0).setDepth(30)

    // Per-zone decorative rendering — each zone gets distinctive landmarks
    // matching the reference Pumpville/Gather aesthetic. All procedural
    // (no tilesets yet) but visually telegraphs what each zone is.
    switch (z.name) {
      case 'society':       this.renderSocietyHouses(z, lighter, brighterStill); break
      case 'park':          this.renderParkFountain(z, lighter, brighterStill); break
      case 'breeding':      this.renderBreedingHall(z, lighter, brighterStill); break
      case 'arena':         this.renderBattlefieldPortal(z, lighter, brighterStill); break
      case 'mailbox':       this.renderPostOffice(z, lighter, brighterStill); break
      case 'office':        this.renderMarketplace(z, lighter, brighterStill); break
      case 'pond':          this.renderPond(z, lighter, brighterStill); break
      default:              this.renderGenericDecor(z, colorNum, lighter)
    }
  }

  // ── Society: cluster of small houses in a 3x2 grid ────────────────────────
  private renderSocietyHouses(z: ZoneData, lighter: number, accent: number) {
    const cols = 3, rows = 2
    const houseW = 96, houseH = 80
    const padX = (z.width  - cols * houseW) / (cols + 1)
    const padY = (z.height - rows * houseH) / (rows + 1) + 24
    const houseColors = [0x8a4a3a, 0x6e4280, 0x3a6a8a, 0x4a8a3a, 0x8a8a3a, 0x8a3a6a]

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        const x = z.x + padX + c * (houseW + padX)
        const y = z.y + padY + r * (houseH + padY)
        const color = houseColors[idx % houseColors.length]
        // House body
        this.add.rectangle(x, y, houseW, houseH, color, 1).setOrigin(0, 0).setStrokeStyle(3, brighten(color, 0.3))
        // Roof (triangle approximated as wider rect)
        this.add.rectangle(x - 6, y - 14, houseW + 12, 18, brighten(color, -0.4), 1).setOrigin(0, 0).setStrokeStyle(2, accent)
        // Door
        this.add.rectangle(x + houseW / 2 - 8, y + houseH - 22, 16, 22, 0x2a1a0a, 1).setOrigin(0, 0)
        // Window
        this.add.rectangle(x + 12, y + 16, 16, 16, 0xfff5b8, 0.85).setOrigin(0, 0).setStrokeStyle(1, 0x0a0c2e)
        this.add.rectangle(x + houseW - 28, y + 16, 16, 16, 0xfff5b8, 0.85).setOrigin(0, 0).setStrokeStyle(1, 0x0a0c2e)
      }
    }
    // Lampposts between rows
    this.renderLamppost(z.x + z.width / 2, z.y + z.height / 2 + 12, accent)
  }

  // ── Park: animated fountain + benches + trees ─────────────────────────────
  private renderParkFountain(z: ZoneData, lighter: number, accent: number) {
    const cx = z.x + z.width / 2
    const cy = z.y + z.height / 2

    // Fountain — tiered circles
    this.add.circle(cx, cy, 56, 0x4a3a1c, 1).setStrokeStyle(3, lighter)         // base
    this.add.circle(cx, cy, 44, 0x1e90c4, 1).setStrokeStyle(2, 0x4ad8ff)        // water
    this.add.circle(cx, cy, 24, 0x4a3a1c, 1).setStrokeStyle(2, lighter)         // pillar
    const splash = this.add.circle(cx, cy, 12, 0xeaffff, 0.9)
    this.tweens.add({ targets: splash, scale: { from: 0.8, to: 1.3 }, alpha: { from: 0.9, to: 0.4 }, duration: 1400, yoyo: true, repeat: -1 })

    // Benches around the fountain
    const benches = [[-110, 0], [110, 0], [0, -110], [0, 110]]
    benches.forEach(([dx, dy]) => {
      this.add.rectangle(cx + dx, cy + dy, 56, 16, 0x6e4a2a, 1).setStrokeStyle(2, accent)
    })

    // Scattered trees
    const rng = mulberry32(stringHash('park-trees'))
    for (let i = 0; i < 6; i++) {
      const tx = z.x + 40 + rng() * (z.width - 80)
      const ty = z.y + 40 + rng() * (z.height - 80)
      // skip if near fountain
      if (Math.hypot(tx - cx, ty - cy) < 100) continue
      this.renderTree(tx, ty, 28)
    }
  }

  // ── Breeding: greenhouse-style hall with glass roof + altar ───────────────
  private renderBreedingHall(z: ZoneData, lighter: number, accent: number) {
    const padding = 24
    const x = z.x + padding
    const y = z.y + padding + 24
    const w = z.width - padding * 2
    const h = z.height - padding * 2 - 24

    // Hall body — half-timber pattern
    this.add.rectangle(x, y, w, h, 0xb89c6e, 1).setOrigin(0, 0).setStrokeStyle(3, 0x4a3a1c)
    // Wood beams (vertical stripes)
    for (let i = 0; i < 4; i++) {
      this.add.rectangle(x + (i + 1) * (w / 5) - 2, y, 4, h, 0x4a3a1c, 1).setOrigin(0, 0)
    }
    // Glass-roof effect (cyan stripes at top)
    for (let i = 0; i < 5; i++) {
      this.add.rectangle(x + i * (w / 5), y + 4, w / 5 - 4, 24, 0x4ad8ff, 0.7)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x2a8aaa)
    }
    // Door
    this.add.rectangle(x + w / 2 - 16, y + h - 36, 32, 36, 0x2a1a0a, 1).setOrigin(0, 0).setStrokeStyle(2, accent)
    // Heart altar inside (small mark)
    this.add.text(x + w / 2, y + h / 2 - 10, '♥', { fontSize: '40px', color: '#ff5e8e' }).setOrigin(0.5)
  }

  // ── Battlefield: arena floor + glowing portal + standing stones ───────────
  private renderBattlefieldPortal(z: ZoneData, lighter: number, accent: number) {
    const cx = z.x + z.width / 2
    const cy = z.y + z.height / 2

    // Arena floor — dark stone
    this.add.rectangle(z.x + 24, z.y + 50, z.width - 48, z.height - 80, 0x2a1a1a, 1).setOrigin(0, 0).setStrokeStyle(3, 0x6a3a3a)

    // Glowing portal (top of arena)
    const portalY = z.y + 100
    this.add.ellipse(cx, portalY, 80, 110, 0x6a1a8a, 1).setStrokeStyle(4, 0xc04ad8)
    const portalGlow = this.add.ellipse(cx, portalY, 60, 90, 0xff4afd, 0.8)
    this.tweens.add({ targets: portalGlow, scale: { from: 0.85, to: 1.15 }, alpha: { from: 0.8, to: 0.3 }, duration: 1200, yoyo: true, repeat: -1 })

    // Standing stones around arena
    const stones = [[-90, 60], [90, 60], [-90, -40], [90, -40], [0, 130]]
    stones.forEach(([dx, dy]) => {
      const sx = cx + dx
      const sy = cy + dy
      this.add.rectangle(sx, sy, 24, 36, 0x4a3a3a, 1).setStrokeStyle(2, 0x8a6a6a)
      this.add.rectangle(sx, sy - 20, 28, 8, 0x5a4a4a, 1)
    })

    // Crossed swords motif (decoration)
    this.add.text(cx, z.y + z.height - 40, '⚔', { fontSize: '36px', color: '#ff5e3e' }).setOrigin(0.5)
  }

  // ── Mailbox: small post-office building ──────────────────────────────────
  private renderPostOffice(z: ZoneData, lighter: number, accent: number) {
    const cx = z.x + z.width / 2
    const cy = z.y + z.height / 2 + 12
    // Body
    this.add.rectangle(cx - 60, cy - 30, 120, 70, 0x6a3a8a, 1).setOrigin(0, 0).setStrokeStyle(3, 0xb070d8)
    // Roof
    this.add.rectangle(cx - 66, cy - 44, 132, 18, 0x4a1a6a, 1).setOrigin(0, 0).setStrokeStyle(2, 0xb070d8)
    // Door
    this.add.rectangle(cx - 12, cy + 14, 24, 26, 0x2a1a0a, 1).setOrigin(0, 0)
    // Window
    this.add.rectangle(cx - 50, cy - 12, 18, 18, 0xfff5b8, 0.85).setOrigin(0, 0).setStrokeStyle(1, 0x0a0c2e)
    this.add.rectangle(cx + 32, cy - 12, 18, 18, 0xfff5b8, 0.85).setOrigin(0, 0).setStrokeStyle(1, 0x0a0c2e)
    // Mail icon
    this.add.text(cx, cy + 26, '✉', { fontSize: '20px', color: '#ffd93c' }).setOrigin(0.5)
  }

  // ── Office: marketplace with awnings ──────────────────────────────────────
  private renderMarketplace(z: ZoneData, lighter: number, accent: number) {
    const cx = z.x + z.width / 2
    const cy = z.y + z.height / 2 + 12
    // Body
    this.add.rectangle(cx - 70, cy - 50, 140, 100, 0x8a3a6a, 1).setOrigin(0, 0).setStrokeStyle(3, 0xd86a9a)
    // Roof
    this.add.rectangle(cx - 76, cy - 64, 152, 18, 0x4a1a3a, 1).setOrigin(0, 0).setStrokeStyle(2, 0xd86a9a)
    // Awning stripes (red + cream)
    for (let i = 0; i < 7; i++) {
      const sx = cx - 70 + i * 20
      const stripeColor = i % 2 === 0 ? 0xc02a4a : 0xf5e8c0
      this.add.rectangle(sx, cy - 46, 20, 14, stripeColor, 1).setOrigin(0, 0)
    }
    // Door
    this.add.rectangle(cx - 14, cy + 26, 28, 24, 0x2a1a0a, 1).setOrigin(0, 0)
    // Sign
    this.add.text(cx, cy - 30, '$', { fontSize: '24px', color: '#ffd93c', fontFamily: 'monospace' }).setOrigin(0.5)
  }

  // ── Pond: water ripples + lily pads ───────────────────────────────────────
  private renderPond(z: ZoneData, lighter: number, _accent: number) {
    const cx = z.x + z.width / 2
    const cy = z.y + z.height / 2
    // Water surface
    this.add.ellipse(cx, cy, z.width - 32, z.height - 16, 0x2a6a9a, 0.85).setStrokeStyle(3, 0x4ad8ff)
    // Ripples
    for (let i = 0; i < 3; i++) {
      const ring = this.add.ellipse(cx + (i - 1) * 80, cy + (i % 2 === 0 ? -8 : 8), 32, 14, 0x4ad8ff, 0)
      ring.setStrokeStyle(2, 0x4ad8ff, 0.6)
      this.tweens.add({ targets: ring, scale: { from: 0.6, to: 1.2 }, alpha: { from: 0.6, to: 0 }, duration: 2400, repeat: -1, delay: i * 600 })
    }
    // Lily pads
    const rng = mulberry32(stringHash('pond-lily'))
    for (let i = 0; i < 4; i++) {
      const lx = z.x + 60 + rng() * (z.width - 120)
      const ly = z.y + 20 + rng() * (z.height - 40)
      this.add.ellipse(lx, ly, 24, 16, 0x3a6a3a, 1).setStrokeStyle(1, 0x6e9e6e)
      this.add.circle(lx + 6, ly - 4, 4, 0xff8ec4, 1)
    }
  }

  private renderGenericDecor(z: ZoneData, colorNum: number, lighter: number) {
    const rng = mulberry32(stringHash(z.name))
    const count = Math.floor(z.width * z.height / 30000)
    for (let i = 0; i < count; i++) {
      const dx = z.x + 40 + rng() * (z.width - 80)
      const dy = z.y + 40 + rng() * (z.height - 80)
      const sz = 16 + Math.floor(rng() * 16)
      this.add.rectangle(dx, dy, sz, sz, brighten(colorNum, 0.5), 0.7).setStrokeStyle(2, lighter, 0.9)
    }
  }

  // ── Tiny shape helpers ────────────────────────────────────────────────────
  private renderTree(x: number, y: number, size: number) {
    // Trunk
    this.add.rectangle(x, y, size / 3, size / 2, 0x6e4a2a, 1).setStrokeStyle(2, 0x4a2a1a)
    // Foliage
    this.add.circle(x, y - size / 2, size, 0x3a6a3a, 1).setStrokeStyle(2, 0x6e9e6e)
    this.add.circle(x - 6, y - size / 2 - 4, size / 2, 0x4a8a4a, 0.9)
  }

  private renderLamppost(x: number, y: number, accent: number) {
    this.add.rectangle(x - 2, y, 4, 36, 0x2a1a0a, 1)
    this.add.circle(x, y, 8, 0xffd93c, 1).setStrokeStyle(2, accent)
    // Glow
    const glow = this.add.circle(x, y, 24, 0xffd93c, 0.2)
    this.tweens.add({ targets: glow, scale: { from: 0.9, to: 1.1 }, alpha: { from: 0.2, to: 0.05 }, duration: 1800, yoyo: true, repeat: -1 })
  }

  /// Single soft dust puff behind a moving pet. Slightly larger and a
  /// bit brighter than the original (4 px / alpha 0.55) so it's readable,
  /// but stays subtle — no clusters, no aggressive expansion.
  private maybeEmitDust(petId: number, x: number, y: number, moving: boolean, now: number) {
    if (!moving) return
    const last = this.dustEmitTimers.get(petId) ?? 0
    if (now - last < 120) return
    this.dustEmitTimers.set(petId, now)

    const dust = this.add.circle(x, y + 12, 5, 0xd4bf90, 0.65)
    dust.setDepth(35)
    this.tweens.add({
      targets:    dust,
      alpha:      0,
      scaleX:     1.1,
      scaleY:     1.1,
      y:          dust.y - 3,           // tiny upward drift
      duration:   600,
      ease:       'Sine.easeOut',
      onComplete: () => dust.destroy(),
    })
  }

  /// Continuous pee stream — emits white droplets in a parabolic arc into
  /// the pond water for as long as the pet stands at the EDGE of the
  /// visible elliptical water. Throttled per-pet to ~1 droplet every 90ms.
  /// No cooldown, no session limit — peeing stops the instant the pet
  /// leaves the edge band, restarts when they return.
  private maybeEmitPee(petId: number, x: number, y: number, now: number) {
    if (!this.pondBounds) return
    const b = this.pondBounds
    // Visible pond water is an ellipse centered in the rect (see renderPond):
    //   center (cx, cy), radii (rxWater, ryWater).
    const cx       = b.x + b.w / 2
    const cy       = b.y + b.h / 2
    const rxWater  = (b.w - 32) / 2
    const ryWater  = (b.h - 16) / 2

    // Ellipse-distance test: <1 = inside water, =1 = on boundary, >1 = outside.
    // Pee only fires when the pet is STRICTLY OUTSIDE the water but within
    // a band around the rim — so a pet swimming inside the pond doesn't
    // pee into the water it's already standing in.
    const dx = x - cx
    const dy = y - cy
    const ellipseDist = (dx / rxWater) ** 2 + (dy / ryWater) ** 2
    const nearEdge    = ellipseDist >= 1.05 && ellipseDist <= 1.6
    if (!nearEdge) return

    // Per-pet throttle: at most one droplet every 90ms. Since this fires
    // every animation frame while the pet is at the edge, the result is
    // a continuous stream that starts/stops with the pet's position.
    const last = this.peeEmitTimers.get(petId) ?? 0
    if (now - last < 90) return
    this.peeEmitTimers.set(petId, now)

    const startX  = x
    const startY  = y - 6   // hip height — droplet leaves slightly above feet
    // Splash lands at a fixed offset along the line from the pet toward
    // the pond center. All droplets in this stream follow the SAME arc,
    // so the stream reads as one coherent line rather than a scattered
    // burst. Tiny ±2 px jitter keeps it from looking robotic.
    const towardX = cx - x
    const towardY = cy - y
    const dist    = Math.max(1, Math.hypot(towardX, towardY))
    const STREAM_REACH = 60   // distance from pet to splash point (px)
    const splashX = x + (towardX / dist) * STREAM_REACH + (Math.random() - 0.5) * 4
    const splashY = y + (towardY / dist) * STREAM_REACH + (Math.random() - 0.5) * 4
    const peakHeight = 18  // arc height above the linear midpoint

    // White droplet — high-contrast against the pond's dark cyan water.
    const drop = this.add.circle(startX, startY, 2.5, 0xffffff, 1)
    drop.setStrokeStyle(1, 0xc8d0e0, 0.9)
    drop.setDepth(36)

    // Single tween with parabolic onUpdate — t * (1-t) peaks at 0.5, so
    // the droplet rises, peaks halfway, then falls into the pond. Phaser
    // y increases downward so SUBTRACTING the parabola term arcs it UP.
    this.tweens.add({
      targets:  { t: 0 },
      t:        1,
      duration: 480,
      ease:     'Linear',
      onUpdate: (tween) => {
        const t  = tween.progress
        const px = startX + (splashX - startX) * t
        const py = startY + (splashY - startY) * t - 4 * peakHeight * t * (1 - t)
        drop.setPosition(px, py)
      },
      onComplete: () => {
        drop.destroy()
        // Small white splash ring at impact, on top of the pond water.
        const splash = this.add.circle(splashX, splashY, 5, 0xffffff, 0)
        splash.setStrokeStyle(2, 0xffffff, 0.85)
        splash.setDepth(36)
        this.tweens.add({
          targets:    splash,
          scaleX:     1.8,
          scaleY:     1.8,
          alpha:      0,
          duration:   380,
          ease:       'Sine.easeOut',
          onComplete: () => splash.destroy(),
        })
      },
    })
  }

  /// Spawns a cyan water ripple ring at (x, y) when a pet is SWIMMING in
  /// the pond. Excludes the top-rim band (the same band where pee fires)
  /// so a pet on the bank peeing doesn't also produce swim ripples — the
  /// two effects are mutually exclusive.
  private maybeEmitRipple(petId: number, x: number, y: number, now: number) {
    if (!this.pondBounds) return
    const b = this.pondBounds
    // Outside the pond rect → no ripple
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return
    // Inside the pee band (top rim) → pet is peeing, not swimming. Skip.
    // Mirror of the band used in maybeEmitPee.
    if (y <= b.y + 30) return
    const last = this.rippleEmitTimers.get(petId) ?? 0
    if (now - last < 350) return
    this.rippleEmitTimers.set(petId, now)

    // Outline-only cyan ring; fill is transparent so the pond surface shows
    // through. Slightly offset y so the ring origin reads as "around the
    // pet's feet" rather than centered on the sprite.
    const ring = this.add.circle(x, y + 8, 8, 0x4ad8ff, 0)
    ring.setStrokeStyle(2, 0x4ad8ff, 0.85)
    ring.setDepth(36) // above pond water (depth 0-ish), below pet sprite (50)
    this.tweens.add({
      targets:    ring,
      scaleX:     2.6,
      scaleY:     2.6,
      alpha:      0,           // strokeAlpha tweens via the Phaser `alpha`
      duration:   1200,
      ease:       'Sine.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  private updateOtherPets(positions: Record<number, { x: number; y: number; zone: Zone }>) {
    // Add or update rectangles + lazily fetch their sprites
    for (const [idStr, pos] of Object.entries(positions)) {
      const id = Number(idStr)
      if (id === this.petId) continue

      let rect = this.otherPets.get(id)
      if (!rect) {
        // Invisible carrier rect; the sprite Image (loaded async) is the
        // ONLY thing the user sees. If the sprite never loads (e.g. legacy
        // archetype pets without a real PNG), this rect stays invisible —
        // no fallback boxes per user request.
        rect = this.add.rectangle(pos.x, pos.y, 24, 24, 0x00d4ff, 0)
        rect.setStrokeStyle(0)
        rect.setDepth(40)
        this.otherPets.set(id, rect)
        void this.loadPetSprite(id)
        continue
      }
      // Smooth glide instead of teleport. Position broadcasts arrive at
      // BROADCAST_HZ (~10Hz, every 100ms). Tween over 110ms slightly out-paces
      // the next packet so motion looks continuous; if the next packet redirects
      // mid-tween, Phaser overrides any in-flight tween on the same target.
      // Tween duration matches broadcast cadence (100ms) — each new packet
      // arrives just as the prior tween completes, so motion looks
      // continuous. If a new packet redirects mid-tween, Phaser kills the
      // in-flight tween automatically.
      this.tweens.add({
        targets: rect,
        x: pos.x,
        y: pos.y,
        duration: 100,
        ease: 'Linear',
      })
    }

    // Remove sprites for pets no longer in positions
    for (const [id, rect] of this.otherPets) {
      if (!(String(id) in positions)) {
        rect.destroy()
        this.otherPets.delete(id)
        this.dustEmitTimers.delete(id)
        this.rippleEmitTimers.delete(id)
        this.peeEmitTimers.delete(id)
        this.prevPositions.delete(id)
        const sprite = this.petSprites.get(id)
        if (sprite) {
          sprite.destroy()
          this.petSprites.delete(id)
        }
        const label = this.petLabels.get(id)
        if (label) {
          label.destroy()
          this.petLabels.delete(id)
        }
      }
    }
  }

  private removeOtherPet(petId: number) {
    const rect = this.otherPets.get(petId)
    if (rect) {
      rect.destroy()
      this.otherPets.delete(petId)
    }
    this.dustEmitTimers.delete(petId)
    this.rippleEmitTimers.delete(petId)
    this.peeEmitTimers.delete(petId)
    this.prevPositions.delete(petId)
    const sprite = this.petSprites.get(petId)
    if (sprite) {
      sprite.destroy()
      this.petSprites.delete(petId)
    }
    const label = this.petLabels.get(petId)
    if (label) {
      label.destroy()
      this.petLabels.delete(petId)
    }
  }

  private handleChat(evt: { from: number; to: number; text: string; timestamp: number }) {
    // Show chat bubble above the speaking pet. Skip the bubble if the speaker
    // has no rendered sprite (invisible carrier rect with no Image overlay)
    // — that prevents the "phantom bubble in empty space" issue without
    // capping by raw distance, so any pet visible on screen gets its bubble.
    const speaker = evt.from === this.petId ? this.player : this.otherPets.get(evt.from)
    if (!speaker) return
    if (evt.from !== this.petId && !this.petSprites.has(evt.from)) {
      // Other pet has no loaded sprite → its rect is alpha 0 → invisible.
      // No point rendering a bubble pointing at nothing.
      return
    }
    showChatBubble(this, speaker as unknown as Phaser.GameObjects.Sprite, evt.text)
  }
}

// ── Tiny utilities ────────────────────────────────────────────────────────

/** Brighten a 24-bit RGB color by `amount` (0..1). */
function brighten(color: number, amount: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * (1 + amount)))
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * (1 + amount)))
  const b = Math.min(255, Math.floor((color & 0xff) * (1 + amount)))
  return (r << 16) | (g << 8) | b
}

/** Deterministic 32-bit string hash (FNV-1a) */
function stringHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Seeded PRNG (Mulberry32) — gives stable decorations per zone */
function mulberry32(seed: number) {
  let t = seed
  return function() {
    t = (t + 0x6d2b79f5) | 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
