/**
 * Poses an Axie from the mixer's own animation data.
 *
 * The mixer embeds all 46 authored clips (horn-gore, tail-smash, cast-fly,
 * run, idle, hit reactions…) in every skeleton it builds, already resolved for
 * that Axie's parts. This module reads those clips and computes where each body
 * part belongs on each frame, so the flat layers we already draw move the way
 * Origins animates them.
 *
 * It is our own code interpreting animation data. It is not, and does not
 * include, Esoteric Software's Spine runtime — which Vibeathon Official Rules
 * section 5 says would need a separate licence. It deliberately supports only
 * what these skeletons use, measured across all 46 clips: region attachments,
 * rotate / translate / scale bone timelines with linear, stepped or bezier
 * curves, slot attachment swaps, the "normal", "noScale" and
 * "noRotationOrReflection" transform modes, and single-bone IK.
 *
 * No Phaser dependency, so it can be verified in Node against the mixer.
 */

const DEG = Math.PI / 180

export default class AxieRig {
  /**
   * `allowMirror: false` keeps the Axie facing the way it was facing.
   *
   * Three tail clips (tail-multi-slap, tail-thrash, tail-smash) scale
   * @pivot-back to -1 so the Axie turns round in place to strike with its tail.
   * In a game where you aim, that reads as the sprite snapping to face away.
   *
   * Simply ignoring the negative scale does not work: the clips position the
   * body relative to that mirror, so dropping it slid the body ~430 units
   * sideways mid-swing. Instead the authored pose is solved as-is, and any frame
   * where the body comes out mirrored is reflected back around the body's own
   * resting centre — same motion, same spot, original facing.
   */
  constructor(skeleton, { allowMirror = true } = {}) {
    this.data = skeleton
    this.allowMirror = allowMirror
    this.animations = skeleton.animations ?? {}

    this.bones = skeleton.bones.map(b => ({
      data: b,
      name: b.name,
      parent: null,
      mode: b.transform ?? 'normal',
      x: b.x ?? 0, y: b.y ?? 0, rotation: b.rotation ?? 0,
      scaleX: b.scaleX ?? 1, scaleY: b.scaleY ?? 1,
      a: 1, b: 0, c: 0, d: 1, worldX: 0, worldY: 0,
    }))
    const byName = new Map(this.bones.map(b => [b.name, b]))
    for (const b of this.bones) b.parent = b.data.parent ? byName.get(b.data.parent) : null
    this.boneByName = byName

    this.slots = skeleton.slots.map(s => ({
      name: s.name,
      bone: byName.get(s.bone),
      setupAttachment: s.attachment ?? null,
      attachment: s.attachment ?? null,
    }))
    this.slotByName = new Map(this.slots.map(s => [s.name, s]))

    this.ik = (skeleton.ik ?? [])
      .map(k => ({ bone: byName.get(k.bones[0]), target: byName.get(k.target), mix: k.mix ?? 1, order: k.order ?? 0, bend: k.bendPositive === false ? -1 : 1 }))
      .filter(k => k.bone && k.target)
      .sort((p, q) => p.order - q.order)

    this.skin = skeleton.skins[0].attachments

    this.track = null
    this.time = 0
    this.durations = {}

    this.pose()
    this.mirrorAxisX = this.rawParts().find(p => p.slot === 'body')?.x ?? 0
  }

  has(name) {
    return Boolean(this.animations[name])
  }

  duration(name) {
    if (this.durations[name] != null) return this.durations[name]
    let max = 0
    const walk = o => {
      if (Array.isArray(o)) o.forEach(k => { if (k && typeof k === 'object') max = Math.max(max, k.time ?? 0) })
      else if (o && typeof o === 'object') Object.values(o).forEach(walk)
    }
    walk(this.animations[name])
    return (this.durations[name] = max)
  }

  /** Start a clip. Non-looping clips hold their last frame until replaced. */
  play(name, { loop = false, speed = 1 } = {}) {
    if (!this.has(name)) return false
    this.track = { name, loop, speed, clip: this.animations[name], length: this.duration(name) }
    this.time = 0
    return true
  }

  get playing() {
    return this.track?.name ?? null
  }

  /** True once a non-looping clip has run its full length. */
  get finished() {
    return Boolean(this.track && !this.track.loop && this.time >= this.track.length)
  }

  update(seconds) {
    if (this.track) {
      this.time += seconds * this.track.speed
      if (this.track.loop && this.track.length > 0) this.time %= this.track.length
    }
    this.pose()
  }

  /** Reset to setup, apply the current clip, then solve the world transforms. */
  pose() {
    for (const b of this.bones) {
      b.x = b.data.x ?? 0
      b.y = b.data.y ?? 0
      b.rotation = b.data.rotation ?? 0
      b.scaleX = b.data.scaleX ?? 1
      b.scaleY = b.data.scaleY ?? 1
    }
    for (const s of this.slots) s.attachment = s.setupAttachment

    if (this.track) applyClip(this, this.track.clip, Math.min(this.time, this.track.length || 0))

    for (const b of this.bones) updateWorld(b)
    for (const k of this.ik) applyIk(this, k)
  }

