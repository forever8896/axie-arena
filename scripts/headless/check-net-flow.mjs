#!/usr/bin/env node
/**
 * The way in to multiplayer, as a player walks it.
 *
 * Home screen, the experimental switch, choosing a Ronke, a lobby listing the
 * server's real rooms, and into one of them with the game's own HUD around it.
 *
 * Needs `npm start` (the rooms) and `npm run dev` (the page).
 *
 * Usage: node scripts/headless/check-net-flow.mjs
 */
import { launch } from './cdp.mjs'

const PAGE = process.env.PAGE ?? 'http://localhost:5173'
let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

const b = await launch({ width: 1280, height: 760 })
try {
  await b.goto(`${PAGE}/`)
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')

  // --- The switch says what is actually there ------------------------------
  await b.waitFor(`/MS/.test(window.__game.scene.getScene('HomeScene').netToggle?.text ?? '')`, 20000)
  const label = await b.eval("window.__game.scene.getScene('HomeScene').netToggle.text")
  check('the home screen says who is in there before you click', /PLAYER|STAND-INS/.test(label), label)

  // --- In through the front door -------------------------------------------
  await b.eval(`window.__game.scene.getScene('HomeScene').start('net'); true`)
  await b.waitFor("window.__game.scene.getScene('MenuScene')?.scene.isActive()", 20000)
  const sub = await b.eval("window.__game.scene.getScene('MenuScene').subtitle.text")
  check('choosing a Ronke says what it is for', sub.includes('MULTIPLAYER'), sub)

  await b.eval(`window.__game.scene.getScene('MenuScene').choose('ronke'); true`)
  await b.waitFor("!!window.__game.scene.getScene('LobbyScene')?.roomViews", 20000)

  const lobby = await b.waitFor(`(() => {
    const s = window.__game.scene.getScene('LobbyScene')
    const rows = s.roomViews.map(v => v.hunters.text)
    return rows.some(t => t.includes('PLAYER')) ? JSON.stringify({ tag: s.netTag?.text, rows }) : false
  })()`, 20000).then(() => b.eval(`(() => {
    const s = window.__game.scene.getScene('LobbyScene')
    return JSON.stringify({ net: s.net, tag: s.netTag?.text, rows: s.roomViews.map(v => v.hunters.text), live: s.live })
  })()`)).then(JSON.parse)
  check('the lobby is the multiplayer one', lobby.net && /EXPERIMENTAL/.test(lobby.tag), lobby.tag)
  check('there is one room, not a menu of them', lobby.rows.length === 1, `${lobby.rows.length} room`)
  check('and it names the people in it', /PLAYERS/.test(lobby.rows[0]), lobby.rows[0])

  // --- Into a room ---------------------------------------------------------
  await b.eval(`window.__game.scene.getScene('LobbyScene').enter(0); true`)
  await b.waitFor("window.__game.scene.getScene('NetScene')?.client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').view.actors.size", 30000)
  await b.waitFor("!!window.__game.scene.getScene('UIScene')?.scene.isActive()", 20000)

  // --- The real HUD, around a room running elsewhere -----------------------
  const hud = await b.waitFor(`(() => {
    const ui = window.__game.scene.getScene('UIScene')
    const s = window.__game.scene.getScene('NetScene')
    // Gates open and close on a rotation, so the highest count seen so far is
    // the honest answer to "do they reach the HUD".
    window.__gatesSeen = Math.max(window.__gatesSeen ?? 0, s.wilds?.gates.length ?? 0)
    return ui.wildsHud && s.player ? JSON.stringify({
      minimap: !!ui.mmRoot,
      portraits: ui.mmIcons ? ui.mmIcons.size : 0,
      bounty: ui.wildsHud.bountyText.text,
      room: ui.wildsHud.roomText.text,
      top: ui.wildsHud.topRows.map(r => r.text).filter(Boolean).length,
      status: ui.status.text,
      icons: Object.keys(s.player.hudIcons ?? {}).length,
      wilds: !!s.wilds,
      gates: s.wilds ? s.wilds.gates.length : 0,
    }) : false
  })()`, 30000).then(r => JSON.parse(r === true ? '{}' : r)).catch(() => ({}))
  const read = await b.eval(`(() => {
    const ui = window.__game.scene.getScene('UIScene')
    const s = window.__game.scene.getScene('NetScene')
    return JSON.stringify({
      minimap: !!ui.mmRoot,
      portraits: ui.mmIcons ? ui.mmIcons.size : 0,
      bounty: ui.wildsHud?.bountyText.text,
      room: ui.wildsHud?.roomText.text,
      leaders: ui.wildsHud ? ui.wildsHud.topRows.map(r => r.text).filter(Boolean).length : 0,
      status: ui.status?.text,
      hudDrawn: s.view?.actors?.get(s.client?.you)?.statusFx?.commandBuffer?.length ?? 0,
      gatesEver: window.__gatesSeen ?? (s.wilds?.gates.length ?? 0),
      feed: s.wilds?.events.length ?? 0,
    })
  })()`).then(JSON.parse)

  check('the game HUD is up, not a stand-in', read.minimap && read.bounty?.length > 0, `bounty "${read.bounty}"`)
  check('the minimap draws the room', read.portraits > 0, `${read.portraits} icons on the map`)
  check('the room is named as the one you picked', /TERRACE/i.test(read.room ?? ''), read.room)
  check('the leaderboard has hunters on it', read.leaders > 0, `${read.leaders} rows`)
  // The ability row is drawn rather than loaded now — a chevron, a shield, a
  // bowl and a crescent — so there are no icon objects left to count. What
  // matters is that the row is being painted at all.
  check('your ability row is drawn above Ronke', read.hudDrawn > 0, `${read.hudDrawn} draw commands`)
  // The room broadcasts only the gates that are open, and they rotate, so
  // sampling once can legitimately see none.
  check('the Moon Gates reach the HUD', read.gatesEver > 0, `${read.gatesEver} gates`)
  check('the room count is shown', (read.status ?? '').length > 0, read.status)
} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
} finally {
  b.close()
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
