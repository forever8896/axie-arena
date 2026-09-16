/**
 * The maths the simulation needs, without Phaser.
 *
 * The game logic used Phaser's helpers throughout, which tied it to a browser
 * and to a renderer. These are the same functions with the same behaviour, so
 * the simulation can run on a server, in a test, or in the page.
 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const degToRad = d => (d * Math.PI) / 180
export const distance = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1)
export const distanceSq = (x1, y1, x2, y2) => (x2 - x1) ** 2 + (y2 - y1) ** 2

/** Signed angle difference in (-pi, pi]. */
export function wrapAngle(a) {
  let x = (a + Math.PI) % (Math.PI * 2)
  if (x < 0) x += Math.PI * 2
  return x - Math.PI
}

export function angleBetween(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1)
}

/** A tiny mutable 2D vector, the handful of operations the game uses. */
export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  set(x, y) {
    this.x = x
    this.y = y
    return this
  }

  copy(v) {
    return this.set(v.x, v.y)
  }

  clone() {
    return new Vec2(this.x, this.y)
  }

  add(v) {
    this.x += v.x
    this.y += v.y
    return this
  }

  scale(k) {
    this.x *= k
    this.y *= k
    return this
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y
  }

  length() {
    return Math.hypot(this.x, this.y)
  }

  normalize() {
    const len = this.length()
    if (len > 0) {
      this.x /= len
      this.y /= len
    }
    return this
  }

  lerpTo(v, t) {
    this.x = lerp(this.x, v.x, t)
    this.y = lerp(this.y, v.y, t)
    return this
  }
}

/**
 * Seeded randomness. The server owns every roll, and a seed makes a match
 * replayable: the same seed and the same inputs give the same fight.
 */
export class Rng {
  constructor(seed = Date.now()) {
    this.state = (seed >>> 0) || 1
  }

  /** mulberry32: small, fast, good enough for gameplay. */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  float(min, max) {
    return min + this.next() * (max - min)
  }

  int(min, max) {
    return Math.floor(this.float(min, max + 1))
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)]
  }

  shuffle(list) {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  chance(p) {
    return this.next() < p
  }
}
