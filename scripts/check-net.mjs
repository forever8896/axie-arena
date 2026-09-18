#!/usr/bin/env node
/**
 * The netcode, over real sockets.
 *
 * Starts the authority on a real HTTP server, connects real WebSocket clients
 * to it, and checks the properties that make a server authoritative: the client
 * sends wishes and never facts, two clients see one world, a dropped connection
 * is not an escape, and no value is created or destroyed by any of it.
 *
 * The host runs on a stretched clock so the slow rules (a six-second abandon
 * window) can be checked in a test that finishes in seconds.
 *
 * Usage: node scripts/check-net.mjs
 */
import { createServer } from 'node:http'
import { attachNet } from '../src/net/wsServer.js'
import * as P from '../src/net/protocol.js'
import { WILDS, ROOMS } from '../src/wilds/config.js'
import { FLAGS, has } from '../src/sim/constants.js'

const SPEED = 4              // simulated milliseconds per real millisecond
const started = Date.now()
const clock = () => started + (Date.now() - started) * SPEED

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol
const sleep = ms => new Promise(r => setTimeout(r, ms))
/** Real milliseconds to wait for `simMs` of room time. */
const simWait = simMs => sleep(Math.ceil(simMs / SPEED) + 30)

const server = createServer((req, res) => res.end('ok'))
// The servers host one room; these checks are about the wire, and want
// several to move between.
const net = attachNet(server, { clock, rooms: ROOMS })
await new Promise(resolve => server.listen(0, resolve))
const URL_BASE = `ws://127.0.0.1:${server.address().port}/ws`

/** A client that keeps what it was told, so the test can assert on it. */
class TestClient {
  constructor(name) {
    this.name = name
    this.socket = new WebSocket(URL_BASE)
    this.welcome = null
    this.snaps = []
    this.events = []
    this.errors = []
    this.closed = null
    this.seq = 0
    this.socket.addEventListener('message', e => {
      const msg = P.parse(e.data)
      if (!msg) return
      if (msg.k === 'welcome') this.welcome = msg
      else if (msg.k === 'snap') {
        this.snaps.push(msg)
        this.events.push(...msg.ev)
      } else if (msg.k === 'error') this.errors.push(msg.why)
      else if (msg.k === 'bye') this.closed = msg.why
    })
  }

  ready() {
    return new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
  }

  send(msg) {
    if (this.socket.readyState === 1) this.socket.send(JSON.stringify(msg))
  }

  /** Drive the fighter the way the real client will: wishes, every frame. */
  drive({ mv = [0, 0], aim = 0, act = [], pt = null, gd = 0, extra = {} } = {}) {
    this.send({ ...P.input({ seq: ++this.seq, mv, aim, act, pt, gd }), ...extra })
  }

  get you() { return this.welcome?.you ?? null }
  get last() { return this.snaps.at(-1)?.s ?? null }
  me(snap = this.last) { return snap?.fighters.find(f => f.id === this.you) ?? null }
  async join(room = 'glade', cls = 'beast', resume = null) {
    await this.ready()
    this.send(P.hello({ room, cls, name: this.name, resume }))
    await waitFor(() => this.welcome, 2000, `${this.name} welcome`)
    return this
  }
  close() { this.socket.close() }
}

async function waitFor(fn, ms = 2000, what = 'condition') {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = fn()
    if (v) return v
    await sleep(10)
  }
  throw new Error(`timed out waiting for ${what}`)
}

const roomSim = id => net.host.live.get(id)?.sim
const fighterOf = (client, id = client.you) => roomSim(client.welcome.room.id)?.fighters.find(f => f.id === id)

