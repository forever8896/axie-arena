/**
 * Verifies the Endless Wilds prototype, and the Showdown restart fix, in real
 * scenes in headless Chromium. Stepped at a fixed 60fps, as check-parry does.
 * Needs the dev server running. Usage: node scripts/headless/check-wilds.mjs
 */
import { launch } from './cdp.mjs'
const b = await launch({ width: 1100, height: 700 })
try {
  await b.goto('http://localhost:5173/')
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  const out = await b.eval(`(async () => {
    const g = window.__game
    const builds = g.scene.getScene('HomeScene').builds
    const { wallet } = await import('/src/wilds/Wallet.js')
    const { ROOMS, WILDS } = await import('/src/wilds/config.js')
    const grove = ROOMS.find(r => r.id === 'grove')
    const results = []
    const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail })
    const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

    g.loop.sleep()
    let clock = 3e8
    const stepScene = s => s.sys.step((clock += 1000 / 60), 1000 / 60)
    const all = ['UIScene', 'GameScene', 'HomeScene', 'MenuScene', 'LobbyScene']

    // 1. Showdown: a restart after time away starts a fresh match.
    {
      all.forEach(k => g.scene.stop(k))
      g.scene.start('GameScene', { builds, playerClass: 'beast' })
      let s = g.scene.getScene('GameScene')
      for (let i = 0; i < 120; i++) stepScene(s)
      s.scene.pause()
      clock += 30000   // thirty seconds on the result screen
      all.forEach(k => g.scene.stop(k))
      g.scene.start('GameScene', { builds, playerClass: 'beast' })
      s = g.scene.getScene('GameScene')
      stepScene(s)
      check('a restarted Showdown starts its clock fresh', s.time.now - s.field.startedAt < 20 && !s.field.active && s.field.progress === 0,
        'since start ' + Math.round(s.time.now - s.field.startedAt) + 'ms, progress ' + s.field.progress)
    }

    const enterWilds = (room = grove) => {
      all.forEach(k => g.scene.stop(k))
      g.scene.start('GameScene', { builds, playerClass: 'beast', mode: 'wilds', room, snapshot: { hunters: 5, topBounty: 3 } })
      g.scene.stop('UIScene')
      const s = g.scene.getScene('GameScene')
      const step = () => stepScene(s)
      const wait = ms => { const end = s.time.now + ms; while (s.time.now < end) step() }
      step()
      s.cameras.main.postFX?.clear()
      s.updateAim = () => {}
      return { s, w: s.wilds, step, wait }
    }
    const freeze = s => s.bots.forEach(bot => { bot.brain = { update() {} }; bot.intent.set(0, 0); bot.vel.set(0, 0) })

    // 2. Entering: the stake buys a bounty, less the fee.
    {
      wallet.topUp()
      wallet.state.AXS = 25
      const before = wallet.balance('AXS')
      const { s, w } = enterWilds()
      const p = s.player
      check('entering pays the stake', near(wallet.balance('AXS'), before - 1), wallet.balance('AXS').toFixed(2))
      check('the stake buys a 90% bounty', near(p.wilds.bounty, 0.9), p.wilds.bounty)
      check('the room is already full of hunters', s.bots.filter(b => b.alive).length === 5, s.bots.length)
      check('two Moon Gates are open', w.gates.filter(g => g.open).length === WILDS.gatesOpen, w.gates.map(g => g.open).join(','))
      check('there is no closing field in the Wilds', s.field === null, String(s.field))
    }

    // 3. Arrival shield.
    {
      const { s, w, wait } = enterWilds()
      freeze(s)
      const p = s.player
      const bot = s.bots[0]
      bot.pos.set(p.x + 60, p.y)
      p.takeDamage(500, bot, 0)
      check('arrival shield blocks damage', p.hp === p.maxHp, 'hp ' + p.hp)
      check('arrival shield blocks attacking', !p.canAttack(s.time.now), 'canAttack ' + p.canAttack(s.time.now))
      wait(WILDS.spawnShieldMs + 100)
      check('the shield lifts after 2.5s', !p.shielded && p.canAttack(s.time.now), 'shielded ' + p.shielded)
    }

    // 4. A kill takes the whole bounty.
    {
      const { s, w, wait } = enterWilds()
      freeze(s)
      wait(WILDS.spawnShieldMs + 100)
      const p = s.player
      const bot = s.bots.find(b => b.alive)
      bot.spawnShieldUntil = 0; bot.invulnerableUntil = 0
      const theirs = bot.wilds.bounty
      bot.hp = 1
      bot.takeDamage(50, p, 0)
      check('a kill takes the whole bounty', near(p.wilds.bounty, 0.9 + theirs), p.wilds.bounty.toFixed(3) + ' after taking ' + theirs.toFixed(3))
      check('value is conserved after a kill', near(w.imbalance, 0), w.imbalance)
    }

    // 5. Falling, then re-entering.
    {
      const { s, w, wait } = enterWilds()
      freeze(s)
      wait(WILDS.spawnShieldMs + 100)
      const p = s.player
      const bot = s.bots.find(b => b.alive)
      const before = bot.wilds.bounty
      const deaths = wallet.session.deaths
      p.hp = 1
      p.takeDamage(50, bot, 0)
      check('your fall pays your killer', near(bot.wilds.bounty, before + 0.9), bot.wilds.bounty.toFixed(3))
      check('a fall opens the fell panel, not a match end', w.panel?.kind === 'fell' && !s.matchOver, JSON.stringify(w.panel))
      check('the fall is recorded', wallet.session.deaths === deaths + 1, wallet.session.deaths)
      const bal = wallet.balance('AXS')
      w.reenter()
      check('re-entering pays again and puts you back', near(wallet.balance('AXS'), bal - 1) && s.player.alive && s.player !== p && s.player.shielded,
        wallet.balance('AXS').toFixed(2))
      check('value is conserved through a fall and re-entry', near(w.imbalance, 0), w.imbalance)
    }

    // 6. Extraction at a Moon Gate.
    {
      const { s, w, wait } = enterWilds()
      freeze(s)
      s.bots.forEach(b => b.pos.set(200, 200))
      const p = s.player
      const gate = w.gates.find(g => g.open)
      p.pos.set(gate.x, gate.y)
      const bal = wallet.balance('AXS')
      wait(WILDS.extractMs - 300)
      check('standing in a gate channels, not instant', p.alive && p.channel && p.channel.progress > 0.8, p.channel?.progress)
      wait(500)
      check('a full channel cashes out the bounty', !p.alive && near(wallet.balance('AXS'), bal + 0.9) && w.panel?.kind === 'extracted',
        'balance ' + wallet.balance('AXS').toFixed(2) + ' panel ' + w.panel?.kind)
      check('value is conserved through extraction', near(w.imbalance, 0), w.imbalance)
    }

    // 7. A hit restarts the channel.
    {
      const { s, w, wait } = enterWilds()
      freeze(s)
      wait(WILDS.spawnShieldMs + 100)
      const p = s.player
      const bot = s.bots.find(b => b.alive)
      const gate = w.gates.find(g => g.open)
      p.pos.set(gate.x, gate.y)
      wait(1800)
      p.takeDamage(10, bot, 0)
      wait(100)
      const after = p.channel?.progress ?? -1
      wait(1500)
      check('a hit restarts the extraction', after < 0.1 && p.alive && p.channel.progress < 0.6, 'progress after hit ' + after.toFixed(2))
    }

    // 8. Leaving without a gate drops the bounty for someone else.
    {
      const { s, w, wait } = enterWilds()
      freeze(s)
      const p = s.player
      const x = p.x, y = p.y
      w.requestLeave()
      check('Esc asks before leaving', w.panel?.kind === 'leave' && p.alive, w.panel?.kind)
      w.forfeit()
      const cache = w.caches[0]
      check('leaving drops your bounty where you stood', cache && near(cache.amount, 0.9) && !p.alive, cache && cache.amount)
      const bot = s.bots.find(b => b.alive)
      const before = bot.wilds.bounty
      bot.pos.set(x, y)
      wait(100)
      check('another hunter can pick it up', near(bot.wilds.bounty, before + 0.9) && w.caches.length === 0, bot.wilds.bounty.toFixed(3))
      check('value is conserved through a dropped bounty', near(w.imbalance, 0), w.imbalance)
    }

    // 9. The room never ends: everyone else falls, and new hunters arrive.
    {
      const { s, w, wait } = enterWilds()
      s.bots.forEach(b => { b.spawnShieldUntil = 0; b.invulnerableUntil = 0; b.hp = 1; b.takeDamage(50, s.player, 0) })
      const empty = s.bots.filter(b => b.alive).length
      wait(12000)
      check('the room never ends', !s.matchOver && s.sys.isActive(), 'matchOver ' + s.matchOver)
      check('new hunters arrive when it empties', empty === 0 && s.bots.filter(b => b.alive).length >= 2, 'alive ' + s.bots.filter(b => b.alive).length)
    }

    // 10. Four minutes of a living room: conservation, population, gates, events.
    {
      const { s, w, wait } = enterWilds()
      const p = s.player
      p.invulnerableUntil = Infinity   // a spectator seat, so the room runs on its own
      p.pos.set(1200, 900)
      let worst = 0, minAlive = 99, maxAlive = 0, maxArray = 0, gatesOk = true, sawBlood = false
      for (let t = 0; t < 240; t++) {
        wait(1000)
        worst = Math.max(worst, Math.abs(w.imbalance))
        const alive = s.fighters.filter(f => f.alive).length
        minAlive = Math.min(minAlive, alive); maxAlive = Math.max(maxAlive, alive)
        maxArray = Math.max(maxArray, s.fighters.length)
        if (w.gates.filter(g => g.open).length < 1) gatesOk = false
        if (w.hotspot) sawBlood = true
      }
      const log = w.events.map(e => e.text).join(' | ')
      check('value is conserved over four minutes', worst < 1e-6, 'worst imbalance ' + worst)
      check('the room stays populated', minAlive >= 3 && maxAlive <= WILDS.maxHunters, 'alive between ' + minAlive + ' and ' + maxAlive)
      check('fallen hunters are cleaned up', maxArray <= WILDS.maxHunters + 6, 'largest fighters array ' + maxArray)
      check('a Moon Gate is always open', gatesOk, '')
      check('hunters extract with real bounties', w.ledger.extracted > 0, 'extracted ' + w.ledger.extracted.toFixed(2) + ' AXS')
      check('a Blood Moon rose', sawBlood, '')
      check('fees match arrivals', w.ledger.fees > 0, 'fees ' + w.ledger.fees.toFixed(2))
    }

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
