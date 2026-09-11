import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'
import { makeGrassTexture } from '../arena/Arena.js'
import { FIELD } from '../axie/palette.js'
import { ambientMotes } from '../fx/Juice.js'

const HEAD = 'Rowdies, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'

const INK = '#26341a'
const INK_SOFT = '#4c6135'
const SUN = 0xffc22e
const SUN_DARK = 0xc98a00

/** Front page. Standing on the same field you fight on. */
export default class HomeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HomeScene' })
  }

  init(data) {
    this.builds = data.builds
  }

  create() {
    this.aboutOpen = false
    this.wanderers = []

    this.buildField()
    this.buildTitle()
    this.buildPlay()
    this.buildAbout()
    this.buildFooter()

    this.input.keyboard.on('keydown-ENTER', () => this.start())
    this.input.keyboard.on('keydown-SPACE', () => this.start())

    this.scale.on('resize', this.layout, this)
    this.layout()
  }

  buildField() {
    const { width, height } = this.scale
    makeGrassTexture(this)

    this.field = this.add.tileSprite(0, 0, width, height, 'field-grass')
      .setOrigin(0).setDepth(-100)

    // Soft daylight falloff so the title always has something to sit on.
    this.wash = this.add.graphics().setDepth(-99)

    ambientMotes(this, { left: 0, top: 0, right: width, bottom: height })

    // A few Axies milling about on the grass behind the card.
    const classes = Object.keys(this.builds ?? {})
    for (const cls of classes) {
      const sprite = new AxieSprite(this, 0, 0, { build: this.builds[cls], axieClass: cls })
      sprite.root.setScale(1.05)
      this.wanderers.push({
        sprite,
        phase: Math.random() * Math.PI * 2,
        speed: 0.12 + Math.random() * 0.16,
        home: { x: 0, y: 0 },
        radius: 60 + Math.random() * 70,
      })
    }
  }

  buildTitle() {
    this.titleShadow = this.add.text(0, 0, 'LUNACY', {
      fontFamily: HEAD, fontSize: '120px', color: '#23300f',
    }).setOrigin(0.5).setAlpha(0.32).setDepth(1009)

    this.title = this.add.text(0, 0, 'LUNACY', {
      fontFamily: HEAD, fontSize: '120px', color: '#fff8d8',
    }).setOrigin(0.5).setDepth(1010)
    this.title.setShadow(0, 6, 'rgba(35,48,15,0.45)', 0, false, true)

    this.tagline = this.add.text(0, 0, 'SIX AXIES  ·  ONE FIELD  ·  LAST ONE STANDING', {
      fontFamily: MONO, fontSize: '14px', color: '#f2f7e4',
    }).setOrigin(0.5).setDepth(1010)
    this.tagline.setShadow(0, 2, 'rgba(35,48,15,0.6)', 3, false, true)
  }

  buildPlay() {
    this.playShadow = this.add.graphics().setDepth(1010)
    this.playFace = this.add.graphics().setDepth(1011)

    this.playText = this.add.text(0, 0, 'PLAY', {
      fontFamily: HEAD, fontSize: '40px', color: '#3b2a00',
    }).setOrigin(0.5).setDepth(1012)

    this.playZone = this.add.zone(0, 0, 300, 84)
      .setInteractive({ useHandCursor: true })
      .setDepth(1012)

    this.playLift = 0
    this.playZone.on('pointerover', () => this.tweenPlay(6))
    this.playZone.on('pointerout', () => this.tweenPlay(0))
    this.playZone.on('pointerdown', () => this.start())
  }

  tweenPlay(lift) {
    this.tweens.add({
      targets: this,
      playLift: lift,
      duration: 130,
      ease: 'Quad.easeOut',
      onUpdate: () => this.drawPlay(),
    })
  }

  /** Chunky, bright, and sitting on a real shadow. */
  drawPlay() {
    const w = 300
    const h = 84
    const x = this.playX - w / 2
    const y = this.playY - h / 2 - this.playLift
    const r = 22
    const drop = 10 + (6 - this.playLift)

    this.playShadow.clear()
    this.playShadow.fillStyle(0x1d2b12, 0.34)
    this.playShadow.fillRoundedRect(x + 4, y + drop, w - 8, h, r)

    this.playFace.clear()
    this.playFace.fillStyle(SUN_DARK, 1)
    this.playFace.fillRoundedRect(x, y + 6, w, h, r)
    this.playFace.fillStyle(SUN, 1)
    this.playFace.fillRoundedRect(x, y, w, h, r)
    // Top gloss.
    this.playFace.fillStyle(0xffe9a3, 0.55)
    this.playFace.fillRoundedRect(x + 12, y + 8, w - 24, h * 0.34, r * 0.7)

    this.playText.setPosition(this.playX, this.playY - this.playLift + 2)
  }

  buildAbout() {
    this.aboutPanel = this.add.graphics().setDepth(1010)

    this.aboutToggle = this.add.text(0, 0, 'ABOUT  +', {
      fontFamily: MONO, fontSize: '13px', color: '#f2f7e4',
    }).setOrigin(0.5).setDepth(1012).setInteractive({ useHandCursor: true })
    this.aboutToggle.setShadow(0, 2, 'rgba(35,48,15,0.6)', 3, false, true)
    this.aboutToggle.on('pointerdown', () => this.toggleAbout())

    this.aboutBody = this.add.text(0, 0, ABOUT, {
      fontFamily: MONO, fontSize: '12.5px', color: INK,
      align: 'left', lineSpacing: 7, wordWrap: { width: 560 },
    }).setOrigin(0.5, 0).setDepth(1012).setVisible(false)

    this.aboutAlpha = 0
  }

  toggleAbout() {
    this.aboutOpen = !this.aboutOpen
    this.aboutToggle.setText(this.aboutOpen ? 'ABOUT  −' : 'ABOUT  +')
    this.aboutBody.setVisible(true)

    this.tweens.add({
      targets: this,
      aboutAlpha: this.aboutOpen ? 1 : 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onUpdate: () => this.drawAbout(),
      onComplete: () => {
        if (!this.aboutOpen) this.aboutBody.setVisible(false)
      },
    })
  }

  drawAbout() {
    const a = this.aboutAlpha
    this.aboutPanel.clear()
    if (a <= 0.01) return

    const w = 620
    const h = this.aboutBody.height + 48
    const x = this.scale.width / 2 - w / 2
    const y = this.aboutY + 22

    this.aboutPanel.fillStyle(0x1d2b12, 0.22 * a)
    this.aboutPanel.fillRoundedRect(x + 5, y + 9, w, h, 18)
    this.aboutPanel.fillStyle(0xfdf6e3, 0.95 * a)
    this.aboutPanel.fillRoundedRect(x, y, w, h, 18)

    this.aboutBody.setAlpha(a).setPosition(this.scale.width / 2, y + 24)
  }

  buildFooter() {
    this.footer = this.add.text(0, 0,
      'ENTER TO PLAY  ·  BUILT FOR AXIE VIBEATHON 2026', {
        fontFamily: MONO, fontSize: '11px', color: '#e8f0d6',
      }).setOrigin(0.5).setDepth(1012).setAlpha(0.85)
    this.footer.setShadow(0, 2, 'rgba(35,48,15,0.6)', 3, false, true)
  }

  layout() {
    const { width, height } = this.scale
    const cx = width / 2

    this.field?.setSize(width, height)

    this.wash?.clear()
    this.wash.fillStyle(0x2c3f16, 0.3)
    this.wash.fillRect(0, 0, width, height)

    // Banded gradient rather than a slab: a hard edge cuts across the field.
    const bandH = 300
    const bands = 30
    for (let i = 0; i < bands; i++) {
      const t = i / bands
      this.wash.fillStyle(0x16200f, 0.3 * (1 - t) * (1 - t))
      this.wash.fillRect(0, (bandH / bands) * i, width, bandH / bands + 1)
    }

    const top = Math.max(96, height * 0.2)

    this.titleShadow?.setPosition(cx + 5, top + 8)
    this.title?.setPosition(cx, top)
    this.tagline?.setPosition(cx, top + 82)

    this.playX = cx
    this.playY = top + 176
    this.playZone?.setPosition(this.playX, this.playY)
    this.drawPlay()

    this.aboutY = this.playY + 78
    this.aboutToggle?.setPosition(cx, this.aboutY)
    this.drawAbout()

    this.footer?.setPosition(cx, height - 26)

    // Park the Axies along the lower field, clear of the card.
    this.wanderers.forEach((w, i) => {
      const n = this.wanderers.length
      const spread = Math.min(width - 200, 900)
      w.home.x = cx - spread / 2 + (spread / Math.max(1, n - 1)) * i
      w.home.y = height - 130
    })
  }

  start() {
    if (this.leaving) return
    this.leaving = true
    this.cameras.main.fadeOut(220)
    this.time.delayedCall(240, () => {
      this.scene.start('MenuScene', { builds: this.builds })
    })
  }

  update(time, delta) {
    // Slow drift, so the field is alive without pulling focus.
    for (const w of this.wanderers) {
      w.phase += delta / 1000 * w.speed
      const x = w.home.x + Math.cos(w.phase) * w.radius
      const y = w.home.y + Math.sin(w.phase * 1.7) * w.radius * 0.25
      const moving = Math.abs(Math.sin(w.phase)) > 0.2

      w.sprite.setFacing(Math.sin(w.phase) > 0 ? 1 : -1)
      w.sprite.root.setPosition(x, y)
      w.sprite.root.setDepth(y)
      w.sprite.update(delta, moving ? 60 : 0)
    }
  }
}

const ABOUT =
  'Six Axie classes meet on one field. Only one walks off it.\n\n' +
  'Every class fights its own way. Beast charges through you. Bird pokes from\n' +
  'range and dies if you catch it. Plant poisons the ground you want to stand\n' +
  'on. Bug wears you down. Aquatic shoves you where it wants you. Reptile\n' +
  'punishes anyone who crowds it.\n\n' +
  'Aim with the mouse, dash to escape, and spend your special when it counts.\n' +
  'Hide in the long grass if the fight is going badly.\n\n' +
  'Axie bodies are built with the official 2D mixer. Battle effects and sounds\n' +
  'come from the Axie Origins Battle Kit. No wallet, no account, no download.'
