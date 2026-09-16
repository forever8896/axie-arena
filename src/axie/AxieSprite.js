import Phaser from 'phaser'
import AxieRig from './AxieRig.js'
import { CLASS_COLORS } from './palette.js'

/**
 * The seam between gameplay and how an Axie is drawn.
 *
 * Draws official Axie art, posed every frame by AxieRig from the mixer's own
 * authored clips — so a beast gores, a reptile spins its tail round, a bird
 * hops up to cast, and faces change mid-attack. No Spine runtime ships.
 *
 * The mixer's art faces LEFT natively, so facing right flips the rig.
 */

/** When a basic's blow lands, in ms. Gameplay was balanced against this. */
// Re-exported from the simulation, which owns the timing the server resolves
// hits on; the clip below is squeezed so its impact frame lands there.
export { CONNECT_MS } from '../sim/constants.js'
import { CONNECT_MS } from '../sim/constants.js'

/** Shared state clips. Chosen by rendering all 46 and keeping the 38 with motion. */
const STATE_CLIPS = {
  idle: 'action/idle/normal',
  run: 'action/run',
  // The three hit-by-normal clips are empty in mixed skeletons; this one is not.
  hit: 'defense/hit-by-ranged-attack',
  dash: 'action/move-forward',
  stun: 'battle/get-debuff',
  ready: 'battle/get-buff',
  prepare: 'activity/prepare',
  appear: 'activity/appear',
  victory: 'activity/victory-pose-back-flip',
}

const IDLE_FLOURISH = [
  'action/idle/random-01', 'action/idle/random-02', 'action/idle/random-03',
  'action/idle/random-04', 'action/idle/random-05',
]

/** Higher wins. A clip only interrupts one of equal or lower priority. */
// A stagger (being parried) cuts off your own attack clip; a parry stance
// outranks walking and getting hit.
const PRIORITY = { locomotion: 0, flourish: 0, ready: 1, hit: 1, stun: 2, dash: 2, prepare: 2, appear: 2, parry: 2, attack: 3, special: 3, stagger: 3, victory: 4 }

