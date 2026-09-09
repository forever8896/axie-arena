import Phaser from 'phaser'
import { CLASS_COLORS } from './palette.js'

/**
 * The seam between gameplay and however an Axie is drawn.
 *
 * Still greybox in the sense that no official art is loaded yet — but built as
 * a layered, procedurally animated creature so the silhouette, lighting and
 * motion are real. Later these same layers are fed by the mixer's
 * exportAvatarLayers (static images, no Spine runtime — see README), and
 * gameplay code never notices: it only calls the methods at the bottom.
 */
export default class AxieSprite {
  constructor(scene, x, y, { axieClass = 'beast', radius = 20 } = {}) {
    this.scene = scene
    this.radius = radius
    this.axieClass = axieClass

    const c = CLASS_COLORS[axieClass] ?? CLASS_COLORS.beast
    this.colors = c

    this.root = scene.add.container(x, y)
    this.rig = scene.add.container(0, 0)

    const r = radius

    // Ground contact. Sold separately from the body so it can stay put while
    // the body bobs — that gap is what makes the bob read as a jump.
    this.shadow = scene.add.ellipse(0, r * 0.95, r * 2.1, r * 0.62, 0x000000, 0.38)

    // Soft light pooling under the creature, tinted to its class.
    this.glow = scene.add.ellipse(0, r * 0.7, r * 3.4, r * 1.5, c.body, 0.13)

    this.tail = scene.add.ellipse(-r * 1.05, r * 0.15, r * 1.15, r * 0.5, c.shade)
    this.legs = [
      scene.add.ellipse(-r * 0.5, r * 0.78, r * 0.46, r * 0.5, c.shade),
      scene.add.ellipse(r * 0.42, r * 0.78, r * 0.46, r * 0.5, c.shade),
    ]

    this.earL = scene.add.ellipse(-r * 0.28, -r * 0.82, r * 0.5, r * 0.72, c.shade)
    this.earR = scene.add.ellipse(r * 0.34, -r * 0.86, r * 0.44, r * 0.64, c.shade)

    this.body = scene.add.ellipse(0, 0, r * 2, r * 1.78, c.body)
    // Shading sits low, rim light sits high-left: cheap two-point lighting.
    this.shade = scene.add.ellipse(0, r * 0.34, r * 1.82, r * 1.1, c.shade, 0.5)
    this.rim = scene.add.ellipse(-r * 0.22, -r * 0.44, r * 1.35, r * 0.72, c.rim, 0.32)

    this.snout = scene.add.ellipse(r * 0.82, r * 0.1, r * 0.82, r * 0.66, c.body)
    this.snoutRim = scene.add.ellipse(r * 0.78, -r * 0.06, r * 0.5, r * 0.3, c.rim, 0.28)

    this.eyeWhite = scene.add.ellipse(r * 0.42, -r * 0.3, r * 0.42, r * 0.46, 0xfdfbff)
    this.pupil = scene.add.ellipse(r * 0.48, -r * 0.28, r * 0.2, r * 0.26, 0x140f26)
    this.spark = scene.add.circle(r * 0.54, -r * 0.38, r * 0.07, 0xffffff, 0.9)

    this.rig.add([
      this.glow, this.shadow,
      this.tail, this.legs[0], this.legs[1],
      this.earL, this.earR,
      this.body, this.shade, this.rim,
      this.snout, this.snoutRim,
      this.eyeWhite, this.pupil, this.spark,
    ])
    this.root.add(this.rig)

    this.facing = 1
    this.runPhase = 0
    this.blinkAt = scene.time.now + Phaser.Math.Between(1200, 4000)
    this.blinking = false
    this.squash = 1
  }

  get x() { return this.root.x }
  get y() { return this.root.y }

  setPosition(x, y) {
    this.root.setPosition(x, y)
    // Overlap sorts by depth so the arena reads with a sense of ground.
    this.root.setDepth(y)
  }

  /** dir < 0 faces left, dir > 0 faces right. Mixer art faces left natively. */
  setFacing(dir) {
    if (dir === 0) return
    const next = dir < 0 ? -1 : 1
    if (next === this.facing) return
    this.facing = next
    // Flip the rig, never the root, so shadows and effects stay put.
    this.scene.tweens.add({
      targets: this.rig,
      scaleX: this.facing,
      duration: 110,
      ease: 'Quad.easeOut',
    })
  }

