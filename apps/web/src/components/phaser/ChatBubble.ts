import Phaser from 'phaser'

export function showChatBubble(
  scene:      Phaser.Scene,
  petSprite:  Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  text:       string,
  durationMs  = 3000,
) {
  const bubble = scene.add
    .text(petSprite.x, petSprite.y - 40, text, {
      fontSize:  '12px',
      backgroundColor: '#ffffff',
      color:     '#000000',
      padding:   { x: 4, y: 2 },
      wordWrap:  { width: 160 },
    })
    .setOrigin(0.5, 1)
    .setDepth(100)

  scene.tweens.add({
    targets:  bubble,
    alpha:    0,
    delay:    durationMs - 400,
    duration: 400,
    onComplete: () => bubble.destroy(),
  })
}