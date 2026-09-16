/**
 * The client's half of the wire.
 *
 * Snapshots arrive twenty times a second; the screen draws sixty. The gap is
 * covered by rendering slightly in the past — far enough back that there is
 * always a newer snapshot to interpolate toward, close enough that the delay is
 * not felt. Nothing here decides anything about the game: it sends what the
 * player wants and reads back what the room says happened.
 *
 * Deliberately free of Phaser, so it can be driven by a test as easily as by a
 * scene.
 */
import * as P from './protocol.js'

/**
 * How far behind the newest snapshot we draw. Two snapshot intervals: one to
 * interpolate across, one of slack for a late packet. Less and every hiccup
 * becomes a stutter; more and the world visibly lags the player.
 */
export const INTERP_MS = 100

/** Buffered history. Enough to ride out a short stall, not enough to drift. */
const MAX_BUFFER = 40

/** Beyond this the clock is not late, it is wrong: jump rather than crawl. */
const RESYNC_MS = 700

const lerp = (a, b, t) => a + (b - a) * t

/** Shortest way round the circle: aim must not spin the long way. */
const lerpAngle = (a, b, t) => {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export default class RoomClient {
  constructor({ url = defaultUrl(), name = 'You' } = {}) {
    this.url = url
    this.name = name
    this.socket = null
    this.you = null
    this.room = null
    this.token = null

    this.buffer = []
    this.renderTime = 0
    this.started = false
    this.acked = 0
    this.seq = 0
    this.actions = new Set()
    this.aimPoint = null
    this.lastSendAt = 0
    this.latency = 0

    this.status = 'idle'
    this.error = null
    /** Room events since the last drain: what the renderer turns into noise. */
    this.events = []
    this.handlers = { open: [], welcome: [], snapshot: [], bye: [], error: [], close: [] }
  }

  on(event, fn) {
    this.handlers[event]?.push(fn)
    return this
  }

  emit(event, arg) {
    for (const fn of this.handlers[event] ?? []) fn(arg)
  }

  /** Connect and take a seat. Resolves with the welcome, or rejects. */
  connect({ room, cls, resume = null }) {
    this.status = 'connecting'
    return new Promise((resolve, reject) => {
      let socket
      try {
        socket = new WebSocket(this.url)
      } catch (err) {
        this.status = 'failed'
        return reject(err)
      }
      this.socket = socket

      const fail = why => {
        this.status = 'failed'
        this.error = why
        reject(new Error(why))
      }

      socket.addEventListener('open', () => {
        this.status = 'joining'
        this.emit('open')
        this.send(P.hello({ room, cls, name: this.name, resume: resume ?? this.token }))
      })

      socket.addEventListener('message', e => {
        const msg = P.parse(e.data)
        if (!msg) return
        switch (msg.k) {
          case 'welcome':
            this.you = msg.you
            this.room = msg.room
            this.token = msg.token
            this.status = 'playing'
            this.accept(msg.snap)
            this.emit('welcome', msg)
            resolve(msg)
            break
          case 'snap':
            this.accept(msg.s)
            if (msg.acks?.[this.you] != null) this.acked = msg.acks[this.you]
            if (msg.ev?.length) {
              this.events.push(...msg.ev)
              this.emit('snapshot', msg)
            }
            break
          case 'pong':
            this.latency = Date.now() - msg.t
            break
          case 'bye':
            this.status = 'left'
            this.emit('bye', msg.why)
            break
          case 'error':
            this.error = msg.why
            this.emit('error', msg.why)
            if (this.status !== 'playing') fail(msg.why)
            break
        }
      })

      socket.addEventListener('close', () => {
        if (this.status === 'playing') this.status = 'dropped'
        else if (this.status !== 'left') this.status = 'failed'
        this.emit('close')
        if (this.status === 'failed') fail(this.error ?? 'closed')
      })

      socket.addEventListener('error', () => {
        // A socket error before the welcome is a failed connection; after it,
        // `close` decides, because a dropped game is resumable.
        if (this.status !== 'playing') fail('connection')
      })
    })
  }

  send(msg) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(msg))
  }

  accept(snap) {
    if (!snap) return
    // A late or duplicated snapshot must never go backwards in the buffer.
    if (this.buffer.length && snap.t <= this.buffer.at(-1).t) return
    this.buffer.push(snap)
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift()
    if (!this.started) {
      this.renderTime = snap.t - INTERP_MS
      this.started = true
    }
  }

  /** Queue an action; it goes out with the next input. */
  act(action) {
    if (P.ACTIONS.includes(action)) this.actions.add(action)
  }

  /**
   * One input per simulation step, whatever the frame rate.
   *
   * The room steps at a fixed rate, so inputs are produced at that same rate
   * and each one stands for exactly one step. That is what lets the client
   * predict its own movement by running those same inputs through the same
   * code, and replay the ones the room has not answered yet.
   *
   * Returns each input it sent, so the caller can predict with it.
   */
  pump({ move = { x: 0, y: 0 }, aim = 0, point = null } = {}, delta = P.TICK_MS) {
    if (this.status !== 'playing') return []
    // A long stall (an alt-tab, a slow load) is not a backlog of intent worth
    // replaying: catch up a little, then carry on from now.
    this.carry = Math.min((this.carry ?? 0) + delta, P.TICK_MS * 5)
    const sent = []
    while (this.carry >= P.TICK_MS) {
      this.carry -= P.TICK_MS
      const act = [...this.actions]
      this.actions.clear()
      const input = {
        seq: ++this.seq,
        move: { x: move.x, y: move.y },
        aim,
        act,
        point,
      }
      this.send(P.input({
        seq: input.seq,
        mv: [move.x, move.y],
        aim,
        act,
        pt: point ? [Math.round(point.x), Math.round(point.y)] : null,
      }))
      sent.push(input)
    }
    return sent
  }

  ping() {
    this.send(P.ping(Date.now()))
  }

  leave() {
    this.send(P.leave())
  }

  close() {
    this.status = 'left'
    try {
      this.socket?.close()
    } catch {
      // Already gone.
    }
  }

  /**
   * Advance the render clock. It runs on the local frame delta and is nudged
   * toward the newest snapshot rather than snapped to it, so a jittery
   * connection changes the speed of time by a few percent instead of teleporting
   * everything twenty times a second.
   */
  advance(delta) {
    if (!this.started || !this.buffer.length) return
    const newest = this.buffer.at(-1).t
    const target = newest - INTERP_MS
    const drift = target - this.renderTime

    // Up to a fifth faster or slower. Enough to close a gap of a snapshot or
    // two within a second — a server that drops time when it stalls leaves
    // exactly that kind of gap — and slow enough that nobody sees time bend.
    if (Math.abs(drift) > RESYNC_MS) this.renderTime = target
    else this.renderTime += delta * (1 + Math.max(-0.2, Math.min(0.2, drift / 500)))

    // Never run past the newest thing we know, or there is nothing to draw.
    if (this.renderTime > newest) this.renderTime = newest
    const oldest = this.buffer[0].t
    if (this.renderTime < oldest) this.renderTime = oldest
  }

  /** The two snapshots the render clock currently sits between. */
  bracket() {
    const t = this.renderTime
    for (let i = this.buffer.length - 1; i > 0; i--) {
      if (this.buffer[i - 1].t <= t && t <= this.buffer[i].t) {
        return [this.buffer[i - 1], this.buffer[i]]
      }
    }
    const last = this.buffer.at(-1)
    return last ? [last, last] : null
  }

  /**
   * The room as it should be drawn this frame: fighters interpolated between
   * the two snapshots around the render clock, everything else taken from the
   * newer of the two.
   */
  view() {
    const pair = this.bracket()
    if (!pair) return null
    const [a, b] = pair
    const span = b.t - a.t
    const t = span > 0 ? (this.renderTime - a.t) / span : 0

    const older = new Map(a.fighters.map(f => [f.id, f]))
    const fighters = b.fighters.map(now => {
      const was = older.get(now.id)
      if (!was) return { ...now, fresh: true }
      return {
        ...now,
        x: lerp(was.x, now.x, t),
        y: lerp(was.y, now.y, t),
        aim: lerpAngle(was.aim, now.aim, t),
        speed: lerp(was.speed, now.speed, t),
        fresh: false,
      }
    })

    const olderShots = new Map((a.shots ?? []).map(s => [s.id, s]))
    const shots = (b.shots ?? []).map(now => {
      const was = olderShots.get(now.id)
      if (!was) return now
      return { ...now, x: lerp(was.x, now.x, t), y: lerp(was.y, now.y, t) }
    })

    return {
      t: this.renderTime,
      tick: b.tick,
      fighters,
      shots,
      zones: b.zones ?? [],
      orbs: b.orbs ?? [],
      wells: b.wells ?? [],
      gates: b.gates ?? [],
      caches: b.caches ?? [],
      moon: b.moon ?? null,
      me: fighters.find(f => f.id === this.you) ?? null,
    }
  }

  /** Events since the last call, for effects and sound. */
  drainEvents() {
    const out = this.events
    this.events = []
    return out
  }
}

/** Same host as the page, upgraded: works on localhost and behind TLS alike. */
export function defaultUrl() {
  if (typeof location === 'undefined') return 'ws://127.0.0.1:8080/ws'
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}
