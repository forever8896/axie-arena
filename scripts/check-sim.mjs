#!/usr/bin/env node
/**
 * Rules checks for the headless simulation — the authority the server runs.
 *
 * No browser and no renderer, so this is the fast check: every combat rule,
 * every boon, and the Wilds economy, in about a second.
 *
 * Usage: node scripts/check-sim.mjs
 */
import SimRoom from '../src/sim/room.js'
import { CLASS_KITS, PARRY } from '../src/axie/classKits.js'
import { WILDS, ROOMS } from '../src/wilds/config.js'
import { MOONWELL, POWERUPS } from '../src/arena/boonConfig.js'
import { CONNECT_MS } from '../src/sim/constants.js'
import { SWING, GUARD, STAMINA, PACE, phasesFor, damageFor } from '../src/axie/combatConfig.js'

/** A swing winds up before it lands; wait out the longest of them. */
const CONTACT = Math.max(...Object.values(CLASS_KITS).map(k => phasesFor(k).windupMs)) + 60
/** Damage is paced down so a fight holds more than one decision. */
const paced = raw => Math.round(raw * PACE.damage)
/** What one blow is worth: the class's old rate, delivered in one commitment. */
const blow = cls => damageFor(CLASS_KITS[cls])

const DT = 1000 / 60
let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

/** A room with two fighters at a set distance, past their opening cooldowns. */
function duel({ a = 'beast', b = 'plant', gap = 60, mode = 'showdown', room = null } = {}) {
  const r = new SimRoom({ mode, room, seed: 42 })
  if (r.field) r.field.startedAt = 1e9
  const A = r.addFighter({ axieClass: a, name: 'A', x: 1200, y: 900 })
  const B = r.addFighter({ axieClass: b, name: 'B', x: 1200 + gap, y: 900 })
  A.aim = 0
  B.aim = Math.PI
  const step = (ms = DT) => { r.step(ms); A.aim = A.aim; }
  const wait = ms => { const end = r.now + ms; while (r.now < end) r.step(DT) }
  wait(1200)
  r.drainEvents()
  return { r, A, B, wait }
}

// --- Basics ---------------------------------------------------------------
{
  for (const cls of Object.keys(CLASS_KITS)) {
    const { r, A, B, wait } = duel({ a: cls, gap: 60 })
    B.maxHp = 1e6
    B.hp = 1e6
    A.aim = 0
    r.useBasic(A)
    wait(CONTACT)
    const dealt = 1e6 - B.hp
    const expected = paced(blow(cls)) * (CLASS_KITS[cls].basic.hits ?? 1)
    check(`${cls} basic lands after its wind-up`, dealt === expected, `${dealt} of ${expected}`)
  }
}

// --- A blow only lands inside the cone -------------------------------------
{
  const { r, A, B, wait } = duel({ a: 'beast', gap: 60 })
  A.aim = Math.PI     // aimed away
  r.useBasic(A)
  wait(CONTACT)
  check('a blow aimed away misses', B.hp === B.maxHp, `hp ${B.hp}`)

  const far = duel({ a: 'beast', gap: 400 })
  far.A.aim = 0
  far.r.useBasic(far.A)
  far.wait(CONTACT)
  check('a blow out of reach misses', far.B.hp === far.B.maxHp, `hp ${far.B.hp}`)
}

