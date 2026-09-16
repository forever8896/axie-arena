import Phaser from 'phaser'
import { WILDS, money } from './config.js'
import { wallet } from './Wallet.js'
import { bindButton } from '../fx/UiSound.js'

const HEAD = 'Rowdies, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'
const INK = 0x16200f

/**
 * The Endless Wilds overlay, drawn by UIScene: what you carry, where to cash
 * it out, who is worth hunting, what just happened, and the choices when you
 * fall or leave.
 */
export default class WildsHud {
  constructor(ui) {
    this.ui = ui
    this.game = ui.game_
    this.wilds = this.game.wilds
    const room = this.wilds.room

    this.topPlate = ui.add.graphics().setDepth(400)
    this.roomText = ui.add.text(0, 24, `${room.name.toUpperCase()}  ·  ${room.free ? 'FREE' : money(room.stake, 'AXS') + ' STAKE'}`, {
      fontFamily: MONO, fontSize: '11px', color: '#c9b8ff',
    }).setOrigin(0.5, 0).setDepth(401)
    this.bountyText = ui.add.text(0, 40, '', {
      fontFamily: HEAD, fontSize: '28px', color: '#ffd964', stroke: '#16200f', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(401)
    this.hintText = ui.add.text(0, 80, '', {
      fontFamily: MONO, fontSize: '11px', color: '#e8f0d6',
    }).setOrigin(0.5, 0).setDepth(401)

    this.arrows = ui.add.graphics().setDepth(390)

    const colX = () => ui.scale.width - 34
    this.topTitle = ui.add.text(colX(), 0, 'TOP BOUNTIES', { fontFamily: MONO, fontSize: '11px', color: '#b9c4a6' })
      .setOrigin(1, 0).setDepth(500)
    this.topRows = [0, 1, 2].map(() => ui.add.text(colX(), 0, '', { fontFamily: MONO, fontSize: '12px', color: '#f4f8e8' })
      .setOrigin(1, 0).setDepth(500))
    this.feedRows = [0, 1, 2, 3, 4, 5].map(() => ui.add.text(colX(), 0, '', { fontFamily: MONO, fontSize: '11px', color: '#e8f0d6' })
      .setOrigin(1, 0).setDepth(500))
    this.sidePlate = ui.add.graphics().setDepth(499)

    this.channelBar = ui.add.graphics().setDepth(600)
    this.channelText = ui.add.text(0, 0, '', { fontFamily: HEAD, fontSize: '16px', color: '#efe8ff', stroke: '#16200f', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(601)

    this.disclaimer = ui.add.text(0, 0, 'PROTOTYPE  ·  SIMULATED BALANCES, NO REAL VALUE  ·  OTHER HUNTERS ARE AI STAND-INS', {
      fontFamily: MONO, fontSize: '10px', color: '#b9c4a6',
    }).setOrigin(1, 1).setDepth(500).setAlpha(0.8)

    this.panelRoot = null
    this.panelFor = null
    ui.input.keyboard.on('keydown-ENTER', () => this.primary?.())

    ui.statusSub?.setText('HUNTERS IN THE ROOM')
    ui.hint?.setText('WASD  MOVE     MOUSE  AIM     LEFT  ATTACK     RIGHT / E  SPECIAL     Q  PARRY     SPACE  DASH     ESC  LEAVE     M  MUTE')
    ui.layoutHintPlate?.()
  }

  update(player) {
    const ui = this.ui
    const w = this.wilds
    const now = this.game.time.now
    const { width, height } = ui.scale
    const cx = width / 2
    const cur = w.currency

    // Top: what you carry.
    this.roomText.setX(cx)
    const carrying = player?.alive ? player.wilds.bounty : 0
    this.bountyText.setX(cx).setText(player?.alive ? `BOUNTY  ${money(carrying, cur)}` : 'NOT IN THE WILDS')
      .setColor(player?.alive ? '#ffd964' : '#b9c4a6')
    let hint = 'REACH A MOON GATE AND STAND IN IT TO CASH OUT'
    if (player?.alive && player.shielded) hint = 'ARRIVAL SHIELD  ·  YOU CANNOT BE HURT OR STRIKE YET'
    else if (w.hotspot) hint = 'BLOOD MOON  ·  HEALING AND POWER-UPS AT THE RED RING'
    this.hintText.setX(cx).setText(hint)
    this.topPlate.clear()
    const pw = Math.max(this.bountyText.width, this.hintText.width) + 48
    this.topPlate.fillStyle(INK, 0.62).fillRoundedRect(cx - pw / 2, 16, pw, 84, 12)
    ui.fieldText?.setVisible(false)
    ui.announceText?.setY(118)

    this.drawGateArrows(player)
    this.drawSide(width)
    this.drawChannel(player, cx, height)
    this.disclaimer.setPosition(width - 18, height - 12)
    this.syncPanel(width, height)
  }

  /**
   * A compass ring around your Axie: one arrow per open gate you cannot see.
   * Around the player rather than at the screen edge, where it covered HUD.
   */
  drawGateArrows(player) {
    const g = this.arrows
    g.clear()
    if (!player?.alive) return
    const cam = this.game.cameras.main
    const view = cam.worldView
    const { width, height } = this.ui.scale
    const px = (player.x - view.x) * cam.zoom
    const py = (player.y - 30 - view.y) * cam.zoom
    for (const gate of this.wilds.gates) {
      if (!gate.open) continue
      const sx = (gate.x - view.x) * cam.zoom
      const sy = (gate.y - view.y) * cam.zoom
      if (sx > 40 && sx < width - 40 && sy > 40 && sy < height - 40) continue
      const a = Math.atan2(sy - py, sx - px)
      const x = px + Math.cos(a) * 118
      const y = py + Math.sin(a) * 118
      const color = gate.closing ? 0xff8098 : 0xc9b8ff
      const tip = 18
      g.fillStyle(INK, 0.7).fillCircle(x, y, 20)
      g.fillStyle(color, 1)
      g.fillTriangle(
        x + Math.cos(a) * tip, y + Math.sin(a) * tip,
        x + Math.cos(a + 2.4) * 11, y + Math.sin(a + 2.4) * 11,
        x + Math.cos(a - 2.4) * 11, y + Math.sin(a - 2.4) * 11,
      )
    }
  }

  drawSide(width) {
    const ui = this.ui
    const w = this.wilds
    const x = width - 34
    let y = 290
    this.topTitle.setPosition(x, y)
    y += 18
    const top = w.topHunters(3)
    this.topRows.forEach((row, i) => {
      const f = top[i]
      row.setPosition(x, y + i * 17)
      if (!f) return row.setText('')
      row.setText(`${f.isPlayer ? 'YOU' : f.name}  ${money(f.wilds.bounty, w.currency)}`)
        .setColor(f.isPlayer ? '#ffd964' : f.wilds.leaving ? '#c9b8ff' : '#f4f8e8')
    })
    y += 3 * 17 + 16
    const now = this.game.time.now
    this.feedRows.forEach((row, i) => {
      const e = w.events[i]
      row.setPosition(x, y + i * 16)
      if (!e) return row.setText('')
      row.setText(e.text).setColor(e.color).setAlpha(Phaser.Math.Clamp(1 - (now - e.at - 9000) / 3000, 0.25, 1))
    })
    const widest = Math.max(this.topTitle.width, ...this.topRows.map(r => r.width), ...this.feedRows.map(r => r.width))
    this.sidePlate.clear()
    this.sidePlate.fillStyle(INK, 0.55).fillRoundedRect(x - widest - 16, 280, widest + 32, y + 6 * 16 - 270, 10)
    ui.status?.setText(String(this.game.fighters.filter(f => f.alive).length).padStart(2, '0'))
  }

  drawChannel(player, cx, height) {
    const g = this.channelBar
    g.clear()
    const ch = player?.alive && player.channel
    if (!ch) {
      this.channelText.setText('')
      return
    }
    const interrupted = ch.interruptedAt && this.game.time.now - ch.interruptedAt < 500
    const w = 280
    const y = height - 110
    g.fillStyle(INK, 0.75).fillRoundedRect(cx - w / 2 - 6, y - 6, w + 12, 24, 10)
    g.fillStyle(interrupted ? 0xff8098 : 0xc9b8ff, 1).fillRoundedRect(cx - w / 2, y, w * (ch.progress ?? 0), 12, 6)
    const left = Math.max(0, (1 - (ch.progress ?? 0)) * WILDS.extractMs / 1000)
    this.channelText.setPosition(cx, y - 18)
      .setText(interrupted ? 'INTERRUPTED' : `EXTRACTING  ${left.toFixed(1)}s`)
      .setColor(interrupted ? '#ff8098' : '#efe8ff')
  }

  // --- Panels ------------------------------------------------------------

  syncPanel(width, height) {
    const panel = this.wilds.panel
    if (panel === this.panelFor) return
    this.panelRoot?.destroy()
    this.panelRoot = null
    this.primary = null
    this.panelFor = panel
    if (!panel) return

    const ui = this.ui
    const w = this.wilds
    const room = w.room
    const cur = w.currency
    const root = ui.add.container(width / 2, height / 2).setDepth(900)
    this.panelRoot = root

    const pw = 460
    const ph = 250
    const bg = ui.add.graphics()
    bg.fillStyle(INK, 0.5).fillRect(-width / 2, -height / 2, width, height)
    bg.fillStyle(0x1d2b12, 0.97).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 18)
    const accent = panel.kind === 'extracted' ? 0xffd964 : panel.kind === 'leave' ? 0xc9b8ff : 0xff8098
    bg.lineStyle(3, accent, 1).strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 18)
    root.add(bg)

    const titles = { fell: 'YOU FELL', extracted: 'EXTRACTED', leave: 'LEAVE THE WILDS?', left: 'YOU LEFT THE WILDS' }
    root.add(ui.add.text(0, -ph / 2 + 22, titles[panel.kind], {
      fontFamily: HEAD, fontSize: '32px', color: `#${accent.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5, 0))

    let body = ''
    if (panel.kind === 'fell') {
      body = panel.killer ? `${panel.killer} took your ${money(panel.lost, cur)} bounty.` : `Your ${money(panel.lost, cur)} lies where you fell.`
    } else if (panel.kind === 'extracted') {
      body = `+${money(panel.amount, cur)} to your ${room.free ? 'season points' : 'balance'}.`
    } else if (panel.kind === 'leave') {
      body = `Leaving without a Moon Gate drops your ${money(panel.bounty, cur)}\nwhere you stand, for another hunter to take.`
    } else {
      body = panel.lost > 0 ? `Your ${money(panel.lost, cur)} stays in the Wilds.` : 'You left with nothing at stake.'
    }
    root.add(ui.add.text(0, -ph / 2 + 74, body, {
      fontFamily: MONO, fontSize: '13px', color: '#f4f8e8', align: 'center',
    }).setOrigin(0.5, 0))

    const s = wallet.session
    const summary = room.free
      ? `Season points ${Math.round(wallet.balance('PTS'))}`
      : `Balance ${money(wallet.balance('AXS'), 'AXS')}  ·  session net ${signed(s.extracted - s.staked)} AXS`
    root.add(ui.add.text(0, -ph / 2 + 130, summary, { fontFamily: MONO, fontSize: '11px', color: '#b9c4a6' }).setOrigin(0.5, 0))

    const btnY = ph / 2 - 50
    if (panel.kind === 'leave') {
      this.primary = () => { w.panel = null }
      root.add(button(ui, -110, btnY, 'KEEP HUNTING', 0xffc22e, true, this.primary))
      root.add(button(ui, 110, btnY, 'DROP IT, LEAVE', 0x9aa88a, true, () => w.forfeit()))
    } else {
      const afford = wallet.canAfford(room)
      this.primary = afford ? () => w.reenter() : null
      const label = room.free ? 'RE-ENTER · FREE' : `RE-ENTER · ${money(room.stake, 'AXS')}`
      root.add(button(ui, -110, btnY, afford ? label : 'BALANCE TOO LOW', 0xffc22e, afford, this.primary))
      root.add(button(ui, 110, btnY, 'BACK TO LOBBY', 0x9aa88a, true, () => w.toLobby()))
      root.add(ui.add.text(0, ph / 2 - 16, 'ENTER  RE-ENTER      ESC  LOBBY', { fontFamily: MONO, fontSize: '10px', color: '#7f8c6a' }).setOrigin(0.5))
    }
  }

  destroy() {
    this.panelRoot?.destroy()
  }
}

const signed = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`

function button(ui, x, y, label, color, enabled, onClick) {
  const c = ui.add.container(x, y)
  const w = 196
  const h = 46
  const g = ui.add.graphics()
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 3, -h / 2 + 6, w, h, 12)
  g.fillStyle(enabled ? color : 0x4a5238, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12)
  const t = ui.add.text(0, 0, label, {
    fontFamily: HEAD, fontSize: '16px', color: enabled ? '#2b2200' : '#9aa88a',
  }).setOrigin(0.5)
  c.add([g, t])
  if (enabled && onClick) {
    const zone = ui.add.zone(0, 0, w, h)
    bindButton(ui, zone, onClick)
    c.add(zone)
  }
  return c
}