  /**
   * World placement of every visible attachment, in skeleton units with Y
   * pointing down (screen space). Rotation is in radians.
   *
   * `height` is signed: negative means the part is mirrored and must be drawn
   * flipped. Decomposing with unsigned lengths turned every mirrored part into
   * a ~180 degree rotation, drawing it upside down.
   */
  parts() {
    const out = this.rawParts()
    if (this.allowMirror) return out

    const body = this.slotByName.get('body')?.bone
    const mirrored = body && body.a * body.d - body.b * body.c < 0
    if (!mirrored) return out

    // Reflect the whole picture about the resting body centre. For a part drawn
    // as R(theta) * S(w, h), reflecting it gives R(-theta) * S(-w, h).
    const axis = this.mirrorAxisX
    for (const p of out) {
      p.x = 2 * axis - p.x
      p.rotation = -p.rotation
      p.width = -p.width
    }
    return out
  }

  rawParts() {
    const out = []
    for (const slot of this.slots) {
      const name = slot.attachment
      if (!name) continue
      const att = this.skin[slot.name]?.[name]
      if (!att || att.type === 'clipping') continue
      const b = slot.bone
      const ax = att.x ?? 0
      const ay = att.y ?? 0
      const wx = b.worldX + b.a * ax + b.b * ay
      const wy = b.worldY + b.c * ax + b.d * ay

      // Full 2x2 transform of the image: bone world x attachment local.
      const ar = (att.rotation ?? 0) * DEG
      const asx = att.scaleX ?? 1
      const asy = att.scaleY ?? 1
      const la = Math.cos(ar) * asx, lb = -Math.sin(ar) * asy
      const lc = Math.sin(ar) * asx, ld = Math.cos(ar) * asy
      const wa = b.a * la + b.b * lc, wb = b.a * lb + b.b * ld
      const wc = b.c * la + b.d * lc, wd = b.c * lb + b.d * ld

      // Into screen space (Y down), then rotation + signed scale.
      const pa = wa, pb = -wb, pc = -wc, pd = wd
      const sx = Math.hypot(pa, pc)
      const sy = sx > 1e-9 ? (pa * pd - pb * pc) / sx : 0

      out.push({
        slot: slot.name,
        attachment: name,
        path: att.path ?? name,
        x: wx,
        y: -wy,
        rotation: Math.atan2(pc, pa),
        width: (att.width ?? 0) * sx,
        height: (att.height ?? 0) * sy,
      })
    }
    return out
  }
}

/* ------------------------------------------------------------------------ */

function updateWorld(bone) {
  const r = bone.rotation * DEG
  const p = bone.parent

  if (!p) {
    const ry = (bone.rotation + 90) * DEG
    bone.a = Math.cos(r) * bone.scaleX
    bone.b = Math.cos(ry) * bone.scaleY
    bone.c = Math.sin(r) * bone.scaleX
    bone.d = Math.sin(ry) * bone.scaleY
    bone.worldX = bone.x
    bone.worldY = bone.y
    return
  }

  let pa = p.a, pb = p.b, pc = p.c, pd = p.d
  bone.worldX = pa * bone.x + pb * bone.y + p.worldX
  bone.worldY = pc * bone.x + pd * bone.y + p.worldY

  switch (bone.mode) {
    case 'noRotationOrReflection': {
      let s = pa * pa + pc * pc
      let prx
      if (s > 0.0001) {
        s = Math.abs(pa * pd - pb * pc) / s
        pb = pc * s
        pd = pa * s
        prx = Math.atan2(pc, pa) / DEG
      } else {
        pa = 0
        pc = 0
        prx = 90 - Math.atan2(pd, pb) / DEG
      }
      const rx = (bone.rotation - prx) * DEG
      const ry = (bone.rotation - prx + 90) * DEG
      const la = Math.cos(rx) * bone.scaleX
      const lb = Math.cos(ry) * bone.scaleY
      const lc = Math.sin(rx) * bone.scaleX
      const ld = Math.sin(ry) * bone.scaleY
      bone.a = pa * la - pb * lc
      bone.b = pa * lb - pb * ld
      bone.c = pc * la + pd * lc
      bone.d = pc * lb + pd * ld
      return
    }
    case 'noScale':
    case 'noScaleOrReflection': {
      const cos = Math.cos(r)
      const sin = Math.sin(r)
      let za = pa * cos + pb * sin
      let zc = pc * cos + pd * sin
      let s = Math.hypot(za, zc)
      if (s > 0.00001) s = 1 / s
      za *= s
      zc *= s
      s = Math.hypot(za, zc)
      if (bone.mode === 'noScale' && (pa * pd - pb * pc < 0)) s = -s
      const rr = Math.PI / 2 + Math.atan2(zc, za)
      const zb = Math.cos(rr) * s
      const zd = Math.sin(rr) * s
      bone.a = za * bone.scaleX
      bone.b = zb * bone.scaleY
      bone.c = zc * bone.scaleX
      bone.d = zd * bone.scaleY
      return
    }
    default: {
      const ry = (bone.rotation + 90) * DEG
      const la = Math.cos(r) * bone.scaleX
      const lb = Math.cos(ry) * bone.scaleY
      const lc = Math.sin(r) * bone.scaleX
      const ld = Math.sin(ry) * bone.scaleY
      bone.a = pa * la + pb * lc
      bone.b = pa * lb + pb * ld
      bone.c = pc * la + pd * lc
      bone.d = pc * lb + pd * ld
    }
  }
}