// --- The guard ------------------------------------------------------------
//
// The parry's 200ms window is gone. In its place a guard you hold: a decision
// with a cost rather than a reaction inside a gate nobody on a real connection
// can hit. See docs/COMBAT.md.
{
  const { r, A, B, wait } = duel({ a: 'beast', b: 'reptile', gap: 60 })
  B.aim = Math.PI
  const full = B.maxHp
  // Raise the guard and hold it, the way a player holds the key.
  const holdFor = ms => { const end = r.now + ms; while (r.now < end) { B.hold(r.now); r.step(DT) } }
  B.hold(r.now)
  holdFor(GUARD.raiseMs + 20)
  check('a guard comes up', B.guarding, `stamina ${Math.round(B.stamina)}`)

  r.useBasic(A)
  holdFor(CONTACT)
  const taken = full - B.hp
  const unguarded = paced(blow('beast'))
  check('a guard takes most of a blow', taken > 0 && taken < unguarded * 0.5, `${taken} of ${unguarded}`)
  check('and blocking earns a riposte', B.riposting, `${Math.round(B.riposteUntil - r.now)}ms left`)
  check('and costs stamina', B.stamina < STAMINA.max, Math.round(B.stamina))

  // A riposte hits harder and comes out faster: the opening is real.
  const before = A.hp
  B.aim = Math.PI          // A stands to B's left; face them to answer
  r.useBasic(B)
  wait(SWING.windupMs * GUARD.riposteWindup + 60)
  const answered = before - A.hp
  check('a riposte answers harder', answered > paced(blow('reptile')), `${answered} dealt`)
}
{
  // A guard is not a wall: hold it long enough and it breaks.
  const { r, B, wait } = duel({ a: 'beast', b: 'plant', gap: 60 })
  B.stamina = 8
  B.hold(r.now)
  const end = r.now + GUARD.raiseMs + 400
  while (r.now < end) { B.hold(r.now); r.step(DT) }
  check('an empty guard breaks', B.guardBroken, `stamina ${Math.round(B.stamina)}`)
  check('and leaves you open', !B.canAttack(r.now) && !B.guarding, 'cannot act')
}
{
  // Facing still matters: a guard covers the front, not the back.
  const { r, A, B, wait } = duel({ a: 'beast', b: 'reptile', gap: 60 })
  B.aim = 0          // facing away from A
  const holdFor = ms => { const end = r.now + ms; while (r.now < end) { B.hold(r.now); r.step(DT) } }
  holdFor(GUARD.raiseMs + 20)
  const full = B.hp
  r.useBasic(A)
  holdFor(CONTACT)
  check('a guard does not cover your back', full - B.hp === paced(blow('beast')), `${full - B.hp} taken`)
}
{
  // Stamina is the clock the fight is played against.
  const { r, A, wait } = duel({ a: 'beast', gap: 60 })
  A.stamina = STAMINA.floor - 1
  check('a winded fighter cannot swing', !A.canAttack(r.now), `stamina ${Math.round(A.stamina)}`)
  wait(STAMINA.idleMs + 1200)
  check('and gets it back by not spending', A.canAttack(r.now), `stamina ${Math.round(A.stamina)}`)
}

// --- Poison, stun, slow, shields ------------------------------------------
{
  const { r, A, B, wait } = duel({ a: 'bug', gap: 60 })
  r.useBasic(A)
  wait(CONTACT)
  const afterHit = B.hp
  wait(CLASS_KITS.bug.basic.poison.interval * 3 + 100)
  const poisonDealt = afterHit - B.hp
  const expected = paced(CLASS_KITS.bug.basic.poison.damage) * CLASS_KITS.bug.basic.poison.ticks
  check('poison ticks for its full course', poisonDealt === expected, `${poisonDealt} of ${expected}`)
}
{
  const { r, A, B, wait } = duel({ a: 'beast', gap: 60 })
  B.applyPowerUp('bulwark', POWERUPS.bulwark)
  const shield = B.shieldHp
  B.takeDamage(200, A, 0)
  check('a shield soaks damage first', B.hp === B.maxHp && B.shieldHp === shield - paced(200), `shield ${B.shieldHp}`)
  // Enough to spend the rest of the shield and still reach health, whatever
  // the pacing takes off it.
  B.takeDamage(B.shieldHp / PACE.damage + 200, A, 0)
  check('damage past the shield lands', B.hp < B.maxHp, `hp ${B.hp}`)
}
{
  const { r, A, B } = duel({ a: 'beast', gap: 60 })
  A.applyPowerUp('fury', POWERUPS.fury)
  B.takeDamage(100, A, 0)
  check('fury adds 30%', B.maxHp - B.hp === paced(130), `${B.maxHp - B.hp}`)
}

// --- Specials -------------------------------------------------------------
{
  for (const cls of Object.keys(CLASS_KITS)) {
    const { r, A, B, wait } = duel({ a: cls, gap: 110 })
    B.maxHp = 1e6
    B.hp = 1e6
    A.charge = 1
    A.aim = 0
    const used = r.useSpecial(A, { x: B.x, y: B.y })
    wait(5000)
    check(`${cls} special connects`, used && 1e6 - B.hp > 0, `${Math.round(1e6 - B.hp)} damage`)
  }
}

// --- Boons ----------------------------------------------------------------
{
  const r = new SimRoom({ mode: 'showdown', seed: 7 })
  r.field.startedAt = 1e9
  const f = r.addFighter({ axieClass: 'beast', name: 'A', x: 1200, y: 900 })
  f.hp = f.maxHp * 0.4
  const well = r.spawnWell({ x: 1200, y: 900 })
  const before = f.hp
  while (r.now < well.activeAt - 60) r.step(DT)
  check('a blooming Moonwell does not heal', f.hp === before, `hp ${Math.round(f.hp)}`)
  const start = f.hp
  const t0 = r.now
  while (r.now < t0 + 2000) r.step(DT)
  const rate = (f.hp - start) / f.maxHp / 2
  check('an open Moonwell heals 8% a second', Math.abs(rate - MOONWELL.healFracPerSec) < 0.02, `${(rate * 100).toFixed(1)}%/s`)
  f.lastHurtAt = r.now
  const held = f.hp
  const t1 = r.now
  while (r.now < t1 + 800) r.step(DT)
  check('a hit pauses the healing', f.hp === held, `healed ${Math.round(f.hp - held)}`)
}
{
  const r = new SimRoom({ mode: 'showdown', seed: 9 })
  r.field.startedAt = 1e9
  const f = r.addFighter({ axieClass: 'beast', name: 'A', x: 1200, y: 900 })
  r.orbBag = ['fury']
  const orb = r.spawnOrb({ x: 1200, y: 900 })
  while (r.now < orb.liveAt - 100) r.step(DT)
  check('an orb cannot be taken while forming', !orb.dead && !f.buff('fury'), `live ${orb.live}`)
  while (r.now < orb.liveAt + 200) r.step(DT)
  check('walking over a formed orb takes it', Boolean(f.buff('fury')), `dead ${orb.dead}`)
}

