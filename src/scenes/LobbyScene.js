import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'
import { makeGrassTexture } from '../arena/Arena.js'
import { CLASS_KITS } from '../axie/classKits.js'
import { ambientMotes } from '../fx/Juice.js'
import { ROOMS, LIVE_ROOM, WILDS, money } from '../wilds/config.js'
import { wallet } from '../wilds/Wallet.js'
import { play as playMusic } from '../fx/Music.js'
import { bindButton, uiSound } from '../fx/UiSound.js'
import { available, remembered, remember, measureAll, suggestion, roomsUrl, FAR_MS } from '../net/regions.js'

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
    // In multiplayer the rooms are real: this list is what the server says is
    // happening in them right now, people included. Otherwise the rooms run in
    // this page, and the numbers are a plausible picture of one that would be.
    this.net = Boolean(data.net)
    // Which server's rooms are being listed. Remembered between visits, and
    // defaulting to whatever is serving this page until a ping says otherwise.
    const regions = available()
    this.region = regions.find(r => r.id === (data.regionId ?? remembered())) ?? regions[0]
    this.live = data.live ?? ROOMS.map(r => ({
      hunters: Phaser.Math.Between(...r.hunters),
      topBounty: (r.free ? r.stake : r.stake * (1 - WILDS.feeRate)) * Phaser.Math.FloatBetween(2, 5),
      players: 0,
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
    this.add.text(pad + 192, 70, this.net
      ? 'Live rooms on the server. Everyone in them shares one fight.'
      : 'No queue. Pick a room and you are in. Take bounties, cash out at a Moon Gate.', {
      fontFamily: MONO, fontSize: '12px', color: '#c9d6b0',
    })
    if (this.net) {
      this.netTag = this.add.text(pad + 190, 8, 'MULTIPLAYER  ·  EXPERIMENTAL', {
        fontFamily: MONO, fontSize: '11px', color: '#c9b8ff',
      })
    }
    this.add.text(width - pad, height - 14,
      'PROTOTYPE  ·  SIMULATED BALANCES WITH NO REAL VALUE  ·  OTHER HUNTERS ARE AI STAND-INS FOR PLAYERS', {
        fontFamily: MONO, fontSize: '10px', color: '#b9c4a6',
      }).setOrigin(1, 1)

    const leftW = 300
    this.buildSide(pad, 118, leftW, height - 150)
    this.buildRooms(pad * 2 + leftW, 118, width - pad * 3 - leftW, height - 150)

    this.input.keyboard.on('keydown-ESC', () => { uiSound(this, 'back'); this.go('HomeScene', { builds: this.builds }) })
    this.esc = this.add.text(width - pad, 30, 'ESC  BACK', { fontFamily: MONO, fontSize: '11px', color: '#b9c4a6' })
      .setOrigin(1, 0)
    this.input.keyboard.on('keydown-C', () => this.changeAxie())
    ;['ONE', 'TWO', 'THREE', 'FOUR'].forEach((key, i) => this.input.keyboard.on(`keydown-${key}`, () => this.enter(i)))

    if (this.net) {
      this.pollRooms()
      this.time.addEvent({ delay: 2000, loop: true, callback: () => this.pollRooms() })
    } else {
      this.time.addEvent({ delay: 2600, loop: true, callback: () => this.drift() })
    }
    const relayout = () => this.scene.restart({ builds: this.builds, playerClass: this.playerClass, live: this.live, net: this.net, regionId: this.region.id })
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
    if (this.net) {
      yy = this.buildRegions(x + 20, yy, w - 40)
    }
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

  /**
   * Which server you are playing on, with the distance to each one measured
   * while you look at it.
   *
   * Each region is its own set of rooms, so this is not a preference — two
   * friends who pick differently are in different worlds. It says so, it
   * measures rather than guesses, and it offers the nearer one when the one you
   * are on is meaningfully further away.
   */
  buildRegions(x, y, w) {
    this.add.text(x, y, 'SERVER', { fontFamily: MONO, fontSize: '11px', color: '#b9c4a6' })
    this.add.text(x + w, y, 'PING', { fontFamily: MONO, fontSize: '10px', color: '#7f8c6a' }).setOrigin(1, 0)

    this.regionRows = available().map((region, i) => {
      const ry = y + 20 + i * 26
      const row = {
        region,
        plate: this.add.graphics(),
        name: this.add.text(x + 10, ry + 4, region.name, { fontFamily: HEAD, fontSize: '15px', color: CREAM }),
        where: this.add.text(x + 10, ry + 4, '', { fontFamily: MONO, fontSize: '10px', color: '#9aa88a' }),
        ping: this.add.text(x + w - 10, ry + 6, '· · ·', { fontFamily: MONO, fontSize: '12px', color: '#9aa88a' }).setOrigin(1, 0),
        y: ry,
      }
      row.where.setPosition(x + 14 + row.name.width, ry + 8)
      const zone = this.add.zone(x + w / 2, ry + 11, w, 24).setInteractive({ useHandCursor: true })
      bindButton(this, zone, () => this.chooseRegion(region))
      return row
    })

    const bottom = y + 20 + this.regionRows.length * 26
    this.regionNote = this.add.text(x, bottom + 4, 'measuring…', {
      fontFamily: MONO, fontSize: '11px', color: '#9aa88a', wordWrap: { width: w },
    })
    this.regionSwitch = this.add.text(x, bottom + 22, '', {
      fontFamily: MONO, fontSize: '11px', color: '#ffd964',
    }).setInteractive({ useHandCursor: true })
    bindButton(this, this.regionSwitch, () => {
      if (this.suggested) this.chooseRegion(this.suggested)
    })

    this.drawRegions()
    this.pingRegions()
    return bottom + 48
  }

  drawRegions() {
    for (const row of this.regionRows ?? []) {
      const mine = row.region.id === this.region.id
      const g = row.plate
      g.clear()
      g.fillStyle(mine ? 0x2f4420 : 0x1a2612, mine ? 1 : 0.6)
      g.fillRoundedRect(row.name.x - 10, row.y, row.ping.x - row.name.x + 20, 24, 8)
      if (mine) g.lineStyle(2, 0xffd964, 0.9).strokeRoundedRect(row.name.x - 10, row.y, row.ping.x - row.name.x + 20, 24, 8)
      row.name.setColor(mine ? CREAM : '#c9d6b0')
      row.where.setText(mine ? `${row.region.where} · playing here` : row.region.where)
    }
  }

  /** Measure every region, then say something only if it is worth saying. */
  async pingRegions() {
    const measured = await measureAll()
    if (!this.regionRows) return
    for (const row of this.regionRows) {
      const found = measured.find(m => m.region.id === row.region.id)
      const ping = found?.ping
      row.ping.setText(ping == null ? 'unreachable' : `${ping}ms`)
        .setColor(ping == null ? '#ff8098' : ping > FAR_MS ? '#ffc22e' : '#9dffd8')
    }

    const advice = suggestion(measured, this.region.id)
    this.suggested = advice?.region ?? null
    const mine = measured.find(m => m.region.id === this.region.id)
    if (!advice) {
      this.regionNote.setText(mine?.ping == null
        ? 'This server is not answering.'
        : `${mine.ping}ms to ${this.region.where}. Each server has its own rooms.`)
      this.regionSwitch.setText('')
      return
    }
    this.regionNote.setText(advice.why === 'unreachable'
      ? `${this.region.name} is not answering. ${advice.region.name} is ${advice.ping}ms away.`
      : `${advice.region.name} is ${advice.ping}ms away — ${advice.was - advice.ping}ms closer than ${this.region.name}.`)
    this.regionSwitch.setText(`▸ PLAY ON ${advice.region.name.toUpperCase()} INSTEAD`)
  }

  /** Switching server means switching worlds, so the lobby reloads with it. */
  chooseRegion(region) {
    if (region.id === this.region.id) return
    remember(region.id)
    this.scene.restart({ builds: this.builds, playerClass: this.playerClass, net: true, regionId: region.id })
  }

  /** In multiplayer there is one room per region; locally, the catalogue. */
  get rooms() {
    return this.net ? [LIVE_ROOM] : ROOMS
  }

  buildRooms(x, y, w, h) {
    const list = this.rooms
    // One room gets the whole panel: it is the only thing anyone has to decide.
    const cols = list.length > 1 && w > 640 ? 2 : 1
    const gap = 18
    const cw = (w - gap * (cols - 1)) / cols
    const rows = Math.ceil(list.length / cols)
    const ch = list.length === 1 ? Math.min(300, h) : Math.min(220, (h - gap * (rows - 1)) / rows)
    this.roomViews = list.map((room, i) => {
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

  /**
   * The rooms as the server has them this second: who is in each one, how many
   * of those are people, and what the best of them is carrying. A room that is
   * already running is the whole promise, so the lobby had better not be
   * guessing about it.
   */
  async pollRooms() {
    try {
      const res = await fetch(roomsUrl(this.region), { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const { rooms } = await res.json()
      this.rooms.forEach((room, i) => {
        const live = rooms.find(r => r.id === room.id)
        if (!live) return
        this.live[i] = {
          hunters: live.hunters, topBounty: live.topBounty, players: live.players,
          humans: live.humans ?? [], bots: live.bots ?? live.hunters,
        }
        if (this.roomViews?.[i]) this.renderRoom(this.roomViews[i], i)
      })
      this.netTag?.setText(`MULTIPLAYER  ·  EXPERIMENTAL  ·  ${this.region.name.toUpperCase()}`).setColor('#c9b8ff')
    } catch {
      // The page can be served without the room server behind it — a static
      // copy, or the server restarting. Say so rather than showing stale rooms
      // as though they were live.
      this.netTag?.setText(`MULTIPLAYER  ·  CANNOT REACH ${this.region.name.toUpperCase()}`).setColor('#ff8098')
    }
  }

  renderRoom(view, i) {
    const live = this.live[i]
    const room = view.room
    const open = WILDS.maxHunters - live.hunters
    const players = live.players ?? 0
    if (this.net) {
      const names = live.humans?.length ? live.humans.join(', ') : 'nobody yet — be the first'
      view.hunters.setText(`PLAYERS  ${players}     ${names}`)
        .setColor(players ? '#ffd964' : '#b9c4a6')
      view.top.setText(`STAND-INS  ${live.bots ?? 0} AI  ·  ${open} ${open === 1 ? 'SEAT' : 'SEATS'} OPEN  ·  TOP BOUNTY ${money(live.topBounty, room.currency)}`)
    } else {
      view.hunters.setText(`HUNTERS  ${live.hunters}  ·  ${open} ${open === 1 ? 'SEAT' : 'SEATS'} OPEN`)
      view.top.setText(`TOP BOUNTY  ${money(live.topBounty, room.currency)}`)
    }
    const g = view.dots
    g.clear()
    for (let k = 0; k < WILDS.maxHunters - 1; k++) {
      g.fillStyle(k < live.hunters ? 0xfff8d8 : 0x3a4a2a, 1)
      g.fillCircle(view.x + 30 + k * 16, view.y, 5)
    }
  }

  /** Rooms are alive while you look: hunters come and go, bounties grow. */
  drift() {
    this.rooms.forEach((room, i) => {
      const live = this.live[i]
      live.hunters = Phaser.Math.Clamp(live.hunters + Phaser.Math.Between(-1, 1), room.hunters[0], room.hunters[1])
      const entry = room.free ? room.stake : room.stake * (1 - WILDS.feeRate)
      live.topBounty = Math.max(entry * 1.5, live.topBounty * Phaser.Math.FloatBetween(0.85, 1.2))
      this.renderRoom(this.roomViews[i], i)
    })
  }

  enter(i) {
    const room = this.rooms[i]
    if (!room || !wallet.canAfford(room)) {
      uiSound(this, 'deny')
      return
    }
    if (this.net) {
      this.go('NetScene', {
        builds: this.builds, playerClass: this.playerClass, roomId: room.id, regionId: this.region.id,
      })
      return
    }
    this.go('GameScene', {
      builds: this.builds, playerClass: this.playerClass, mode: 'wilds', room, snapshot: { ...this.live[i] },
    })
  }

  changeAxie() {
    this.go('MenuScene', { builds: this.builds, mode: this.net ? 'net' : 'wilds' })
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
