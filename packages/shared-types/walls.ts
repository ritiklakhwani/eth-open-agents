// Wall rectangles — collision data for the PetCity world map.
//
// Single source of truth shared between:
//   - Frontend (apps/web/src/components/phaser/WorldScene.ts): renders
//     invisible static-physics colliders so the player can't walk through
//     buildings.
//   - Backend (apps/hub/src/...): wander-target picker rejects any target
//     whose center falls inside one of these rects, so wandering pets respect
//     the same collision.
//
// Coordinates are in pixels of world space, matching world.tmj's coordinate
// system. World dims: 1376 x 768. Origin (0, 0) = top-left.
//
// Partner-row buildings: walls cover only the upper ~140px of each so the
// bottom ~60px is walkable porch — player can step into the trigger zone
// (which fires the partner-enter event) without being blocked by the wall.

export interface WallRect {
  x: number
  y: number
  w: number
  h: number
  /** Optional debug name; not load-bearing. */
  name?: string
}

export const WALLS: WallRect[] = [
  // ── Society zone — partner row (4 buildings) ────────────────────────────
  // Upper 140px walled, bottom 60px open as a porch entry.
  { name: 'partner-axl-body',       x:  75, y: 10, w: 170, h: 140 },
  { name: 'partner-ens-body',       x: 295, y: 10, w: 160, h: 140 },
  { name: 'partner-keeperhub-body', x: 485, y: 10, w: 190, h: 140 },
  { name: 'partner-0g-body',        x: 695, y: 10, w: 200, h: 140 },

  // ── Society zone — civilian houses (lower row) ──────────────────────────
  { name: 'civ-house-left',  x:  30, y: 200, w: 140, h: 150 },
  { name: 'civ-house-mid',   x: 230, y: 220, w: 130, h: 140 },
  { name: 'civ-house-large', x: 380, y: 365, w: 220, h: 230 },

  // ── Mailbox post office (small purple-roof building) ────────────────────
  { name: 'mailbox-body', x: 365, y: 215, w: 120, h: 100 },

  // ── Breeding greenhouse (large building, top-right) ─────────────────────
  // Body of the greenhouse; doorway at the bottom edge stays walkable.
  { name: 'breeding-greenhouse', x: 1010, y: 20, w: 350, h: 350 },

  // ── Marketplace stalls (bottom-left) ────────────────────────────────────
  { name: 'marketplace-stalls', x: 40, y: 480, w: 165, h: 110 },

  // ── Pond water (decorative; pets shouldn't walk on water) ───────────────
  { name: 'pond-water', x: 0, y: 640, w: 200, h: 128 },

  // ── Central park fountain ───────────────────────────────────────────────
  { name: 'park-fountain', x: 660, y: 660, w: 60, h: 70 },

  // ── Battlefield portal frame ────────────────────────────────────────────
  { name: 'battle-portal', x: 1240, y: 480, w: 60, h: 90 },
]

/** World dimensions — useful for clamping wander targets. */
export const WORLD_WIDTH  = 1376
export const WORLD_HEIGHT = 768

/**
 * Returns true if the point (x, y) is inside any wall rect.
 * Used by the wander-target picker on the Hub to reject blocked targets.
 */
export function isInsideAnyWall(x: number, y: number): boolean {
  for (const w of WALLS) {
    if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true
  }
  return false
}

/**
 * Pick a random walkable point inside the given rect (typically a zone).
 * Rejects up to `maxAttempts` candidates that fall inside walls; if none of
 * them work, returns the rect center as a final fallback.
 *
 * Hub wander tick should call this with the pet's current zone rect.
 */
export function pickWalkableTarget(
  zone: { x: number; y: number; w: number; h: number },
  maxAttempts = 16,
): { x: number; y: number } {
  for (let i = 0; i < maxAttempts; i++) {
    const x = zone.x + Math.random() * zone.w
    const y = zone.y + Math.random() * zone.h
    if (!isInsideAnyWall(x, y)) return { x, y }
  }
  return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 }
}
