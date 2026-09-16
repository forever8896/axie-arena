#!/usr/bin/env node
/**
 * The balance simulation, run against the headless simulation in src/sim/.
 *
 * The browser version of this (src/dev/balanceSim.js, /?sim=120) takes minutes
 * because it drives real scenes. This runs the same fights as pure logic in a
 * couple of seconds, and its numbers are the check that the port kept the game
 * the balance was measured on.
 *
 * Usage: node scripts/sim-balance.mjs [matches]
 */
import SimRoom from '../src/sim/room.js'

const CLASSES = ['beast', 'aquatic', 'plant', 'bird', 'bug', 'reptile']
const DT = 1000 / 60
const matches = Number(process.argv[2]) || 120

const results = []
for (let m = 0; m < matches; m++) {
  const room = new SimRoom({ mode: 'showdown', seed: 1000 + m })
  // One of each class; the seat order rotates so no class is favoured by spawn.
  const order = CLASSES.map((_, i) => CLASSES[(i + m) % CLASSES.length])
  for (const cls of order) room.addFighter({ axieClass: cls, bot: true, name: cls })

  const deaths = []
  let elapsed = 0
  while (room.fighters.filter(f => f.alive).length > 1 && elapsed < 160000) {
    const before = room.fighters.filter(f => f.alive).map(f => ({ f, hp: f.hp }))
    room.step(DT)
    room.drainEvents()
    elapsed += DT
    const fell = before.filter(b => !b.f.alive)
    fell.sort((a, b) => a.hp - b.hp).forEach(b => deaths.push(b.f.axieClass))
  }
  const alive = room.fighters.filter(f => f.alive)
  results.push({
    winner: alive.length === 1 ? alive[0].axieClass : null,
    placements: [...alive.map(f => f.axieClass), ...deaths.reverse()],
    seconds: elapsed / 1000,
  })
}

const by = Object.fromEntries(CLASSES.map(c => [c, { wins: 0, placeSum: 0, games: 0 }]))
let seconds = 0
let draws = 0
for (const r of results) {
  seconds += r.seconds
  if (!r.winner) draws++
  else by[r.winner].wins++
  r.placements.forEach((cls, i) => {
    if (!by[cls]) return
    by[cls].placeSum += i + 1
    by[cls].games++
  })
}

const fair = 1 / 6
const sigma = Math.sqrt((fair * (1 - fair)) / matches) * 100
console.log(`LUNACY BALANCE — ${matches} bot-only matches on the headless simulation\n`)
console.log(`Fair win rate: ${(fair * 100).toFixed(1)}%   average match ${(seconds / matches).toFixed(1)}s   draws ${draws}`)
console.log(`Noise: ±${sigma.toFixed(1)}pt at 1σ; flags need about 2σ (±${(2 * sigma).toFixed(1)}pt)\n`)
console.log('class      win rate   vs fair    avg place')
console.log('─────────────────────────────────────────────')
const rows = CLASSES.map(c => ({
  cls: c,
  winRate: by[c].wins / matches,
  avgPlace: by[c].games ? by[c].placeSum / by[c].games : 0,
})).sort((a, b) => b.winRate - a.winRate)
let worst = 0
for (const r of rows) {
  const delta = (r.winRate - fair) * 100
  worst = Math.max(worst, Math.abs(delta) / sigma)
  const flag = delta > 2 * sigma ? '  ▲ strong' : delta < -2 * sigma ? '  ▼ weak' : ''
  console.log(
    `${r.cls.padEnd(10)} ${(r.winRate * 100).toFixed(1).padStart(6)}%  ` +
    `${(delta >= 0 ? '+' : '') + delta.toFixed(1).padStart(5)}pt  ${r.avgPlace.toFixed(2).padStart(8)}${flag}`,
  )
}
console.log(`\nwidest gap: ${worst.toFixed(1)}σ`)