export default class AxieSprite {
  constructor(scene, x, y, { build, axieClass = 'beast' } = {}) {
    this.scene = scene
    this.axieClass = axieClass
    this.colors = CLASS_COLORS[axieClass] ?? CLASS_COLORS.beast
    this.build = build
    this.S = build.scale

    this.root = scene.add.container(x, y)

    const b = build.bounds
    this.width = b.width * this.S
    this.height = b.height * this.S

    // Shadow and glow sit outside the rig so they stay planted on the ground.
    this.shadow = scene.add.ellipse(0, 0, this.width * 0.66, this.width * 0.2, 0x000000, 0.4)
    this.glow = scene.add.ellipse(0, 0, this.width * 1.5, this.width * 0.5, this.colors.body, 0.12)

    this.facingWrap = scene.add.container(0, 0)
    this.root.add([this.glow, this.shadow, this.facingWrap])

    // Tail clips mirror the body to turn it away mid-swing; in an aimed game
    // that reads as the sprite flipping for no reason. See AxieRig.
    this.rig = new AxieRig(build.skeleton, { allowMirror: false })

    // One image per slot, created in slot order so draw order matches the rig.
    this.images = []
    this.slotImages = new Map()
    for (const slot of this.rig.slots) {
      if (slot.name === 'shadow' || slot.name === 'ball') continue
      const img = scene.add.image(0, 0, '__DEFAULT').setVisible(false)
      img.slotName = slot.name
      this.facingWrap.add(img)
      this.images.push(img)
      this.slotImages.set(slot.name, img)
    }

    this.facing = -1
    this.action = null
    this.idleSince = scene.time.now
    this.nextFlourish = scene.time.now + Phaser.Math.Between(3500, 7000)

    this.rig.play(STATE_CLIPS.idle, { loop: true })
    this.locomotion = 'idle'
    this.draw()
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

  setAlpha(a) {
    this.facingWrap.setAlpha(a)
  }

  /**
   * Play a clip that takes over from walking and idling.
   *
   * `fit` time-scales the clip to last that many ms. `peakAt` instead scales it
   * so the moment `peakFraction` of the way through lands at `peakAt` ms —
   * which is how an attack's visual impact is lined up with gameplay.
   */
  play(clip, { kind = 'attack', loop = false, fit, peakAt, peakFraction = 0.4, holdMs } = {}) {
    if (!clip || !this.rig.has(clip)) return false

    const priority = PRIORITY[kind] ?? 1
    if (this.action && !this.actionDone() && priority < this.action.priority) return false

    const length = this.rig.duration(clip)
    let speed = 1
    if (fit && length > 0) speed = length / (fit / 1000)
    else if (peakAt && length > 0) speed = Math.max(1, (length * peakFraction) / (peakAt / 1000))

    this.rig.play(clip, { loop, speed })
    this.action = {
      clip, kind, priority, loop,
      until: holdMs ? this.scene.time.now + holdMs : null,
    }
    return true
  }

  actionDone() {
    if (!this.action) return true
    if (this.action.until != null) return this.scene.time.now >= this.action.until
    return this.rig.playing !== this.action.clip || this.rig.finished
  }

  playState(state, options) {
    return this.play(STATE_CLIPS[state], { kind: state, ...options })
  }

  update(delta, speed = 0) {
    const now = this.scene.time.now

    if (this.action && this.actionDone()) {
      this.action = null
      this.locomotion = null
    }

    if (!this.action) {
      const moving = speed > 12
      const want = moving ? 'run' : 'idle'
      if (want !== this.locomotion) {
        this.rig.play(STATE_CLIPS[want], { loop: true })
        this.locomotion = want
        this.idleSince = now
      }
      // Run cadence follows actual speed, so a slowed Axie visibly trudges.
      if (moving && this.rig.track) this.rig.track.speed = Phaser.Math.Clamp(speed / 200, 0.55, 1.6)

      // Standing around long enough earns one of the authored idle flourishes.
      if (!moving && now >= this.nextFlourish && now - this.idleSince > 2500) {
        this.play(Phaser.Utils.Array.GetRandom(IDLE_FLOURISH), { kind: 'flourish' })
        this.nextFlourish = now + Phaser.Math.Between(5000, 9000)
      }
    }

    this.rig.update(delta / 1000)
    this.draw()

    // Shadow tightens as the body lifts off the ground in a leap.
    const root = this.rig.boneByName.get('@pivot-main')
    const lift = root ? Phaser.Math.Clamp(-root.y * this.S / 30, 0, 1) : 0
    this.shadow.setScale(1 - lift * 0.35).setAlpha(0.4 - lift * 0.2)
  }

  /** Pose every slot's image from the rig. */
  draw() {
    const S = this.S
    const b = this.build.bounds
    const seen = new Set()

    for (const p of this.rig.parts()) {
      const img = this.slotImages.get(p.slot)
      if (!img) continue
      const key = this.build.textures[`${p.slot}/${p.attachment}`]
      if (!key || !this.scene.textures.exists(key) || Math.abs(p.width) < 1) continue

      if (img.texture.key !== key) img.setTexture(key)
      img
        .setPosition((p.x - b.cx) * S, (p.y - b.bottom) * S)
        .setRotation(p.rotation)
        .setDisplaySize(Math.abs(p.width) * S, Math.abs(p.height) * S)
        // Signed sizes mean a mirrored part: flip it rather than rotate it.
        .setFlip(p.width < 0, p.height < 0)
        .setVisible(true)
      seen.add(p.slot)
    }

    for (const img of this.images) if (!seen.has(img.slotName)) img.setVisible(false)
  }

  /**
   * A basic attack. The clip is sped up so its impact lands at CONNECT_MS,
   * the timing the combat was balanced on, then `onConnect` fires.
   */
  playAttack(onConnect, clip) {
    const attackClip = clip ?? 'attack/melee/normal-attack'
    // A multi-hit basic calls this again mid-swing; let the clip carry on.
    const midSwing = this.action?.clip === attackClip && !this.actionDone() &&
      this.rig.time < this.rig.duration(attackClip) * 0.6
    if (!midSwing) this.play(attackClip, { kind: 'attack', peakAt: CONNECT_MS })

    this.scene.time.delayedCall(CONNECT_MS, () => onConnect?.())
  }

  /** Afterimages of the current pose along the dash direction. */
  dashTrail(dir) {
    const scene = this.scene
    for (let i = 0; i < 4; i++) {
      scene.time.delayedCall(i * 34, () => {
        if (!this.root.active) return
        const ghost = scene.add.container(this.root.x, this.root.y).setDepth(this.root.y - 2)
        for (const img of this.images) {
          if (!img.visible) continue
          ghost.add(
            // Bake the facing flip into position, scale and rotation, since the
            // ghost is not inside the flipped container.
            scene.add.image(img.x * this.facingWrap.scaleX, img.y, img.texture.key)
              .setScale(img.scaleX * this.facingWrap.scaleX, img.scaleY)
              .setFlip(img.flipX, img.flipY)
              .setRotation(img.rotation * this.facingWrap.scaleX)
              .setTintFill(this.colors.rim)
              .setAlpha(0.4),
          )
        }
        scene.tweens.add({
          targets: ghost, alpha: 0,
          x: ghost.x - dir.x * 16, y: ghost.y - dir.y * 16,
          duration: 260, onComplete: () => ghost.destroy(),
        })
      })
    }
  }

  flash(color, ms = 110) {
    this.images.forEach(i => i.setTintFill(color))
    this.scene.time.delayedCall(ms, () => this.images.forEach(i => i.clearTint()))
  }

  destroy() {
    this.root.destroy()
  }
}