  update(delta, speed) {
    const r = this.radius
    const t = this.scene.time.now
    const moving = speed > 8
    const gait = Phaser.Math.Clamp(speed / 210, 0, 1.4)

    if (moving) {
      this.runPhase += (delta / 1000) * (9 + gait * 5)
    } else {
      this.runPhase += (delta / 1000) * 2.2
    }

    const p = this.runPhase
    const amp = moving ? 1 : 0.22
    const bob = Math.sin(p * 2) * r * 0.13 * amp
    const lean = moving ? Math.sin(p) * 0.04 + gait * 0.06 : 0

    // Body squash follows the bob: compressed at the bottom of the arc.
    const squash = 1 + Math.sin(p * 2 + Math.PI) * 0.07 * amp
    this.squash = Phaser.Math.Linear(this.squash, squash, 0.35)

    this.body.setY(bob)
    this.body.setScale(2 - this.squash, this.squash)
    this.shade.setY(r * 0.34 + bob)
    this.rim.setY(-r * 0.44 + bob * 1.1)
    this.snout.setY(r * 0.1 + bob * 1.15)
    this.snoutRim.setY(-r * 0.06 + bob * 1.15)

    // Ears lag the body — the overlap is what makes it feel alive.
    this.earL.setY(-r * 0.82 + bob * 1.5)
    this.earR.setY(-r * 0.86 + bob * 1.6)
    this.earL.rotation = Math.sin(p - 0.6) * 0.16 * amp
    this.earR.rotation = Math.sin(p - 0.9) * 0.2 * amp

    this.tail.setY(r * 0.15 + bob * 0.6)
    this.tail.rotation = Math.sin(p * 1.5) * 0.3 * amp

    // Legs alternate; when idle they settle.
    this.legs[0].setY(r * 0.78 - (moving ? Math.max(0, Math.sin(p)) * r * 0.32 : 0))
    this.legs[1].setY(r * 0.78 - (moving ? Math.max(0, Math.sin(p + Math.PI)) * r * 0.32 : 0))

    this.rig.rotation = Phaser.Math.Linear(this.rig.rotation, lean, 0.15)

    // Shadow tightens and darkens as the body rises.
    const lift = 1 - Math.abs(bob) / (r * 0.16)
    this.shadow.setScale(0.86 + lift * 0.2)
    this.shadow.setAlpha(0.22 + lift * 0.18)

    this.eyeWhite.setY(-r * 0.3 + bob * 1.15)
    this.pupil.setY(-r * 0.28 + bob * 1.15)
    this.spark.setY(-r * 0.38 + bob * 1.15)

    this.updateBlink(t)
  }

  updateBlink(t) {
    if (!this.blinking && t >= this.blinkAt) {
      this.blinking = true
      this.eyeWhite.setScale(1, 0.12)
      this.pupil.setScale(1, 0.12)
      this.spark.setAlpha(0)
      this.scene.time.delayedCall(90, () => {
        this.eyeWhite.setScale(1, 1)
        this.pupil.setScale(1, 1)
        this.spark.setAlpha(0.9)
        this.blinking = false
        this.blinkAt = t + Phaser.Math.Between(1600, 5000)
      })
    }
  }

  /** Wind-up then lunge. Reads as an attack without any skeletal animation. */
  playAttack(onConnect) {
    this.scene.tweens.chain({
      targets: this.rig,
      tweens: [
        { x: -this.radius * 0.45, scaleY: 0.9, duration: 90, ease: 'Quad.easeOut' },
        { x: this.radius * 0.7, scaleY: 1.1, duration: 70, ease: 'Back.easeOut',
          onComplete: () => onConnect?.() },
        { x: 0, scaleY: 1, duration: 180, ease: 'Quad.easeOut' },
      ],
    })
  }

  flash(color, ms = 120) {
    const parts = [this.body, this.snout, this.tail, this.earL, this.earR, ...this.legs]
    parts.forEach(p => p.setFillStyle(color))
    this.scene.time.delayedCall(ms, () => {
      this.body.setFillStyle(this.colors.body)
      this.snout.setFillStyle(this.colors.body)
      this.tail.setFillStyle(this.colors.shade)
      this.earL.setFillStyle(this.colors.shade)
      this.earR.setFillStyle(this.colors.shade)
      this.legs.forEach(l => l.setFillStyle(this.colors.shade))
    })
  }

  destroy() {
    this.root.destroy()
  }
}
