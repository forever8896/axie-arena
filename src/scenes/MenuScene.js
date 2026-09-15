import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'
import { CLASS_KITS } from '../axie/classKits.js'
import { CLASS_COLORS, ARENA_PALETTE } from '../axie/palette.js'
import { ambientMotes } from '../fx/Juice.js'

const CARD = { w: 228, h: 424, gap: 18 }
const HEAD = 'Rowdies, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'

/**
 * Class select. Doubles as the instruction screen: every card shows the real
 * Axie, what it is good at, and both of its abilities before you commit.
 */
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  init(data) {
    this.builds = data.builds
    // Which mode the chosen Axie is for: a Showdown match, or the Wilds lobby.
    this.mode = data.mode ?? 'showdown'
  }

  create() {
    // Scene instances are reused: a revisit must not inherit the last exit.
    this.leaving = false
    const P = ARENA_PALETTE
    this.cameras.main.setBackgroundColor(P.deep)

    this.classes = Object.keys(this.builds).filter(c => CLASS_KITS[c])
    this.selected = 0
    this.cards = []

    this.backdrop()

    this.title = this.add.text(0, 0, 'LUNACY', {
      fontFamily: HEAD, fontSize: '46px', color: '#fff8d8',
    }).setOrigin(0.5)

    this.subtitle = this.add.text(0, 0, ({ wilds: 'CHOOSE YOUR AXIE  ·  THE ENDLESS WILDS', tutorial: 'CHOOSE YOUR AXIE  ·  TUTORIAL' })[this.mode] ?? 'CHOOSE YOUR AXIE  ·  SHOWDOWN', {
      fontFamily: MONO, fontSize: '13px', color: '#8b83ad',
    }).setOrigin(0.5)

    this.input.keyboard.on('keydown-ESC', () => this.scene.start('HomeScene', { builds: this.builds }))

    this.footer = this.add.text(0, 0, '← →  BROWSE      ENTER  FIGHT      ESC  BACK', {
      fontFamily: MONO, fontSize: '12px', color: '#5f5980',
    }).setOrigin(0.5)

    this.classes.forEach((cls, i) => this.cards.push(this.buildCard(cls, i)))

    this.input.keyboard.on('keydown-LEFT', () => this.move(-1))
    this.input.keyboard.on('keydown-RIGHT', () => this.move(1))
    this.input.keyboard.on('keydown-A', () => this.move(-1))
    this.input.keyboard.on('keydown-D', () => this.move(1))
    this.input.keyboard.on('keydown-ENTER', () => this.choose(this.classes[this.selected]))
    this.input.keyboard.on('keydown-SPACE', () => this.choose(this.classes[this.selected]))

    this.scale.on('resize', this.layout, this)
    this.layout()
    this.highlight()
  }

  backdrop() {
    const { width, height } = this.scale
    const g = this.add.graphics().setDepth(-100)
    const cx = width / 2
    const cy = height / 2
    for (let i = 12; i >= 0; i--) {
      const t = i / 12
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(ARENA_PALETTE.floorLit),
        Phaser.Display.Color.ValueToColor(ARENA_PALETTE.deep),
        12, i,
      )
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1)
      g.fillEllipse(cx, cy, width * 1.6 * t + 300, height * 1.5 * t + 240)
    }
    ambientMotes(this, { left: 0, top: 0, right: width, bottom: height })
  }

  buildCard(cls, index) {
    const kit = CLASS_KITS[cls]
    const colors = CLASS_COLORS[cls]
    const card = this.add.container(0, 0)

    const panel = this.add.graphics()
    card.panel = panel
    card.add(panel)

    // Pedestal the Axie stands on, so it does not float in the card.
    const pedestal = this.add.ellipse(0, -108, 124, 27, colors.body, 0.16)
    card.add(pedestal)

    const sprite = new AxieSprite(this, 0, 0, { build: this.builds[cls], axieClass: cls })
    sprite.root.setScale(1.15)
    sprite.root.setPosition(0, -106)
    card.add(sprite.root)
    card.sprite = sprite

    const name = this.add.text(0, -78, kit.title.toUpperCase(), {
      fontFamily: HEAD, fontSize: '26px', color: hex(colors.body),
    }).setOrigin(0.5, 0)

    const tagline = this.add.text(0, -44, kit.tagline, {
      fontFamily: MONO, fontSize: '11px', color: '#8b83ad',
      align: 'center', lineSpacing: 3, wordWrap: { width: CARD.w - 44 },
    }).setOrigin(0.5, 0)

    const stats = this.add.text(0, 4, `HP  ${hpBar(kit.hp)}  ${kit.hp}\nSPD ${speedBar(kit.speed)}`, {
      fontFamily: MONO, fontSize: '12px', color: '#b9b2d4', align: 'center', lineSpacing: 5,
    }).setOrigin(0.5, 0)

    const rule = this.add.rectangle(0, 56, CARD.w - 56, 1, 0x3d2f7a, 0.8)

    const basicLabel = this.add.text(0, 70, 'BASIC', {
      fontFamily: MONO, fontSize: '9px', color: '#5f5980',
    }).setOrigin(0.5, 0)

    const basic = this.add.text(0, 84, `${kit.basic.name.toUpperCase()}\n${kit.basic.desc}`, {
      fontFamily: MONO, fontSize: '11px', color: '#b9b2d4',
      align: 'center', lineSpacing: 3, wordWrap: { width: CARD.w - 40 },
    }).setOrigin(0.5, 0)

    const specialLabel = this.add.text(0, 130, 'SPECIAL', {
      fontFamily: MONO, fontSize: '9px', color: '#5f5980',
    }).setOrigin(0.5, 0)

    const special = this.add.text(0, 144, `${kit.special.name.toUpperCase()}\n${kit.special.desc}`, {
      fontFamily: MONO, fontSize: '11px', color: hex(colors.rim),
      align: 'center', lineSpacing: 3, wordWrap: { width: CARD.w - 40 },
    }).setOrigin(0.5, 0)

    card.add([name, tagline, stats, rule, basicLabel, basic, specialLabel, special])

    // The whole card is the hit area; hovering previews the attack.
    const zone = this.add.zone(0, 0, CARD.w, CARD.h).setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => { this.selected = index; this.highlight() })
    zone.on('pointerdown', () => this.choose(cls))
    card.add(zone)

    card.cls = cls
    card.colors = colors
    card.attackAt = 0
    return card
  }

  layout() {
    const { width, height } = this.scale
    const cols = width > 1380 ? 6 : width > 940 ? 3 : 2
    const rows = Math.ceil(this.classes.length / cols)
    const gridW = cols * CARD.w + (cols - 1) * CARD.gap
    const gridH = rows * CARD.h + (rows - 1) * CARD.gap

    const top = Math.max(120, (height - gridH) / 2 + 26)
    const left = (width - gridW) / 2

    this.title.setPosition(width / 2, Math.max(46, top - 84))
    this.subtitle.setPosition(width / 2, Math.max(78, top - 46))
    this.footer.setPosition(width / 2, Math.min(height - 26, top + gridH + 34))

    this.cards.forEach((card, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      card.setPosition(
        left + col * (CARD.w + CARD.gap) + CARD.w / 2,
        top + row * (CARD.h + CARD.gap) + CARD.h / 2,
      )
    })
    this.highlight()
  }

  highlight() {
    this.cards.forEach((card, i) => {
      const on = i === this.selected
      const c = card.colors
      const g = card.panel
      g.clear()

      const x = -CARD.w / 2
      const y = -CARD.h / 2

      g.fillStyle(on ? 0x221b40 : 0x171233, on ? 0.96 : 0.8)
      g.fillRoundedRect(x, y, CARD.w, CARD.h, 16)

      if (on) {
        g.lineStyle(2, c.body, 0.95)
        g.strokeRoundedRect(x, y, CARD.w, CARD.h, 16)
        g.lineStyle(8, c.body, 0.12)
        g.strokeRoundedRect(x - 4, y - 4, CARD.w + 8, CARD.h + 8, 20)
      } else {
        g.lineStyle(1, 0x3d2f7a, 0.7)
        g.strokeRoundedRect(x, y, CARD.w, CARD.h, 16)
      }

      this.tweens.add({
        targets: card,
        scale: on ? 1.045 : 1,
        duration: 160,
        ease: 'Quad.easeOut',
      })
    })
  }

  move(step) {
    this.selected = Phaser.Math.Wrap(this.selected + step, 0, this.classes.length)
    this.highlight()
  }

  choose(cls) {
    if (this.leaving) return
    this.leaving = true

    const card = this.cards.find(c => c.cls === cls)
    card?.sprite.playState('victory')
    this.cameras.main.flash(180, 40, 30, 70)

    this.time.delayedCall(260, () => {
      this.cameras.main.fadeOut(220)
      this.time.delayedCall(240, () => {
        if (this.mode === 'wilds') this.scene.start('LobbyScene', { builds: this.builds, playerClass: cls })
        else this.scene.start('GameScene', { builds: this.builds, playerClass: cls, mode: this.mode })
      })
    })
  }

  update(time, delta) {
    this.cards.forEach((card, i) => {
      const selected = i === this.selected
      card.sprite.update(delta, selected ? 40 : 0)

      // The highlighted Axie shows off its attack every couple of seconds.
      if (selected && time > card.attackAt) {
        card.attackAt = time + 2400
        const kit = CLASS_KITS[card.cls]
        // Alternate the class's basic and its special, played at authored speed.
        card.showSpecial = !card.showSpecial
        card.sprite.play(card.showSpecial ? kit.special.anim : kit.basic.anim, { kind: 'attack' })
      }
    })
  }
}

const hex = v => `#${v.toString(16).padStart(6, '0')}`

/** Health on a 2000–4000 scale, as five blocks. */
function hpBar(hp) {
  const filled = Math.round(Phaser.Math.Clamp((hp - 1800) / 2000, 0, 1) * 5)
  return '▮'.repeat(filled) + '▯'.repeat(5 - filled)
}

function speedBar(speed) {
  const filled = Math.round(Phaser.Math.Clamp((speed - 190) / 90, 0, 1) * 5)
  return '▮'.repeat(filled) + '▯'.repeat(5 - filled)
}
