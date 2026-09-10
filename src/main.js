import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import GameScene from './scenes/GameScene.js'
import MenuScene from './scenes/MenuScene.js'
import ResultScene from './scenes/ResultScene.js'
import UIScene from './scenes/UIScene.js'

// Rowdies must be available before Phaser measures any text, or headings
// render in the fallback face and never re-lay out.
async function start() {
  try {
    await document.fonts?.ready
  } catch {
    // Fonts blocked or unsupported: fall back to the system stack.
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#12121a',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: { pixelArt: false, antialias: true },
    scene: [BootScene, MenuScene, GameScene, UIScene, ResultScene],
  })

  // Dev-only handle for poking at the running game from the console.
  // Dead-code eliminated from the production build.
  if (import.meta.env.DEV) window.__game = game
}

start()

