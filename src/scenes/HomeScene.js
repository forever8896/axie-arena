import Phaser from 'phaser'
import RonkeSprite from '../ronke/RonkeSprite.js'
import { makeGrassTexture } from '../arena/Arena.js'
import { FIELD } from '../game/palette.js'
import { ambientMotes } from '../fx/Juice.js'
import { tutorialDone } from '../tutorial/TutorialDirector.js'
import { play as playMusic } from '../fx/Music.js'
import { bindButton, uiSound } from '../fx/UiSound.js'
import { measureAll, nearest, roomsUrl, remember, remembered } from '../net/regions.js'

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
    // Scene instances are reused: a revisit must not inherit the last exit.
    this.leaving = false
    this.aboutOpen = false
    this.wanderers = []

    playMusic('theme')
    this.buildField()
    this.buildTitle()
    this.buildPlay()
    this.buildTutorialLink()
    this.buildMultiplayer()
    this.buildAbout()
    this.buildFooter()

    this.input.keyboard.on('keydown-ENTER', () => this.start('wilds'))
    this.input.keyboard.on('keydown-SPACE', () => this.start('wilds'))
    this.input.keyboard.on('keydown-T', () => this.start('tutorial'))

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

    // A field of Ronkes milling about behind the card. There is one of him, so
    // the crowd is made of the same fighter at different sizes and speeds —
    // which is what a Ronkeverse looks like anyway.
    const CROWD = 9
    for (let i = 0; i < CROWD; i++) {
      const sprite = new RonkeSprite(this, 0, 0, { build: this.builds?.ronke, cls: 'ronke' })
      // Further back reads smaller; it is the only depth cue a flat field has.
      const far = Math.random()
      sprite.root.setScale(0.8 + far * 0.5)
      this.wanderers.push({
        sprite,
        phase: Math.random() * Math.PI * 2,
        speed: 0.1 + Math.random() * 0.22,
        home: { x: 0, y: 0 },
        radius: 40 + Math.random() * 70,
        lift: far,
      })
    }
    // One of them is not well, and keeps not being well. Not the middle one:
    // the middle is where the Play button is, and he is worth seeing.
    this.sick = this.wanderers[1]
    this.sick.sickUntil = 0
  }

  buildTitle() {
    if (this.textures.exists('brand-logo')) {
      this.logo = this.add.image(0, 0, 'brand-logo').setDepth(1010)
      // A slow bob, so the title feels as alive as the field under it.
      this.logoBob = 0
    }
    // The logo art is the Lunacy wordmark, and it stays: the game was called
    // that, and crossing it out says so more plainly than replacing it would.
    this.strike = this.add.graphics().setDepth(1011)

    this.titleShadow = this.add.text(0, 0, 'LUNACY', {
      fontFamily: HEAD, fontSize: '120px', color: '#23300f',
    }).setOrigin(0.5).setAlpha(0.32).setDepth(1009)

    this.title = this.add.text(0, 0, 'LUNACY', {
      fontFamily: HEAD, fontSize: '120px', color: '#fff8d8',
    }).setOrigin(0.5).setDepth(1010)
    this.title.setShadow(0, 6, 'rgba(35,48,15,0.45)', 0, false, true)

    this.newName = this.add.text(0, 0, 'RONKACY', {
      fontFamily: HEAD, fontSize: '84px', color: '#fff8d8',
    }).setOrigin(0.5).setDepth(1012)
    this.newName.setShadow(0, 6, 'rgba(35,48,15,0.5)', 0, false, true)

    this.tagline = this.add.text(0, 0, 'DROP IN  ·  TAKE BOUNTIES  ·  WALK OUT WITH THEM', {
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
    bindButton(this, this.playZone, () => this.start('wilds'), { sound: 'start' })
  }

  /** The way in for new players: loud until the tutorial has been finished once. */
  buildTutorialLink() {
    const fresh = !tutorialDone()
    this.tutorialText = this.add.text(0, 0, fresh ? 'NEW HERE?  PLAY THE TUTORIAL  ▸' : 'REPLAY THE TUTORIAL  ▸', {
      fontFamily: HEAD, fontSize: fresh ? '17px' : '14px', color: fresh ? '#ffd964' : '#fff8d8',
    }).setOrigin(0.5).setDepth(1012).setInteractive({ useHandCursor: true })
    this.tutorialText.setShadow(0, 2, 'rgba(35,48,15,0.8)', 3, false, true)
    bindButton(this, this.tutorialText, () => this.start('tutorial'), { sound: 'start' })
    if (fresh) this.tweens.add({ targets: this.tutorialText, scale: 1.06, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
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

  /**
   * The way into the networked rooms, and honest about what it is: the local
   * game is the finished one, this is the one being built. It says whether the
   * rooms are actually reachable before anyone clicks it, because a switch that
   * leads to a connection error is worse than one that says it is down.
   */
  buildMultiplayer() {
    this.netToggle = this.add.text(0, 0, 'MULTIPLAYER  ·  EXPERIMENTAL  ▸', {
      fontFamily: HEAD, fontSize: '15px', color: '#c9b8ff',
    }).setOrigin(0.5).setDepth(1012).setInteractive({ useHandCursor: true })
    this.netToggle.setShadow(0, 2, 'rgba(35,48,15,0.8)', 3, false, true)
    bindButton(this, this.netToggle, () => this.playNet(), { sound: 'start' })
    this.input.keyboard.on('keydown-N', () => this.playNet())

    // Measure the servers and list the nearest one's rooms, so the switch says
    // where you would be playing and how far away it is before you press it.
    this.findRooms()
  }

  /**
   * The nearest server that answers, and what is happening on it. Measured
   * before anyone clicks, because "multiplayer" is a promise worth checking:
   * if no server answers, the switch says so instead of leading somewhere that
   * cannot be reached.
   */
  async findRooms() {
    const measured = await measureAll()
    // A server chosen before wins, as long as it still answers; otherwise the
    // nearest one that does. Nobody should have to pick twice.
    const saved = remembered()
    const best = measured.find(m => m.region.id === saved && m.ping != null) ?? nearest(measured)
    if (!this.live()) return
    if (!best) {
      this.netToggle.setText('MULTIPLAYER  ·  ROOMS OFFLINE').setColor('#9aa88a').disableInteractive()
      return
    }
    this.region = best.region
    try {
      const res = await fetch(roomsUrl(best.region), { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const { rooms } = await res.json()
      if (!this.live()) return
      const players = rooms.reduce((s, r) => s + r.players, 0)
      const hunters = rooms.reduce((s, r) => s + r.hunters, 0)
      const where = `${best.region.name.toUpperCase()} ${best.ping}MS`
      // One room per region, so this can say the thing that actually decides
      // whether it is worth clicking: whether anyone is in there.
      this.netToggle.setText(players
        ? `MULTIPLAYER  ·  ${players} ${players === 1 ? 'PLAYER' : 'PLAYERS'} IN THE ROOM  ·  ${where}  ▸`
        : `MULTIPLAYER  ·  ${where}  ·  ${hunters} STAND-INS WAITING  ▸`)
    } catch {
      if (!this.live()) return
      this.netToggle.setText('MULTIPLAYER  ·  ROOMS OFFLINE').setColor('#9aa88a').disableInteractive()
    }
  }

  /**
   * Whether this screen is still the one on screen.
   *
   * Room lookup is asynchronous and the player can be two scenes away by the
   * time it answers. Writing to a Text that has been destroyed throws from
   * inside Phaser's texture code, which is a long way from the cause.
   */
  live() {
    return Boolean(this.scene?.isActive() && this.netToggle?.scene && !this.leaving)
  }

  /** Into multiplayer, on whichever server answered fastest. */
  playNet() {
    if (this.region) remember(this.region.id)
    this.start('net')
  }

  /** The menu carries the chosen server through to the lobby. */

  buildAbout() {
    this.aboutToggle = this.add.text(0, 0, 'ABOUT  ·  HOW IT WORKS  ▸', {
      fontFamily: MONO, fontSize: '12px', color: '#e8f0d6',
    }).setOrigin(0.5).setDepth(1012).setInteractive({ useHandCursor: true })
    this.aboutToggle.setShadow(0, 2, 'rgba(35,48,15,0.7)', 3, false, true)
    bindButton(this, this.aboutToggle, () => this.openAbout())
    this.input.keyboard.on('keydown-A', () => this.openAbout())
  }

  openAbout() {
    if (this.leaving) return
    this.leaving = true
    this.cameras.main.fadeOut(180)
    this.time.delayedCall(200, () => this.scene.start('AboutScene', { builds: this.builds }))
  }

  buildFooter() {
    this.footer = this.add.text(0, 0,
      'ENTER  PLAY  ·  T  TUTORIAL  ·  N  MULTIPLAYER  ·  A  ABOUT  ·  M  MUTE  ·  A RONKEVERSE GAME', {
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

    let top = Math.max(96, height * 0.2)
    let taglineY = top + 82
    // The old name sits where it always did, struck through; the new one sits
    // under it, smaller, because it is the answer and not the question.
    let oldW = Math.min(420, width * 0.52)
    let oldY = top
    if (this.logo) {
      // The text title stays as a fallback for a logo that failed to load.
      this.title.setVisible(false)
      this.titleShadow.setVisible(false)
      const w = Math.min(430, width * 0.55)
      this.logo.setScale(w / this.logo.width)
      const h = this.logo.displayHeight
      top = Math.max(h / 2 + 12, height * 0.15)
      this.logoY = top
      this.logo.setPosition(cx, top)
      oldW = this.logo.displayWidth
      oldY = top
      // Room for the new name between the struck wordmark and the tagline.
      taglineY = top + h / 2 + 128
      top = taglineY - 46
    } else {
      this.title?.setScale(0.72)
      this.titleShadow?.setScale(0.72)
      oldW = (this.title?.displayWidth ?? oldW)
      taglineY = top + 150
      top = taglineY - 46
    }
    this.titleShadow?.setPosition(cx + 5, top + 8)
    this.title?.setPosition(cx, top)
    this.newName?.setPosition(cx, taglineY - 58)
    this.tagline?.setPosition(cx, taglineY)
    this.drawStrike(cx, oldY, oldW)

    this.playX = cx
    this.playY = top + 176
    this.playZone?.setPosition(this.playX, this.playY)
    this.drawPlay()

    this.tutorialText?.setPosition(this.playX, this.playY + 74)
    this.netToggle?.setPosition(cx, this.playY + 112)
    this.aboutY = this.playY + 152
    this.aboutToggle?.setPosition(cx, this.aboutY)

    this.footer?.setPosition(cx, height - 26)

    // Spread the crowd across the lower field and stagger it in depth, so it
    // reads as a field of them rather than a row.
    this.wanderers.forEach((w, i) => {
      const n = this.wanderers.length
      // Inset by more than the widest wander, so nobody walks off the edge.
      const spread = Math.min(width - 260, 1180)
      let x = cx - spread / 2 + (spread / Math.max(1, n - 1)) * i
      // Nobody stands in the middle column, where the card and the buttons are.
      const clear = 250
      if (Math.abs(x - cx) < clear) x = cx + (x < cx ? -clear : clear)
      // Pushing people out of the middle can push them off the side; the wander
      // radius is already counted into the spread, so this only catches that.
      w.home.x = Phaser.Math.Clamp(x, 120, width - 120)
      // Low enough that the crowd never climbs over the Play button.
      w.home.y = height - 150 + w.lift * 70
    })
  }

  /**
   * The line through the old name.
   *
   * Hand-drawn rather than straight: two strokes that overshoot the letters
   * slightly, the way someone crossing a word out actually does it. A clean
   * horizontal rule reads as a redaction, which is the opposite of fond.
   */
  drawStrike(cx, y, w) {
    const g = this.strike
    if (!g) return
    g.clear()
    const half = w / 2 + 14
    g.lineStyle(7, 0x23300f, 0.55)
    g.beginPath(); g.moveTo(cx - half, y + 10); g.lineTo(cx + half, y - 8); g.strokePath()
    g.lineStyle(5, 0xff6a8a, 0.92)
    g.beginPath()
    g.moveTo(cx - half, y + 6)
    g.lineTo(cx - half * 0.3, y - 4)
    g.lineTo(cx + half * 0.35, y + 2)
    g.lineTo(cx + half, y - 10)
    g.strokePath()
  }

  start(mode = 'wilds') {
    if (this.leaving) return
    this.leaving = true
    this.cameras.main.fadeOut(220)
    this.time.delayedCall(240, () => {
      this.scene.start('MenuScene', { builds: this.builds, mode })
    })
  }

  update(time, delta) {
    if (this.logo) this.logo.y = this.logoY + Math.sin(time / 900) * 4

    // Slow drift, so the field is alive without pulling focus.
    for (const w of this.wanderers) {
      w.phase += delta / 1000 * w.speed
      const x = w.home.x + Math.cos(w.phase) * w.radius
      const y = w.home.y + Math.sin(w.phase * 1.7) * w.radius * 0.12
      const moving = Math.abs(Math.sin(w.phase)) > 0.2

      w.sprite.setFacing(Math.sin(w.phase) > 0 ? 1 : -1)
      w.sprite.root.setPosition(x, y)
      w.sprite.root.setDepth(y)

      // The sick one stands still and keeps bringing up rice. The vomit sheet
      // does not loop, so it is restarted whenever it finishes — with a pause,
      // because being sick without a break is a seizure, not a joke.
      if (w === this.sick) {
        if (time >= (w.sickUntil ?? 0)) {
          w.sprite.playState('special')
          w.sickUntil = time + 2300
        }
        w.sprite.update(delta, 0)
        continue
      }
      w.sprite.update(delta, moving ? 60 : 0)
    }
  }
}
