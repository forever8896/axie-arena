import Phaser from 'phaser'
import { initMixer, buildAxie, AXIE_CDN, CLASS_PART_SETS } from '../axie/AxieFactory.js'
import { ARENA_PALETTE } from '../axie/palette.js'
import { CLASS_KITS } from '../axie/classKits.js'
import { loadSkillPlates } from '../fx/SkillVfx.js'
import { loadSfx, SFX } from '../fx/Sfx.js'

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
    this.status.setText('BUILDING AXIES')

    try {
      await initMixer()
    } catch (err) {
      return this.fail('Could not load mixer data', err)
    }

    const builds = {}
    for (const [axieClass, partSet] of Object.entries(CLASS_PART_SETS)) {
      try {
        builds[axieClass] = buildAxie(axieClass, partSet)
      } catch (err) {
        console.warn(`skipping ${axieClass}:`, err.message)
      }
    }

    const paths = new Set()
    for (const build of Object.values(builds)) {
      build.layers.forEach(l => paths.add(l.imagePath))
    }

    this.status.setText('LOADING AXIE PARTS')
    await this.loadTextures([...paths])

    this.status.setText('LOADING ORIGINS EFFECTS')
    this.setBar(0)
    const vfxIds = [...new Set(
      Object.values(CLASS_KITS).map(k => k.special.vfx).filter(Boolean),
    )]
    let vfxDone = 0
    await loadSkillPlates(vfxIds, this, () => this.setBar(++vfxDone / vfxIds.length))

    this.status.setText('LOADING BATTLE AUDIO')
    this.setBar(0)
    let sfxDone = 0
    await loadSfx(this, () => this.setBar(++sfxDone / SFX.length))

    const missing = []
    for (const [axieClass, build] of Object.entries(builds)) {
      if (build.layers.some(l => !this.textures.exists(l.imagePath))) missing.push(axieClass)
    }
    if (missing.length === Object.keys(builds).length) {
      return this.fail('Could not reach the Axie CDN', new Error('no textures loaded'))
    }
    missing.forEach(c => delete builds[c])

    this.scene.start('MenuScene', { builds })
  }

  /**
   * Textures are fetched directly rather than through Phaser's loader.
   * The loader is built to run during a scene's preload phase; queueing into it
   * afterwards stalls at its parallel-download cap and never resumes.
   */
  async loadTextures(paths) {
    let done = 0
    await Promise.all(paths.map(async path => {
      if (!this.textures.exists(path)) await this.loadTexture(path)
      done++
      this.setBar(done / paths.length)
    }))
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

  showProgress() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor(ARENA_PALETTE.deep)

    this.add.text(width / 2, height / 2 - 46, 'AXIE ARENA', {
      fontFamily: 'ui-monospace, monospace', fontSize: '26px', color: '#e8e4f5',
    }).setOrigin(0.5)

    this.status = this.add.text(width / 2, height / 2 + 34, 'STARTING', {
      fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#6f6892',
    }).setOrigin(0.5)

    this.barBg = this.add.rectangle(width / 2, height / 2, 320, 4, 0x2a2440)
    this.bar = this.add.rectangle(width / 2 - 160, height / 2, 0, 4, 0xffb812).setOrigin(0, 0.5)
  }

  setBar(v) {
    this.bar.width = 320 * v
  }

  fail(message, err) {
    console.error(message, err)
    this.status.setColor('#ff8098').setText(`${message.toUpperCase()} — CHECK YOUR CONNECTION`)
  }
}
