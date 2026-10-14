import Phaser from 'phaser'
import { CONNECT_MS } from '../sim/constants.js'

/**
 * One Ronke on screen.
 *
 * It stands in for RonkeSprite and answers the same calls, because the game
 * above it — fighters, the tutorial, the networked view — asks for animation by
 * name and should not care whether that name resolves to a skeleton or a strip
 * of frames. The difference is underneath: there is no rig and no runtime
 * assembly here, just six sheets cut from generated video.
 *
 * Six animations have to cover what forty-six did, so CLIP_FOR maps the old
 * vocabulary onto them rather than every call site being rewritten: a parry and
 * a block are both the guard, a punch answers anything in reach and the rice
 * answers anything at range.
 */

export const SHEETS = ['idle', 'run', 'punch', 'vomit', 'hurt', 'guard']

/** What each sheet means, and whether it holds or returns to idle. */
const LOOPS = new Set(['idle', 'run', 'guard'])

/**
 * The old clip and state names, pointed at the animation that now plays them.
 * Anything unrecognised falls back to idle, so a missing mapping is a dull
 * fighter rather than a crash.
 */
const CLIP_FOR = {
  idle: 'idle', run: 'run', dash: 'run',
  attack: 'punch', special: 'vomit', heavy: 'vomit', vomit: 'vomit',
  hit: 'hurt', stun: 'hurt', stagger: 'hurt',
  parry: 'guard', guard: 'guard', block: 'guard',
  ready: 'idle', prepare: 'idle', appear: 'idle', victory: 'idle', flourish: 'idle',
}

/** Higher wins: a clip only interrupts one of equal or lower priority. */
const PRIORITY = {
  idle: 0, run: 0, guard: 1, hurt: 2, punch: 3, vomit: 3,
}

/** Read a clip or state name of any vintage and say which sheet plays it. */
export function clipFor(name) {
  if (!name) return 'idle'
  const key = String(name).toLowerCase()
  if (CLIP_FOR[key]) return CLIP_FOR[key]
  // Ronke clip paths look like 'attack/melee/horn-gore' or 'defense/hit-by-…'.
  // Ranged attacks are the rice; everything else in reach is the fist.
  if (key.includes('attack')) return key.includes('ranged') || key.includes('cast') ? 'vomit' : 'punch'
  if (key.includes('defense') || key.includes('hit')) return 'hurt'
  if (key.includes('shield') || key.includes('block')) return 'guard'
  if (key.includes('run') || key.includes('move')) return 'run'
  return 'idle'
}

/** Register every sheet's animation once per scene. */
export function registerAnimations(scene) {
  for (const name of SHEETS) {
    const key = `ronke-${name}`
    if (scene.anims.exists(key)) continue
    const meta = scene.cache.json.get(`sprites-${name}`)
    if (!meta) continue
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(`ronke-${name}`, { start: 0, end: meta.frames - 1 }),
      frameRate: meta.fps,
      repeat: LOOPS.has(name) ? -1 : 0,
    })
  }
}

export default class RonkeSprite {
  /**
   * `build` and `cls` are accepted and ignored. Every caller still passes
   * them because every caller used to assemble a Ronke from parts; there is one
   * Ronke now and he needs neither, and swallowing them here kept the swap to a
   * change of import at ten call sites instead of a rewrite of all ten.
   */
  constructor(scene, x, y, { scale = 1 } = {}) {
    this.scene = scene
    this.facing = 1
    this.action = null
    this.locomotion = null

    this.root = scene.add.container(x, y)
    this.shadow = scene.add.ellipse(0, 4, 54, 16, 0x000000, 0.35)
    this.sprite = scene.add.sprite(0, 0, 'ronke-idle')
    // Drawn standing on the container's origin rather than centred on it, so a
    // fighter's position is its feet — which is what the simulation means by it.
    // The ground line comes from the sheets: the shared crop box has to hold
    // the rice landing well below him, so the bottom of the frame is not where
    // he stands.
    this.ground = scene.cache.json.get('sprites-idle')?.originY ?? 1
    this.sprite.setOrigin(0.5, this.ground)
    this.sprite.setScale(scale)
    this.root.add([this.shadow, this.sprite])

    registerAnimations(scene)
    this.playSheet('idle')
  }

  get x() { return this.root.x }
  get y() { return this.root.y }
  get width() { return this.sprite.displayWidth }
  get height() { return this.sprite.displayHeight }

  setPosition(x, y) {
    this.root.setPosition(x, y)
    return this
  }

