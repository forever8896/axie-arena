import Phaser from 'phaser'
import { WILDS } from './config.js'
import { ensureTexture } from '../arena/Moonwell.js'

/**
 * A Moon Gate: stand inside for WILDS.extractMs to leave the Wilds with your
 * bounty. A beam of moonlight marks it from across the field.
 */
export default class MoonGate {
  constructor(scene, site) {
    this.scene = scene
    this.site = site
    this.x = site.x
    this.y = site.y
    this.open = false
    this.closingAt = 0
    ensureTexture(scene)
    const R = WILDS.gateRadius
    const c = 0xc9b8ff

    this.base = scene.add.circle(this.x, this.y, R, 0x2a2350, 0.35).setDepth(-18)
    this.glow = scene.add.image(this.x, this.y, 'fx-moonwell').setTint(c).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(R * 2.6, R * 2.6).setDepth(-17)
    this.ring = scene.add.circle(this.x, this.y, R, 0, 0).setStrokeStyle(4, 0xefe8ff, 0.95).setDepth(-16)
    this.beam = scene.add.image(this.x, this.y - 170, 'fx-soft').setTint(c).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(R * 1.1, 320).setDepth(this.y + 30)
    const markKey = scene.textures.exists('brand-mark') ? 'brand-mark' : 'fx-dot'
    this.mark = scene.add.image(this.x, this.y - 165, markKey).setDepth(this.y + 31)
    this.markScale = 58 / Math.max(this.mark.width, this.mark.height)
    this.mark.setScale(this.markScale)
    this.parts = [this.base, this.glow, this.ring, this.beam, this.mark]
    this.parts.forEach(p => p.setVisible(false))
  }

  get closing() {
    return this.open && this.closingAt > 0
  }

  openGate() {
    this.open = true
    this.closingAt = 0
    this.parts.forEach(p => p.setVisible(true).setAlpha(1))
    this.ring.setScale(0.2)
    this.scene.tweens.add({ targets: this.ring, scale: 1, duration: 700, ease: 'Back.easeOut' })
    this.mark.setScale(0)
    this.scene.tweens.add({ targets: this.mark, scale: this.markScale, duration: 700, ease: 'Back.easeOut' })
  }

  closeGate() {
    this.open = false
    this.closingAt = 0
    this.scene.tweens.add({
      targets: this.parts, alpha: 0, duration: 500,
      onComplete: () => { if (!this.open) this.parts.forEach(p => p.setVisible(false)) },
    })
  }

  contains(f) {
    return this.open && Phaser.Math.Distance.Between(f.x, f.y, this.x, this.y) <= WILDS.gateRadius
  }

  update(now) {
    if (!this.open) return
    const t = now / 1000
    this.mark.y = this.y - 165 + Math.sin(t * 2) * 6
    this.glow.setAlpha(0.55 + Math.sin(t * 2.6) * 0.15)
    this.beam.setAlpha(0.35 + Math.sin(t * 1.7) * 0.1)
    if (this.closing) {
      // Blinks faster as it runs out, so a hunter mid-channel sees it coming.
      const left = this.closingAt - now
      const on = Math.floor(now / (left < 3000 ? 110 : 260)) % 2 === 0
      this.ring.setStrokeStyle(4, on ? 0xff8098 : 0xefe8ff, 0.95)
    } else {
      this.ring.setStrokeStyle(4, 0xefe8ff, 0.95)
    }
  }
}
