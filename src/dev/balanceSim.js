import BotBrain from '../ai/BotBrain.js'

/**
 * Headless balance simulation. Dev builds only: open `/?sim=60`.
 *
 * Runs bot-only free-for-alls with update-only stepping (no rendering, no
 * HUD), rotating which class takes the centre spawn so no class is favoured
 * by seat. Reports win rate, average placement and match length per class.
 *
 * This follows the shape of Riot's champion balance framework: decide with
 * measured win rates against a band, not with feel. In a six-way FFA a
 * perfectly balanced class wins 1 in 6 (16.7%). Bot skill dominates these
 * numbers, so treat them as a check for gross imbalance, not as final truth.
 */

const CLASSES = ['beast', 'aquatic', 'plant', 'bird', 'bug', 'reptile']
const DT = 16.7

// Game time must only ever move forward across matches. Restarting it from
// performance.now() each match put the new clock behind the scene's existing
// one, which stalled it: the closing field then never activated in five of
// every six matches, and the first three balance runs were invalid.
let simClock = 1e7
const parryStats = { attempts: 0, successes: 0 }
const boonStats = { powerUps: 0, healed: 0, wells: 0, byClass: {} }

export async function runBalanceSim(game, builds, matches) {
  const results = []
  const status = document.createElement('pre')
  status.style.cssText =
    'position:fixed;inset:0;margin:0;padding:24px;background:#16200f;color:#e8f0d6;' +
    'font:13px ui-monospace,monospace;overflow:auto;z-index:10;white-space:pre'
  document.body.appendChild(status)

  for (let i = 0; i < matches; i++) {
    const seat = CLASSES[i % CLASSES.length]
    results.push({ seat, ...simulate(game, builds, seat) })
    status.textContent = `Simulating ${i + 1} / ${matches}…`
    // Yield occasionally so the page stays responsive. Not every match:
    // background tabs clamp timers to about one per second.
    if (i % 6 === 5) await new Promise(r => setTimeout(r, 0))
  }

  const report = summarise(results)
  window.__balance = { results, report, boonStats: { perMatchPowerUps: +(boonStats.powerUps / matches).toFixed(1), perMatchHealed: Math.round(boonStats.healed / matches), perMatchWells: +(boonStats.wells / matches).toFixed(2), byClass: Object.fromEntries(Object.entries(boonStats.byClass).map(([c, r]) => [c, { powerUps: +(r.powerUps / matches).toFixed(2), healed: Math.round(r.healed / matches) }])) }, parryStats: { ...parryStats, perMatch: +(parryStats.attempts / matches).toFixed(1), successRate: +(parryStats.successes / Math.max(1, parryStats.attempts)).toFixed(2) } }
  status.textContent = format(report, matches)
  return report
}