  setFacing(dir) {
    if (dir === this.facing) return this
    this.facing = dir
    this.sprite.setFlipX(dir < 0)
    return this
  }

  setAlpha(a) {
    this.root.setAlpha(a)
    return this
  }

  /** Straight to a sheet, ignoring the old names. */
  playSheet(name, { speed = 1 } = {}) {
    const key = `ronke-${name}`
    if (!this.scene.anims.exists(key)) return false
    this.sprite.play(key, true)
    const meta = this.scene.cache.json.get(`sprites-${name}`)
    if (meta?.originY) this.sprite.setOrigin(0.5, meta.originY)
    if (this.sprite.anims) this.sprite.anims.timeScale = speed
    return true
  }

  /**
   * An animation by its old name. `peakAt` is honoured the way it was on the
   * Ronke rig: the clip is slowed or hurried so its most committed frame lands
   * when the game says the blow lands.
   */
  play(clip, { kind, fit, peakAt, peakFraction = 0.3, holdMs, minSpeed = 0.25 } = {}) {
    const name = clipFor(kind ?? clip)
    const rank = PRIORITY[name] ?? 0
    if (this.action && rank < (PRIORITY[this.action.name] ?? 0) && !this.actionDone()) return false

    const meta = this.scene.cache.json.get(`sprites-${name}`)
    const lengthMs = meta ? (meta.frames / meta.fps) * 1000 : 600
    let speed = 1
    if (peakAt) speed = Math.max(minSpeed, (lengthMs * peakFraction) / peakAt)
    else if (fit) speed = Math.max(minSpeed, lengthMs / fit)

    if (!this.playSheet(name, { speed })) return false
    if (!LOOPS.has(name)) {
      this.action = { name, until: this.scene.time.now + (holdMs ?? lengthMs / speed) }
      this.locomotion = null
    }
    return true
  }

  playState(state, options = {}) {
    return this.play(state, { kind: state, ...options })
  }

  actionDone() {
    if (!this.action) return true
    return this.scene.time.now >= this.action.until
  }

  /** Walking and standing are decided here; anything louder is an action. */
  update(delta, speed = 0) {
    if (this.action && this.actionDone()) {
      this.action = null
      this.locomotion = null
    }
    if (this.action) return

    const moving = speed > 12
    const want = moving ? 'run' : 'idle'
    if (want !== this.locomotion) {
      this.playSheet(want)
      this.locomotion = want
    }
    // The run cadence follows real speed, so a slowed Ronke visibly trudges.
    if (moving && this.sprite.anims) {
      this.sprite.anims.timeScale = Phaser.Math.Clamp(speed / 200, 0.55, 1.6)
    }
  }

  /**
   * Swing, and tell the caller when the blow lands.
   *
   * CONNECT_MS is the contract the simulation holds the renderer to: the punch
   * is sped up or slowed so its most committed frame falls exactly there, which
   * is what keeps what you see and what hurts you the same event.
   */
  playAttack(onConnect, clip) {
    const midSwing = this.action?.name === 'punch' && !this.actionDone()
    if (!midSwing) this.play(clip ?? 'attack', { kind: 'attack', peakAt: CONNECT_MS })
    this.scene.time.delayedCall(CONNECT_MS, () => onConnect?.())
  }

  /**
   * Afterimages along the dash direction.
   *
   * The rig version ghosted every body part separately because there were
   * twenty of them; one sheet means one ghost per step, which is both simpler
   * and cheaper.
   */
  dashTrail(dir) {
    for (let i = 0; i < 4; i++) {
      this.scene.time.delayedCall(i * 34, () => {
        if (!this.root.active) return
        const ghost = this.scene.add.image(this.root.x, this.root.y, this.sprite.texture.key, this.sprite.frame.name)
        ghost.setOrigin(0.5, 1).setFlipX(this.facing < 0).setScale(this.sprite.scaleX, this.sprite.scaleY)
          .setDepth(this.root.y - 2).setTintFill(0x7ce8ff).setAlpha(0.35)
        this.scene.tweens.add({
          targets: ghost, alpha: 0,
          x: ghost.x - dir.x * 16, y: ghost.y - dir.y * 16,
          duration: 260, onComplete: () => ghost.destroy(),
        })
      })
    }
  }

  /** Kept for the callers that sold a hit with a white flash. */
  flash(color = 0xffffff, ms = 110) {
    this.sprite.setTintFill(color)
    this.scene.time.delayedCall(ms, () => this.sprite.clearTint())
  }

  destroy() {
    this.root.destroy()
  }
}
