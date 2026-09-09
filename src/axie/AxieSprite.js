import Phaser from 'phaser'
import { CLASS_COLORS } from './palette.js'

/**
 * The seam between gameplay and however an Axie is drawn.
 *
 * Draws official Axie art: flat layers from the mixer's exportAvatarLayers,
 * assembled and animated procedurally. No Spine runtime ships — see README.
 *
 * The mixer's art faces LEFT natively, so facing right flips the rig.
 */
export default class AxieSprite {
  constructor(scene, x, y, { build, axieClass = 'beast' } = {}) {
    this.scene = scene
    this.axieClass = axieClass
    this.colors = CLASS_COLORS[axieClass] ?? CLASS_COLORS.beast
    this.build = build

    this.root = scene.add.container(x, y)

    // Shadow sits outside the animated rig so it stays planted on the ground.
    this.shadow = scene.add.ellipse(0, 0, 1, 1, 0x000000, 0.4)
    this.glow = scene.add.ellipse(0, 0, 1, 1, this.colors.body, 0.12)

    this.facingWrap = scene.add.container(0, 0)
    this.anim = scene.add.container(0, 0)
    this.facingWrap.add(this.anim)
    this.root.add([this.glow, this.shadow, this.facingWrap])

    this.parts = { legFront: [], legBack: [], tail: [], earLeft: [], earRight: [], head: [], body: [] }
    this.images = []

    this.assemble()

    this.facing = -1
    this.runPhase = 0
    this.blinkAt = scene.time.now + Phaser.Math.Between(1200, 4000)
  }

  assemble() {
    const { layers, scale } = this.build
    const scene = this.scene

    // Measure first, so the rig is centred on the body and stands on its feet
    // rather than floating from the mixer's own canvas origin.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const l of layers) {
      minX = Math.min(minX, l.px)
      maxX = Math.max(maxX, l.px + l.w)
      minY = Math.min(minY, l.py)
      maxY = Math.max(maxY, l.py + l.h)
    }

    const cx = (minX + maxX) / 2
    const cy = maxY

    for (const l of layers) {
      // Pivot per part: limbs swing from where they meet the body.
      const [ox, oy] = PIVOTS[l.part] ?? [0.5, 0.5]
      const img = scene.add.image(0, 0, l.imagePath)
        .setOrigin(ox, oy)
        .setDisplaySize(l.w, l.h)
        .setPosition(l.px - cx + l.w * ox, l.py - cy + l.h * oy)

      img.baseX = img.x
      img.baseY = img.y
      img.baseScaleY = img.scaleY
      this.anim.add(img)
      this.images.push(img)

      const bucket = HEAD_PARTS.has(l.part) ? 'head' : (this.parts[l.part] ? l.part : 'body')
      this.parts[bucket].push(img)
    }

    this.height = maxY - minY
    this.width = maxX - minX

    // Ground furniture is sized from the assembled body, not guessed at.
    this.shadow.setSize(this.width * 0.66, this.width * 0.2)
    this.glow.setSize(this.width * 1.5, this.width * 0.5)
  }

  get x() { return this.root.x }
  get y() { return this.root.y }

  setPosition(x, y) {
    this.root.setPosition(x, y)
    this.root.setDepth(y)
  }

  /** dir < 0 faces left (the art's native direction), dir > 0 faces right. */
  setFacing(dir) {
    if (dir === 0) return
    const next = dir < 0 ? -1 : 1
    if (next === this.facing) return
    this.facing = next
    this.scene.tweens.add({
      targets: this.facingWrap,
      scaleX: -this.facing,
      duration: 110,
      ease: 'Quad.easeOut',
    })
  }

  update(delta, speed) {
    const moving = speed > 8
    const gait = Phaser.Math.Clamp(speed / 215, 0, 1.3)

    this.runPhase += (delta / 1000) * (moving ? 9 + gait * 6 : 2.4)
    const p = this.runPhase
    const amp = moving ? 1 : 0.25

    // Whole-body bob, and a squash that compresses at the bottom of the arc.
    const bob = Math.sin(p * 2) * 7 * amp
    const squash = 1 + Math.sin(p * 2 + Math.PI) * 0.05 * amp
    this.anim.setY(bob)
    this.anim.setScale(2 - squash, squash)
    this.anim.rotation = Phaser.Math.Linear(
      this.anim.rotation, moving ? -0.05 * gait : 0, 0.12,
    )

    // Legs alternate; the pair on each side is half a cycle out of phase.
    const stride = moving ? 9 : 0
    this.parts.legFront.forEach((img, i) => {
      img.y = img.baseY - Math.max(0, Math.sin(p + i * Math.PI)) * stride
      img.rotation = Math.sin(p + i * Math.PI) * 0.18 * amp
    })
    this.parts.legBack.forEach((img, i) => {
      img.y = img.baseY - Math.max(0, Math.sin(p + Math.PI + i * Math.PI)) * stride
      img.rotation = Math.sin(p + Math.PI + i * Math.PI) * 0.18 * amp
    })

    // Ears and tail lag the body — the overlap is what makes it read as alive.
    this.parts.tail.forEach(img => { img.rotation = Math.sin(p * 1.4 - 0.5) * 0.16 * amp })
    this.parts.earLeft.forEach(img => { img.rotation = Math.sin(p - 0.7) * 0.13 * amp })
    this.parts.earRight.forEach(img => { img.rotation = Math.sin(p - 0.9) * 0.15 * amp })

    // Shadow tightens as the body lifts.
    const lift = 1 - Math.abs(bob) / (7 * Math.max(amp, 0.01))
    this.shadow.setScale(0.88 + lift * 0.16).setAlpha(0.24 + lift * 0.18)
    this.glow.setScale(0.95 + lift * 0.1)

    this.updateBlink()
  }

  updateBlink() {
    const t = this.scene.time.now
    if (t < this.blinkAt || this.blinking) return
    this.blinking = true
    const eyes = this.parts.head.filter(i => i.texture.key.includes('eyes'))
    eyes.forEach(e => e.setScale(e.scaleX, e.baseScaleY * 0.1))
    this.scene.time.delayedCall(95, () => {
      eyes.forEach(e => e.setScale(e.scaleX, e.baseScaleY))
      this.blinking = false
      this.blinkAt = t + Phaser.Math.Between(1800, 5200)
    })
  }

  /** Wind-up then lunge, in the direction the Axie faces. */
  playAttack(onConnect) {
    this.scene.tweens.chain({
      targets: this.anim,
      tweens: [
        { x: 14, duration: 95, ease: 'Quad.easeOut' },
        { x: -22, duration: 70, ease: 'Back.easeOut', onComplete: () => onConnect?.() },
        { x: 0, duration: 190, ease: 'Quad.easeOut' },
      ],
    })
  }

  flash(color, ms = 110) {
    this.images.forEach(i => i.setTintFill(color))
    this.scene.time.delayedCall(ms, () => this.images.forEach(i => i.clearTint()))
  }

  destroy() {
    this.root.destroy()
  }
}

const HEAD_PARTS = new Set(['eyes', 'mouth', 'horn'])

/** Origin per part, so rotation happens at the joint rather than the corner. */
const PIVOTS = {
  legFront: [0.5, 0.1],
  legBack: [0.5, 0.1],
  tail: [0.1, 0.5],
  earLeft: [0.5, 0.9],
  earRight: [0.5, 0.9],
}
