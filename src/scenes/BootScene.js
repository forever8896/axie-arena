import Phaser from 'phaser'
import { ARENA_PALETTE } from '../axie/palette.js'
import { CLASS_KITS } from '../axie/classKits.js'
import { SHEETS } from '../ronke/RonkeSprite.js'
import { POWERUPS, POWERUP_ICONS } from '../arena/PowerUps.js'
import { makeMiniPortraits } from '../fx/MiniPortrait.js'
import { makeGrassTexture } from '../arena/Arena.js'
import { createFxTextures, ambientMotes } from '../fx/Juice.js'
import { FIELD } from '../axie/palette.js'

const HEAD = 'Rowdies, ui-sans-serif, system-ui, sans-serif'
const MONO = 'ui-monospace, monospace'
const PHASES = 4

/** Shown while the Axie parts come down from the CDN. */
const TIPS = [
  'Q parries. A blow you meet is a blow that hurts whoever threw it.',
  'Your stake buys a bounty. A kill takes the whole bounty its owner carried.',
  'Nothing is yours until you carry it out through a Moon Gate.',
  'Landing hits charges your special, not waiting around.',
  'A hit restarts the gate channel. Cash out when nobody can reach you.',
  'Moonwells heal you, but a rival hit stops the healing for a moment.',
  'Bushes hide you. Rivals lose sight of you unless they are close.',
  'The leader glows. So will you, once you are the one carrying.',
]
import { loadSfx, SFX } from '../fx/Sfx.js'
import { loadMusic, attachMusic, TRACKS } from '../fx/Music.js'

