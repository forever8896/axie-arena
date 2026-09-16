/**
 * Verifies power-ups and Moonwells in a real match, in headless Chromium.
 * Needs the dev server running. Usage: node scripts/headless/check-boons.mjs
 */
import { launch } from './cdp.mjs'
const b = await launch({ width: 900, height: 600 })
try {
  await b.goto('http://localhost:5173/')
  await b.waitFor("window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  const out = await b.eval(`(async () => {
    const g = window.__game
    const builds = g.scene.getScene('HomeScene').builds
    const results = []
    const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail })
    const near = (a, b, tol) => Math.abs(a - b) <= tol

    // Stepped by hand at 60fps with the live loop paused, as check-parry does.
    g.loop.sleep()
    let clock = 2e8
    const setup = (playerClass = 'beast', { natural = false } = {}) => {
      ;['UIScene','GameScene','HomeScene','MenuScene'].forEach(k => g.scene.stop(k))
      g.scene.start('GameScene', { builds, playerClass })
      g.scene.stop('UIScene')
      const s = g.scene.getScene('GameScene')
      const stepOnce = () => s.sys.step((clock += 1000 / 60), 1000 / 60)
      stepOnce()
      s.updateAim = () => {}
      s.field.startedAt = s.time.now + 1e9
      s.startedAt = s.time.now
      if (!natural) { s.powerUps.enabled = false; s.moonwells.enabled = false }
      s.bots.forEach((bot, i) => { bot.realBrain = bot.brain; bot.brain = { update() {} }; bot.intent.set(0, 0); bot.vel.set(0, 0); bot.pos.set(250 + i * 90, 250) })
      const wait = ms => { const end = s.time.now + ms; while (s.time.now < end) stepOnce() }
      wait(300)
      return { s, p: s.player, wait }
    }
    const orbOf = (s, type, x, y) => {
      s.powerUps.enabled = true
      s.powerUps.bag = [type]
      const orb = s.powerUps.spawn(s.fighters)
      s.powerUps.enabled = false
      orb.x = x; orb.y = y
      return orb
    }

    // 1. The natural schedule: an orb forms at 8s, can't be taken while forming.
    {
      const { s, p, wait } = setup('beast', { natural: true })
      p.pos.set(1200, 900)
      wait(7600)
      const early = s.powerUps.orbs.length
      wait(700)
      const orb = s.powerUps.orbs[0]
      check('first power-up forms at 8s', early === 0 && orb && !orb.live, 'before=' + early + ' after=' + s.powerUps.orbs.length)
      if (orb) {
        p.pos.set(orb.x, orb.y)
        wait(200)
        check('a forming orb cannot be taken', !orb.dead && s.powerUps.taken === 0, 'taken=' + s.powerUps.taken)
        wait(1500)
        check('a formed orb is taken by walking over it', orb.dead && s.powerUps.taken === 1, 'taken=' + s.powerUps.taken)
      }
      check('orbs spawn clear of walls', !orb || !s.arena.wallAt(orb.x, orb.y, 40), orb && Math.round(orb.x) + ',' + Math.round(orb.y))
    }

    // 2. Fury: +30% damage, then it wears off.
    {
      const { s, p, wait } = setup('beast')
      const bot = s.bots[0]
      p.pos.set(1200, 900); bot.pos.set(1500, 900)
      const orb = orbOf(s, 'fury', 1200, 900)
      wait(1700)
      bot.hp = bot.maxHp; bot.takeDamage(1000, p, 0)
      check('fury adds 30% damage', bot.maxHp - bot.hp === 1300, 'dealt ' + (bot.maxHp - bot.hp))
      wait(7200)
      bot.hp = bot.maxHp; bot.takeDamage(1000, p, 0)
      check('fury wears off after 7s', bot.maxHp - bot.hp === 1000, 'dealt ' + (bot.maxHp - bot.hp))
    }

    // 3. Bulwark: soaks 25% max health, then damage lands.
    {
      const { s, p, wait } = setup('beast')
      const bot = s.bots[0]
      p.pos.set(1200, 900); bot.pos.set(1500, 900)
      orbOf(s, 'bulwark', 1200, 900)
      wait(1700)
      const shield = p.shieldHp
      p.takeDamage(500, bot, 0)
      check('bulwark shield soaks damage', shield === Math.round(p.maxHp * 0.25) && p.hp === p.maxHp, 'shield ' + shield + ' hp ' + p.hp)
      p.takeDamage(500, bot, 0)
      check('damage past the shield lands', p.hp === p.maxHp - (1000 - shield) && !p.buff('bulwark'), 'hp ' + p.hp + '/' + p.maxHp)
    }

    // 4. Tailwind: faster, dashes twice as often.
    {
      const { s, p, wait } = setup('beast')
      p.pos.set(1200, 900)
      const base = p.speed
      orbOf(s, 'tailwind', 1200, 900)
      wait(1700)
      check('tailwind speeds you up 35%', near(p.speed / base, 1.35, 0.01), (p.speed / base).toFixed(2))
      check('tailwind halves dash cooldown', p.dashCooldown === 900, p.dashCooldown)
    }

    // 5. Moonrise: special charged.
    {
      const { s, p, wait } = setup('beast')
      p.pos.set(1200, 900); p.charge = 0.1
      orbOf(s, 'moonrise', 1200, 900)
      wait(1700)
      check('moonrise fills the special', p.charge >= 1, p.charge.toFixed(2))
    }

    // 6. Never the same power-up twice until all have appeared.
    {
      const { s } = setup('beast')
      s.powerUps.bag = []
      const seen = [0, 1, 2, 3].map(() => s.powerUps.nextType())
      check('power-ups cycle without repeats', new Set(seen).size === 4, seen.join(','))
    }

    // 7. Moonwell: nothing while blooming, 8%/s once open, cut by a rival's hit.
    {
      const { s, p, wait } = setup('beast')
      const bot = s.bots[0]
      p.pos.set(1200, 900); bot.pos.set(1600, 900)
      p.hp = p.maxHp * 0.3
      const well = s.moonwells.spawn(s.fighters, { x: 1200, y: 900 })
      wait(2000)
      check('a blooming Moonwell does not heal', p.hp === p.maxHp * 0.3, 'hp ' + Math.round(p.hp))
      wait(600)
      const h0 = p.hp
      wait(2000)
      const rate = (p.hp - h0) / p.maxHp / 2
      check('an open Moonwell heals about 8% per second', near(rate, 0.08, 0.02), (rate * 100).toFixed(1) + '%/s')
      p.takeDamage(10, bot, 0)
      const h1 = p.hp
      wait(1000)
      check('a rival hit stops the healing', p.hp === h1, 'healed ' + Math.round(p.hp - h1))
      wait(800)
      check('healing resumes after the lockout', p.hp > h1, 'healed ' + Math.round(p.hp - h1))
      check('the pool drains and the well shrinks', well.poolLeft < 2400 && well.radius < 115, Math.round(well.poolLeft) + ' left, r ' + Math.round(well.radius))
      p.hp = 10
      well.poolLeft = 300
      const given0 = s.moonwells.healed
      wait(1500)
      check('a Moonwell closes when its pool is spent', (well.dead || well.ending) && s.time.now < well.activeUntil, 'pool ' + Math.round(well.poolLeft) + ' gave ' + Math.round(s.moonwells.healed))
      check('it never gives more than its pool', s.moonwells.healed - given0 <= 300.5, 'gave ' + Math.round(s.moonwells.healed - given0) + ' of 300')
    }

    // 8. Spawns stay inside where the closing field will be.
    {
      const { s } = setup('beast')
      s.field.startedAt = s.time.now - 20000 - 50000
      let worst = 0
      for (let i = 0; i < 20; i++) {
        const w = s.moonwells.spawn(s.fighters)
        const future = s.field.radiusIn(9500)
        worst = Math.max(worst, Math.hypot(w.x - s.field.cx, w.y - s.field.cy) - future)
        w.remove()
      }
      s.moonwells.wells = []
      check('Moonwells spawn inside the future safe field', worst <= 0, 'worst overshoot ' + Math.round(worst))
    }

    // 9. Bots go for what they can reach, and heal when hurt.
    {
      const { s, wait } = setup('beast')
      const bot = s.bots[1]
      bot.brain = bot.realBrain
      s.bots.forEach(o => { if (o !== bot) o.pos.set(200, 200) })
      s.player.pos.set(2200, 1600)
      bot.pos.set(1000, 900)
      const orb = orbOf(s, 'fury', 1300, 900)
      wait(4500)
      check('a bot races to a power-up it can win', orb.dead && bot.buff('fury'), 'orb dead=' + orb.dead)

      bot.hp = bot.maxHp * 0.4
      bot.pos.set(1000, 900)
      const well = s.moonwells.spawn(s.fighters, { x: 1400, y: 900 })
      wait(5000)
      check('a hurt bot heals in a Moonwell', well.contains(bot) && bot.hp > bot.maxHp * 0.4, 'hp ' + Math.round(bot.hp / bot.maxHp * 100) + '%')
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
