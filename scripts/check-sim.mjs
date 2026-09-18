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
import { SWING, GUARD, STAMINA, PACE, LANCE, phasesFor, damageFor } from '../src/axie/combatConfig.js'

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

// --- The Moonshot ---------------------------------------------------------
{
  // It is aimed, so every check here is about where it is pointed rather than
  // when it was pressed.
  for (const cls of Object.keys(CLASS_KITS)) {
    const ult = CLASS_KITS[cls].ultimate
    const { r, A, B, wait } = duel({ a: cls, gap: Math.min(200, ult.range * 0.5) })
    B.maxHp = 1e6
    B.hp = 1e6
    B.brain = null
    A.moon = 1
    A.aim = Math.atan2(B.y - A.y, B.x - A.x)
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: A.aim, aiming: true })
    wait(LANCE.minAimMs + 40)
    B.pos.set(A.x + Math.cos(A.aim) * Math.min(200, ult.range * 0.5), A.y + Math.sin(A.aim) * Math.min(200, ult.range * 0.5))
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: A.aim, aiming: false })
    // The bolt crosses the ground before it strikes, so the blow lands a beat
    // after the shot rather than with it.
    wait((ult.range / LANCE.speed) * 1000 + 120)
    check(`${cls} Moonshot connects`, 1e6 - B.hp > 0, `${Math.round(1e6 - B.hp)} damage`)
  }

  // Held too briefly it is called off, and the meter survives: a Moonshot
  // cannot be flicked out, and being interrupted must not cost it either.
  {
    const { r, A, wait } = duel({ a: 'bird', gap: 200 })
    A.moon = 1
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: 0, aiming: true })
    wait(LANCE.minAimMs * 0.4)
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: 0, aiming: false })
    check('a Moonshot released early is called off', !A.aiming && A.moon === 1, `moon ${A.moon}`)
  }

  // A stun takes the aim, not the shot.
  {
    const { r, A, wait } = duel({ a: 'bird', gap: 200 })
    A.moon = 1
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: 0, aiming: true })
    wait(100)
    A.applyStun(400)
    check('a stun ends the aim but keeps the meter', !A.aiming && A.moon === 1, `moon ${A.moon}`)
  }

  // It pierces: that is what makes pointing it worth the standing still.
  {
    const r = new SimRoom({ mode: 'showdown', seed: 5 })
    const A = r.addFighter({ axieClass: 'bird', name: 'A' })
    A.brain = null
    A.pos.set(300, 300)
    A.aim = 0
    const marks = [0, 1, 2].map(i => {
      const m = r.addFighter({ axieClass: 'plant', name: `m${i}` })
      m.brain = null
      m.pos.set(420 + i * 140, 300)
      return m
    })
    A.moon = 1
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: 0, aiming: true })
    for (let t = 0; t < LANCE.minAimMs + 40; t += DT) { r.step(DT); r.drainEvents() }
    A.pos.set(300, 300)
    A.aim = 0
    marks.forEach((m, i) => m.pos.set(420 + i * 140, 300))
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: 0, aiming: false })
    for (let t = 0; t < (CLASS_KITS.bird.ultimate.range / LANCE.speed) * 1000 + 160; t += DT) { r.step(DT); r.drainEvents() }
    check('a Moonshot pierces everyone on its line', marks.every(m => m.hp < m.maxHp),
      marks.map(m => Math.round(m.maxHp - m.hp)).join('/'))
    // Spent, then already refilling: the room has been stepped to let the bolt
    // arrive, and the meter fills the whole time.
    check('and spends the meter', A.moon < 0.05, `moon ${A.moon.toFixed(3)}`)
  }

  // Pointed elsewhere it hits nobody — the whole reason it is aimed.
  {
    const { r, A, B, wait } = duel({ a: 'bird', gap: 200 })
    B.brain = null
    const before = B.hp
    A.moon = 1
    A.aim = Math.PI
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: Math.PI, aiming: true })
    wait(LANCE.minAimMs + 40)
    A.aim = Math.PI
    r.applyInput(A, { move: { x: 0, y: 0 }, aim: Math.PI, aiming: false })
    check('a Moonshot aimed away hits nobody', B.hp === before, `${Math.round(before - B.hp)} damage`)
  }

  // The meter fills at half the special's rate, which is the "twice as long".
  {
    const { r, A, wait } = duel({ a: 'bird', gap: 400 })
    A.charge = 0
    A.moon = 0
    wait(4000)
    check('the Moonshot meter fills at half the special rate',
      Math.abs(A.moon - A.charge * LANCE.chargeFactor) < 0.02, `charge ${A.charge.toFixed(2)} moon ${A.moon.toFixed(2)}`)
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
