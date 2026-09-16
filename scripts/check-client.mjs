#!/usr/bin/env node
/**
 * The client's half of the wire, against a real server.
 *
 * RoomClient has no Phaser in it, so the interesting parts can be checked here
 * rather than by staring at a browser: that it draws a smooth world out of
 * twenty snapshots a second, that its clock follows the server's without
 * lurching, and that a dropped connection can be picked back up.
 *
 * Usage: node scripts/check-client.mjs
 */
import { createServer } from 'node:http'
import { attachNet } from '../src/net/wsServer.js'
import RoomClient, { INTERP_MS } from '../src/net/client.js'
import { FLAGS, has } from '../src/sim/constants.js'
import * as P from '../src/net/protocol.js'

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, ms = 3000, what = 'condition') {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = fn()
    if (v) return v
    await sleep(10)
  }
  throw new Error(`timed out waiting for ${what}`)
}

const server = createServer((req, res) => res.end('ok'))
const net = attachNet(server)
await new Promise(resolve => server.listen(0, resolve))
const url = `ws://127.0.0.1:${server.address().port}/ws`

/** Drive a client the way a scene's update loop would. */
async function frames(client, ms, input = {}, fps = 60) {
  const step = 1000 / fps
  const end = Date.now() + ms
  const seen = []
  while (Date.now() < end) {
    await sleep(step)
    client.advance(step)
    client.sendInput(input)
    const v = client.view()
    if (v) seen.push(v)
  }
  return seen
}

