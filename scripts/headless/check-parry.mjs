/**
 * Verifies the parry rules in a real match, in headless Chromium.
 * Needs the dev server running. Usage: node scripts/headless/check-parry.mjs
 */
import { launch } from './cdp.mjs'
const b = await launch({ width: 900, height: 600 })
try {
  await b.goto('http://localhost:5173/')
  await b.waitFor("window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  const out = await b.eval(`(async () => {
    const g = window.__game
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const builds = g.scene.getScene('HomeScene').builds
    const results = []
    const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail })

    // Fresh match, stepped by hand in exact 16.7ms increments with the browser's
    // own loop paused. Sampling a live loop in headless Chromium, which renders
    // WebGL in software at a few fps, made window-sensitive checks flaky: a
    // 200ms parry window read at 130ms frame boundaries.
    g.loop.sleep()
    let clock = 1e8
    const setup = async (playerClass) => {
      ;['UIScene','GameScene','HomeScene','MenuScene'].forEach(k => g.scene.stop(k))
      g.scene.start('GameScene', { builds, playerClass })
      g.scene.stop('UIScene')
      const s = g.scene.getScene('GameScene')
      const stepOnce = () => s.sys.step((clock += 1000 / 60), 1000 / 60)
      stepOnce()
      s.updateAim = () => {}
      s.matchOver = false
      s.field.startedAt = s.time.now + 1e9
      // Stubbing a brain does not clear the last intent it set: zero it, or the
      // bot keeps walking and drifts out of reach mid-swing.
      // Power-ups and Moonwells would wander into these staged fights.
      s.powerUps.enabled = false
      s.moonwells.enabled = false
      s.bots.forEach((bot, i) => { bot.brain = { update() {} }; bot.intent.set(0, 0); bot.vel.set(0, 0); bot.pos.set(200 + i * 80, 200) })
      const wait = async ms => { const end = s.time.now + ms; while (s.time.now < end) stepOnce() }
      await wait(1500)
      return { s, p: s.player, wait }
    }

    // 1. Parry a basic from the front.
    {
      const { s, p, wait } = await setup('beast')
      const atk = s.bots.find(x => x.axieClass === 'reptile')
      p.pos.set(1200, 900); p.aim = Math.PI; p.charge = 0; p.hp = p.maxHp
      atk.pos.set(1130, 900); atk.aim = 0; atk.lastAttack = -1e9
      // Parry the way a player reads it: shortly after the swing starts, before impact.
      atk.swing(s.fighters, s.time.now)
      await wait(60)
      p.parry(s.time.now)
      await wait(400)
      check('front parry blocks a basic', p.hp === p.maxHp, 'player hp ' + p.hp + '/' + p.maxHp)
      check('attacker is staggered', atk.stunned, 'stunUntil in ' + Math.round(atk.stunUntil - s.time.now) + 'ms')
      check('parry refunds special charge', p.charge >= 0.34, 'charge ' + p.charge.toFixed(2))
      check('clean parry leaves no recovery', !p.parryRecovering && p.canAttack(s.time.now), 'recovering=' + p.parryRecovering)
    }

    // 2. A blow from behind is not parried.
    {
      const { s, p, wait } = await setup('beast')
      const atk = s.bots.find(x => x.axieClass === 'reptile')
      p.pos.set(1200, 900); p.aim = Math.PI; p.hp = p.maxHp
      atk.pos.set(1270, 900); atk.aim = Math.PI; atk.lastAttack = -1e9
      atk.swing(s.fighters, s.time.now)
      await wait(60)
      p.parry(s.time.now)
      await wait(400)
      check('parry does not cover your back', p.hp < p.maxHp, 'player hp ' + p.hp + '/' + p.maxHp)
    }

    // 3. Whiff: committed recovery, then free again; and cooldown blocks a re-parry.
    {
      const { s, p, wait } = await setup('beast')
      p.pos.set(1200, 900); p.aim = Math.PI
      const t0 = s.time.now
      check('parry raises', p.parry(t0), '')
      check('cannot re-parry during cooldown', !p.parry(s.time.now), '')
      await wait(260)
      check('whiff leaves you recovering', p.parryRecovering && !p.canAttack(s.time.now) && !p.canDash(s.time.now), 'recovering=' + p.parryRecovering)
      check('recovery slows you', p.speed < p.baseSpeed * 0.5, 'speed ' + Math.round(p.speed) + ' of ' + Math.round(p.baseSpeed))
      await wait(400)
      check('recovery ends', !p.parryCommitted && p.canAttack(s.time.now), 'committed=' + p.parryCommitted)
      await wait(900)
      check('parry available after cooldown', p.canParry(s.time.now), 'since ' + Math.round(s.time.now - t0) + 'ms')
    }

    // 4. Projectiles are not parryable.
    {
      const { s, p, wait } = await setup('beast')
      const bird = s.bots.find(x => x.axieClass === 'bird')
      p.pos.set(1200, 900); p.aim = Math.PI; p.hp = p.maxHp
      bird.pos.set(1000, 900); bird.aim = 0; bird.charge = 1
      bird.special(s.fighters, s.time.now, { x: 1200, y: 900 })
      await wait(290)                     // telegraph done, feathers in the air
      p.parry(s.time.now)
      await wait(700)
      check('feathers go through a parry', p.hp < p.maxHp, 'player hp ' + p.hp + '/' + p.maxHp)
    }

    // 5. A telegraphed melee special can be parried, and stops a charging beast.
    {
      const { s, p, wait } = await setup('bird')
      const beast = s.bots.find(x => x.axieClass === 'beast')
      p.pos.set(1200, 900); p.aim = Math.PI; p.hp = p.maxHp
      beast.pos.set(1080, 900); beast.aim = 0; beast.charge = 1
      beast.special(s.fighters, s.time.now, { x: 1200, y: 900 })
      // On the game clock, like the charge itself: polling between frames can
      // overshoot by a whole frame and parry after the contact.
      s.time.delayedCall(285, () => p.parry(s.time.now))
      await wait(520)
      check('Impale is parried on reaction', p.hp === p.maxHp, 'player hp ' + p.hp + '/' + p.maxHp)
      check('charging beast is stopped and staggered', !beast.chargeState && beast.stunned, 'charge=' + !!beast.chargeState + ' stunned=' + beast.stunned)
    }

    // 6. Bots bait a parry they have had time to see, and punish the recovery.
    {
      const { s, p, wait } = await setup('beast')
      const { default: BotBrain } = await import('/src/ai/BotBrain.js')
      const atk = s.bots.find(x => x.axieClass === 'reptile')
      atk.brain = new BotBrain(atk, { parryReadChance: 0, parryReadRate: 0, parryReactChance: 0 })
      atk.brain.noticeDelay = 40
      atk.brain.state = 'strike'
      // Record every state the bot passes through: at a few fps it can wait,
      // punish and back off between two samples.
      const seen = []
      const think = atk.brain.update.bind(atk.brain)
      atk.brain.update = (now, t) => { think(now, t); if (seen[seen.length - 1] !== atk.brain.state) seen.push(atk.brain.state) }
      p.pos.set(1200, 900); p.aim = Math.PI; p.hp = p.maxHp
      atk.pos.set(1130, 900); atk.lastAttack = -1e9
      atk.lastAttack = s.time.now - atk.attackCooldown + 150   // attack comes ready in 150ms
      const swingsBefore = atk.lastAttack
      p.parry(s.time.now)
      await wait(240)
      check('bot holds off a parry it has seen', seen.includes('bait') && seen.indexOf('bait') < (seen.indexOf('backoff') === -1 ? Infinity : seen.indexOf('backoff')), 'states ' + seen.join(' > '))
      await wait(420)
      check('bot punishes the recovery', p.hp < p.maxHp, 'player hp ' + p.hp + '/' + p.maxHp)
    }

    // 7. A parry raised just before a bot's swing goes unseen, and lands.
    {
      const { s, p, wait } = await setup('beast')
      const { default: BotBrain } = await import('/src/ai/BotBrain.js')
      const atk = s.bots.find(x => x.axieClass === 'reptile')
      atk.brain = new BotBrain(atk, { parryReadChance: 0, parryReadRate: 0, parryReactChance: 0 })
      atk.brain.noticeDelay = 190
      atk.brain.state = 'strike'
      p.pos.set(1200, 900); p.aim = Math.PI; p.hp = p.maxHp
      atk.pos.set(1130, 900); atk.lastAttack = -1e9
      // Parry, then let the bot decide on this same tick: frame rate cannot put
      // a gap between them. The parry is 0ms old, far under its 190ms notice.
      p.parry(s.time.now)
      atk.brain.update(s.time.now, s.fighters)
      await wait(500)
      check('a well-timed parry is not noticed, and lands', p.hp === p.maxHp && atk.stunUntil > p.lastParry, 'hp ' + p.hp + ' staggered=' + (atk.stunUntil > p.lastParry))
    }
    g.loop.wake()
    return results
  })()`)
  let failed = 0
  for (const r of out) { if (!r.pass) failed++; console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`) }
  console.log(`\n${out.length - failed}/${out.length} passed`)
  if (b.logs.length) console.log('logs:', JSON.stringify(b.logs.slice(0, 5)))
  process.exitCode = failed ? 1 : 0
} finally { b.close() }
