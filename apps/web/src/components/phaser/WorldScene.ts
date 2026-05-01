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
  private mp!: MultiplayerClient

  // Position broadcast throttle
  private lastBroadcast = 0
  private readonly BROADCAST_HZ = 10 // 10 broadcasts per second

  constructor() {
    super('WorldScene')
  }

  init(data: WorldSceneInit) {
    this.petId = data.petId
    this.serverUrl = data.socketServerUrl ?? 'http://localhost:3001'
  }

  preload() {
    // Tiled map JSON. Note: we render zones procedurally — no tileset image
    // needed for v1. When Kenney tileset is dropped into public/assets/tilesets/
    // we add: this.load.image('tiles', '/assets/tilesets/tiny-town/Tilemap/tilemap_packed.png')
    this.load.json('world-map', '/world.tmj')
  }

  create() {
    const map = this.cache.json.get('world-map') as {
      width: number
      height: number
      tilewidth: number
      tileheight: number
      layers: Array<{ name: string; type: string; objects?: Array<{ name: string; x: number; y: number; width: number; height: number; properties?: Array<{ name: string; value: string }> }> }>
    }

    const worldW = map.width * map.tilewidth
    const worldH = map.height * map.tileheight

    // Background — deep navy from our palette
    this.cameras.main.setBackgroundColor(0x0a0c2e)

    // Render zones procedurally
    const zonesLayer = map.layers.find(l => l.name === 'zones' && l.type === 'objectgroup')
    if (!zonesLayer || !zonesLayer.objects) {
      console.error('[WorldScene] zones layer not found in world.tmj')
      return
    }

    const zoneData: ZoneData[] = zonesLayer.objects.map(o => ({
      name: o.name,
      x: o.x,
      y: o.y,
      width: o.width,
      height: o.height,
      color: o.properties?.find(p => p.name === 'color')?.value ?? '#333333',
    }))

    for (const z of zoneData) {
      this.renderZone(z)
    }

    // Build invisible Phaser zones for trigger overlap detection
    this.zoneRects = zonesLayer.objects.map(o => {
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
      return z
    })

    // World boundaries
    this.physics.world.setBounds(0, 0, worldW, worldH)

    // Player — pixel rectangle in pink (will swap for sprite later)
    this.player = this.add.rectangle(240, 240, 24, 24, 0xff1e8e, 1)
    this.player.setStrokeStyle(2, 0x0a0c2e)
    this.physics.add.existing(this.player)
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body
    playerBody.setCollideWorldBounds(true)

    // Camera
    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setZoom(1.5)

    // Input — arrow keys + WASD
    if (!this.input.keyboard) throw new Error('keyboard input not available')
    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>

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

    // Cleanup on scene shutdown
    this.events.once('shutdown', () => this.mp.disconnect())

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
      const data = (await res.json()) as { pet?: { spriteUrl?: string } }
      const url = data.pet?.spriteUrl
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
        sprite.setDisplaySize(28, 28)
        sprite.setDepth(50)
        this.petSprites.set(petId, sprite)
        rect.setFillStyle(0x000000, 0)        // hide rectangle fill
        rect.setStrokeStyle(0)                 // hide outline
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

    // Sync sprite overlays with their underlying rectangles every frame.
    // The rectangle holds the physics body / camera target; sprite is purely
    // visual. Drift-free because we update each frame from the rect's pos.
    for (const [petId, sprite] of this.petSprites) {
      const rect = petId === this.petId ? this.player : this.otherPets.get(petId)
      if (rect) sprite.setPosition(rect.x, rect.y)
    }

    // Only broadcast position when the user is ACTIVELY pressing keys.
    // When all keys release, the Hub stops getting move() events for ~2s
    // and its wander tick takes over — pet auto-wanders around the park.
    // Press a key again, manual control resumes.
    const isMoving = vx !== 0 || vy !== 0
    if (!isMoving) return
    const now = this.time.now
    if (now - this.lastBroadcast > 1000 / this.BROADCAST_HZ) {
      this.lastBroadcast = now
      this.mp.move(this.player.x, this.player.y, this.currentZone)
    }
  }

  private renderZone(z: ZoneData) {
    const colorNum = Number.parseInt(z.color.replace('#', ''), 16)

    // Solid color fill
    this.add.rectangle(z.x, z.y, z.width, z.height, colorNum, 1).setOrigin(0, 0)

    // Pixel-style border (4px, slightly brighter than fill)
    const lighter = brighten(colorNum, 0.3)
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
    ).setOrigin(0.5, 0)

    // Add a few decorative pixel rectangles for "furniture" — randomized but seeded
    // by zone name for visual interest
    const rng = mulberry32(stringHash(z.name))
    const decorCount = Math.floor(z.width * z.height / 30000)
    for (let i = 0; i < decorCount; i++) {
      const dx = z.x + 40 + rng() * (z.width - 80)
      const dy = z.y + 40 + rng() * (z.height - 80)
      const sz = 16 + Math.floor(rng() * 16)
      const decorColor = brighten(colorNum, 0.5)
      this.add.rectangle(dx, dy, sz, sz, decorColor, 0.7).setStrokeStyle(2, lighter, 0.9)
    }
  }

  private updateOtherPets(positions: Record<number, { x: number; y: number; zone: Zone }>) {
    // Add or update rectangles + lazily fetch their sprites
    for (const [idStr, pos] of Object.entries(positions)) {
      const id = Number(idStr)
      if (id === this.petId) continue

      let rect = this.otherPets.get(id)
      if (!rect) {
        // New pet — create a cyan rectangle as initial render. The sprite
        // overlay (loaded async from /api/pets/:id) replaces the visible
        // fill once the texture lands.
        rect = this.add.rectangle(pos.x, pos.y, 24, 24, 0x00d4ff, 1)
        rect.setStrokeStyle(2, 0x0a0c2e)
        this.otherPets.set(id, rect)
        void this.loadPetSprite(id)
      }
      rect.setPosition(pos.x, pos.y)
    }

    // Remove sprites for pets no longer in positions
    for (const [id, rect] of this.otherPets) {
      if (!(String(id) in positions)) {
        rect.destroy()
        this.otherPets.delete(id)
        const sprite = this.petSprites.get(id)
        if (sprite) {
          sprite.destroy()
          this.petSprites.delete(id)
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
    const sprite = this.petSprites.get(petId)
    if (sprite) {
      sprite.destroy()
      this.petSprites.delete(petId)
    }
  }

  private handleChat(evt: { from: number; to: number; text: string; timestamp: number }) {
    // Show chat bubble above the speaking pet
    const speaker = evt.from === this.petId ? this.player : this.otherPets.get(evt.from)
    if (speaker) {
      // Cast: showChatBubble accepts Sprite | Physics.Sprite, but rectangles share x/y so it works
      showChatBubble(this, speaker as unknown as Phaser.GameObjects.Sprite, evt.text)
    }
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
