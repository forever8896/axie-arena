import Phaser from 'phaser'
import { CLASS_COLORS, ARENA_PALETTE } from '../axie/palette.js'
import { CLASS_KITS } from '../axie/classKits.js'

const HEAD = 'Rowdies, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'

/**
 * End of match. Overlays the frozen arena so you can see the state you died
 * in, and offers the two things worth offering: same Axie again, or a
 * different one.
 */
export default class ResultScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResultScene' })
  }

  init(data) {
    this.result = data
  }

  create() {
    const { width, height } = this.scale
    const { won, axieClass, kills, seconds, builds } = this.result
    const colors = CLASS_COLORS[axieClass] ?? CLASS_COLORS.beast
    const accent = won ? colors.body : 0xff5c72

    // Light enough that the arena you just fought in still reads behind it.
    this.add.rectangle(0, 0, width, height, ARENA_PALETTE.deep, 0.58)
      .setOrigin(0).setDepth(0)

    const panelW = 420
    const panelH = 290
    const panel = this.add.graphics().setDepth(1)
    panel.fillStyle(0x1a1436, 0.98)
    panel.fillRoundedRect((width - panelW) / 2, (height - panelH) / 2, panelW, panelH, 18)
    panel.lineStyle(2, accent, 0.9)
    panel.strokeRoundedRect((width - panelW) / 2, (height - panelH) / 2, panelW, panelH, 18)

    const top = (height - panelH) / 2

    this.add.text(width / 2, top + 34, won ? 'VICTORY' : 'DEFEATED', {
      fontFamily: HEAD, fontSize: '42px', color: hex(accent),
    }).setOrigin(0.5, 0).setDepth(2)

    this.add.text(width / 2, top + 90,
      won ? 'Last Axie standing' : `${CLASS_KITS[axieClass]?.title ?? 'Your Axie'} went down`, {
        fontFamily: MONO, fontSize: '12px', color: '#8b83ad',
      }).setOrigin(0.5, 0).setDepth(2)

    this.add.text(width / 2, top + 128, `${kills}  RIVALS DEFEATED        ${seconds}s  SURVIVED`, {
      fontFamily: MONO, fontSize: '13px', color: '#e8e4f5',
    }).setOrigin(0.5, 0).setDepth(2)

    this.button(width / 2, top + 186, 'FIGHT AGAIN', accent, () => {
      this.scene.stop('GameScene')
      this.scene.stop('UIScene')
      this.scene.stop()
      this.scene.start('GameScene', { builds, playerClass: axieClass })
    })

    this.button(width / 2, top + 236, 'CHOOSE ANOTHER AXIE', 0x5f5980, () => {
      this.scene.stop('GameScene')
      this.scene.stop('UIScene')
      this.scene.stop()
      this.scene.start('MenuScene', { builds })
    })

    this.input.keyboard.on('keydown-ENTER', () => {
      this.scene.stop('GameScene')
      this.scene.stop('UIScene')
      this.scene.stop()
      this.scene.start('GameScene', { builds, playerClass: axieClass })
    })
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.stop('GameScene')
      this.scene.stop('UIScene')
      this.scene.stop()
      this.scene.start('MenuScene', { builds })
    })

    this.add.text(width / 2, top + panelH - 26, 'ENTER  AGAIN        ESC  CHOOSE', {
      fontFamily: MONO, fontSize: '10px', color: '#5f5980',
    }).setOrigin(0.5, 0).setDepth(2)
  }

  button(x, y, label, color, onClick) {
    const w = 300
    const h = 38
    const g = this.add.graphics().setDepth(2)
    const draw = (hover) => {
      g.clear()
      g.fillStyle(color, hover ? 0.22 : 0.1)
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 10)
      g.lineStyle(hover ? 2 : 1, color, hover ? 1 : 0.6)
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10)
    }
    draw(false)

    const text = this.add.text(x, y, label, {
      fontFamily: MONO, fontSize: '13px', color: hex(color),
    }).setOrigin(0.5).setDepth(3)

    const zone = this.add.zone(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .setDepth(3)
    zone.on('pointerover', () => { draw(true); text.setColor('#ffffff') })
    zone.on('pointerout', () => { draw(false); text.setColor(hex(color)) })
    zone.on('pointerdown', onClick)
  }
}

const hex = v => `#${v.toString(16).padStart(6, '0')}`
