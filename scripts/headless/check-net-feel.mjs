#!/usr/bin/env node
/**
 * How long the game takes to answer you.
 *
 * The number that decides whether a networked brawler is playable, measured
 * rather than felt: press a key, and count the milliseconds until your own Axie
 * has moved on screen. Without prediction that is a full round trip plus the
 * interpolation delay — about a third of a second to the deployed server, which
 * is unplayable. With it, the answer should arrive in the next frame.
 *
 * Point it at production to measure the real thing:
 *   PAGE=https://lunacy.up.railway.app node scripts/headless/check-net-feel.mjs
 *
 * Usage: node scripts/headless/check-net-feel.mjs
 */
import { launch } from './cdp.mjs'

const PAGE = process.env.PAGE ?? 'http://localhost:5173'
// Point the local page at a room server elsewhere to measure a real connection:
//   SERVER=wss://lunacy.up.railway.app/ws node scripts/headless/check-net-feel.mjs
const SERVER = process.env.SERVER ? `&server=${encodeURIComponent(process.env.SERVER)}` : ''
let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

const b = await launch({ width: 1000, height: 640 })
try {
  await b.goto(`${PAGE}/?net=glade&cls=beast&name=Feel${SERVER}`)
  await b.waitFor("!!window.__game?.scene.getScene('NetScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')
  await b.waitFor("window.__game.scene.getScene('NetScene').client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').view.actors.size", 30000)
  await new Promise(r => setTimeout(r, 1500))

  // --- How far away is the room? ------------------------------------------
  const ping = await b.eval(`(async () => {
    const c = window.__game.scene.getScene('NetScene').client
    const seen = []
    for (let i = 0; i < 6; i++) { c.ping(); await new Promise(r => setTimeout(r, 200)); seen.push(c.latency) }
    seen.sort((a, b) => a - b)
    return seen[Math.floor(seen.length / 2)]
  })()`)
  console.log(`      the room is ${ping}ms away, round trip`)

  // --- Does your own Axie answer the key, or the round trip? --------------
  //
  // Counted in frames, not milliseconds. Headless Chromium draws WebGL in
  // software at about ten frames a second, so a wall-clock answer here measures
  // this machine's renderer rather than the network. What matters is whether
  // the answer arrives on the next frame the game draws, whatever a frame costs.
  const felt = await b.eval(`(async () => {
    const s = window.__game.scene.getScene('NetScene')
    const me = () => s.view.actors.get(s.client.you)
    const runs = []
    let frames = 0
    let ms = 0
    for (let i = 0; i < 5; i++) {
      const key = i % 2 ? 'A' : 'D'
      const from = me().sprite.x
      const at = performance.now()
      s.keys[key].isDown = true
      let waited = -1
      for (let f = 1; f <= 200; f++) {
        await new Promise(r => requestAnimationFrame(r))
        if (Math.abs(me().sprite.x - from) > 1.5) { waited = f; break }
      }
      ms += performance.now() - at
      frames += waited
      s.keys[key].isDown = false
      runs.push(waited)
      await new Promise(r => setTimeout(r, 400))
    }
    return JSON.stringify({ runs, frameMs: Math.round(ms / Math.max(1, frames)) })
  })()`).then(JSON.parse)

  const worst = Math.max(...felt.runs)
  const median = [...felt.runs].sort((a, b) => a - b)[Math.floor(felt.runs.length / 2)]
  console.log(`      key to movement: ${felt.runs.join(', ')} frames (this browser draws one every ~${felt.frameMs}ms)`)
  // Two frames: the one that reads the key, and the one that draws the result.
  check('your Axie answers the key, not the round trip', median > 0 && median <= 2,
    `${median} frames median, ${worst} worst`)
  // Only worth asserting where there is a real distance to beat. Against a
  // server on this machine the frame time swamps everything and the comparison
  // says nothing; point PAGE at the deployed game to measure the real thing.
  if (ping >= 50) {
    check('and answers it in less time than a trip to the room',
      median * felt.frameMs < ping, `${median * felt.frameMs}ms against a ${ping}ms round trip`)
  } else {
    console.log(`      (room is only ${ping}ms away; run against the deployed game to measure the real gain)`)
  }

  // --- And the swing, which is the other half of the feel ------------------
  const swing = await b.eval(`(async () => {
    const s = window.__game.scene.getScene('NetScene')
    const me = () => s.view.actors.get(s.client.you)
    await new Promise(r => setTimeout(r, 900))
    s.want('attack')
    for (let f = 1; f <= 200; f++) {
      await new Promise(r => requestAnimationFrame(r))
      if (me().sprite.action?.kind === 'attack') return f
    }
    return -1
  })()`)
  check('and swings when you click', swing > 0 && swing <= 2, `${swing} frames`)

  // --- The prediction must not fight the room ------------------------------
  const drift = await b.eval(`(async () => {
    const s = window.__game.scene.getScene('NetScene')
    const seen = []
    const end = Date.now() + 4000
    s.keys.D.isDown = true
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, 100))
      seen.push(s.predict.error)
    }
    s.keys.D.isDown = false
    seen.sort((a, b) => a - b)
    return JSON.stringify({ median: seen[Math.floor(seen.length / 2)], worst: seen.at(-1) })
  })()`).then(JSON.parse)
  check('the prediction agrees with the room while you run', drift.median < 20,
    `${drift.median}px median, ${drift.worst}px worst`)
  check('and never has to be yanked back', drift.worst < 140, `${drift.worst}px worst`)
} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
} finally {
  b.close()
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
