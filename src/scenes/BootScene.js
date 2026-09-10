import Phaser from 'phaser'
import { initMixer, buildAxie, AXIE_CDN, CLASS_PART_SETS } from '../axie/AxieFactory.js'
import { ARENA_PALETTE } from '../axie/palette.js'

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
    this.load.setCORS('anonymous')
    for (const path of paths) {
      if (!this.textures.exists(path)) this.load.image(path, AXIE_CDN + path)
    }

    this.load.on('progress', v => this.setBar(v))
    this.load.once('complete', () => {
      const missing = []
      for (const [axieClass, build] of Object.entries(builds)) {
        if (build.layers.some(l => !this.textures.exists(l.imagePath))) missing.push(axieClass)
      }
      if (missing.length === Object.keys(builds).length) {
        return this.fail('Could not reach the Axie CDN', new Error('no textures loaded'))
      }
      missing.forEach(c => delete builds[c])
      this.scene.start('MenuScene', { builds })
    })
    this.load.start()
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
