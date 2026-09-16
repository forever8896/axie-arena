import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'
import { makeGrassTexture } from '../arena/Arena.js'
import { CLASS_KITS } from '../axie/classKits.js'
import { ambientMotes } from '../fx/Juice.js'
import { ROOMS, WILDS, money } from '../wilds/config.js'
import { wallet } from '../wilds/Wallet.js'
import { play as playMusic } from '../fx/Music.js'
import { bindButton, uiSound } from '../fx/UiSound.js'

const HEAD = 'Rowdies, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'
const INK = 0x16200f
const CREAM = '#fff8d8'

/**
 * The Endless Wilds lobby: every room that is running, who is in it, what it
 * costs, and your practice balance. The point of the mode is visible here —
 * no queue, no waiting: pick a room and you are in.
 */
export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' })
  }

  init(data) {
    this.builds = data.builds
    this.playerClass = data.playerClass
    // Live room state survives a resize-restart.
    this.live = data.live ?? ROOMS.map(r => ({
      hunters: Phaser.Math.Between(...r.hunters),
      topBounty: (r.free ? r.stake : r.stake * (1 - WILDS.feeRate)) * Phaser.Math.FloatBetween(2, 5),
    }))
  }

  create() {
    this.leaving = false
    playMusic('theme')
    const { width, height } = this.scale
    makeGrassTexture(this)
    this.add.tileSprite(0, 0, width, height, 'field-grass').setOrigin(0).setDepth(-100)
    this.add.rectangle(0, 0, width, height, INK, 0.55).setOrigin(0).setDepth(-99)
    ambientMotes(this, { left: 0, top: 0, right: width, bottom: height })

    const pad = Math.max(24, Math.min(48, width * 0.03))
    if (this.textures.exists('brand-logo')) {
      const logo = this.add.image(pad, 18, 'brand-logo').setOrigin(0, 0)
      logo.setScale(170 / logo.width)
    }
    this.add.text(pad + 190, 30, 'THE ENDLESS WILDS', { fontFamily: HEAD, fontSize: '30px', color: CREAM })
    this.add.text(pad + 192, 70, 'No queue. Pick a room and you are in. Take bounties, cash out at a Moon Gate.', {
      fontFamily: MONO, fontSize: '12px', color: '#c9d6b0',
    })
    this.add.text(width - pad, height - 14,
      'PROTOTYPE  ·  SIMULATED BALANCES WITH NO REAL VALUE  ·  OTHER HUNTERS ARE AI STAND-INS FOR PLAYERS', {
        fontFamily: MONO, fontSize: '10px', color: '#b9c4a6',
      }).setOrigin(1, 1)

    const leftW = 300
    this.buildSide(pad, 118, leftW, height - 150)
    this.buildRooms(pad * 2 + leftW, 118, width - pad * 3 - leftW, height - 150)

    this.input.keyboard.on('keydown-ESC', () => { uiSound(this, 'back'); this.go('HomeScene', { builds: this.builds }) })
    this.input.keyboard.on('keydown-C', () => this.changeAxie())
    ;['ONE', 'TWO', 'THREE', 'FOUR'].forEach((key, i) => this.input.keyboard.on(`keydown-${key}`, () => this.enter(i)))

    this.time.addEvent({ delay: 2600, loop: true, callback: () => this.drift() })
    const relayout = () => this.scene.restart({ builds: this.builds, playerClass: this.playerClass, live: this.live })
    this.scale.once('resize', relayout)
    this.events.once('shutdown', () => this.scale.off('resize', relayout))
  }

  plate(x, y, w, h, alpha = 0.72) {
    const g = this.add.graphics()
    g.fillStyle(0x000000, 0.22).fillRoundedRect(x + 4, y + 8, w, h, 16)
    g.fillStyle(0x1d2b12, alpha).fillRoundedRect(x, y, w, h, 16)
    return g
  }

  buildSide(x, y, w, h) {
    this.plate(x, y, w, h)
    const kit = CLASS_KITS[this.playerClass]
    this.add.text(x + 20, y + 16, 'YOUR AXIE', { fontFamily: MONO, fontSize: '11px', color: '#b9c4a6' })
    this.add.text(x + 20, y + 32, kit?.title ?? this.playerClass, { fontFamily: HEAD, fontSize: '22px', color: CREAM })
    const change = this.add.text(x + w - 20, y + 38, 'CHANGE  (C)', { fontFamily: MONO, fontSize: '11px', color: '#ffd964' })
      .setOrigin(1, 0).setInteractive({ useHandCursor: true })
    bindButton(this, change, () => this.changeAxie())

    if (this.builds?.[this.playerClass]) {
      this.hero = new AxieSprite(this, x + w / 2, y + 150, { build: this.builds[this.playerClass], axieClass: this.playerClass })
      this.hero.root.setScale(1.25)
      this.hero.setFacing(1)
    }

    let yy = y + 196
    this.add.text(x + 20, yy, 'PRACTICE BALANCE', { fontFamily: MONO, fontSize: '11px', color: '#b9c4a6' })
    this.add.text(x + 20, yy + 16, money(wallet.balance('AXS'), 'AXS'), { fontFamily: HEAD, fontSize: '28px', color: '#ffd964' })
    this.add.text(x + w - 20, yy + 4, `SEASON  ${Math.round(wallet.balance('PTS'))} PTS`, { fontFamily: MONO, fontSize: '11px', color: '#9dffd8' })
      .setOrigin(1, 0)
    if (wallet.balance('AXS') < WILDS.startingBalance) {
      const top = this.add.text(x + w - 20, yy + 30, 'RESET TO 25', { fontFamily: MONO, fontSize: '11px', color: '#ffd964' })
        .setOrigin(1, 0).setInteractive({ useHandCursor: true })
      bindButton(this, top, () => { wallet.topUp(); this.scene.restart({ builds: this.builds, playerClass: this.playerClass, live: this.live }) })
    }

    const s = wallet.session
    yy += 66
    const lines = [
      `Lives entered  ${s.entries}`,
      `Cashed out     ${s.extractions}   fell ${s.deaths}`,
      `Staked         ${s.staked.toFixed(2)} AXS`,
      `Fees paid      ${s.fees.toFixed(2)} AXS`,
      `Cashed out     ${s.extracted.toFixed(2)} AXS`,
      `Session net    ${(s.extracted - s.staked >= 0 ? '+' : '')}${(s.extracted - s.staked).toFixed(2)} AXS`,
    ]
    this.add.text(x + 20, yy, 'THIS SESSION', { fontFamily: MONO, fontSize: '11px', color: '#b9c4a6' })
    this.add.text(x + 20, yy + 18, lines.join('\n'), { fontFamily: MONO, fontSize: '12px', color: '#e8f0d6', lineSpacing: 4 })

    yy += 150
    if (yy + 120 < y + h) {
      this.add.text(x + 20, yy, 'HOW IT WORKS', { fontFamily: MONO, fontSize: '11px', color: '#b9c4a6' })
      this.add.text(x + 20, yy + 18, [
        '1  Your stake buys a bounty.',
        `   The fee is ${Math.round(WILDS.feeRate * 100)}%; you carry the rest.`,
        '2  A kill takes the whole bounty',
        '   the victim was carrying.',
        '3  Stand in a Moon Gate for',
        `   ${WILDS.extractMs / 1000}s to cash out. Hits reset it.`,
      ].join('\n'), { fontFamily: MONO, fontSize: '12px', color: '#e8f0d6', lineSpacing: 3 })
    }
  }

  buildRooms(x, y, w, h) {
    const cols = w > 640 ? 2 : 1
    const gap = 18
    const cw = (w - gap * (cols - 1)) / cols
    const rows = Math.ceil(ROOMS.length / cols)
    const ch = Math.min(220, (h - gap * (rows - 1)) / rows)
    this.roomViews = ROOMS.map((room, i) => {
      const cx = x + (i % cols) * (cw + gap)
      const cy = y + Math.floor(i / cols) * (ch + gap)
      return this.buildRoom(room, i, cx, cy, cw, ch)
    })
  }

  buildRoom(room, i, x, y, w, h) {
    const accent = room.free ? 0x9dffd8 : room.stake >= 5 ? 0xff8098 : room.stake >= 1 ? 0xffd964 : 0xc9b8ff
    const hexA = `#${accent.toString(16).padStart(6, '0')}`
    this.plate(x, y, w, h, 0.78)
    const stripe = this.add.graphics()
    stripe.fillStyle(accent, 1).fillRoundedRect(x, y, 8, h, { tl: 16, bl: 16, tr: 0, br: 0 })

    this.add.text(x + 24, y + 16, `${i + 1}`, { fontFamily: MONO, fontSize: '11px', color: '#7f8c6a' })
    this.add.text(x + 40, y + 12, room.name, { fontFamily: HEAD, fontSize: '21px', color: CREAM })
    this.add.text(x + w - 18, y + 16, room.free ? 'FREE' : `${money(room.stake, 'AXS')} STAKE`, {
      fontFamily: HEAD, fontSize: '16px', color: hexA,
    }).setOrigin(1, 0)
    this.add.text(x + 24, y + 46, room.blurb, { fontFamily: MONO, fontSize: '12px', color: '#c9d6b0' })

    const hunters = this.add.text(x + 24, y + 76, '', { fontFamily: MONO, fontSize: '12px', color: '#f4f8e8' })
    const top = this.add.text(x + 24, y + 96, '', { fontFamily: MONO, fontSize: '12px', color: '#f4f8e8' })
    const carry = room.free ? room.stake : room.stake * (1 - WILDS.feeRate)
    this.add.text(x + 24, y + 116, room.free
      ? `You carry ${money(carry, 'PTS')}; cash out into season points`
      : `You carry ${money(carry, 'AXS')} after the ${Math.round(WILDS.feeRate * 100)}% fee`, {
      fontFamily: MONO, fontSize: '11px', color: '#b9c4a6',
    })

    const afford = wallet.canAfford(room)
    const bw = Math.min(200, w - 48)
    const bx = x + w - 24 - bw
    const by = y + h - 60
    const btn = this.add.graphics()
    btn.fillStyle(0x000000, 0.25).fillRoundedRect(bx + 3, by + 6, bw, 42, 12)
    btn.fillStyle(afford ? 0xffc22e : 0x4a5238, 1).fillRoundedRect(bx, by, bw, 42, 12)
    this.add.text(bx + bw / 2, by + 21, afford ? 'ENTER NOW' : 'BALANCE TOO LOW', {
      fontFamily: HEAD, fontSize: '17px', color: afford ? '#2b2200' : '#9aa88a',
    }).setOrigin(0.5)
    if (afford) {
      bindButton(this, this.add.zone(bx + bw / 2, by + 21, bw, 42), () => this.enter(i), { sound: 'start' })
    }
    const dots = this.add.graphics()
    const view = { room, hunters, top, dots, x, y: y + h - 38 }
    this.renderRoom(view, i)
    return view
  }

  renderRoom(view, i) {
    const live = this.live[i]
    const room = view.room
    const open = WILDS.maxHunters - live.hunters
    view.hunters.setText(`HUNTERS  ${live.hunters}  ·  ${open} ${open === 1 ? 'SEAT' : 'SEATS'} OPEN`)
    view.top.setText(`TOP BOUNTY  ${money(live.topBounty, room.currency)}`)
    const g = view.dots
    g.clear()
    for (let k = 0; k < WILDS.maxHunters - 1; k++) {
      g.fillStyle(k < live.hunters ? 0xfff8d8 : 0x3a4a2a, 1)
      g.fillCircle(view.x + 30 + k * 16, view.y, 5)
    }
  }

  /** Rooms are alive while you look: hunters come and go, bounties grow. */
  drift() {
    ROOMS.forEach((room, i) => {
      const live = this.live[i]
      live.hunters = Phaser.Math.Clamp(live.hunters + Phaser.Math.Between(-1, 1), room.hunters[0], room.hunters[1])
      const entry = room.free ? room.stake : room.stake * (1 - WILDS.feeRate)
      live.topBounty = Math.max(entry * 1.5, live.topBounty * Phaser.Math.FloatBetween(0.85, 1.2))
      this.renderRoom(this.roomViews[i], i)
    })
  }

  enter(i) {
    const room = ROOMS[i]
    if (!room || !wallet.canAfford(room)) {
      uiSound(this, 'deny')
      return
    }
    this.go('GameScene', {
      builds: this.builds, playerClass: this.playerClass, mode: 'wilds', room, snapshot: { ...this.live[i] },
    })
  }

  changeAxie() {
    this.go('MenuScene', { builds: this.builds, mode: 'wilds' })
  }

  go(key, data) {
    if (this.leaving) return
    this.leaving = true
    this.cameras.main.fadeOut(200)
    this.time.delayedCall(220, () => this.scene.start(key, data))
  }

  update(time, delta) {
    this.hero?.update(delta, 0)
  }
}
