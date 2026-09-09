import Phaser from 'phaser'

/**
 * HUD lives in its own scene so camera zoom, shake and post-processing on the
 * game camera never touch it. Reads game state; never writes it.
 */
export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' })
  }

  create() {
    this.game_ = this.scene.get('GameScene')

    this.pips = []
    for (let i = 0; i < 5; i++) {
      const pip = this.add.circle(34 + i * 26, 40, 9, 0xffb812)
        .setStrokeStyle(3, 0x0b0918, 0.9)
      this.pips.push(pip)
    }

    this.label = this.add.text(34, 66, 'HP', {
      fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#6f6892',
    })

    this.status = this.add.text(this.scale.width - 34, 34, '', {
      fontFamily: 'ui-monospace, monospace', fontSize: '15px', color: '#e8e4f5',
    }).setOrigin(1, 0)

    this.statusSub = this.add.text(this.scale.width - 34, 56, 'RIVALS REMAIN', {
      fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#6f6892',
    }).setOrigin(1, 0)

    this.hint = this.add.text(34, this.scale.height - 40, 'WASD  MOVE          SPACE  ATTACK', {
      fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#6f6892',
    })

    this.scale.on('resize', this.layout, this)
  }

  layout(size) {
    this.status?.setPosition(size.width - 34, 34)
    this.statusSub?.setPosition(size.width - 34, 56)
    this.hint?.setY(size.height - 40)
  }

  update() {
    const player = this.game_?.player
    if (!player) return

    this.pips.forEach((pip, i) => {
      const on = i < player.hp
      pip.setFillStyle(on ? player.colors.body : 0x2a2440)
      pip.setScale(on ? 1 : 0.68)
    })

    const alive = this.game_.bots.filter(b => b.alive).length
    this.status.setText(String(alive).padStart(2, '0'))
  }
}