/**
 * Builds every Axie the arena needs, then pulls their textures off the Axie
 * CDN before the game starts. Nothing renders until the art is in.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    this.showProgress()
  }

  async create() {
    createFxTextures(this)
    this.setPhase('BUILDING AXIES', 0)
    await this.loadBrand()
    this.brandReady()

    this.setPhase('WAKING RONKE', 1)
    const builds = await this.loadRonke()
    if (!builds) return this.fail('Could not load Ronke', new Error('no sprite sheets'))

    this.setPhase('PAINTING THE MAP', 2)
    makeMiniPortraits(this, builds)
    this.setBar(1)

    this.setPhase('LOADING BATTLE AUDIO', 3)
    attachMusic(this.game)
    let sfxDone = 0
    const audioSteps = SFX.length + TRACKS.length
    await loadSfx(this, () => this.setBar(++sfxDone / audioSteps))
    await loadMusic(() => this.setBar(++sfxDone / audioSteps))

    // Dev-only balance tool: /?sim=60 runs bot-only matches and reports.
    const sim = import.meta.env.DEV && new URLSearchParams(location.search).get('sim')
    if (sim) {
      const { runBalanceSim } = await import('../dev/balanceSim.js')
      runBalanceSim(this.game, builds, Math.max(6, parseInt(sim, 10) || 60))
      return
    }

    // /?net=glade drops straight into a room on the server, while the menu's
    // Play still runs the Wilds in the page. Both exist until the networked
    // room is the better of the two.
    const net = new URLSearchParams(location.search).get('net')
    if (net != null) {
      return this.scene.start('NetScene', {
        builds,
        roomId: net || 'glade',
        playerClass: new URLSearchParams(location.search).get('cls') ?? Object.keys(builds)[0],
        name: new URLSearchParams(location.search).get('name') ?? 'You',
      })
    }

    this.scene.start('HomeScene', { builds })
  }

  /**
  /**
   * The six sprite sheets, and one entry per class pointing at the same Ronke.
   *
   * The classes still exist above this — the lobby, the menu and the kits all
   * speak in them — so rather than tear that out, every one of them resolves to
   * the same fighter. Collapsing the roster itself is a separate job.
   */
  async loadRonke() {
    const base = `${import.meta.env.BASE_URL}sprites/`
    let done = 0
    for (const name of SHEETS) {
      try {
        const meta = await (await fetch(`${base}${name}.json`)).json()
        const img = await new Promise((resolve, reject) => {
          const i = new Image()
          i.onload = () => resolve(i)
          i.onerror = () => reject(new Error(`${name}.png failed`))
          i.src = `${base}${name}.png`
        })
        this.cache.json.add(`sprites-${name}`, meta)
        this.textures.addSpriteSheet(`ronke-${name}`, img, {
          frameWidth: meta.frameWidth, frameHeight: meta.frameHeight, endFrame: meta.frames - 1,
        })
      } catch (err) {
        console.warn(`sheet ${name} failed:`, err.message)
      }
      this.setBar(++done / SHEETS.length)
    }
    if (!this.textures.exists('ronke-idle')) return null
    return Object.fromEntries(Object.keys(CLASS_KITS).map(c => [c, { ronke: true }]))
  }

  /** The logo, as SVG rasterised at its authored size so it stays crisp. */
  loadBrand() {
    const one = (key, file) => new Promise(resolve => {
      if (this.textures.exists(key)) return resolve()
      const img = new Image()
      img.onload = () => { this.textures.addImage(key, img); resolve() }
      img.onerror = () => { console.warn(`${file} failed to load`); resolve() }
      img.src = `${import.meta.env.BASE_URL}brand/${file}`
    })
    // The moon mark crowns every Moon Gate in the Wilds.
    return Promise.all([one('brand-logo', 'lunacy-logo.svg'), one('brand-mark', 'lunacy-mark.svg')])
  }

  loadTexture(path) {
    return new Promise(resolve => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (!this.textures.exists(path)) this.textures.addImage(path, img)
        resolve(true)
      }
      img.onerror = () => {
        console.warn('texture failed:', path)
        resolve(false)
      }
      img.src = AXIE_CDN + path
    })
  }

  /**
   * The first thing anyone sees, so it is the field itself: grass, drifting
   * motes, the logo, and a moon that fills as the game loads. The phases are
   * named as they happen and a tip rotates underneath, because the Axie parts
   * come off a CDN and this screen is up for a few seconds on a cold load.
   */
  showProgress() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor(FIELD.grassDeep)
    makeGrassTexture(this)
    this.add.tileSprite(0, 0, width, height, 'field-grass').setOrigin(0).setDepth(-100).setAlpha(0.9)

    // Darkened toward the edges so the middle reads as lit.
    const wash = this.add.graphics().setDepth(-99)
    wash.fillStyle(0x16200f, 0.26).fillRect(0, 0, width, height)
    for (let i = 0; i < 26; i++) {
      const t = i / 26
      wash.fillStyle(0x16200f, 0.42 * t * t)
      wash.fillRect(0, 0, width, (height / 2) * (1 - t) + 2)
      wash.fillRect(0, height - (height / 2) * (1 - t), width, (height / 2) * (1 - t) + 2)
    }
    ambientMotes(this, { left: 0, top: 0, right: width, bottom: height })

    const cx = width / 2
    const cy = height / 2

    this.title = this.add.text(cx, cy - 150, 'LUNACY', {
      fontFamily: HEAD, fontSize: '54px', color: '#fff8d8',
    }).setOrigin(0.5).setDepth(10)
    this.title.setShadow(0, 5, 'rgba(22,32,15,0.55)', 0, false, true)

    // The moon dial: the mark from the logo, with a ring that fills.
    this.dial = this.add.graphics().setDepth(11)
    this.dialY = cy + 6
    this.moonGlow = this.add.image(cx, this.dialY, 'fx-soft')
    if (!this.textures.exists('fx-soft')) this.moonGlow.destroy(), (this.moonGlow = null)
    this.moonGlow?.setTint(0xffd964).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setAlpha(0.35).setDepth(10)

    this.status = this.add.text(cx, cy + 100, 'STARTING', {
      fontFamily: MONO, fontSize: '12px', color: '#e8f0d6',
    }).setOrigin(0.5).setDepth(11)
    this.percent = this.add.text(cx, this.dialY, '', {
      fontFamily: HEAD, fontSize: '20px', color: '#fff8d8',
    }).setOrigin(0.5).setDepth(12)

    this.tipPlate = this.add.graphics().setDepth(10)
    this.tip = this.add.text(cx, height - 74, '', {
      fontFamily: MONO, fontSize: '12px', color: '#f4f8e8', align: 'center',
    }).setOrigin(0.5).setDepth(11)
    this.tipIndex = Math.floor(Math.random() * TIPS.length)
    this.showTip()
    this.time.addEvent({ delay: 4200, loop: true, callback: () => this.showTip() })

    this.add.text(cx, height - 26, 'BUILT FOR AXIE VIBEATHON 2026', {
      fontFamily: MONO, fontSize: '10px', color: '#b9c4a6',
    }).setOrigin(0.5).setDepth(11).setAlpha(0.75)

    this.phaseIndex = 0
    this.progress = 0
    this.shown = 0
  }

  showTip() {
    this.tipIndex = (this.tipIndex + 1) % TIPS.length
    this.tip.setText(TIPS[this.tipIndex]).setAlpha(0)
    this.tweens.add({ targets: this.tip, alpha: 1, duration: 400 })
    const w = this.tip.width + 44
    const g = this.tipPlate
    g.clear()
    g.fillStyle(0x16200f, 0.6).fillRoundedRect(this.tip.x - w / 2, this.tip.y - 19, w, 38, 12)
  }

  /** Called as each stage starts, so the dots below the moon fill in. */
  setPhase(name, index) {
    this.phaseIndex = index
    this.status.setText(name)
    this.progress = 0
    this.shown = 0
  }

  /** The logo replaces the plain title as soon as it has loaded. */
  brandReady() {
    if (!this.textures.exists('brand-logo') || this.logo) return
    this.title.setVisible(false)
    this.logo = this.add.image(this.title.x, this.title.y, 'brand-logo').setDepth(10)
    this.logo.setScale(Math.min(420, this.scale.width * 0.6) / this.logo.width)
    this.logo.setAlpha(0)
    this.tweens.add({ targets: this.logo, alpha: 1, duration: 450, ease: 'Sine.easeOut' })
  }

  update(time, delta) {
    if (!this.dial) return
    // Ease toward the real value: a bar that jumps looks broken.
    this.shown += (this.progress - this.shown) * Math.min(1, delta / 160)
    const g = this.dial
    const cx = this.scale.width / 2
    const cy = this.dialY
    const r = 54
    g.clear()

    g.fillStyle(0x16200f, 0.55).fillCircle(cx, cy, r + 12)
    g.lineStyle(9, 0x3a4a2a, 1).strokeCircle(cx, cy, r)
    g.lineStyle(9, 0xffc22e, 1)
    g.beginPath()
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(this.shown, 0, 1))
    g.strokePath()

    // A spark riding the head of the ring.
    const a = -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(this.shown, 0, 1)
    g.fillStyle(0xfff8d8, 1).fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5)

    // Phase dots under the dial.
    for (let i = 0; i < PHASES; i++) {
      const x = cx - (PHASES - 1) * 9 + i * 18
      g.fillStyle(i < this.phaseIndex ? 0xffd964 : i === this.phaseIndex ? 0xfff8d8 : 0x3a4a2a, 1)
      g.fillCircle(x, cy + 126, i === this.phaseIndex ? 5 : 3.5)
    }

    this.percent.setText(`${Math.round(Phaser.Math.Clamp(this.shown, 0, 1) * 100)}%`)
    this.moonGlow?.setAlpha(0.28 + Math.sin(time / 420) * 0.1)
    if (this.logo) this.logo.y = this.title.y + Math.sin(time / 900) * 4
    if (this.mark) {
      this.mark.setPosition(cx, cy)
      this.mark.rotation = Math.sin(time / 1400) * 0.12
    } else if (this.textures.exists('brand-mark')) {
      this.mark = this.add.image(cx, cy, 'brand-mark').setDepth(11)
      this.mark.setScale(64 / Math.max(this.mark.width, this.mark.height))
      this.percent.setY(cy + 76).setFontSize(14)
    }
  }

  setBar(v) {
    this.progress = v
  }

  fail(message, err) {
    console.error(message, err)
    this.status.setColor('#ff8098').setText(`${message.toUpperCase()} — CHECK YOUR CONNECTION`)
  }
}
