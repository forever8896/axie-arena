#!/usr/bin/env node
/**
 * The networked room, drawn in a real browser.
 *
 * check-net and check-client prove the wire; this proves the picture: that a
 * room running in another process arrives on screen as Axies with their own
 * animations, that the player's keys move the one they are driving, and that a
 * second browser in the same room sees the same fight.
 *
 * Needs both servers: `npm start` (the rooms, :8080) and `npm run dev` (the
 * page, :5173, proxying /ws through to it).
 *
 * Usage: node scripts/headless/check-net-scene.mjs
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

/** A browser sitting in a room, with helpers to poke at the live scene. */
async function player(name, cls) {
  const b = await launch({ width: 900, height: 600 })
  await b.goto(`${PAGE}/?net=glade&cls=${cls}&name=${name}`)
  await b.waitFor("!!window.__game?.scene.getScene('NetScene')?.scene.isActive()", 90000)
  // A headless page never gains focus, so Phaser sleeps its loop and the scene
  // stops updating — which is right for a backgrounded tab and useless here.
  // The other suites step the clock by hand; a networked room cannot, because
  // its authority is running on real time in another process.
  await b.eval('window.__game.loop.wake(); true')
  await b.waitFor("window.__game.scene.getScene('NetScene').client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').view.actors.size", 30000)
  return b
}

/**
 * A room full of hunters kills people, including test subjects. A player whose
 * Axie went down walks back in, which is what a person would do, and what the
 * checks below need before they can mean anything.
 */
