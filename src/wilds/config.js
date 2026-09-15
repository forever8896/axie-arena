/**
 * The Endless Wilds prototype: rules and rooms.
 *
 * A playable model of the design in docs/VISION.md. Balances are simulated and
 * carry no value, and every other hunter is an AI stand-in for a player, which
 * the game says wherever it matters.
 */

export const WILDS = {
  feeRate: 0.1,            // of the stake, kept by the operator; the rest is your bounty
  extractMs: 3000,         // channel time at a Moon Gate
  gateRadius: 70,
  gatesOpen: 2,
  gateRotateMs: 40000,     // one open gate moves on this cycle
  gateWarnMs: 8000,        // a closing gate says so before it goes
  spawnShieldMs: 2500,
  maxHunters: 8,           // you plus up to seven
  joinGapMs: 3500,         // at least this long between arrivals
  retargetMs: [20000, 35000],
  bloodMoonEvery: 70000,
  bloodMoonMs: 20000,
  bloodMoonRadius: 260,
  cacheLifetimeMs: 30000,  // a bounty dropped with no killer stays this long
  startingBalance: 25,
}

export const ROOMS = [
  {
    id: 'meadow', name: 'Moonpetal Meadow', stake: 10, currency: 'PTS', free: true,
    blurb: 'Free. Bounties are season points.', hunters: [5, 7],
  },
  {
    id: 'glade', name: 'Dewdrop Glade', stake: 0.1, currency: 'AXS',
    blurb: 'Low stakes. Learn the gates.', hunters: [4, 7],
  },
  {
    id: 'grove', name: 'Silverbark Grove', stake: 1, currency: 'AXS',
    blurb: 'The standard table.', hunters: [5, 7],
  },
  {
    id: 'summit', name: 'Bloodmoon Summit', stake: 5, currency: 'AXS',
    blurb: 'High stakes, fewer hunters.', hunters: [3, 5],
  },
]

const FIRST = ['Moss', 'Puff', 'Tide', 'Ember', 'Clover', 'Bramble', 'Pebble', 'Nimbus', 'Thistle', 'Fern',
  'Maple', 'Drizzle', 'Sprout', 'Cinder', 'Pippin', 'Juniper', 'Wisp', 'Bog', 'Honey', 'Luna']
const LAST = ['bean', 'whisker', 'paw', 'tail', 'horn', 'fluff', 'snout', 'wing', 'shell', 'fin',
  'claw', 'nib', 'tuft', 'berry', 'spark', 'root']

export function hunterName(taken = new Set()) {
  for (let i = 0; i < 50; i++) {
    const n = FIRST[Math.floor(Math.random() * FIRST.length)] + LAST[Math.floor(Math.random() * LAST.length)]
    if (!taken.has(n)) return n
  }
  return `Hunter${Math.floor(Math.random() * 999)}`
}

/** Two decimals for AXS, whole numbers for points. */
export function money(value, currency) {
  return currency === 'PTS' ? `${Math.round(value)} PTS` : `${value.toFixed(2)} AXS`
}