try {
  // --- A room you can walk into -------------------------------------------
  const a = await new TestClient('Ayla').join('glade')
  check('a client is welcomed into a room', a.welcome.v === P.PROTOCOL_VERSION && a.welcome.room.id === 'glade', a.welcome.you)
  check('the welcome carries the room as it stands', a.welcome.snap?.fighters?.length > 1, `${a.welcome.snap?.fighters?.length} fighters`)
  check('joining pays the room its fee', roomSim('glade').ledger.fees > 0, roomSim('glade').ledger.fees.toFixed(3))

  const listed = net.host.roomList().find(r => r.id === 'glade')
  check('the lobby sees the live room', listed.hunters > 1 && listed.players === 1, `${listed.hunters} hunters, ${listed.players} player`)

  // --- Two clients, one world ---------------------------------------------
  const b = await new TestClient('Bram').join('glade', 'plant')
  await waitFor(() => a.snaps.length > 2 && b.snaps.length > 2, 2000, 'snapshots')
  check('each client sees the other', Boolean(a.me(a.last) && a.last.fighters.some(f => f.id === b.you)), `${a.last.fighters.length} in room`)
  check('both are shown the same tick', Math.abs(a.last.tick - b.last.tick) <= P.SNAPSHOT_EVERY, `${a.last.tick} vs ${b.last.tick}`)
  check('the two are different fighters', a.you !== b.you, `${a.you} / ${b.you}`)

  // --- Snapshots arrive at the stated rate ---------------------------------
  {
    const before = a.snaps.length
    await simWait(1000)
    const rate = a.snaps.length - before
    const expected = 1000 / (P.TICK_MS * P.SNAPSHOT_EVERY)
    check('snapshots arrive about 20 times a second', rate > expected * 0.6 && rate < expected * 1.5, `${rate} in a second of room time`)
  }

  // --- The client sends wishes, not facts ----------------------------------
  {
    const from = { ...a.me() }
    const end = Date.now() + 700
    while (Date.now() < end) {
      a.drive({ mv: [1, 0], aim: 0 })
      await sleep(16)
    }
    const to = a.me()
    check('a move input moves you', to.x - from.x > 20, `${Math.round(from.x)} to ${Math.round(to.x)}`)

    // The same input, with a position bolted on. The authority has no field for
    // it, so it cannot be believed: this is the whole point of the protocol.
    a.drive({ mv: [0, 0], aim: 0, extra: { x: 99999, y: 99999, hp: 1e6, bounty: 999 } })
    await simWait(200)
    const after = a.me()
    check('a forged position is ignored', Math.abs(after.x - to.x) < 200 && after.x < 90000, `x ${Math.round(after.x)}`)
    check('a forged bounty is ignored', after.bounty < 100, `bounty ${after.bounty}`)

    // Silence is not a held key.
    const still = a.me()
    await simWait(P.INPUT_STALE_MS + 400)
    const drift = Math.hypot(a.me().x - still.x, a.me().y - still.y)
    check('a client that goes quiet stops moving', drift < 90, `drifted ${Math.round(drift)}px`)
  }

  // --- Actions reach the simulation ----------------------------------------
  {
    a.events.length = 0
    a.drive({ mv: [0, 0], aim: 0, act: ['attack'] })
    await waitFor(() => a.events.some(e => e.t === 'swing' && e.id === a.you), 2000, 'a swing event')
    check('an attack reaches the room', true)

    a.events.length = 0
    a.drive({ mv: [1, 0], aim: 0, act: ['dash'] })
    await waitFor(() => a.events.some(e => e.t === 'dash' && e.id === a.you), 2000, 'a dash event')
    check('a dash reaches the room', true)

    // A parry is refused mid-dash by the rules, so let the dash finish first.
    await simWait(600)
    a.events.length = 0
    a.drive({ mv: [0, 0], aim: 0, act: ['parry'] })
    await waitFor(() => a.events.some(e => e.t === 'parry-raise' && e.id === a.you), 2000, 'a parry event')
    check('a parry reaches the room', true)

    // A guard is held rather than pressed, so it travels as a flag on every
    // input instead of an action. The host once read that flag and dropped it
    // on the floor, which left the key doing nothing at all for a real player
    // while the bots guarded happily — so this follows it all the way to the
    // fighter rather than trusting an event that anyone could have raised.
    await simWait(700)
    a.events.length = 0
    for (let i = 0; i < 20; i++) {
      a.drive({ mv: [0, 0], aim: 0, gd: 1 })
      await sleep(16)
    }
    const up = await waitFor(() => a.events.some(e => e.t === 'guard-up' && e.id === a.you), 2000, 'a guard-up event')
    check('a held guard reaches the room', Boolean(up))
    check('and the room says that Axie is guarding', has(a.me()?.flags ?? 0, FLAGS.GUARDING), `flags ${a.me()?.flags}`)

    // And it has to come back down with the key, or a guard becomes a stance.
    for (let i = 0; i < 20; i++) {
      a.drive({ mv: [0, 0], aim: 0, gd: 0 })
      await sleep(16)
    }
    check('and lowers when the key comes up', !has(a.me()?.flags ?? 0, FLAGS.GUARDING), `flags ${a.me()?.flags}`)
  }

  // --- Inputs are acknowledged, so a client can reconcile -------------------
  {
    a.drive({ mv: [0, 1], aim: 1 })
    const seq = a.seq
    const acked = await waitFor(() => a.snaps.slice(-4).find(s => s.acks[a.you] >= seq), 2000, 'an ack')
    check('snapshots acknowledge the input they include', acked.acks[a.you] >= seq, `acked ${acked.acks[a.you]} of ${seq}`)
  }

  // --- A person never waits behind a stand-in -------------------------------
  {
    const sim = roomSim('glade')
    const crowd = []
    while (sim.fighters.filter(f => f.alive).length < WILDS.maxHunters) {
      sim.addFighter({ bot: true, name: `filler${crowd.length}` })
      crowd.push(1)
    }
    const c = await new TestClient('Cass').join('glade', 'bird')
    check('a player gets a seat in a full room', Boolean(c.you) && !c.errors.length, `${sim.fighters.filter(f => f.alive).length} alive`)
    check('the room stays within its cap', sim.fighters.filter(f => f.alive).length <= WILDS.maxHunters, `${sim.fighters.filter(f => f.alive).length}`)
    check('displacing a stand-in destroys no value', near(sim.imbalance, 0, 1e-9), sim.imbalance)
    c.close()
  }

  // --- Dropping the connection is not an escape ----------------------------
  {
    const d = await new TestClient('Dree').join('grove', 'reptile')
    const sim = roomSim('grove')
    const id = d.you
    const carried = fighterOf(d).wilds.bounty
    d.close()
    await sleep(120)
    const left = sim.fighters.find(f => f.id === id)
    check('a dropped Axie stays in the room', Boolean(left?.alive), left ? 'still standing' : 'gone')
    check('and defends itself while nobody drives it', Boolean(left?.brain), left?.brain ? 'brain attached' : 'no brain')

    // Back inside the window: the same Axie, with what it was carrying.
    const again = await new TestClient('Dree').join('grove', 'reptile', d.welcome.token)
    check('reconnecting takes the same Axie back', again.you === id, `${again.you} vs ${id}`)
    check('and the bounty came back with it', near(fighterOf(again).wilds.bounty, carried, 0.001), fighterOf(again).wilds.bounty)
    check('and it is under a player again', !fighterOf(again).brain, 'brain cleared')

    // This time, stay gone.
    again.close()
    await simWait(P.ABANDON_MS + 600)
    const gone = sim.fighters.find(f => f.id === id)
    check('an abandoned Axie forfeits in the end', !gone?.alive, gone?.alive ? 'still up' : 'forfeited')
    check('and what it carried stayed in the room', near(sim.imbalance, 0, 1e-9), sim.imbalance)
  }

  // --- Leaving on purpose --------------------------------------------------
  {
    const e = await new TestClient('Esk').join('meadow', 'bug')
    const sim = roomSim('meadow')
    const id = e.you
    e.send(P.leave())
    await waitFor(() => e.closed, 2000, 'a goodbye')
    check('leaving is answered', e.closed === 'left', e.closed)
    check('and the Axie is out of the room', !sim.fighters.find(f => f.id === id)?.alive, 'gone')
    check('and its bounty stayed behind', near(sim.imbalance, 0, 1e-9), sim.imbalance)
    e.close()
  }

  // --- The server defends its own loop -------------------------------------
  {
    const f = await new TestClient('Flin').join('glade', 'aquatic')
    f.send({ k: 'nonsense' })
    await waitFor(() => f.errors.includes('unknown'), 2000, 'an unknown-message error')
    check('an unknown message is refused, not obeyed', true)

    for (let i = 0; i < 400; i++) f.drive({ mv: [1, 0] })
    await waitFor(() => f.socket.readyState === 3 || f.errors.includes('too-fast'), 3000, 'a rate limit')
    check('a client that floods the socket is cut off', true, f.errors.includes('too-fast') ? 'told, then closed' : 'closed')
  }

  // --- The rooms kept running through all of it ----------------------------
  {
    const was = new Map([...net.host.live].map(([id, live]) => [id, live.sim.now]))
    await simWait(800)

    let worst = 0
    let ticking = 0
    let populated = 0
    for (const [id, live] of net.host.live) {
      worst = Math.max(worst, Math.abs(live.sim.imbalance))
      if (live.sim.now > was.get(id)) ticking++
      if (live.sim.fighters.some(f => f.alive)) populated++
    }
    const count = net.host.live.size
    check('every room conserved value throughout', worst < 1e-9, `worst ${worst}`)
    // Nobody is connected to any of them by now: the rooms keep running anyway,
    // which is the difference between a lobby and a world.
    check('every room keeps running with nobody connected', ticking === count, `${ticking} of ${count} advancing`)
    check('and keeps its hunters', populated === count, `${populated} of ${count} populated`)
    // Including the one nobody in this test ever visited.
    const untouched = roomSim('summit')
    check('a room nobody has visited is running too', untouched?.now > 0 && untouched.fighters.some(f => f.alive),
      `${Math.round((untouched?.now ?? 0) / 1000)}s in, ${untouched?.fighters.filter(f => f.alive).length} hunters`)
  }

  a.close()
  b.close()
} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
} finally {
  await net.close()
  server.close()
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