/** Recompute a bone and everything under it, after IK changed its rotation. */
function updateBranch(rig, root) {
  updateWorld(root)
  for (const b of rig.bones) {
    let p = b.parent
    while (p && p !== root) p = p.parent
    if (p === root) updateWorld(b)
  }
}

/** Single-bone IK: rotate the bone so it points at its target. */
function applyIk(rig, k) {
  const bone = k.bone
  const p = bone.parent
  if (!p) return
  const det = p.a * p.d - p.b * p.c
  if (Math.abs(det) < 1e-9) return
  const tx = k.target.worldX - p.worldX
  const ty = k.target.worldY - p.worldY
  // Target in the parent's local space, relative to this bone's origin.
  const lx = (tx * p.d - ty * p.b) / det - bone.x
  const ly = (ty * p.a - tx * p.c) / det - bone.y
  let delta = Math.atan2(ly, lx) / DEG - bone.rotation
  if (bone.scaleX < 0) delta += 180
  delta = wrap180(delta)
  bone.rotation += delta * k.mix
  updateBranch(rig, bone)
}

function applyClip(rig, clip, t) {
  for (const [boneName, timelines] of Object.entries(clip.bones ?? {})) {
    const bone = rig.boneByName.get(boneName)
    if (!bone) continue

    if (timelines.rotate) {
      const v = sample(timelines.rotate, t, key => [key.angle ?? 0], true)
      if (v) bone.rotation = (bone.data.rotation ?? 0) + v[0]
    }
    if (timelines.translate) {
      const v = sample(timelines.translate, t, key => [key.x ?? 0, key.y ?? 0])
      if (v) {
        bone.x = (bone.data.x ?? 0) + v[0]
        bone.y = (bone.data.y ?? 0) + v[1]
      }
    }
    if (timelines.scale) {
      const v = sample(timelines.scale, t, key => [key.x ?? 1, key.y ?? 1])
      if (v) {
        bone.scaleX = (bone.data.scaleX ?? 1) * v[0]
        bone.scaleY = (bone.data.scaleY ?? 1) * v[1]
      }
    }
  }

  for (const [slotName, timelines] of Object.entries(clip.slots ?? {})) {
    const slot = rig.slotByName.get(slotName)
    const keys = timelines.attachment
    if (!slot || !keys?.length) continue
    let chosen = null
    for (const key of keys) {
      if ((key.time ?? 0) <= t) chosen = key
      else break
    }
    if (chosen) slot.attachment = chosen.name ?? null
  }
}

/**
 * Value of a keyframe timeline at time t. `rotate` interpolates along the
 * shortest arc, as Spine does.
 */
function sample(keys, t, read, rotate = false) {
  if (!keys.length) return null
  if (t <= (keys[0].time ?? 0)) return read(keys[0])
  const last = keys[keys.length - 1]
  if (t >= (last.time ?? 0)) return read(last)

  let i = 0
  while (i < keys.length - 1 && (keys[i + 1].time ?? 0) <= t) i++
  const from = keys[i]
  const to = keys[i + 1]
  const t0 = from.time ?? 0
  const t1 = to.time ?? 0
  const raw = t1 > t0 ? (t - t0) / (t1 - t0) : 0
  const pct = ease(from, raw)

  const a = read(from)
  const b = read(to)
  return a.map((va, n) => {
    let diff = b[n] - va
    if (rotate) diff = wrap180(diff)
    return va + diff * pct
  })
}

/** Spine 3.8 key easing: linear, "stepped", or a cubic bezier (curve, c2, c3, c4). */
function ease(key, x) {
  if (key.curve === 'stepped') return 0
  if (typeof key.curve !== 'number') return x

  const cx1 = key.curve
  const cy1 = key.c2 ?? 0
  const cx2 = key.c3 ?? 1
  const cy2 = key.c4 ?? 1

  // Find the bezier parameter whose x matches, then return its y.
  let lo = 0
  let hi = 1
  let u = x
  for (let n = 0; n < 20; n++) {
    u = (lo + hi) / 2
    const bx = bezier(u, cx1, cx2)
    if (bx < x) lo = u
    else hi = u
  }
  return bezier(u, cy1, cy2)
}

function bezier(u, p1, p2) {
  const inv = 1 - u
  return 3 * inv * inv * u * p1 + 3 * inv * u * u * p2 + u * u * u
}

function wrap180(deg) {
  return deg - Math.round(deg / 360) * 360
}
