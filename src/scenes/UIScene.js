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

    // Built on first update, once the chosen class's max HP is known.
    this.pips = []

    this.label = this.add.text(34, 66, 'HP', {
      fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#6f6892',
    })

    this.status = this.add.text(this.scale.width - 34, 34, '', {
      fontFamily: 'ui-monospace, monospace', fontSize: '15px', color: '#e8e4f5',
    }).setOrigin(1, 0)

    this.statusSub = this.add.text(this.scale.width - 34, 56, 'RIVALS REMAIN', {
      fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#6f6892',
    }).setOrigin(1, 0)

    // Dash cooldown, read at a glance next to the health pips.
    this.dashBg = this.add.rectangle(34, 92, 130, 5, 0x2a2440).setOrigin(0, 0.5)
    this.dashBar = this.add.rectangle(34, 92, 0, 5, 0x7ce8ff).setOrigin(0, 0.5)
    this.dashLabel = this.add.text(34, 102, 'DASH', {
      fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#6f6892',
    })

    this.hint = this.add.text(34, this.scale.height - 40,
      'WASD  MOVE      MOUSE  AIM      CLICK  ATTACK      SPACE  DASH', {
        fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#6f6892',
      })

    this.scale.on('resize', this.layout, this)
  }

  layout(size) {
    this.status?.setPosition(size.width - 34, 34)
    this.statusSub?.setPosition(size.width - 34, 56)
    this.hint?.setY(size.height - 40)
  }

  buildPips(count, color) {
    this.pips.forEach(p => p.destroy())
    this.pips = []
    for (let i = 0; i < count; i++) {
      this.pips.push(
        this.add.circle(34 + i * 24, 40, 8, color).setStrokeStyle(3, 0x0b0918, 0.9),
      )
    }
  }

  update() {
    const player = this.game_?.player
    if (!player) return

    if (this.pips.length !== player.maxHp) this.buildPips(player.maxHp, player.colors.body)

    this.pips.forEach((pip, i) => {
      const on = i < player.hp
      pip.setFillStyle(on ? player.colors.body : 0x2a2440)
      pip.setScale(on ? 1 : 0.68)
    })

    const alive = this.game_.bots.filter(b => b.alive).length
    this.status.setText(String(alive).padStart(2, '0'))

    const now = this.game_.time.now
    const charge = Phaser.Math.Clamp((now - player.lastDash) / player.dashCooldown, 0, 1)
    this.dashBar.width = 130 * charge
    this.dashBar.setFillStyle(charge >= 1 ? 0x7ce8ff : 0x4a4570)
    this.dashLabel.setColor(charge >= 1 ? '#7ce8ff' : '#6f6892')
  }
}
