/**
 * The room authority: the server's half of the game.
 *
 * It owns a live SimRoom per room in the lobby and steps them all on one fixed
 * clock, whether or not anybody is connected — which is the whole promise of
 * the Endless Wilds. A client that joins is dropped into a room that has been
 * running for hours, with hunters already in it carrying what they have earned.
 *
 * Deliberately transport-agnostic: it knows about clients that can `send` an
 * object, and nothing about sockets. That is what lets the same authority run
 * behind a WebSocket, inside a test, or in the page itself.
 */
import SimRoom from '../sim/room.js'
import SimBrain from '../sim/bots.js'
import { ROOMS, WILDS } from '../wilds/config.js'
import * as P from './protocol.js'

/** Never run more than this many steps in one wake-up. */
const MAX_CATCHUP = 8

let nextClientId = 0

export class Client {
  constructor(send, { name = 'You' } = {}) {
    this.id = `c${++nextClientId}`
    this.send = send
    this.name = name
    this.roomId = null
    this.fighterId = null
    this.token = null
    this.seq = 0
    this.pending = { move: { x: 0, y: 0 }, aim: 0, act: new Set(), point: null }
    this.lastInputAt = 0
    this.closed = false
  }
}

export default class RoomHost {
  constructor({ rooms = ROOMS, clock = () => Date.now(), seed = Date.now() } = {}) {
    this.defs = rooms
    this.clock = clock
    this.seed = seed
    this.live = new Map()
    this.clients = new Map()
    this.timer = null
    this.lastAt = null
    this.carry = 0
    this.steps = 0
  }

  // --- Rooms --------------------------------------------------------------

  /** The room, opened and populated on first use. */
  open(roomId) {
    if (this.live.has(roomId)) return this.live.get(roomId)
    const def = this.defs.find(r => r.id === roomId)
    if (!def) return null

    const sim = new SimRoom({ mode: 'wilds', room: def, seed: this.seed + roomId.length * 7919 })
    sim.openWilds({})
    const live = { def, sim, clients: new Set(), events: [], acks: {}, sinceSnapshot: 0 }
    this.live.set(roomId, live)
    return live
  }

  /** What the lobby shows: who is in each room, and what the best of them carries. */
  roomList() {
    return this.defs.map(def => {
      const live = this.live.get(def.id)
      const sim = live?.sim
      const alive = sim ? sim.fighters.filter(f => f.alive) : []
      return {
        id: def.id,
        name: def.name,
        stake: def.stake,
        currency: def.currency,
        free: Boolean(def.free),
        blurb: def.blurb,
        hunters: alive.length,
        players: live ? live.clients.size : 0,
        topBounty: alive.reduce((m, f) => Math.max(m, f.wilds?.bounty ?? 0), 0),
        open: alive.length < WILDS.maxHunters,
      }
    })
  }

  // --- Clients ------------------------------------------------------------

  add(client) {
    this.clients.set(client.id, client)
    return client
  }

  /**
   * A player takes a seat. If the room is full it is full of stand-ins, so one
   * of them leaves to make room: a person waiting behind a bot would be absurd.
   * The bot forfeits rather than evaporating, so what it carried stays in the
   * room as a cache and the ledger still balances.
   */
  join(client, msg) {
    if (msg?.v !== P.PROTOCOL_VERSION) {
      client.send(P.oops('version'))
      return null
    }
    const live = this.open(msg.room)
    if (!live) {
      client.send(P.oops('no-such-room'))
      return null
    }

    // Coming back to an Axie still standing where the connection dropped.
    if (msg.resume) {
      const back = this.resume(client, live, msg.resume)
      if (back) return back
    }

    const alive = live.sim.fighters.filter(f => f.alive)
    if (alive.length >= WILDS.maxHunters) {
      const stand = alive
        .filter(f => f.brain && !f.channel)
        .sort((a, b) => (a.wilds?.bounty ?? 0) - (b.wilds?.bounty ?? 0))[0]
      if (!stand) {
        client.send(P.oops('room-full'))
        return null
      }
      live.sim.forfeit(stand)
    }

    const f = live.sim.joinPlayer({ axieClass: msg.cls, name: client.name })
    client.roomId = live.def.id
    client.fighterId = f.id
    client.token = `${f.id}.${Math.random().toString(36).slice(2, 10)}`
    live.clients.add(client)
    live.abandoned?.delete(f.id)

    client.send(P.welcome({
      you: f.id,
      token: client.token,
      room: { id: live.def.id, name: live.def.name, stake: live.def.stake, currency: live.def.currency, free: Boolean(live.def.free) },
      snap: live.sim.snapshot(),
    }))
    return f
  }

  /** Reattach to the Axie a dropped client left behind, if it is still up. */
  resume(client, live, token) {
    const held = (live.abandoned ??= new Map())
    for (const [fighterId, entry] of held) {
      if (entry.token !== token) continue
      const f = live.sim.fighters.find(x => x.id === fighterId && x.alive)
      held.delete(fighterId)
      if (!f) return null
      // It was defending itself while nobody was driving; hand it back.
      f.brain = null
      client.roomId = live.def.id
      client.fighterId = f.id
      client.token = token
      live.clients.add(client)
      client.send(P.welcome({
        you: f.id,
        token,
        room: { id: live.def.id, name: live.def.name, stake: live.def.stake, currency: live.def.currency, free: Boolean(live.def.free) },
        snap: live.sim.snapshot(),
      }))
      return f
    }
    return null
  }

