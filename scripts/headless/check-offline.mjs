#!/usr/bin/env node
/**
 * Basic play must not need the server.
 *
 * Round 1's rules: multiplayer may ship, but the core loop has to work with no
 * custom backend behind it. Leaving the local room server off is not enough to
 * show that — the home screen pings the live regions directly — so this blocks
 * every route to any room server and then plays the single-player game from
 * the home screen, the way a judge would.
 *
 * Usage: node scripts/headless/check-offline.mjs   (dev server on :5173)
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

const b = await launch({ width: 1280, height: 720 })
try {
  // Every road to a room: the deployed regions, and the dev proxy's.
  await b.cdp('Network.enable')
  await b.cdp('Network.setBlockedURLs', { urls: ['*railway.app*', '*/ws*', '*/api/*'] })

  await b.goto(`${PAGE}/`)
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')

  // The multiplayer door should say it is shut rather than hang or throw.
  await b.waitFor("/OFFLINE/.test(window.__game.scene.getScene('HomeScene').netToggle?.text ?? '')", 30000)
    .catch(() => {})
  const door = await b.eval("window.__game.scene.getScene('HomeScene').netToggle?.text ?? ''")
  check('the home screen knows the rooms are unreachable', /OFFLINE/.test(door), door.replace(/\s+/g, ' '))

  // Play, the way a person does: home, pick an Axie, pick a room, fight.
  await b.eval("window.__game.scene.getScene('HomeScene').start('wilds'); true")
  await b.waitFor("!!window.__game.scene.getScene('MenuScene')?.scene.isActive()", 30000)
  await b.eval("window.__game.scene.getScene('MenuScene').choose('beast'); true")
  await b.waitFor("!!window.__game.scene.getScene('LobbyScene')?.scene.isActive()", 30000)
  const lobbyNet = await b.eval("Boolean(window.__game.scene.getScene('LobbyScene').net)")
  check('the lobby is the local one', !lobbyNet)
  await b.eval("window.__game.scene.getScene('LobbyScene').enter(0); true")
  const inGame = await b.waitFor("!!window.__game.scene.getScene('GameScene')?.scene.isActive()", 30000)
  check('a single-player game starts', inGame === true)

  // And it actually plays: the player moves, and the hunters fight.
  const played = JSON.parse(await b.eval(`(async () => {
    const s = window.__game.scene.getScene('GameScene')
    const frame = () => new Promise(r => requestAnimationFrame(r))
    for (let f = 0; f < 60 && !s.player; f++) await frame()
    const p = s.player
    const from = p ? { x: p.x, y: p.y } : null
    const k = s.keys ?? s.input.keyboard.addKeys('D')
    if (k.D) k.D.isDown = true
    for (let f = 0; f < 90; f++) await frame()
    if (k.D) k.D.isDown = false
    return JSON.stringify({
      player: Boolean(p),
      moved: p && from ? Math.round(Math.hypot(p.x - from.x, p.y - from.y)) : 0,
      fighters: (s.fighters ?? []).filter(f => f.alive).length,
    })
  })()`))
  check('the player is in the game', played.player)
  check('and moves', played.moved > 20, `${played.moved}px`)
  check('with hunters to fight', played.fighters > 1, `${played.fighters} alive`)

  const errs = await b.eval('(window.__errors ?? []).length')
  check('nothing threw', errs === 0, `${errs} errors`)
} finally {
  await b.close()
}
console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
