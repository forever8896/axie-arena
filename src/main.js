import Phaser from 'phaser'
import GameScene from './scenes/GameScene.js'
import UIScene from './scenes/UIScene.js'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#12121a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { pixelArt: false, antialias: true },
  scene: [GameScene, UIScene],
})

// Dev-only handle for poking at the running game from the console.
// Dead-code eliminated from the production build.
if (import.meta.env.DEV) window.__game = game