  input(client, msg) {
    const read = P.readInput(msg)
    if (!read || !client.roomId) return
    // Out-of-order arrivals are stale by definition: keep the newest.
    if (read.seq < client.seq) return
    client.seq = read.seq
    client.lastInputAt = this.clock()
    client.pending.move = read.move
    client.pending.aim = read.aim
    client.pending.point = read.point ?? client.pending.point
    for (const a of read.act) client.pending.act.add(a)
  }

  /**
   * A player who leaves on purpose forfeits: whatever they were carrying falls
   * where they stood. Leaving by the door is what a Moon Gate is for.
   */
  leave(client, why = 'left') {
    const live = client.roomId ? this.live.get(client.roomId) : null
    if (live) {
      live.clients.delete(client)
      const f = live.sim.fighters.find(x => x.id === client.fighterId)
      if (f?.alive) live.sim.forfeit(f)
    }
    client.roomId = null
    client.fighterId = null
    if (!client.closed) client.send(P.bye(why))
  }

  /**
   * The connection died. The Axie stays standing and defends itself for a few
   * seconds, so closing the tab is not an escape from a fight you are losing,
   * and so a flaky connection is survivable.
   */
  drop(client) {
    client.closed = true
    this.clients.delete(client.id)
    const live = client.roomId ? this.live.get(client.roomId) : null
    if (!live) return
    live.clients.delete(client)
    const f = live.sim.fighters.find(x => x.id === client.fighterId)
    if (f?.alive) {
      f.brain = new SimBrain(f)
      f.intent.set(0, 0)
      const held = (live.abandoned ??= new Map())
      held.set(f.id, { token: client.token, at: live.sim.now })
    }
    client.roomId = null
  }

  // --- The clock ----------------------------------------------------------

  start() {
    if (this.timer) return this
    // Every room opens with the process, not with its first visitor. The lobby
    // promises rooms that are already running, and a room that only starts when
    // somebody knocks would make that a lie: the first player through the door
    // would arrive at an empty field with no history in it.
    for (const def of this.defs) this.open(def.id)
    this.lastAt = this.clock()
    // Woken more often than the step, so the accumulator stays small and the
    // room never has to catch up in a visible lurch.
    this.timer = setInterval(() => this.pump(), 8)
    this.timer.unref?.()
    return this
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    return this
  }

  /** Real time in, fixed steps out. */
  pump() {
    const now = this.clock()
    this.carry += now - this.lastAt
    this.lastAt = now
    let budget = MAX_CATCHUP
    while (this.carry >= P.TICK_MS && budget-- > 0) {
      this.carry -= P.TICK_MS
      this.step()
    }
    // Far behind (a stalled process, a laptop lid): drop the debt rather than
    // running hundreds of steps and freezing everyone to catch up.
    if (this.carry > P.TICK_MS * MAX_CATCHUP) this.carry = 0
  }

  step() {
    this.steps++
    for (const client of this.clients.values()) {
      if (!client.roomId) continue
      const live = this.live.get(client.roomId)
      const f = live?.sim.fighters.find(x => x.id === client.fighterId)
      if (!f) continue
      const p = client.pending
      // A client that has gone quiet (a hidden tab, a stalled connection) stops
      // moving rather than holding its last direction into a wall forever.
      const fresh = this.clock() - client.lastInputAt < P.INPUT_STALE_MS
      live.sim.applyInput(f, {
        move: fresh ? p.move : { x: 0, y: 0 },
        aim: p.aim,
        attack: p.act.has('attack'),
        special: p.act.has('special'),
        dash: p.act.has('dash'),
        parry: p.act.has('parry'),
        point: p.point,
      })
      p.act.clear()
      live.acks[f.id] = client.seq
    }

    for (const live of this.live.values()) {
      live.sim.step(P.TICK_MS)
      const events = live.sim.drainEvents()
      // Nobody watching: the room still runs, but its effects need no audience.
      if (live.clients.size) live.events.push(...events)
      this.reapAbandoned(live)

      if (++live.sinceSnapshot >= P.SNAPSHOT_EVERY) {
        live.sinceSnapshot = 0
        this.broadcast(live)
      }
    }
  }

  /** A dropped player who never came back forfeits what they were carrying. */
  reapAbandoned(live) {
    if (!live.abandoned?.size) return
    for (const [fighterId, entry] of live.abandoned) {
      if (live.sim.now - entry.at < P.ABANDON_MS) continue
      live.abandoned.delete(fighterId)
      const f = live.sim.fighters.find(x => x.id === fighterId)
      if (f?.alive) live.sim.forfeit(f)
    }
  }

  /** One snapshot, built and serialised once, sent to everyone in the room. */
  broadcast(live) {
    if (!live.clients.size) {
      live.events.length = 0
      return
    }
    const msg = P.snapshot({ s: live.sim.snapshot(), ev: live.events, acks: live.acks })
    live.events = []
    live.acks = {}
    for (const client of live.clients) {
      try {
        client.send(msg)
      } catch {
        // A send that throws is a connection already gone; the transport's own
        // close handler will drop it.
      }
    }
  }

  /** Route a parsed message. Returns false if it was not understood. */
  handle(client, msg) {
    if (!msg) return false
    switch (msg.k) {
      case 'hello': this.join(client, msg); return true
      case 'input': this.input(client, msg); return true
      case 'leave': this.leave(client); return true
      case 'ping': client.send(P.pong(msg.t, this.clock())); return true
      default: return false
    }
  }
}
