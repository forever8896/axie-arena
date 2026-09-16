import Phaser from 'phaser'
import { makeGrassTexture } from '../arena/Arena.js'
import { ambientMotes } from '../fx/Juice.js'
import { WILDS, ROOMS, money } from '../wilds/config.js'
import { play as playMusic } from '../fx/Music.js'
import { bindButton, uiSound } from '../fx/UiSound.js'

const HEAD = 'Rowdies, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'
const CREAM = '#fff8d8'
const BODY = '#e8f0d6'
const MUTED = '#b9c4a6'
const GOLD = '#ffd964'

/**
 * The about page: what the game is, and the whole money model in plain words,
 * including what it deliberately does not do. A player should be able to read
 * this once and know exactly what a stake buys, where the fee goes, and what
 * is simulated in this build.
 *
 * Numbers come from the game's own config, so the page cannot drift from it.
 */
export default class AboutScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AboutScene' })
  }

  init(data) {
    this.builds = data.builds
  }

  create() {
    playMusic('theme')
    const { width, height } = this.scale
    makeGrassTexture(this)
    this.add.tileSprite(0, 0, width, height, 'field-grass').setOrigin(0).setDepth(-100)
    this.add.rectangle(0, 0, width, height, 0x16200f, 0.62).setOrigin(0).setDepth(-99)
    ambientMotes(this, { left: 0, top: 0, right: width, bottom: height })

    this.colW = Math.min(760, width - 80)
    this.page = this.add.container(0, 0)
    this.buildPage()

    // Header sits above the page and never scrolls.
    const bar = this.add.graphics().setDepth(50)
    bar.fillStyle(0x16200f, 1).fillRect(0, 0, width, 64)
    bar.lineStyle(2, 0x5f9330, 0.5).lineBetween(0, 64, width, 64)
    this.add.text(width / 2 - this.colW / 2, 20, 'ABOUT LUNACY', {
      fontFamily: HEAD, fontSize: '22px', color: CREAM,
    }).setDepth(51)
    const back = this.add.text(width / 2 + this.colW / 2, 24, '◂  BACK  (ESC)', {
      fontFamily: MONO, fontSize: '12px', color: GOLD,
    }).setOrigin(1, 0).setDepth(51).setInteractive({ useHandCursor: true })
    bindButton(this, back, () => this.leave(), { sound: 'back' })

    this.scrollbar = this.add.graphics().setDepth(52)
    this.top = 84
    this.scroll = 0
    this.maxScroll = Math.max(0, this.pageHeight - (height - this.top - 40))

    this.input.on('wheel', (_p, _o, _dx, dy) => this.scrollBy(dy * 0.6))
    this.input.keyboard.on('keydown-ESC', () => { uiSound(this, 'back'); this.leave() })
    this.input.keyboard.on('keydown-DOWN', () => this.scrollBy(80))
    this.input.keyboard.on('keydown-UP', () => this.scrollBy(-80))
    this.input.keyboard.on('keydown-SPACE', () => this.scrollBy(height * 0.7))
    this.input.on('pointermove', p => { if (p.isDown) this.scrollBy(-p.velocity.y * 0.5) })
    this.scale.on('resize', this.relayout, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.relayout, this))
    this.apply()
  }

  relayout() {
    this.scene.restart({ builds: this.builds })
  }

  leave() {
    this.scene.start('HomeScene', { builds: this.builds })
  }

  scrollBy(dy) {
    this.scroll = Phaser.Math.Clamp(this.scroll + dy, 0, this.maxScroll)
    this.apply()
  }

  apply() {
    this.page.y = this.top - this.scroll
    const g = this.scrollbar
    g.clear()
    if (this.maxScroll <= 0) return
    const { width, height } = this.scale
    const trackH = height - this.top - 30
    const barH = Math.max(40, trackH * (trackH / this.pageHeight))
    const x = width / 2 + this.colW / 2 + 22
    g.fillStyle(0x16200f, 0.5).fillRoundedRect(x, this.top, 5, trackH, 3)
    g.fillStyle(0xffc22e, 0.9).fillRoundedRect(x, this.top + (trackH - barH) * (this.scroll / this.maxScroll), 5, barH, 3)
  }

  // --- Page ---------------------------------------------------------------

  buildPage() {
    const stake = ROOMS.find(r => !r.free) ?? ROOMS[1]
    const fee = Math.round(WILDS.feeRate * 100)
    const carried = stake.stake * (1 - WILDS.feeRate)
    this.y = 0

    this.section('THE GAME')
    this.para(
      'Lunacy is an arena that never closes. There is no lobby and no queue: you pick a room, ' +
      'you are in it, and other hunters are already fighting. You leave when you decide to.')
    this.para(
      'Six Axie classes, each with its own basic attack and special. Parry a blow you saw coming, ' +
      'dash out of one you did not, grab power-ups as they appear, heal in a Moonwell, hide in the ' +
      'long grass. A Blood Moon gathers everyone every so often, so nobody can sit in a corner.')

    this.section('A ROUND, START TO FINISH')
    this.steps([
      ['You pay a stake to enter', `${money(stake.stake, 'AXS')} in ${stake.name}. Rooms run from ${money(ROOMS[1].stake, 'AXS')} to ${money(ROOMS[3].stake, 'AXS')}, plus a free room.`],
      ['The stake becomes your bounty', `The house fee is ${fee}%. You carry ${money(carried, 'AXS')} into the room, over your head, where everyone can see it.`],
      ['A kill takes the whole bounty', 'Knock someone out and everything they were carrying is now yours. Fall, and yours goes to whoever hit you.'],
      ['You cash out at a Moon Gate', `Stand in an open gate for ${WILDS.extractMs / 1000} seconds. A hit restarts the count. Walk out and the bounty is yours to keep.`],
      ['Leaving any other way drops it', 'Quit mid-room and your bounty falls on the ground for someone else to pick up. It stays in the game.'],
    ])

    this.section('WHERE THE MONEY GOES')
    this.para(
      `Every stake becomes a bounty in the room, minus the ${fee}% fee. Nothing is minted, and the ` +
      'house never takes a cut of a kill: money only moves between players until somebody carries it out.')
    this.table(
      ['WHAT HAPPENS', 'WHERE YOUR STAKE GOES'],
      [
        ['You extract', 'Back to you, plus everything you took'],
        ['You fall', 'To the hunter who knocked you out'],
        ['You quit mid-room', 'Onto the ground, for whoever finds it'],
        ['Always', `${fee}% entry fee to the operator`],
      ])
    this.para(
      `About ${100 - fee}% of everything staked goes back to players. For comparison, a skill-gaming ` +
      'platform typically keeps around 10%, and a casino keeps its edge on every hand.', MUTED)

    this.section('WHY IT IS BUILT THIS WAY')
    this.bullets([
      'Rooms are matched by skill and split into stake tiers, so a new player’s first stake is not a donation to a veteran. In our model that lifted the weakest quarter of players from almost never ahead to about a third of them ahead.',
      'A bounty you have to carry out beats a flat payout per kill: it makes leaving a decision, and makes the leader everyone’s target.',
      'Bots never carry money. If killing a bot paid, the best players — and then scripts — would farm them all day, and the treasury would pay for it.',
      'Free rooms earn from a fixed seasonal pool instead. A fixed pool cannot be farmed for more than it holds.',
      'No token is minted to pay rewards. Axie’s own history is the lesson there.',
    ])

    this.section('WHAT IS REAL IN THIS BUILD')
    this.callout([
      'This is a prototype. Balances are simulated and have no value, nothing',
      'touches a wallet or a blockchain, and no purchase is possible.',
      'Every other hunter is an AI stand-in for a player, labelled as one.',
    ].join('\n'))
    this.para(
      'Staked rooms with real value are the last step, not the next one. They need a legal opinion ' +
      'per market (paid-entry skill contests are restricted in some places), an agreement with Sky Mavis, ' +
      'server-side anti-cheat, and proof that the game holds people when it is free. The full plan, ' +
      'including the simulation the payout rules were chosen with, is in docs/VISION.md in the repository.')

    this.section('CREDITS')
    this.para(
      'Axie bodies are built with the official 2D mixer and animated with their own authored clips. ' +
      'Battle effects, status icons and battle sounds come from the Axie Origins Battle Kit, used under ' +
      'the Vibeathon builder terms. The music was generated for this game. The logo was drawn for it. ' +
      'Built for Axie Vibeathon 2026.', MUTED)

    this.pageHeight = this.y + 40
  }

  // --- Blocks -------------------------------------------------------------

  get left() {
    return this.scale.width / 2 - this.colW / 2
  }

  section(title) {
    this.y += this.y ? 34 : 6
    const t = this.add.text(this.left, this.y, title, { fontFamily: HEAD, fontSize: '20px', color: GOLD })
    const rule = this.add.graphics()
    rule.lineStyle(2, 0x5f9330, 0.7).lineBetween(this.left, this.y + 30, this.left + this.colW, this.y + 30)
    this.page.add([t, rule])
    this.y += 46
  }

  para(text, color = BODY) {
    const t = this.add.text(this.left, this.y, text, {
      fontFamily: MONO, fontSize: '13px', color, lineSpacing: 7,
      wordWrap: { width: this.colW },
    })
    this.page.add(t)
    this.y += t.height + 14
  }

  steps(rows) {
    rows.forEach(([title, body], i) => {
      const plate = this.add.graphics()
      const num = this.add.text(this.left + 26, this.y + 14, String(i + 1), {
        fontFamily: HEAD, fontSize: '16px', color: '#2b2200',
      }).setOrigin(0.5)
      const head = this.add.text(this.left + 54, this.y + 8, title, { fontFamily: HEAD, fontSize: '15px', color: CREAM })
      const text = this.add.text(this.left + 54, this.y + 30, body, {
        fontFamily: MONO, fontSize: '12px', color: BODY, lineSpacing: 5,
        wordWrap: { width: this.colW - 74 },
      })
      const h = Math.max(52, text.height + 42)
      plate.fillStyle(0x1d2b12, 0.72).fillRoundedRect(this.left, this.y - 4, this.colW, h, 12)
      plate.fillStyle(0xffc22e, 1).fillCircle(this.left + 26, this.y + 14, 13)
      this.page.add([plate, num, head, text])
      this.y += h + 8
    })
    this.y += 6
  }

  table(header, rows) {
    const colA = Math.round(this.colW * 0.42)
    const plate = this.add.graphics()
    const h = 30 + rows.length * 26 + 10
    plate.fillStyle(0x1d2b12, 0.72).fillRoundedRect(this.left, this.y - 4, this.colW, h, 12)
    this.page.add(plate)
    this.page.add(this.add.text(this.left + 16, this.y + 6, header[0], { fontFamily: MONO, fontSize: '11px', color: MUTED }))
    this.page.add(this.add.text(this.left + 16 + colA, this.y + 6, header[1], { fontFamily: MONO, fontSize: '11px', color: MUTED }))
    rows.forEach(([a, b], i) => {
      const y = this.y + 30 + i * 26
      this.page.add(this.add.text(this.left + 16, y, a, { fontFamily: MONO, fontSize: '12px', color: CREAM }))
      this.page.add(this.add.text(this.left + 16 + colA, y, b, { fontFamily: MONO, fontSize: '12px', color: BODY }))
    })
    this.y += h + 12
  }

  bullets(items) {
    for (const item of items) {
      const dot = this.add.graphics()
      dot.fillStyle(0xffc22e, 1).fillCircle(this.left + 6, this.y + 8, 4)
      const t = this.add.text(this.left + 22, this.y, item, {
        fontFamily: MONO, fontSize: '12.5px', color: BODY, lineSpacing: 6,
        wordWrap: { width: this.colW - 30 },
      })
      this.page.add([dot, t])
      this.y += t.height + 12
    }
    this.y += 4
  }

  callout(text) {
    const t = this.add.text(this.left + 20, this.y + 14, text, {
      fontFamily: MONO, fontSize: '12.5px', color: GOLD, lineSpacing: 6,
      wordWrap: { width: this.colW - 40 },
    })
    const plate = this.add.graphics()
    plate.fillStyle(0x3a2a18, 0.85).fillRoundedRect(this.left, this.y, this.colW, t.height + 28, 12)
    plate.lineStyle(2, 0xffc22e, 0.8).strokeRoundedRect(this.left, this.y, this.colW, t.height + 28, 12)
    this.page.add([plate, t])
    this.page.bringToTop(t)
    this.y += t.height + 40
  }
}
