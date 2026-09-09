import Phaser from 'phaser'

/**
 * The seam between gameplay and however an Axie is drawn.
 *
 * Right now this is a greybox: plain shapes, procedurally animated. Later it
 * becomes layered art from `@axieinfinity/mixer`'s exportAvatarLayers (static
 * layers, no Spine runtime — see README). Gameplay code only ever calls the
 * methods below, so swapping the visuals does not touch the rest of the game.
 */
export default class AxieSprite {
  constructor(scene, x, y, { tint = 0x9aa0b5, radius = 18 } = {}) {
    this.scene = scene
    this.radius = radius
    this.baseTint = tint

    this.root = scene.add.container(x, y)

    // Body + a snout marker so facing is readable at a glance.
    this.body = scene.add.ellipse(0, 0, radius * 2, radius * 1.7, tint)
    this.snout = scene.add.ellipse(radius * 0.9, 0, radius * 0.7, radius * 0.6, tint)
    this.snout.setAlpha(0.9)
    this.eye = scene.add.circle(radius * 0.45, -radius * 0.3, radius * 0.16, 0x12121a)

    this.root.add([this.snout, this.body, this.eye])

    this.facing = 1
    this.runPhase = 0
  }

  get x() { return this.root.x }
  get y() { return this.root.y }

  setPosition(x, y) {
    this.root.setPosition(x, y)
  }

  /** dir < 0 faces left, dir > 0 faces right. The mixer art faces left natively. */
  setFacing(dir) {
    if (dir === 0 || dir === this.facing) return
    this.facing = dir < 0 ? -1 : 1
    this.root.scaleX = Math.abs(this.root.scaleX) * this.facing
  }

  /**
   * Procedural run cycle: a bob and a slight lean. Stands in for the skeletal
   * animation we are not shipping, and will drive the mixer layers unchanged.
   */
  update(delta, speed) {
    const moving = speed > 5

    if (moving) {
      this.runPhase += (delta / 1000) * 12
      const bob = Math.sin(this.runPhase) * this.radius * 0.14
      const squash = 1 + Math.sin(this.runPhase * 2) * 0.06
      this.body.setY(bob)
      this.snout.setY(bob * 1.3)
      this.eye.setY(-this.radius * 0.3 + bob * 1.3)
      this.body.setScale(1, squash)
      this.root.rotation = Phaser.Math.Linear(this.root.rotation, this.facing * 0.08, 0.2)
    } else {
      this.runPhase = 0
      const idle = Math.sin(this.scene.time.now / 400) * this.radius * 0.04
      this.body.setY(idle)
      this.snout.setY(idle)
      this.eye.setY(-this.radius * 0.3 + idle)
      this.body.setScale(1, 1)
      this.root.rotation = Phaser.Math.Linear(this.root.rotation, 0, 0.2)
    }
  }

  flash(color, ms = 120) {
    this.body.setFillStyle(color)
    this.snout.setFillStyle(color)
    this.scene.time.delayedCall(ms, () => {
      this.body.setFillStyle(this.baseTint)
      this.snout.setFillStyle(this.baseTint)
    })
  }

  destroy() {
    this.root.destroy()
  }
}
