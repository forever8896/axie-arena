#!/usr/bin/env node
/**
 * The way in to multiplayer, as a player walks it.
 *
 * Home screen, the experimental switch, choosing an Axie, a lobby listing the
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
  const label = await b.waitFor(`(() => {
    const t = window.__game.scene.getScene('HomeScene').netToggle?.text ?? ''
    return t.includes('LIVE ROOMS') || t.includes('PLAYER') ? t : false
  })()`, 20000).then(() => b.eval("window.__game.scene.getScene('HomeScene').netToggle.text"))
  check('the home screen counts the live rooms before you click', /LIVE ROOMS|PLAYER/.test(label), label)

  // --- In through the front door -------------------------------------------
  await b.eval(`window.__game.scene.getScene('HomeScene').start('net'); true`)
  await b.waitFor("window.__game.scene.getScene('MenuScene')?.scene.isActive()", 20000)
  const sub = await b.eval("window.__game.scene.getScene('MenuScene').subtitle.text")
  check('choosing an Axie says what it is for', sub.includes('MULTIPLAYER'), sub)

  await b.eval(`window.__game.scene.getScene('MenuScene').choose('beast'); true`)
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
  check('and lists real hunters in each room', lobby.live.every(l => l.hunters > 0), lobby.rows[0])
  check('and counts the people among them', lobby.rows.every(r => r.includes('PLAYER')), lobby.rows[1])

  // --- Into a room ---------------------------------------------------------
  await b.eval(`window.__game.scene.getScene('LobbyScene').enter(1); true`)
  await b.waitFor("window.__game.scene.getScene('NetScene')?.client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').view.actors.size", 30000)
  await b.waitFor("!!window.__game.scene.getScene('UIScene')?.scene.isActive()", 20000)

  // --- The real HUD, around a room running elsewhere -----------------------
  const hud = await b.waitFor(`(() => {
    const ui = window.__game.scene.getScene('UIScene')
    const s = window.__game.scene.getScene('NetScene')
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
      icons: Object.keys(s.player?.hudIcons ?? {}).length,
      gates: s.wilds?.gates.length ?? 0,
      feed: s.wilds?.events.length ?? 0,
    })
  })()`).then(JSON.parse)

  check('the game HUD is up, not a stand-in', read.minimap && read.bounty?.length > 0, `bounty "${read.bounty}"`)
  check('the minimap draws the room', read.portraits > 0, `${read.portraits} icons on the map`)
  check('the room is named as the one you picked', /GLADE/i.test(read.room ?? ''), read.room)
  check('the leaderboard has hunters on it', read.leaders > 0, `${read.leaders} rows`)
  check('your ability icons are above your Axie', read.icons >= 3, `${read.icons} icons`)
  check('the Moon Gates are known to the HUD', read.gates > 0, `${read.gates} gates`)
  check('the room count is shown', (read.status ?? '').length > 0, read.status)
} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
} finally {
  b.close()
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
