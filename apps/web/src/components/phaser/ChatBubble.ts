import * as Phaser from 'phaser'

const MAX_CHARS = 90   // keep bubbles compact — long LLM responses get truncated
const FONT_PX   = 8    // Phaser camera is 1.5x zoom; effective ~12px on screen
const WRAP_PX   = 130  // narrow bubble keeps it readable + above the speaker

export function showChatBubble(
  scene:      Phaser.Scene,
  petSprite:  Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle | Phaser.Physics.Arcade.Sprite,
  text:       string,
  durationMs  = 4500,    // matches Hub's 10s convo pause; bubble still visible most of pause
) {
  // Guard: scene may be destroyed (HMR / page-nav) but a chat event arrived
  // late on the still-open socket. Drop silently rather than crashing.
  if (!scene || !scene.add || !scene.tweens) return
  if (!petSprite || !petSprite.scene || petSprite.scene !== scene) return

  const trimmed = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS - 1) + '…' : text

  const bubble = scene.add
    .text(petSprite.x, petSprite.y - 28, trimmed, {
      fontSize:        `${FONT_PX}px`,
      backgroundColor: '#fff5f5',
      color:           '#0a0c2e',
      padding:         { x: 4, y: 2 },
      wordWrap:        { width: WRAP_PX },
      align:           'center',
      fontFamily:      'monospace',
    })
    .setOrigin(0.5, 1)
    .setDepth(100)
    .setResolution(2)   // sharper pixels at zoom

  scene.tweens.add({
    targets:  bubble,
    alpha:    0,
    delay:    durationMs - 300,
    duration: 300,
    onComplete: () => bubble.destroy(),
  })
}
