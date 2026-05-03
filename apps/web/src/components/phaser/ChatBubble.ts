import * as Phaser from 'phaser'

// Arcade-style chat bubble: chunky black border, cream fill, stair-stepped
// pixel tail pointing down at the speaker. Pop-in animation + fade-out.
//
// Renders as a Phaser Container holding a Graphics (border + fill + tail) and
// a Text. Total bubble lifecycle is managed by tweens that destroy the
// container at the end so callers don't need to clean up.

const MAX_CHARS = 90
const FONT_PX   = 9
const WRAP_PX   = 140
const PAD_X     = 8
const PAD_Y     = 5

const COLOR_BORDER = 0x0a0c2e   // deep navy
const COLOR_FILL   = 0xfff5e1   // warm cream

export function showChatBubble(
  scene:      Phaser.Scene,
  petSprite:  Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle | Phaser.Physics.Arcade.Sprite,
  text:       string,
  durationMs  = 4500,
) {
  if (!scene || !scene.add || !scene.tweens) return
  if (!petSprite || !petSprite.scene || petSprite.scene !== scene) return

  const trimmed = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS - 1) + '…' : text

  // Build the text first so we know how big to draw the box.
  const txt = scene.add.text(0, 0, trimmed, {
    fontFamily: '"Press Start 2P", monospace',
    fontSize:   `${FONT_PX}px`,
    color:      '#0a0c2e',
    wordWrap:   { width: WRAP_PX },
    align:      'center',
  }).setOrigin(0.5, 0.5).setResolution(2)

  const w = Math.max(28, Math.ceil(txt.width))  + PAD_X * 2
  const h = Math.ceil(txt.height) + PAD_Y * 2

  // Container origin sits at the BOTTOM-CENTER of where the tail's tip lands.
  // The bubble extends upward from y=0 (tail tip), and the body is above the tail.
  const TAIL_HEIGHT = 8
  const bodyTopY    = -h - TAIL_HEIGHT
  const bodyBotY    = -TAIL_HEIGHT

  // Graphics handles the border, fill, and pixel-stepped tail in one draw call.
  const g = scene.add.graphics()
  // Outer black border (offset 2px on every side).
  g.fillStyle(COLOR_BORDER, 1)
  g.fillRect(-w / 2 - 2, bodyTopY - 2, w + 4, h + 4)
  // Cream inner fill.
  g.fillStyle(COLOR_FILL, 1)
  g.fillRect(-w / 2, bodyTopY, w, h)
  // Stair-stepped pixel tail — black silhouette, 4 rows of decreasing width.
  g.fillStyle(COLOR_BORDER, 1)
  g.fillRect(-5, bodyBotY,        10, 2)
  g.fillRect(-4, bodyBotY + 2,     8, 2)
  g.fillRect(-3, bodyBotY + 4,     6, 2)
  g.fillRect(-2, bodyBotY + 6,     4, 2)
  // Cream inside (1px in from the black silhouette so the outline is visible).
  g.fillStyle(COLOR_FILL, 1)
  g.fillRect(-4, bodyBotY,         8, 2)
  g.fillRect(-3, bodyBotY + 2,     6, 2)
  g.fillRect(-2, bodyBotY + 4,     4, 2)
  g.fillRect(-1, bodyBotY + 6,     2, 2)

  // Position text inside the body.
  txt.setPosition(0, bodyTopY + h / 2)

  // Anchor the container so the tail-tip points at the pet's head area.
  const container = scene.add.container(petSprite.x, petSprite.y - 18, [g, txt])
  container.setDepth(100)

  // Arcade pop-in — bounce into existence.
  container.setScale(0.6).setAlpha(0)
  scene.tweens.add({
    targets:  container,
    scale:    1,
    alpha:    1,
    duration: 220,
    ease:     'Back.Out',
  })

  // Subtle settle wobble while the bubble is up.
  scene.tweens.add({
    targets:  container,
    y:        petSprite.y - 20,
    duration: 1000,
    yoyo:     true,
    repeat:   -1,
    ease:     'Sine.InOut',
  })

  // Fade-out at the end.
  scene.tweens.add({
    targets:    container,
    alpha:      0,
    delay:      durationMs - 280,
    duration:   280,
    onComplete: () => container.destroy(),
  })
}
