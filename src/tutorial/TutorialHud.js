import Phaser from 'phaser'
import { bindButton } from '../fx/UiSound.js'

const HEAD = 'Rowdies, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'
const INK = 0x16200f

/**
 * The tutorial overlay, drawn by UIScene: a coach card with the current step,
 * the keys for it (lit while held), progress, a hint when a step drags on, an
 * arrow to the objective, and the finish panel.
 */
export default class TutorialHud {
  constructor(ui) {
    this.ui = ui
    this.game = ui.game_
    this.t = this.game.tutorial

    this.card = ui.add.graphics().setDepth(700)
    this.stepText = ui.add.text(0, 0, '', { fontFamily: MONO, fontSize: '11px', color: '#c9b8ff' }).setOrigin(0.5, 0).setDepth(701)
    this.titleText = ui.add.text(0, 0, '', { fontFamily: HEAD, fontSize: '24px', color: '#fff8d8' }).setOrigin(0.5, 0).setDepth(701)
    this.bodyText = ui.add.text(0, 0, '', {
      fontFamily: MONO, fontSize: '13px', color: '#e8f0d6', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(701)
    this.hintText = ui.add.text(0, 0, '', { fontFamily: MONO, fontSize: '12px', color: '#ffd964' }).setOrigin(0.5, 0).setDepth(701)
    this.caps = ui.add.graphics().setDepth(701)
    this.capTexts = []
    this.arrow = ui.add.graphics().setDepth(390)

    const keys = this.game.input.keyboard
    this.held = {
      W: keys.addKey('W'), A: keys.addKey('A'), S: keys.addKey('S'), D: keys.addKey('D'),
      SPACE: keys.addKey('SPACE'), Q: keys.addKey('Q'), E: keys.addKey('E'),
    }

    ui.status?.setVisible(false)
    ui.statusSub?.setVisible(false)
    ui.hint?.setText('TAB  SKIP THIS STEP      ESC  LEAVE THE TUTORIAL      M  MUTE')
    ui.layoutHintPlate?.()

    this.panel = null
    ui.input.keyboard.on('keydown-ENTER', () => this.primary?.())
  }

  update(player) {
    const ui = this.ui
    const t = this.t
    const { width, height } = ui.scale
    const cx = width / 2
    ui.fieldText?.setVisible(false)

    if (t.finished) {
      this.hideCard()
      this.showFinish(width, height)
      return
    }
    const step = t.step
    if (!step) return this.hideCard()

    const celebrating = t.celebrateUntil > this.game.time.now
    // The card sits at the bottom: objectives tend to be ahead of you, and a
    // card at the top of the screen covered the very marker it pointed to.
    this.bodyText.setText(step.text)
    const capsH = step.keys.length ? 34 : 0
    const cardH = 62 + this.bodyText.height + 12 + capsH + 26
    const top = height - cardH - 62
    this.stepText.setPosition(cx, top + 10).setText(`STEP ${t.index + 1} OF ${t.steps.length}`)
    this.titleText.setPosition(cx, top + 26).setText(celebrating ? `${step.title}  ✓` : step.title)
      .setColor(celebrating ? '#ffd964' : '#fff8d8')
    this.bodyText.setPosition(cx, top + 62)

    const capsY = top + 62 + this.bodyText.height + 12
    this.drawCaps(step.keys, cx, capsY)

    const barY = capsY + capsH + 4
    const cardW = Math.max(460, this.bodyText.width + 60)
    this.card.clear()
    this.card.fillStyle(0x000000, 0.25).fillRoundedRect(cx - cardW / 2 + 4, top + 6, cardW, cardH, 16)
    this.card.fillStyle(0x1d2b12, 0.9).fillRoundedRect(cx - cardW / 2, top, cardW, cardH, 16)
    this.card.lineStyle(3, celebrating ? 0xffd964 : 0x5f9330, 1).strokeRoundedRect(cx - cardW / 2, top, cardW, cardH, 16)

    // Steps along the bottom edge of the card; the current one wider.
    const n = t.steps.length
    for (let i = 0; i < n; i++) {
      const x = cx - (n - 1) * 9 + i * 18
      const done = i < t.index || (i === t.index && celebrating)
      this.card.fillStyle(done ? 0xffd964 : i === t.index ? 0xfff8d8 : 0x3a4a2a, 1)
      this.card.fillRoundedRect(x - (i === t.index ? 7 : 4), barY + 2, i === t.index ? 14 : 8, 6, 3)
    }
    if (step.progress && t.progress > 0) {
      const w = cardW - 80
      this.card.fillStyle(0x3a4a2a, 1).fillRoundedRect(cx - w / 2, barY - 8, w, 5, 2)
      this.card.fillStyle(0x9ff0bb, 1).fillRoundedRect(cx - w / 2, barY - 8, w * t.progress, 5, 2)
    }

    this.hintText.setOrigin(0.5, 1).setPosition(cx, top - 10).setText(t.hint ? `TIP  ${t.hint}` : '')
    this.drawArrow(player)
  }

  drawCaps(keys, cx, y) {
    const pointer = this.game.input.activePointer
    const heldOf = k => Boolean(this.held[k]?.isDown || (k === 'LEFT CLICK' && pointer.leftButtonDown()))
    // Rebuilt only when something visible changes, not every frame.
    const sig = `${keys.join()}|${keys.map(heldOf).join()}|${cx}|${y}`
    if (sig === this.capsSig) return
    this.capsSig = sig
    this.caps.clear()
    this.capTexts.forEach(x => x.destroy())
    this.capTexts = []
    if (!keys.length) return
    const widths = keys.map(k => Math.max(34, k.length * 9 + 20))
    const total = widths.reduce((a, b) => a + b, 0) + (keys.length - 1) * 8
    let x = cx - total / 2
    keys.forEach((k, i) => {
      const w = widths[i]
      const held = heldOf(k)
      this.caps.fillStyle(0x000000, 0.35).fillRoundedRect(x, y + 4, w, 28, 7)
      this.caps.fillStyle(held ? 0xffd964 : 0xfff8d8, 1).fillRoundedRect(x, y + (held ? 3 : 0), w, 26, 7)
      this.capTexts.push(this.ui.add.text(x + w / 2, y + 13 + (held ? 3 : 0), k, {
        fontFamily: HEAD, fontSize: '12px', color: '#2b2200',
      }).setOrigin(0.5).setDepth(702))
      x += w + 8
    })
  }

  /** An arrow around your Axie toward the objective, when it is off screen. */
  drawArrow(player) {
    const g = this.arrow
    g.clear()
    const goal = this.t.goal
    if (!goal || !player?.alive) return
    const cam = this.game.cameras.main
    const view = cam.worldView
    const { width, height } = this.ui.scale
    const sx = (goal.x - view.x) * cam.zoom
    const sy = (goal.y - view.y) * cam.zoom
    if (sx > 60 && sx < width - 60 && sy > 60 && sy < height - 60) return
    const px = (player.x - view.x) * cam.zoom
    const py = (player.y - 30 - view.y) * cam.zoom
    const a = Math.atan2(sy - py, sx - px)
    const x = px + Math.cos(a) * 118
    const y = py + Math.sin(a) * 118
    g.fillStyle(INK, 0.75).fillCircle(x, y, 20)
    g.fillStyle(0xffd964, 1).fillTriangle(
      x + Math.cos(a) * 18, y + Math.sin(a) * 18,
      x + Math.cos(a + 2.4) * 11, y + Math.sin(a + 2.4) * 11,
      x + Math.cos(a - 2.4) * 11, y + Math.sin(a - 2.4) * 11,
    )
  }

  hideCard() {
    this.capsSig = null
    this.card.clear()
    this.caps.clear()
    this.capTexts.forEach(x => x.destroy())
    this.capTexts = []
    this.arrow.clear()
    for (const x of [this.stepText, this.titleText, this.bodyText, this.hintText]) x.setText('')
  }

  showFinish(width, height) {
    if (this.panel) return
    const ui = this.ui
    const root = ui.add.container(width / 2, height / 2).setDepth(900)
    this.panel = root
    const pw = 560
    const ph = 300
    const bg = ui.add.graphics()
    bg.fillStyle(INK, 0.45).fillRect(-width / 2, -height / 2, width, height)
    bg.fillStyle(0x1d2b12, 0.97).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 20)
    bg.lineStyle(3, 0xffd964, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 20)
    root.add(bg)
    root.add(ui.add.text(0, -ph / 2 + 24, 'TUTORIAL COMPLETE', { fontFamily: HEAD, fontSize: '34px', color: '#ffd964' }).setOrigin(0.5, 0))
    root.add(ui.add.text(0, -ph / 2 + 80,
      'You can move, hit, dash, charge a special, parry, grab power-ups,\nheal, hide, win a fight and cash out at a Moon Gate.\nThat is the whole game. The Wilds are open.', {
        fontFamily: MONO, fontSize: '13px', color: '#f4f8e8', align: 'center', lineSpacing: 5,
      }).setOrigin(0.5, 0))

    const go = (key, data) => {
      ui.scene.stop('GameScene')
      ui.scene.start(key, data)
    }
    const builds = this.game.builds
    this.primary = () => go('MenuScene', { builds, mode: 'wilds' })
    root.add(button(ui, -95, ph / 2 - 56, 'ENTER THE WILDS', 0xffc22e, this.primary))
    root.add(button(ui, 95, ph / 2 - 56, 'PLAY IT AGAIN', 0x9aa88a, () => go('GameScene', { builds, mode: 'tutorial', playerClass: this.game.playerClass })))
  }
}

function button(ui, x, y, label, color, onClick) {
  const c = ui.add.container(x, y)
  const w = 164
  const h = 46
  const g = ui.add.graphics()
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 3, -h / 2 + 6, w, h, 12)
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12)
  const t = ui.add.text(0, 0, label, { fontFamily: HEAD, fontSize: '14px', color: '#2b2200' }).setOrigin(0.5)
  const zone = ui.add.zone(0, 0, w, h)
  bindButton(ui, zone, onClick)
  c.add([g, t, zone])
  return c
}
