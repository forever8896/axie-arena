import Phaser from 'phaser'
import { WORLD } from '../arena/Arena.js'

const MINIMAP = { size: 186, pad: 22 }

const MONO = 'ui-monospace, monospace'
const hex = v => `#${v.toString(16).padStart(6, '0')}`

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

    // The field is bright, so the readouts sit on their own dark plate.
    this.plate = this.add.graphics().setDepth(-1)
    this.plate.fillStyle(0x16200f, 0.62)
    this.plate.fillRoundedRect(18, 20, 190, 128, 12)

    this.hintPlate = this.add.graphics().setDepth(-1)

    // Built on first update, once the chosen class's max HP is known.
    this.pips = []

    this.label = this.add.text(34, 66, 'HP', {
      fontFamily: MONO, fontSize: '11px', color: '#b9c4a6',
    })

    this.status = this.add.text(this.scale.width - 34, MINIMAP.size + 34, '', {
      fontFamily: MONO, fontSize: '15px', color: '#f4f8e8',
    }).setOrigin(1, 0).setDepth(500)

    this.statusSub = this.add.text(this.scale.width - 34, MINIMAP.size + 56, 'RIVALS REMAIN', {
      fontFamily: MONO, fontSize: '11px', color: '#b9c4a6',
    }).setOrigin(1, 0).setDepth(500)

    // Dash cooldown, read at a glance next to the health pips.
    this.dashBg = this.add.rectangle(34, 92, 130, 5, 0x2a2440).setOrigin(0, 0.5)
    this.dashBar = this.add.rectangle(34, 92, 0, 5, 0x7ce8ff).setOrigin(0, 0.5)
    this.dashLabel = this.add.text(34, 102, 'DASH', {
      fontFamily: MONO, fontSize: '11px', color: '#b9c4a6',
    })

    // Special charge, named so you always know what it will do.
    this.specialBg = this.add.rectangle(34, 122, 130, 5, 0x2a2440).setOrigin(0, 0.5)
    this.specialBar = this.add.rectangle(34, 122, 0, 5, 0xffb812).setOrigin(0, 0.5)
    this.specialLabel = this.add.text(34, 132, 'SPECIAL', {
      fontFamily: MONO, fontSize: '11px', color: '#b9c4a6',
    })

    this.hint = this.add.text(34, this.scale.height - 40,
      'WASD  MOVE      MOUSE  AIM      LEFT  ATTACK      RIGHT / E  SPECIAL      SPACE  DASH', {
        fontFamily: MONO, fontSize: '12px', color: '#b9c4a6',
      })

    this.buildMinimap()

    this.layoutHintPlate()
    this.scale.on('resize', this.layout, this)
  }

  layoutHintPlate() {
    if (!this.hintPlate || !this.hint) return
    this.hintPlate.clear()
    this.hintPlate.fillStyle(0x16200f, 0.6)
    this.hintPlate.fillRoundedRect(18, this.hint.y - 10, this.hint.width + 32, 32, 10)
  }

  /**
   * Top-right minimap. Cover and foliage are painted once; only the dots and
   * the viewport box are redrawn each frame.
   */
  buildMinimap() {
    const game = this.game_
    if (!game?.arena) return

    this.mmScale = MINIMAP.size / Math.max(WORLD.width, WORLD.height)
    this.mmW = WORLD.width * this.mmScale
    this.mmH = WORLD.height * this.mmScale

    this.mmRoot = this.add.container(0, 0).setDepth(500)

    const bg = this.add.graphics()
    bg.fillStyle(0x16200f, 0.78)
    bg.fillRoundedRect(0, 0, this.mmW, this.mmH, 10)
    bg.lineStyle(1, 0x5f9330, 0.9)
    bg.strokeRoundedRect(0, 0, this.mmW, this.mmH, 10)

    const terrain = this.add.graphics()
    for (const b of game.arena.bushes) {
      terrain.fillStyle(0x2f6b33, 0.75)
      terrain.fillEllipse(b.x * this.mmScale, b.y * this.mmScale,
        b.rx * 2 * this.mmScale, b.ry * 2 * this.mmScale)
    }
    for (const w of game.arena.walls) {
      terrain.fillStyle(0xd9bd85, 0.85)
      terrain.fillRect(w.left * this.mmScale, w.top * this.mmScale,
        w.w * this.mmScale, w.h * this.mmScale)
    }

    this.mmViewport = this.add.graphics()
    this.mmDots = this.add.graphics()

    this.mmRoot.add([bg, terrain, this.mmViewport, this.mmDots])
    this.layoutMinimap()
  }

  layoutMinimap() {
    if (!this.mmRoot) return
    this.mmRoot.setPosition(this.scale.width - this.mmW - MINIMAP.pad, MINIMAP.pad)
  }

  drawMinimap() {
    const game = this.game_
    if (!this.mmDots || !game?.player) return

    const s = this.mmScale
    const cam = game.cameras.main

    this.mmViewport.clear()
    this.mmViewport.lineStyle(1, 0xb9b2d4, 0.55)
    this.mmViewport.strokeRect(
      cam.worldView.x * s, cam.worldView.y * s,
      cam.worldView.width * s, cam.worldView.height * s,
    )

    this.mmDots.clear()
    for (const bot of game.bots) {
      if (!bot.alive) continue
      // Hidden rivals do not show; foliage means something on the map too.
      if (bot.hidden) continue
      this.mmDots.fillStyle(bot.colors.body, 0.95)
      this.mmDots.fillCircle(bot.x * s, bot.y * s, 3.2)
    }

    if (game.player.alive) {
      this.mmDots.fillStyle(0xffffff, 0.35)
      this.mmDots.fillCircle(game.player.x * s, game.player.y * s, 6)
      this.mmDots.fillStyle(game.player.colors.body, 1)
      this.mmDots.fillCircle(game.player.x * s, game.player.y * s, 3.6)
    }
  }

  layout(size) {
    this.status?.setPosition(size.width - 34, MINIMAP.size + 34)
    this.statusSub?.setPosition(size.width - 34, MINIMAP.size + 56)
    this.hint?.setY(size.height - 40)
    this.layoutHintPlate()
    this.layoutMinimap()
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
    if (!player || !this.specialBar) return

    if (!this.mmRoot) this.buildMinimap()
    this.drawMinimap()

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

    const sp = Phaser.Math.Clamp((now - player.lastSpecial) / player.specialCooldown, 0, 1)
    this.specialBar.width = 130 * sp
    this.specialBar.setFillStyle(sp >= 1 ? player.colors.body : 0x4a4570)
    this.specialLabel
      .setText(player.kit?.special?.name?.toUpperCase() ?? 'SPECIAL')
      .setColor(sp >= 1 ? hex(player.colors.body) : '#6f6892')
  }
}