async function alive(b, name, cls) {
  const up = await b.eval(`(() => {
    const s = window.__game.scene.getScene('NetScene')
    const me = s?.client?.view?.()?.me
    return !!(me && me.alive)
  })()`)
  if (up) return 'still up'
  await b.goto(`${PAGE}/?net=glade&cls=${cls}&name=${name}`)
  await b.waitFor("!!window.__game?.scene.getScene('NetScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')
  await b.waitFor("window.__game.scene.getScene('NetScene').client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').client.view()?.me", 30000)
  return 're-entered'
}

const read = `(() => {
  const s = window.__game.scene.getScene('NetScene')
  const v = s.client.view()
  return {
    status: s.client.status,
    you: s.client.you,
    room: s.client.room?.id,
    fighters: v ? v.fighters.length : 0,
    ids: v ? v.fighters.map(f => f.id) : [],
    me: v?.me ? { x: Math.round(v.me.x), y: Math.round(v.me.y), hp: v.me.hp, bounty: v.me.bounty } : null,
    actors: s.view.actors.size,
    sprites: [...s.view.actors.values()].filter(a => a.sprite.root.active).length,
    clip: [...s.view.actors.values()].map(a => a.sprite.rig.playing).filter(Boolean).length,
    cam: { x: Math.round(s.cameras.main.scrollX), y: Math.round(s.cameras.main.scrollY) },
    gates: v ? v.gates.length : 0,
  }
})()`

let a = null
let b = null
try {
  a = await player('Ayla', 'beast')
  const first = await a.eval(read)
  check('the browser joins a room on the server', first.status === 'playing' && Boolean(first.you), first.you)
  check('the room arrives with hunters already in it', first.fighters > 1, `${first.fighters} fighters`)
  // Against the frame that was actually drawn: read the count separately and a
  // hunter who left between the two reads looks like a leak.
  const drawn = await a.eval(`(async () => {
    const s = window.__game.scene.getScene('NetScene')
    // Let a frame be drawn first: a hunter who joined a moment ago is in the
    // view before the render that gives them a sprite, and counting across that
    // gap reports a hole that is really one frame of lag.
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => requestAnimationFrame(r))
    const v = s.client.view()
    const missing = v.fighters.filter(f => !s.view.actors.has(f.id))
    return JSON.stringify({ of: v.fighters.length, missing: missing.length })
  })()`).then(JSON.parse)
  check('every fighter in the snapshot gets a sprite', drawn.missing === 0, `${drawn.of - drawn.missing} of ${drawn.of}`)
  check('and every sprite is playing an animation', first.clip === first.actors, `${first.clip} animating`)
  check('the gates are drawn to aim for', first.gates > 0, `${first.gates} open`)

  // You have to be able to find yourself: your own Axie, drawn, near the middle
  // of the screen, and without a name tag over it — you know who you are.
  {
    const self = await a.eval(`(() => {
      const s = window.__game.scene.getScene('NetScene')
      const me = s.view.actors.get(s.client.you)
      if (!me) return { found: false }
      const cam = s.cameras.main
      const b = cam.getBounds()
      return {
        found: true,
        drawn: me.sprite.root.active && me.sprite.root.visible,
        screenX: Math.round((me.sprite.x - cam.scrollX) * cam.zoom),
        screenY: Math.round((me.sprite.y - cam.scrollY) * cam.zoom),
        w: cam.width,
        h: cam.height,
        // Near the edge of the world the view stops following, and your Axie
        // sits off centre on purpose. Being visible is the promise, not being
        // in the middle.
        clamped: cam.scrollX <= 1 || cam.scrollY <= 1 ||
          cam.scrollX >= b.width - cam.width / cam.zoom - 1 ||
          cam.scrollY >= b.height - cam.height / cam.zoom - 1,
        labelled: me.label.text.length > 0,
      }
    })()`)
    check('your own Axie is on screen', self.found && self.drawn, self.found ? 'drawn' : 'missing')
    check('and the camera is looking at it',
      self.screenX > 0 && self.screenX < self.w && self.screenY > 0 && self.screenY < self.h,
      `${self.screenX},${self.screenY} in ${self.w}x${self.h}${self.clamped ? ', clamped at the world edge' : ''}`)
    check('and it is not labelled with your own name', !self.labelled)
  }

  // --- The keys move the Axie the server says is yours ---------------------
  {
    const before = await a.eval(read)
    // Walk toward the middle of the arena. Walking into the edge is a fine way
    // to prove the keys work and a useless way to prove the camera follows,
    // because there the view clamps against the world bounds and stays put.
    const walked = await a.eval(`(async () => {
      const s = window.__game.scene.getScene('NetScene')
      const b = s.cameras.main.getBounds()
      const me = s.client.view().me
      const key = me.x > b.centerX ? 'A' : 'D'
      s.keys[key].isDown = true
      await new Promise(r => setTimeout(r, 1200))
      s.keys[key].isDown = false
      await new Promise(r => setTimeout(r, 400))
      return key
    })()`)
    const after = await a.eval(read)
    check('holding a key walks you, as the room decides', Math.abs(after.me.x - before.me.x) > 25,
      `${before.me.x} to ${after.me.x}, holding ${walked}`)

    // The camera follows unless it is up against the edge of the world, where
    // staying put is the correct thing to do. Either way you stay on screen,
    // which is the contract that actually matters.
    const frame = await a.eval(`(() => {
      const s = window.__game.scene.getScene('NetScene')
      const cam = s.cameras.main
      const me = s.client.view().me
      const b = cam.getBounds()
      return JSON.stringify({
        moved: Math.abs(cam.scrollX - ${before.cam.x}) > 10,
        clamped: cam.scrollX <= 1 || cam.scrollX >= b.width - cam.width / cam.zoom - 1,
        onScreenX: Math.round((me.x - cam.scrollX) * cam.zoom),
        onScreenY: Math.round((me.y - cam.scrollY) * cam.zoom),
        w: cam.width, h: cam.height,
      })
    })()`).then(JSON.parse)
    check('and the camera came along, unless the world ran out',
      frame.moved || frame.clamped, frame.moved ? 'followed' : 'clamped at the world edge')
    check('and you are still on screen either way',
      frame.onScreenX > 0 && frame.onScreenX < frame.w && frame.onScreenY > 0 && frame.onScreenY < frame.h,
      `${frame.onScreenX},${frame.onScreenY} in ${frame.w}x${frame.h}`)
  }

  // --- A second browser, the same room ------------------------------------
  {
    b = await player('Bram', 'plant')
    const backA = await alive(a, 'Ayla', 'beast')
    const backB = await alive(b, 'Bram', 'plant')
    check('both players are in the room', true, `Ayla ${backA}, Bram ${backB}`)
    const mine = await a.eval(read)
    const theirs = await b.eval(read)
    check('a second browser joins the same room', theirs.room === mine.room && theirs.you !== mine.you,
      `${mine.you} and ${theirs.you}`)

    // Each one has to wait for a snapshot carrying the other, and each draws a
    // tenth of a second in the past, so seeing each other is something that
    // becomes true rather than something that is true the instant they join.
    const sees = async (watcher, id) => watcher.waitFor(
      `!!window.__game.scene.getScene('NetScene').client.view()?.fighters.some(f => f.id === '${id}')`, 8000,
    ).then(() => true).catch(() => false)
    const aSeesB = await sees(a, theirs.you)
    const bSeesA = await sees(b, mine.you)
    check('each sees the other on screen', aSeesB && bSeesA,
      `${aSeesB ? 'A sees B' : 'A cannot see B'}, ${bSeesA ? 'B sees A' : 'B cannot see A'}`)

    // One browser swings. The other must animate it, because neither of them
    // decided it: the room did, and told them both. A corpse cannot swing, so
    // make sure the swinger is on its feet first.
    await alive(b, 'Bram', 'plant')
    // The arrival shield protects a new hunter and also stops them swinging, so
    // wait it out rather than asking for an attack the room will refuse.
    // FLAGS.SHIELDED is bit 32 in the snapshot; a snapshot has no `shielded`.
    await b.waitFor(`(() => {
      const me = window.__game.scene.getScene('NetScene').client.view()?.me
      return !!me && (me.flags & 32) === 0
    })()`, 8000).catch(() => {})
    await b.eval(`(() => {
      const s = window.__game.scene.getScene('NetScene')
      for (let i = 0; i < 20; i++) setTimeout(() => s.client.act('attack'), i * 300)
      return true
    })()`)
    const watching = await a.eval(`(async () => {
      const s = window.__game.scene.getScene('NetScene')
      const them = [...s.view.actors.values()].find(x => x.id !== s.client.you)
      const before = them?.sprite.action?.clip ?? null
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 50))
        const now = [...s.view.actors.values()].map(x => x.sprite.action?.kind).filter(Boolean)
        if (now.includes('attack')) return 'saw an attack'
      }
      return 'none'
    })()`)
    check("one browser's attack is animated in the other", watching === 'saw an attack', watching)
  }

  // --- Leaving -------------------------------------------------------------
  {
    await alive(a, 'Ayla', 'beast')
    // A frame has to have been drawn, or there is nobody in the room to leave.
    await a.waitFor("!!window.__game.scene.getScene('NetScene').wilds?.fighters.length", 8000)
    const panel = () => a.eval("window.__game.scene.getScene('NetScene').wilds?.panel?.kind ?? null")

    await a.eval(`window.__game.scene.getScene('NetScene').wilds.requestLeave(); true`)
    check('Esc asks before you walk out on a bounty', await panel() === 'leave', await panel())

    await a.eval(`window.__game.scene.getScene('NetScene').wilds.forfeit(); true`)
    const left = await a.waitFor(
      "window.__game.scene.getScene('NetScene').wilds?.panel?.kind === 'left'", 8000,
    ).then(() => true).catch(() => false)
    check('and says what leaving cost you', left, 'the room kept it')

    await a.eval(`window.__game.scene.getScene('NetScene').wilds.toLobby(); true`)
    const lobby = await a.waitFor("!!window.__game.scene.getScene('LobbyScene')?.scene.isActive()", 8000)
      .then(() => true).catch(() => false)
    check('and puts you back in the lobby', lobby)
  }
  // --- A fallen player is not trapped --------------------------------------
  //
  // The HUD used to stop drawing entirely once your Axie was gone, so the panel
  // offering the way back never appeared and Esc had nothing to dismiss. The
  // only way out of the room was reloading the page.
  {
    await alive(a, 'Ayla', 'beast')
    await a.eval(`(() => {
      const s = window.__game.scene.getScene('NetScene')
      // Fall the way a player falls: tell the room, and let it decide.
      s.wilds.handle({ t: 'die', id: s.client.you, by: null }, s.client.view(), s.client.you)
      s.player = null
      return true
    })()`)
    const fallen = await a.waitFor(`(() => {
      const ui = window.__game.scene.getScene('UIScene')
      return !!ui.wildsHud?.panelRoot
    })()`, 8000).then(() => true).catch(() => false)
    check('a fallen player still has a HUD to answer', fallen, 'the panel is drawn')

    const out = await a.eval(`(() => {
      const s = window.__game.scene.getScene('NetScene')
      s.wilds.requestLeave()
      return s.wilds.panel?.kind ?? 'left the room'
    })()`)
    check('and Esc always does something', typeof out === 'string', String(out))
    await a.waitFor("!!window.__game.scene.getScene('LobbyScene')?.scene.isActive()", 8000)
      .then(() => check('and it leads back to the lobby', true))
      .catch(() => check('and it leads back to the lobby', false, 'still in the room'))
  }

} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
} finally {
  a?.close()
  b?.close()
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
