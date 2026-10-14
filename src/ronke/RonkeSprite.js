import Phaser from 'phaser'

/**
 * One Ronke on screen.
 *
 * It stands in for AxieSprite and answers the same calls, because the game
 * above it — fighters, the tutorial, the networked view — asks for animation by
 * name and should not care whether that name resolves to a skeleton or a strip
 * of frames. The difference is underneath: there is no rig and no runtime
 * assembly here, just six sheets cut from generated video.
 *
 * Six animations have to cover what forty-six did, so CLIP_FOR maps the old
 * vocabulary onto them rather than every call site being rewritten: a parry and
 * a block are both the guard, every attack is the punch unless it is heavy.
 */

export const SHEETS = ['idle', 'run', 'punch', 'slam', 'hurt', 'guard']

/** What each sheet means, and whether it holds or returns to idle. */
const LOOPS = new Set(['idle', 'run', 'guard'])

/**
 * The old clip and state names, pointed at the animation that now plays them.
 * Anything unrecognised falls back to idle, so a missing mapping is a dull
 * fighter rather than a crash.
 */
const CLIP_FOR = {
  idle: 'idle', run: 'run', dash: 'run',
  attack: 'punch', special: 'slam', heavy: 'slam',
  hit: 'hurt', stun: 'hurt', stagger: 'hurt',
  parry: 'guard', guard: 'guard', block: 'guard',
  ready: 'idle', prepare: 'idle', appear: 'idle', victory: 'idle', flourish: 'idle',
}

/** Higher wins: a clip only interrupts one of equal or lower priority. */
const PRIORITY = {
  idle: 0, run: 0, guard: 1, hurt: 2, punch: 3, slam: 3,
}

/** Read a clip or state name of any vintage and say which sheet plays it. */
export function clipFor(name) {
  if (!name) return 'idle'
  const key = String(name).toLowerCase()
  if (CLIP_FOR[key]) return CLIP_FOR[key]
  // Axie clip paths look like 'attack/melee/horn-gore' or 'defense/hit-by-…'.
  if (key.includes('attack')) return key.includes('ranged') || key.includes('cast') ? 'slam' : 'punch'
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
    this.sprite.setOrigin(0.5, 1)
    this.sprite.setScale(scale)
    this.root.add([this.shadow, this.sprite])

    registerAnimations(scene)
    this.playSheet('idle')
  }

  get x() { return this.root.x }
  get y() { return this.root.y }

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
    if (this.sprite.anims) this.sprite.anims.timeScale = speed
    return true
  }

  /**
   * An animation by its old name. `peakAt` is honoured the way it was on the
   * Axie rig: the clip is slowed or hurried so its most committed frame lands
   * when the game says the blow lands.
   */
  play(clip, { kind, fit, peakAt, peakFraction = 0.4, holdMs, minSpeed = 0.25 } = {}) {
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

  /** Kept for the callers that sold a hit with a white flash. */
  flash(color = 0xffffff, ms = 110) {
    this.sprite.setTintFill(color)
    this.scene.time.delayedCall(ms, () => this.sprite.clearTint())
  }

  destroy() {
    this.root.destroy()
  }
}