// --- The Wilds ------------------------------------------------------------
{
  const room = ROOMS.find(x => x.id === 'grove')
  const r = new SimRoom({ mode: 'wilds', room, seed: 11 })
  r.openWilds({ hunters: 4 })
  const you = r.joinPlayer({ axieClass: 'beast' })
  check('your stake buys a 90% bounty', near(you.wilds.bounty, room.stake * (1 - WILDS.feeRate)), you.wilds.bounty)
  check('the room opens with gates', r.gates.filter(g => g.open).length === WILDS.gatesOpen, r.gates.filter(g => g.open).length)
  check('the room opens with hunters', r.fighters.length === 5, r.fighters.length)

  const victim = r.fighters.find(f => f !== you && f.alive)
  const theirs = victim.wilds.bounty
  const mine = you.wilds.bounty
  victim.spawnShieldUntil = 0
  victim.invulnerableUntil = 0
  victim.hp = 1
  victim.takeDamage(50, you, 0)
  check('a kill takes the whole bounty', near(you.wilds.bounty, mine + theirs), you.wilds.bounty.toFixed(3))
  check('value is conserved after a kill', near(r.imbalance, 0, 1e-9), r.imbalance)

  // Alone at the gate: this checks the channel, not whether bots interrupt it.
  for (const f of r.fighters.filter(x => x !== you)) f.vanish()
  you.spawnShieldUntil = 0
  const gate = r.gates.find(g => g.open)
  you.pos.set(gate.x, gate.y)
  const carried = you.wilds.bounty
  let t = r.now
  while (r.now < t + WILDS.extractMs - 200) r.step(DT)
  check('a gate channels rather than paying instantly', you.alive && you.channel?.progress > 0.8, you.channel?.progress?.toFixed(2))
  while (r.now < t + WILDS.extractMs + 200) r.step(DT)
  check('a full channel extracts the bounty', !you.alive && near(r.ledger.extracted, carried), r.ledger.extracted.toFixed(3))
  check('value is conserved through extraction', near(r.imbalance, 0, 1e-9), r.imbalance)
}
{
  // A room left to itself: it keeps going, and no value appears or vanishes.
  const room = ROOMS.find(x => x.id === 'grove')
  const r = new SimRoom({ mode: 'wilds', room, seed: 13 })
  r.openWilds({ hunters: 5 })
  let worst = 0
  let minAlive = 99
  let maxAlive = 0
  let extractions = 0
  let moons = 0
  while (r.now < 300000) {
    r.step(DT)
    for (const e of r.drainEvents()) {
      if (e.t === 'extract') extractions++
      if (e.t === 'moon') moons++
    }
    if (Math.round(r.now) % 1000 < DT) {
      worst = Math.max(worst, Math.abs(r.imbalance))
      const alive = r.fighters.filter(f => f.alive).length
      minAlive = Math.min(minAlive, alive)
      maxAlive = Math.max(maxAlive, alive)
    }
  }
  check('five minutes of a room conserve value', worst < 1e-6, `worst ${worst}`)
  check('the room stays populated', minAlive >= 2 && maxAlive <= WILDS.maxHunters, `${minAlive}–${maxAlive} hunters`)
  check('hunters cash out', extractions > 0, `${extractions} extractions`)
  check('Blood Moons rise', moons >= 3, `${moons} in five minutes`)
  check('fees are collected', r.ledger.fees > 0, r.ledger.fees.toFixed(2))
}

// --- Determinism ----------------------------------------------------------
{
  const run = seed => {
    const r = new SimRoom({ mode: 'showdown', seed })
    for (const cls of Object.keys(CLASS_KITS)) r.addFighter({ axieClass: cls, bot: true, name: cls })
    while (r.now < 30000) { r.step(DT); r.drainEvents() }
    return r.fighters.map(f => `${f.axieClass}:${Math.round(f.x)},${Math.round(f.y)},${Math.round(f.hp)}`).join('|')
  }
  check('the same seed gives the same fight', run(99) === run(99))
  check('a different seed gives a different fight', run(99) !== run(100))
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exitCode = fail ? 1 : 0
