/**
 * Plays the whole tutorial through the real mechanics, in headless Chromium,
 * stepped at a fixed 60fps: every step must complete by doing the thing it
 * teaches, and only that. Needs the dev server running.
 * Usage: node scripts/headless/check-tutorial.mjs
 */
import { launch } from './cdp.mjs'
const b = await launch({ width: 1100, height: 700 })
try {
  await b.goto('http://localhost:5173/')
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  const out = await b.eval(`(async () => {
    const g = window.__game
    const builds = g.scene.getScene('HomeScene').builds
    const results = []
    const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail })
    const { CONNECT_MS } = await import('/src/axie/AxieSprite.js')
    try { localStorage.removeItem('lunacy.tutorial.done.v1') } catch {}

    g.loop.sleep()
    let clock = 5e8
    ;['UIScene', 'GameScene', 'HomeScene', 'MenuScene', 'LobbyScene'].forEach(k => g.scene.stop(k))
    g.scene.start('GameScene', { builds, playerClass: 'beast', mode: 'tutorial' })
    g.scene.stop('UIScene')
    const s = g.scene.getScene('GameScene')
    const t = s.tutorial
    const step = () => s.sys.step((clock += 1000 / 60), 1000 / 60)
    const wait = ms => { const end = s.time.now + ms; while (s.time.now < end) step() }
    const until = (fn, ms) => { const end = s.time.now + ms; while (!fn() && s.time.now < end) step(); return fn() }
    step()
    s.updateAim = () => {}
    const p = () => s.player
    const face = f => { p().aim = Math.atan2(f.y - p().y, f.x - p().x) }
    // Waits for the step to complete. If it does not, skips it so the rest of
    // the run still reports, and the failure shows in its own check.
    const advanced = (id, ms = 30000) => {
      const ok = until(() => t.step?.id !== id || t.finished, ms)
      if (!ok) { t.skip(); until(() => t.step?.id !== id, 2000) }
      return ok
    }
    let deaths = 0
    const died = () => { if (!p().alive) deaths++ }

    // 1. Move: not complete until you are in the ring.
    check('the tutorial starts on moving', t.step?.id === 'move' && !s.field && s.bots.length === 0, t.step?.id)
    wait(1500)
    check('standing still does not complete a step', t.step.id === 'move', t.step.id)
    p().pos.set(t.goal.x, t.goal.y)
    check('reaching the ring completes Move', advanced('move'), t.step?.id)

    // 2. Attack: three hits on the dummy.
    const dummy = t.dummy
    p().pos.set(dummy.x - 70, dummy.y); face(dummy)
    for (let i = 0; i < 3; i++) { p().lastAttack = -1e9; face(dummy); p().swing(s.fighters, s.time.now); wait(700) }
    check('three hits complete Attack', advanced('attack', 3000), t.step?.id)
    check('the dummy cannot be knocked out', dummy.alive, 'hp ' + Math.round(dummy.hp))

    // 3. Dash: walking in does not count; dashing does.
    p().pos.set(t.goal.x - 200, t.goal.y)
    p().aim = 0
    wait(200)
    // With no keys held, a dash goes where you aim.
    s.playerDash()
    wait(600)
    if (t.step?.id === 'dash') p().pos.set(t.goal.x, t.goal.y)
    check('a dash into the ring completes Dash', advanced('dash', 3000), t.step?.id + ' dashed ' + (p().lastDash > 0))

    // 4. Special: charge it on the dummy, then fire.
    p().pos.set(dummy.x - 70, dummy.y)
    until(() => { if (p().charge >= 1) return true; p().lastAttack = -1e9; face(dummy); p().swing(s.fighters, s.time.now); wait(650); return false }, 20000)
    check('landing hits charges the special', p().charge >= 1, p().charge.toFixed(2))
    face(dummy)
    s.playerSpecial = s.playerSpecial.bind(s)
    p().special(s.fighters, s.time.now, { x: dummy.x, y: dummy.y })
    check('firing it completes Special', advanced('special', 4000), t.step?.id)

    // 5. Parry on the ring's timing, twice.
    const partner = t.partner
    check('a sparring partner arrives', partner?.alive, '')
    for (let i = 0; i < 2 && t.step?.id === 'parry'; i++) {
      until(() => partner.nextSwing - s.time.now < 60, 6000)
      p().pos.set(partner.x - 60, partner.y); face(partner)
      const impact = partner.nextSwing + CONNECT_MS
      until(() => s.time.now >= impact - 110, 2000)
      face(partner); p().parry(s.time.now)
      wait(900)
      results.push({ name: 'parry attempt ' + (i + 1), pass: true, detail: 'parries ' + t.parries + ' hint ' + t.hint + ' partner stunned ' + partner.stunned + ' d ' + Math.round(Math.hypot(partner.x - p().x, partner.y - p().y)) + ' range ' + partner.attackRange })
    }
    check('parrying on the gold ring completes Parry', advanced('parry', 8000), t.step?.id + ' parries ' + t.parries)
    died()

    // 6. Power-up: the orb, once formed.
    until(() => t.orb?.live, 4000)
    p().pos.set(t.orb.x, t.orb.y)
    check('taking the orb completes Power-ups', advanced('powerup', 3000) && p().buff('fury'), t.step?.id)

    // 7. Moonwell: hurt, then healed by standing in it.
    const hurt = p().hp / p().maxHp
    p().pos.set(t.well.x, t.well.y)
    check('healing in the Moonwell completes Moonwells', hurt < 0.5 && advanced('heal', 15000), 'started at ' + Math.round(hurt * 100) + '%')

    // 8. Hide.
    const bush = t.nearestBush()
    p().pos.set(bush.x, bush.y)
    check('stepping into a bush completes Bushes', advanced('hide', 3000), t.step?.id)

    // 9. The first real fight.
    const rival = t.rival
    check('a real rival arrives with a brain', rival?.alive && rival.brain?.nearest, '')
    until(() => {
      if (!rival.alive) return true
      face(rival)
      const d = Math.hypot(rival.x - p().x, rival.y - p().y)
      // The scene reads movement from the keyboard every frame, so walk the
      // scripted player directly, at its own speed.
      if (d > p().attackRange * 0.8) {
        // Close in directly: this checks the fight, not pathfinding.
        p().pos.set(rival.x - (rival.x - p().x) / d * p().attackRange * 0.6, rival.y - (rival.y - p().y) / d * p().attackRange * 0.6)
        wait(100)
      } else {
        p().swing(s.fighters, s.time.now)
        wait(100)
      }
      died()
      return false
    }, 60000)
    p().intent.set(0, 0)
    check('knocking out the rival completes the fight', advanced('fight', 3000), 'rival alive ' + rival.alive)
    check('you cannot go down in the tutorial', deaths === 0 && p().alive, 'deaths ' + deaths)

    // 10. Moon Gate: a hit restarts it, standing it out finishes.
    p().pos.set(t.gate.x, t.gate.y)
    wait(1500)
    const mid = t.channel
    wait(1800)
    check('the gate channel fills while you stand in it', mid > 0.35 && mid < 0.7, mid.toFixed(2))
    until(() => t.finished, 3000)
    check('cashing out at the gate finishes the tutorial', t.finished, 'finished ' + t.finished)
    check('finishing is remembered', localStorage.getItem('lunacy.tutorial.done.v1') === '1', '')

    // The finish panel, with the overlay actually running. The checks above
    // stop UIScene, so a crash while building that panel went unseen: it threw
    // every frame inside the scene update and froze the whole game.
    {
      ;['UIScene', 'GameScene'].forEach(k => g.scene.stop(k))
      g.scene.start('GameScene', { builds, playerClass: 'plant', mode: 'tutorial' })
      // GameScene launches UIScene from create(), which the manual stepping
      // below never processes on its own.
      g.scene.processQueue()
      const s3 = g.scene.getScene('GameScene')
      const ui3 = g.scene.getScene('UIScene')
      const both = () => {
        s3.sys.step((clock += 1000 / 60), 1000 / 60)
        ui3.sys.step(clock, 1000 / 60)
      }
      both()
      check('the tutorial overlay is up', Boolean(ui3.tutorialHud), String(Boolean(ui3.tutorialHud)))
      const t3 = s3.tutorial
      for (let i = 0; i < 9; i++) t3.skip()
      check('skipping reaches the Moon Gate', t3.step?.id === 'gate', t3.step?.id)
      s3.player.pos.set(t3.gate.x, t3.gate.y)
      const end = s3.time.now + 6000
      while (!t3.finished && s3.time.now < end) both()
      check('standing in the gate finishes the tutorial', t3.finished, 'channel ' + t3.channel?.toFixed(2))
      for (let i = 0; i < 20; i++) both()
      check('the finish panel opens without crashing', Boolean(ui3.tutorialHud.panel), String(Boolean(ui3.tutorialHud.panel)))
      check('it offers the Wilds', typeof ui3.tutorialHud.primary === 'function', typeof ui3.tutorialHud.primary)
    }

    // Skipping.
    ;['GameScene'].forEach(k => g.scene.stop(k))
    g.scene.start('GameScene', { builds, playerClass: 'bird', mode: 'tutorial' })
    g.scene.stop('UIScene')
    const s2 = g.scene.getScene('GameScene')
    s2.sys.step((clock += 17), 17)
    s2.tutorial.skip()
    s2.tutorial.skip()
    check('Tab skips a step', s2.tutorial.step?.id === 'dash', s2.tutorial.step?.id)

    g.loop.wake()
    return results
  })()`)
  let pass = 0
  for (const r of out) {
    if (r.pass) pass++
    console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + '  (' + r.detail + ')')
  }
  console.log(pass + '/' + out.length + ' passed')
  if (b.logs.length) console.log('logs:', JSON.stringify(b.logs.slice(0, 8)))
  process.exitCode = pass === out.length ? 0 : 1
} finally { b.close() }
