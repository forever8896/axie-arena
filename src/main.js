import Phaser from 'phaser'
import BootScene from './scenes/BootScene.js'
import GameScene from './scenes/GameScene.js'
import HomeScene from './scenes/HomeScene.js'
import LobbyScene from './scenes/LobbyScene.js'
import MenuScene from './scenes/MenuScene.js'
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
    // One clock for gameplay. Combat mixes deadlines on scene.time.now (parry
    // windows, stuns, cooldowns) with timers that advance on frame delta (a
    // blow connecting, a special's telegraph). Phaser's smoothing caps that
    // delta on slow or hitching frames while time.now keeps real time, so the
    // two drift: at 10fps a 1000ms timer fired after 24.9s of time.now. A
    // parry could expire before the blow it was meant to catch. Unsmoothed,
    // timers advance on real elapsed time and the two agree.
    fps: { smoothStep: false },
    scene: [BootScene, HomeScene, MenuScene, LobbyScene, GameScene, UIScene],
  })

  // Dev-only handle for poking at the running game from the console.
  // Dead-code eliminated from the production build.
  if (import.meta.env.DEV) window.__game = game
}

start()

