#!/usr/bin/env node
/**
 * Two servers, two worlds, one choice in front of the player.
 *
 * Each region runs its own rooms, so the thing to check is that the game is
 * honest about it: that both are measured before anyone commits, that the
 * nearer one is offered, that picking one actually plays there — and that a
 * room in one region is not the same room in the other, because two friends who
 * picked differently must not think they are about to meet.
 *
 * Needs `npm run dev`; talks to the deployed regions.
 *
 * Usage: node scripts/headless/check-regions.mjs
 */
import { launch } from './cdp.mjs'
import { REGIONS } from '../../src/net/regions.js'
import * as P from '../../src/net/protocol.js'

const PAGE = process.env.PAGE ?? 'http://localhost:5173'
let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

// --- Both servers, from here ------------------------------------------------
for (const region of REGIONS) {
  const at = Date.now()
  const res = await fetch(`${region.origin}/api/rooms`, { cache: 'no-store' }).catch(() => null)
  const body = res?.ok ? await res.json() : null
  check(`${region.name} (${region.where}) is serving rooms`, Boolean(body?.rooms?.length),
    body ? `${body.rooms.length} rooms, ${Date.now() - at}ms` : 'no answer')
}

// --- The rooms are separate worlds ------------------------------------------
//
// The reason this matters: if two addresses were one server, two friends who
// picked different regions would expect to meet and never would. Comparing
// bounties would not settle it — two rooms can hold the same amount by chance.
// Who is standing in them settles it.
{
  const hunters = async region => {
    const ws = new WebSocket(`${region.origin.replace(/^http/, 'ws')}/ws`)
    const names = await new Promise(resolve => {
      const done = setTimeout(() => resolve(null), 12000)
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify(P.hello({ room: 'glade', cls: 'beast', name: 'Scout' })))
      })
      ws.addEventListener('message', e => {
        const m = P.parse(e.data)
        if (m?.k !== 'welcome') return
        clearTimeout(done)
        // Name and place together. Names come from a small pool and collide by
        // chance; two independent rooms putting the same hunter on the same
        // patch of grass does not happen.
        resolve(m.snap.fighters.filter(f => f.bot).map(f => `${f.name}@${Math.round(f.x)},${Math.round(f.y)}`).sort())
      })
      ws.addEventListener('error', () => { clearTimeout(done); resolve(null) })
    })
    ws.close()
    return names
  }

  const [eu, sg] = await Promise.all(REGIONS.map(hunters))
  const shared = eu && sg ? eu.filter(n => sg.includes(n)) : null
  check('a room in one region is not the room in the other',
    Boolean(eu?.length && sg?.length && shared.length === 0),
    eu && sg ? `${eu.length} hunters in eu, ${sg.length} in sg, ${shared.length} in common` : 'could not reach both')
}

const b = await launch({ width: 1280, height: 800 })
try {
  await b.goto(`${PAGE}/`)
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')

  // --- The switch says where, and how far ----------------------------------
  await b.waitFor(`/MS/.test(window.__game.scene.getScene('HomeScene').netToggle?.text ?? '')`, 30000)
  const label = await b.eval("window.__game.scene.getScene('HomeScene').netToggle.text")
  check('the home switch names the server and its distance', /\d+MS/.test(label), label)

  // --- Into the lobby, where the choice lives ------------------------------
  await b.eval(`window.__game.scene.getScene('HomeScene').playNet(); true`)
  await b.waitFor("window.__game.scene.getScene('MenuScene')?.scene.isActive()", 20000)
  await b.eval(`window.__game.scene.getScene('MenuScene').choose('beast'); true`)
  await b.waitFor("!!window.__game.scene.getScene('LobbyScene')?.regionRows", 30000)

  await b.waitFor(`(() => {
    const s = window.__game.scene.getScene('LobbyScene')
    return s.regionRows.every(r => r.ping.text !== '· · ·')
  })()`, 30000)
  const pinged = await b.eval(`JSON.stringify(window.__game.scene.getScene('LobbyScene').regionRows.map(r => r.ping.text))`)
    .then(JSON.parse)
  check('every server is measured in the lobby', pinged.every(p => /ms|unreachable/.test(p)), pinged.join(', '))

  const state = await b.eval(`(() => {
    const s = window.__game.scene.getScene('LobbyScene')
    return JSON.stringify({
      chosen: s.region.id,
      note: s.regionNote.text,
      offer: s.regionSwitch.text,
      suggested: s.suggested?.id ?? null,
      rooms: s.roomViews.map(v => v.hunters.text)[0],
    })
  })()`).then(JSON.parse)
  check('the lobby says which server you are on', state.note.length > 0, state.note)
  check('and lists the rooms on it', /HUNTERS/.test(state.rooms), state.rooms)
  // The suggestion only appears when another server is meaningfully closer, so
  // either it is offering one or it is quiet — both are correct, but a
  // suggestion must never point at the server already chosen.
  check('any suggestion points somewhere else', state.suggested !== state.chosen,
    state.suggested ? `on ${state.chosen}, offering ${state.suggested}` : `on ${state.chosen}, nothing to offer`)

  // --- Switching actually moves you ----------------------------------------
  const other = REGIONS.find(r => r.id !== state.chosen)
  await b.eval(`(() => {
    const s = window.__game.scene.getScene('LobbyScene')
    s.chooseRegion(s.regionRows.find(r => r.region.id === '${other.id}').region)
    return true
  })()`)
  await b.waitFor(`window.__game.scene.getScene('LobbyScene').region?.id === '${other.id}'`, 20000)
  await b.waitFor(`(() => {
    const s = window.__game.scene.getScene('LobbyScene')
    return !!(s.roomViews && s.live.every(l => l.hunters > 0))
  })()`, 30000)
  const moved = await b.eval(`(() => {
    const s = window.__game.scene.getScene('LobbyScene')
    return JSON.stringify({ id: s.region.id, tag: s.netTag.text })
  })()`).then(JSON.parse)
  check('choosing another server lists its rooms instead', moved.id === other.id, moved.tag)

  // --- And playing there connects there -------------------------------------
  await b.eval(`window.__game.scene.getScene('LobbyScene').enter(1); true`)
  await b.waitFor("window.__game.scene.getScene('NetScene')?.client?.status === 'playing'", 60000)
  const where = await b.eval(`(() => {
    const s = window.__game.scene.getScene('NetScene')
    return JSON.stringify({ region: s.regionId, url: s.client.url })
  })()`).then(JSON.parse)
  check('and the game connects to the server you picked',
    where.region === other.id && where.url.includes(new URL(other.origin).host), where.url)
} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
} finally {
  b.close()
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
