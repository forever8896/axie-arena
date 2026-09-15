#!/usr/bin/env node
/**
 * Stake-mode economy model for docs/VISION.md.
 *
 * Simulates an always-on arena of real players with a spread of skill, and
 * compares payout rules on what matters before any real money is involved:
 * how much of what players put in comes back to them, what the operator keeps,
 * who ends up ahead, and what bots paying rewards would cost.
 *
 * Deliberately simple. Fights are duels whose winner is decided by a logistic
 * of the skill gap; `k` sets how much skill matters (a six-way brawl with third
 * parties is closer to the low end). It is a way to compare rules, not a
 * forecast. Usage: node scripts/economy/model.mjs
 */

// Seeded, so the numbers in docs/VISION.md reproduce exactly.
let seed = 20260915
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())

const PLAYERS = 2000
const LIVES_EACH = 40
const ROOM = 12
const CASH_OUT_AFTER_KILL = 0.3   // chance a player leaves after each kill

/**
 * Payout rules. Every rule is a stake of 1 AXS per life.
 *  - death(victim, killer): money moved when a life ends
 *  - leave(p): what a player receives when leaving alive
 */
const RULES = {
  'Proposed: 1 in, 0.6 per kill, stake back if you leave': {
    enter: p => { p.life = 1 },
    death: (v, k, house) => { k.earned += 0.6; house.take += 0.4 },
    leave: p => p.life + 0,
  },
  'Same, 10% rake: 0.9 per kill': {
    enter: p => { p.life = 1 },
    death: (v, k, house) => { k.earned += 0.9; house.take += 0.1 },
    leave: p => p.life,
  },
  'Bounty: 10% entry fee, killer takes the whole bounty': {
    enter: (p, house) => { house.take += 0.1; p.life = 0.9 },
    death: (v, k) => { k.life += v.life },
    leave: p => p.life,
  },
}

const makePlayers = () => Array.from({ length: PLAYERS }, (_, id) => ({
  id, skill: gauss(), livesLeft: LIVES_EACH, paidIn: 0, paidOut: 0, earned: 0, life: 0,
}))

/** Runs one arena over a set of players; returns the operator's take. */
function play(players, rule, k) {
  const house = { take: 0 }
  let biggestCashOut = 0
  const queue = [...players]
  const room = []

  const enter = () => {
    while (room.length < ROOM && queue.length) {
      const i = Math.floor(rand() * queue.length)
      const p = queue.splice(i, 1)[0]
      if (p.livesLeft <= 0) continue
      p.livesLeft--
      p.paidIn += 1
      p.earned = 0
      rule.enter(p, house)
      room.push(p)
    }
  }
  const exit = (p, alive) => {
    room.splice(room.indexOf(p), 1)
    // Per-kill payouts are banked the moment they happen; only the stake (or
    // the bounty) is at risk in a fight.
    const out = (alive ? rule.leave(p) : 0) + p.earned
    p.paidOut += out
    biggestCashOut = Math.max(biggestCashOut, out)
    if (p.livesLeft > 0) queue.push(p)
  }

  enter()
  while (room.length >= 2) {
    const a = room[Math.floor(rand() * room.length)]
    let b = a
    while (b === a) b = room[Math.floor(rand() * room.length)]
    const aWins = rand() < 1 / (1 + Math.exp(-k * (a.skill - b.skill)))
    const [winner, loser] = aWins ? [a, b] : [b, a]
    rule.death(loser, winner, house)
    exit(loser, false)
    if (rand() < CASH_OUT_AFTER_KILL) exit(winner, true)
    enter()
  }
  // Anyone still standing when the queue runs dry cashes out.
  while (room.length) exit(room[0], true)
  return { house: house.take, biggestCashOut }
}

/**
 * `brackets` > 1 matches players into rooms by skill band, as ranked queues
 * do: everyone fights people near their own level.
 */
function simulate(rule, k, brackets = 1) {
  const players = makePlayers()
  const sorted = [...players].sort((x, y) => x.skill - y.skill)
  let houseTake = 0
  let biggestCashOut = 0
  for (let b = 0; b < brackets; b++) {
    const band = sorted.slice((b * PLAYERS) / brackets, ((b + 1) * PLAYERS) / brackets)
    const r = play(band, rule, k)
    houseTake += r.house
    biggestCashOut = Math.max(biggestCashOut, r.biggestCashOut)
  }

  const paidIn = players.reduce((s, p) => s + p.paidIn, 0)
  const paidOut = players.reduce((s, p) => s + p.paidOut, 0)
  const bySkill = [...players].sort((x, y) => x.skill - y.skill)
  const q = n => bySkill.slice((n * PLAYERS) / 4, ((n + 1) * PLAYERS) / 4)
  const ahead = list => list.filter(p => p.paidOut > p.paidIn).length / list.length
  const net = list => list.reduce((s, p) => s + p.paidOut - p.paidIn, 0) / list.length

  return {
    rtp: paidOut / paidIn,
    houseRate: houseTake / paidIn,
    ahead: ahead(players),
    aheadBottom: ahead(q(0)),
    aheadTop: ahead(q(3)),
    netBottom: net(q(0)),
    netTop: net(q(3)),
    biggestCashOut,
  }
}

const pct = v => `${(v * 100).toFixed(0)}%`
const axs = v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

for (const k of [0.6, 1.2]) {
  console.log(`\nSkill weight k=${k} (${k < 1 ? 'luck matters a lot, like a six-way brawl' : 'skill dominates, like a duel'}); ${PLAYERS} players x ${LIVES_EACH} lives at 1 AXS`)
  console.log('| Rule | Returned to players | Operator keeps | Players ahead after 40 lives | Bottom quarter ahead / net | Top quarter ahead / net | Biggest single cash-out |')
  console.log('| --- | --- | --- | --- | --- | --- | --- |')
  for (const [name, rule] of Object.entries(RULES)) {
    for (const brackets of [1, 8]) {
      seed = 20260915
      const r = simulate(rule, k, brackets)
      const label = brackets > 1 ? `${name}, skill-matched rooms` : name
      console.log(`| ${label} | ${pct(r.rtp)} | ${pct(r.houseRate)} | ${pct(r.ahead)} | ${pct(r.aheadBottom)} / ${axs(r.netBottom)} AXS | ${pct(r.aheadTop)} / ${axs(r.netTop)} AXS | ${r.biggestCashOut.toFixed(1)} AXS |`)
    }
  }
}

/**
 * Bots that pay real rewards. A kill on a bot pays from the treasury; a death
 * to a bot sends the stake to the treasury. Who profits depends on skill
 * against the bots, and scripted play is by far the most skilled.
 */
console.log('\nBots paying 0.6 AXS per kill, 1 AXS stake lost to a bot, 2 fights a minute')
console.log('| Who | Wins vs bots | Net per hour | Net per day of 24h scripted play |')
console.log('| --- | --- | --- | --- |')
for (const [who, win] of [['Typical player', 0.55], ['Strong player', 0.75], ['Aim-assisted script', 0.95]]) {
  const fightsPerHour = 120
  const perHour = fightsPerHour * (win * 0.6 - (1 - win) * 1)
  console.log(`| ${who} | ${pct(win)} | ${axs(perHour)} AXS | ${axs(perHour * 24)} AXS |`)
}
const breakEven = 1 / 1.6
console.log(`\nBreak-even win rate against bots: ${pct(breakEven)} (0.6 x w = 1 x (1 - w)).`)
