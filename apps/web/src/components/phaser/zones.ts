import * as Phaser from 'phaser'
import type { Zone } from 'shared-types'

const VALID_ZONES = new Set<string>(['park', 'office', 'arena', 'lounge', 'kitchen', 'mailbox', 'society', 'breeding', 'pond'])

// Zones the Hub has /api/zones/<name>/enter endpoints for. The wider VALID_ZONES
// is for type-narrowing and event-firing; the POST is gated to known endpoints.
const POSTABLE_ZONES = new Set<string>(['park', 'office', 'arena', 'lounge', 'kitchen', 'mailbox'])

/**
 * Creates static physics-enabled zones from the "zones" object layer in a
 * Tiled map.  Each returned zone's name matches the Tiled rectangle name.
 */
export function parseZonesFromTiledMap(
  scene: Phaser.Scene,
  map:   Phaser.Tilemaps.Tilemap,
): Phaser.GameObjects.Zone[] {
  const layer = map.getObjectLayer('zones')
  if (!layer) return []

  return layer.objects
    .filter(obj => obj.width != null && obj.height != null)
    .map(obj => {
      const zone = scene.add.zone(
        obj.x! + obj.width!  / 2,
        obj.y! + obj.height! / 2,
        obj.width!,
        obj.height!,
      )
      zone.setName(obj.name)
      scene.physics.world.enable(zone)
      const body = zone.body as Phaser.Physics.Arcade.Body
      body.setAllowGravity(false)
      body.moves = false
      return zone
    })
}

/** Notifies the Hub that a pet entered a named zone (fire-and-forget). */
export function onZoneEnter(zoneName: string, petId: number) {
  if (!POSTABLE_ZONES.has(zoneName)) return
  fetch(`/api/zones/${zoneName}/enter`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ petId }),
  }).catch(() => {})
}

/** Type-narrowing helper so WorldScene can cast the raw string to Zone. */
export function isZone(name: string): name is Zone {
  return VALID_ZONES.has(name)
}