try {
  const client = new RoomClient({ url, name: 'Ayla' })
  const welcome = await client.connect({ room: 'glade', cls: 'beast' })
  check('a client connects and is seated', client.status === 'playing' && Boolean(client.you), client.you)
  check('the welcome names the room', welcome.room.id === 'glade', welcome.room.name)
  check('a first view is drawable straight away', Boolean(client.view()?.me), 'view ready')

  // --- The render clock ----------------------------------------------------
  {
    await frames(client, 900)
    const newest = client.buffer.at(-1).t
    const behind = newest - client.renderTime
    // Drawing ahead of the newest snapshot would mean inventing a future the
    // room has not decided yet; drawing far behind would be a visible lag.
    check('the client never draws ahead of the room', behind >= 0, `${Math.round(behind)}ms behind`)
    check('and stays within a snapshot or two of it', behind < INTERP_MS * 2.5, `${Math.round(behind)}ms behind`)

    const views = await frames(client, 600)
    const steps = views.slice(1).map((v, i) => v.t - views[i].t)
    const backwards = steps.filter(d => d < 0).length
    const biggest = Math.max(...steps)
    check('the render clock never runs backwards', backwards === 0, `${backwards} reversals`)
    check('and never lurches', biggest < 120, `biggest step ${Math.round(biggest)}ms`)
  }

  // --- Interpolation -------------------------------------------------------
  {
    // Walking in a straight line: between two snapshots the drawn position has
    // to move in small steps, not sit still and then jump 20 times a second.
    const views = await frames(client, 900, { move: { x: 1, y: 0 }, aim: 0 })
    const mine = views.map(v => v.me).filter(Boolean)
    const hops = mine.slice(1).map((m, i) => Math.hypot(m.x - mine[i].x, m.y - mine[i].y))
    const moved = hops.filter(h => h > 0.01).length
    const biggest = Math.max(...hops)
    check('a walk is drawn smoothly, not in snapshot jumps', moved > hops.length * 0.7,
      `${moved} of ${hops.length} frames moved`)
    check('and no frame jumps a whole snapshot', biggest < 40, `biggest hop ${biggest.toFixed(1)}px`)
    check('the walk actually went somewhere', mine.at(-1).x - mine[0].x > 40,
      `${Math.round(mine.at(-1).x - mine[0].x)}px`)
  }

  // --- What the view carries ----------------------------------------------
  {
    const v = client.view()
    check('the view has the room in it', Array.isArray(v.fighters) && v.fighters.length > 1, `${v.fighters.length} fighters`)
    check('the view knows which one is you', v.me?.id === client.you, v.me?.id)
    check('gates are there to aim for', v.gates.length > 0, `${v.gates.length} open`)
    check('your bounty is on your fighter', typeof v.me.bounty === 'number', String(v.me.bounty))
  }

  // --- Actions and their events -------------------------------------------
  {
    // Standing still in a room full of hunters gets you killed, and a corpse
    // cannot swing: keep this client on its feet so the checks below are about
    // the wire rather than about how the fight went.
    const sim = net.host.live.get('glade').sim
    const mine = sim.fighters.find(f => f.id === client.you)
    check('the client is still standing', Boolean(mine?.alive), mine ? `hp ${Math.round(mine.hp)}` : 'gone')
    if (mine) {
      mine.hp = mine.maxHp
      mine.invulnerableUntil = sim.now + 60000
    }

    // You cannot swing from behind a spawn shield — the shield protects you, so
    // it does not also arm you. Worth checking over the wire: it is the kind of
    // rule a client would otherwise be tempted to decide for itself.
    mine.spawnShieldUntil = sim.now + 5000
    client.drainEvents()
    client.act('attack')
    client.sendInput({ move: { x: 0, y: 0 }, aim: 0 })
    await sleep(200)
    check('a shielded fighter cannot attack', !client.events.some(e => e.t === 'swing' && e.id === client.you),
      'refused by the room')
    mine.spawnShieldUntil = 0

    client.drainEvents()
    client.act('attack')
    client.sendInput({ move: { x: 0, y: 0 }, aim: 0 })
    const swing = await waitFor(() => {
      const evs = client.events
      return evs.find(e => e.t === 'swing' && e.id === client.you)
    }, 3000, 'a swing of my own')
    check('an action queued this frame reaches the room', Boolean(swing))

    client.drainEvents()
    check('draining leaves nothing behind', client.events.length === 0)
  }

  // --- Flags are read the same on both sides -------------------------------
  {
    client.act('dash')
    client.sendInput({ move: { x: 1, y: 0 }, aim: 0 })
    // The view is a frame of a clock that only moves when a scene drives it, so
    // the wait has to keep drawing, exactly as the game loop would.
    const dashing = await waitFor(() => {
      client.advance(1000 / 60)
      const me = client.view()?.me
      return me && has(me.flags, FLAGS.DASHING) ? me : null
    }, 3000, 'a dash in the view')
    check('the renderer sees the state the server set', Boolean(dashing), `flags ${dashing.flags}`)
  }

  // --- Latency -------------------------------------------------------------
  {
    client.ping()
    await waitFor(() => client.latency > 0 || client.latency === 0, 2000, 'a pong')
    check('the round trip is measured', client.latency >= 0 && client.latency < 500, `${client.latency}ms`)
  }

  // --- Picking a dropped game back up --------------------------------------
  {
    const id = client.you
    const token = client.token
    client.socket.close()
    await waitFor(() => client.status === 'dropped', 2000, 'a dropped status')
    check('a lost socket is noticed', client.status === 'dropped', client.status)

    const back = new RoomClient({ url, name: 'Ayla' })
    await back.connect({ room: 'glade', cls: 'beast', resume: token })
    check('and the game is picked back up', back.you === id, `${back.you} vs ${id}`)
    await frames(back, 300)
    check('with a drawable world again', Boolean(back.view()?.me), 'view ready')
    back.leave()
    await waitFor(() => back.status === 'left', 2000, 'a goodbye')
    back.close()
  }

  // --- A client that asks for nonsense ------------------------------------
  {
    const lost = new RoomClient({ url })
    let refused = null
    await lost.connect({ room: 'nowhere', cls: 'beast' }).catch(err => { refused = err.message })
    check('joining a room that does not exist fails cleanly', refused === 'no-such-room', refused)
    lost.close()
  }
} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
} finally {
  await net.close()
  server.close()
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
