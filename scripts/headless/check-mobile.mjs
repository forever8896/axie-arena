#!/usr/bin/env node
/**
 * Does it play with thumbs?
 *
 * Emulated as a phone rather than a narrow window: touch events, a phone-sized
 * viewport and a device pixel ratio, because the controls only appear once a
 * real touch happens and a mouse-driven check would never see them.
 *
 * Usage: node scripts/headless/check-mobile.mjs
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

const b = await launch({ width: 844, height: 390 })
try {
  await b.cdp('Network.enable')
  await b.cdp('Network.setBlockedURLs', { urls: ['*railway.app*', '*/ws*', '*/api/*'] })
  // Landscape, which is the orientation the game asks for: a twin-stick
  // brawler wants two thumbs and a wide field.
  await b.cdp('Emulation.setDeviceMetricsOverride', {
    width: 844, height: 390, deviceScaleFactor: 3, mobile: true,
  })
  await b.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

  await b.goto(`${PAGE}/`)
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')

  // Measured against the window rather than against what Phaser believes.
  // The canvas was sized in vh, which on a phone is the viewport with the
  // address bar hidden — so it hung below the fold, taking the thumb buttons
  // with it, while scale.width/height reported exactly what was asked for.
  const size = JSON.parse(await b.eval(`JSON.stringify((() => {
    const c = document.querySelector('#game canvas')
    const r = c.getBoundingClientRect()
    return {
      w: window.__game.scale.width, h: window.__game.scale.height,
      rectW: Math.round(r.width), rectH: Math.round(r.height),
      left: Math.round(r.left), top: Math.round(r.top),
      viewW: window.innerWidth, viewH: window.innerHeight,
    }
  })())`))
  check('the canvas fills a phone', size.w >= 800 && size.h <= 420, `${size.w}x${size.h}`)
  check('and sits flush in the window',
    size.left === 0 && size.top === 0, `at ${size.left},${size.top}`)
  check('and is no taller than the visible viewport',
    size.rectH <= size.viewH + 1 && size.rectW <= size.viewW + 1,
    `canvas ${size.rectW}x${size.rectH}, window ${size.viewW}x${size.viewH}`)

  // Into a game the way a thumb would: tap Play, pick Ronke, enter the room.
  await b.eval("window.__game.scene.getScene('HomeScene').start('wilds'); true")
  await b.waitFor("!!window.__game.scene.getScene('MenuScene')?.scene.isActive()", 30000)
  await b.eval("window.__game.scene.getScene('MenuScene').choose('ronke'); true")
  await b.waitFor("!!window.__game.scene.getScene('LobbyScene')?.scene.isActive()", 30000)
  await b.eval("window.__game.scene.getScene('LobbyScene').enter(0); true")
  await b.waitFor("!!window.__game.scene.getScene('GameScene')?.scene.isActive()", 30000)
  await b.waitFor("!!window.__game.scene.getScene('GameScene').player", 30000)

  const zoom = Number(await b.eval("window.__game.scene.getScene('GameScene').cameras.main.zoom"))
  check('the camera pulls back for a small screen', zoom < 1.1, `zoom ${zoom.toFixed(2)}`)

  const before = JSON.parse(await b.eval(`(() => {
    const p = window.__game.scene.getScene('GameScene').player
    return JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) })
  })()`))

  // A real finger on the left half, dragged right.
  const touch = async (type, x, y) => b.cdp('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  })
  await touch('touchStart', 120, 300)
  for (let i = 1; i <= 8; i++) await touch('touchMove', 120 + i * 7, 300)
  await b.eval('new Promise(r => setTimeout(r, 900))')

  const shown = await b.eval("Boolean(window.__game.scene.getScene('GameScene').touch?.enabled)")
  check('the sticks appear on first touch', shown === true)

  const moving = JSON.parse(await b.eval(`(() => {
    const s = window.__game.scene.getScene('GameScene')
    return JSON.stringify({ x: Math.round(s.player.x), intent: Math.round(s.player.intent.x * 100) / 100 })
  })()`))
  check('the left stick moves him', moving.intent > 0.3, `intent x ${moving.intent}`)
  check('and he actually travels', moving.x > before.x + 10, `${before.x} → ${moving.x}`)
  await touch('touchEnd', 0, 0)

  // The right half aims and releases into a swing.
  const swingsBefore = Number(await b.eval(
    "window.__game.scene.getScene('GameScene').player.lastAttack ?? 0"))
  await touch('touchStart', 430, 190)
  // A drag is several moves, not one: a single event can land before Phaser
  // has registered the touch that started it.
  for (let i = 1; i <= 8; i++) await touch('touchMove', 430 + i * 8, 190 - i * 5)
  await b.eval('new Promise(r => setTimeout(r, 250))')
  const aimed = await b.eval("window.__game.scene.getScene('GameScene').touch.aim")
  await touch('touchEnd', 0, 0)
  await b.eval('new Promise(r => setTimeout(r, 400))')
  const swingsAfter = Number(await b.eval(
    "window.__game.scene.getScene('GameScene').player.lastAttack ?? 0"))
  check('the right stick sets an aim', aimed !== null && aimed !== undefined, `${Number(aimed).toFixed(2)} rad`)
  check('and letting go swings', swingsAfter > swingsBefore)

  // The HUD has to give the corner back to the thumbs on a short screen.
  const hud = JSON.parse(await b.eval(`(() => {
    const ui = window.__game.scene.getScene('UIScene')
    return JSON.stringify({ counter: Boolean(ui?.status?.visible), hint: Boolean(ui?.hint?.visible) })
  })()`))
  check('the room counter gives up the corner', hud.counter === false)
  check('the keyboard strip is gone', hud.hint === false)

  await b.screenshot('/home/deepseek/axie-vibeathon/art/work/mobile-land.png')

  // Turned upright, the game asks for the phone back rather than squeezing.
  await b.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
  })
  await b.eval('new Promise(r => setTimeout(r, 600))')
  const note = JSON.parse(await b.eval(`JSON.stringify((() => {
    const el = document.getElementById('rotate-note')
    const st = el && getComputedStyle(el)
    return { shown: st?.display === 'flex', text: (el?.innerText ?? '').slice(0, 24) }
  })())`))
  check('portrait asks for a turn', note.shown === true, note.text)

  const errs = await b.eval('(window.__errors ?? []).length')
  check('nothing threw', errs === 0, `${errs} errors`)
} finally {
  await b.close()
}
console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