function simulate(game, builds, seat) {
  game.scene.stop('ResultScene')
  game.scene.stop('UIScene')
  game.scene.stop('GameScene')
  game.scene.start('GameScene', { builds, playerClass: seat })
  game.scene.stop('UIScene')

  const s = game.scene.getScene('GameScene')
  s.sys.step((simClock += DT), DT)

  // The field stamps its start from whichever clock was live when the scene
  // was created, which is not the simulation clock. Re-stamp it here, or the
  // field is born fully closed and the match lasts eight seconds.
  s.field.startedAt = s.time.now
  s.startedAt = s.time.now
  // /?sim=120&boons=orbs|wells|none isolates one system's effect on balance.
  const boons = new URLSearchParams(location.search).get('boons') ?? 'all'
  s.powerUps.enabled = boons === 'all' || boons === 'orbs'
  s.moonwells.enabled = boons === 'all' || boons === 'wells'
  const spawnWell = s.moonwells.spawn.bind(s.moonwells)
  s.moonwells.spawn = (...a) => { const w = spawnWell(...a); if (w) boonStats.wells++; return w }

  // No seat is human. matchOver suppresses keyboard input and the result
  // screen; the closing field is then driven manually below.
  s.matchOver = true
  s.player.brain = new BotBrain(s.player)
  s.bots.push(s.player)
  for (const f of s.fighters) {
    const parry = f.parry.bind(f)
    f.parry = now => { const ok = parry(now); if (ok) parryStats.attempts++; return ok }
    const tryParry = f.tryParry.bind(f)
    f.tryParry = attacker => { const ok = tryParry(attacker); if (ok) parryStats.successes++; return ok }
    const row = boonStats.byClass[f.axieClass] ??= { powerUps: 0, healed: 0 }
    const apply = f.applyPowerUp.bind(f)
    f.applyPowerUp = (...a) => { row.powerUps++; return apply(...a) }
    const heal = f.heal.bind(f)
    f.heal = amount => { const got = heal(amount); row.healed += got; return got }
  }

  const everyone = s.fighters
  const deaths = []
  let sim = 0

  let tieWinner = null
  while (everyone.filter(f => f.alive).length > 1 && sim < 160000) {
    const before = everyone.filter(f => f.alive).map(f => ({ f, hp: f.hp }))
    s.sys.step((simClock += DT), DT)
    s.field.update(everyone)
    sim += DT

    const fell = before.filter(b => !b.f.alive)
    // Fewest-HP falls first, so simultaneous deaths still order cleanly.
    fell.sort((a, b) => a.hp - b.hp).forEach(b => deaths.push(b.f.axieClass))

    // Everyone left died on the same tick: the healthiest going in wins.
    if (fell.length && everyone.every(f => !f.alive)) {
      tieWinner = fell[fell.length - 1].f.axieClass
      deaths.pop()
    }
  }

  boonStats.powerUps += s.powerUps.taken
  boonStats.healed += s.moonwells.healed

  if (sim > 30000 && !s.field.active) {
    throw new Error('closing field never activated: simulation clock is not advancing')
  }
  // Nothing legitimate ends a six-way match this fast with a ~5s time-to-kill.
  if (sim < 15000) {
    throw new Error(`match ended in ${(sim / 1000).toFixed(1)}s: field timing is broken`)
  }

  const alive = everyone.filter(f => f.alive)
  if (tieWinner) {
    return { winner: tieWinner, placements: [tieWinner, ...deaths.reverse()], seconds: sim / 1000 }
  }
  // Placement: last to die places second, and so on. Survivors share first.
  const order = [...alive.map(f => f.axieClass), ...deaths.reverse()]
  return {
    winner: alive.length === 1 ? alive[0].axieClass : null,
    placements: order,
    seconds: sim / 1000,
  }
}

function summarise(results) {
  const by = Object.fromEntries(CLASSES.map(c => [c, { wins: 0, placeSum: 0, games: 0 }]))
  let totalSeconds = 0
  let draws = 0

  for (const r of results) {
    totalSeconds += r.seconds
    if (!r.winner) draws++
    else by[r.winner].wins++
    r.placements.forEach((cls, i) => {
      if (!by[cls]) return
      by[cls].placeSum += i + 1
      by[cls].games++
    })
  }

  const rows = CLASSES.map(c => ({
    cls: c,
    winRate: by[c].wins / results.length,
    avgPlace: by[c].games ? by[c].placeSum / by[c].games : 0,
  }))
  return { rows, draws, avgSeconds: totalSeconds / results.length }
}

function format(report, matches) {
  const fair = 1 / 6
  const lines = [
    `LUNACY BALANCE SIMULATION — ${matches} bot-only matches`,
    '',
    `Fair win rate in a six-way free-for-all: ${(fair * 100).toFixed(1)}%`,
    `Average match length: ${report.avgSeconds.toFixed(1)}s     Draws: ${report.draws}`,
    // One standard deviation on a fair win rate at this sample size. Swings
    // inside about two of these are noise, not balance.
    `Noise: ±${(Math.sqrt(fair * (1 - fair) / matches) * 100).toFixed(1)}pt at 1σ; ` +
      `flags need about 2σ (±${(2 * Math.sqrt(fair * (1 - fair) / matches) * 100).toFixed(1)}pt)`,
    '',
    'class      win rate   vs fair    avg place',
    '─────────────────────────────────────────────',
  ]
  for (const r of [...report.rows].sort((a, b) => b.winRate - a.winRate)) {
    const delta = (r.winRate - fair) * 100
    const sigma = Math.sqrt(fair * (1 - fair) / matches) * 100
    const flag = delta > 2 * sigma ? '  ▲ strong' : delta < -2 * sigma ? '  ▼ weak' : ''
    lines.push(
      `${r.cls.padEnd(10)} ${(r.winRate * 100).toFixed(1).padStart(6)}%  ` +
      `${(delta >= 0 ? '+' : '') + delta.toFixed(1).padStart(5)}pt  ` +
      `${r.avgPlace.toFixed(2).padStart(8)}${flag}`,
    )
  }
  lines.push('', 'Results are also on window.__balance.')
  return lines.join('\n')
}
