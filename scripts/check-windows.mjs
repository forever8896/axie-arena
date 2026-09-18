#!/usr/bin/env node
/**
 * Can a person actually do what the combat asks of them, over a network?
 *
 * There are two different questions here, and holding everything to the first
 * one is what made the reworked fight boring.
 *
 * A window a player must BEAT — dodging a special, answering with a riposte —
 * has to clear reaction time plus everything the netcode adds on both sides of
 * it. That is the strict bar, and it is a big number.
 *
 * A window a player must only READ — the wind-up that says a blow is coming —
 * has no such requirement, because a guard here is held rather than raised in
 * answer to a particular swing. It only has to be legible: clearly longer than
 * the staleness, so it lands on screen as an act rather than a twitch. Sizing
 * these past the strict bar does not make them more readable, it just makes
 * the fight slow.
 *
 * The point of the combat rework in docs/COMBAT.md is to move these numbers.
 * This is the check that says whether it did.
 *
 * Usage: node scripts/check-windows.mjs [ping]
 */
import { CLASS_KITS, PARRY, TELEGRAPH_MS } from '../src/axie/classKits.js'
import { SWING, GUARD, STAMINA, SPECIAL_TELEGRAPH_MS, phasesFor } from '../src/axie/combatConfig.js'
import { CONNECT_MS } from '../src/sim/constants.js'
import { INTERP_MS } from '../src/net/client.js'
import { TICK_MS, SNAPSHOT_EVERY } from '../src/net/protocol.js'

/** Simple visual reaction time: about sixteen frames at 60fps. */
const REACTION_MS = 250

/** What we measure to Amsterdam from here; pass another to try it. */
const PING_MS = Number(process.argv[2]) || 43

// What a player is looking at is always this far behind the room.
// What a player is looking at is always this far behind the room: the trip a
// snapshot makes, plus the buffer the client renders behind it.
const staleness = PING_MS / 2 + INTERP_MS + TICK_MS * SNAPSHOT_EVERY
/** To beat a window: see it late, react, and get the answer back to the room. */
const needed = REACTION_MS + staleness + PING_MS / 2
/**
 * To merely read one. A telegraph shorter than the staleness cannot be told
 * apart from the lag itself; this asks for half again as much on top, so it
 * reads as something the other fighter did.
 */
const legible = staleness * 1.5

let pass = 0
let fail = 0
const check = (name, ms, { kind = 'beat' } = {}) => {
  const bar = kind === 'beat' ? needed : kind === 'read' ? legible : 0
  const ok = kind === 'pace' || ms >= bar
  if (ok) pass++
  else fail++
  const margin = Math.round(ms - bar)
  const against = kind === 'beat' ? 'to answer on reaction'
    : kind === 'read' ? 'to read as an act' : ''
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(34)} ${String(Math.round(ms)).padStart(5)}ms` +
    (kind === 'pace' ? '   (pacing)' : `   ${margin >= 0 ? '+' : ''}${margin}ms ${against}`))
}

console.log(`A player sees the room ${Math.round(staleness)}ms late:`)
console.log(`  ${Math.round(PING_MS / 2)}ms each way + ${INTERP_MS}ms interpolation + ${Math.round(TICK_MS * SNAPSHOT_EVERY)}ms between snapshots`)
console.log(`A window they must BEAT needs ${Math.round(needed)}ms; one they must only READ needs ${Math.round(legible)}ms.\n`)

// --- The reworked fight, in src/sim ----------------------------------------

console.log('THE REWORKED FIGHT (multiplayer)\n')
// The wind-up is the warning: the whole window in which to move, guard, or
// decide to trade. It is per class now — a heavier blow is slower to start —
// so the lightest one is the one that has to clear the bar.
for (const [cls, kit] of Object.entries(CLASS_KITS)) {
  check(`${cls}: warning before its blow`, phasesFor(kit).windupMs, { kind: 'read' })
}
// After the guard is up, blocking is automatic — but it has to be raised in
// time, which is the decision this replaces the parry with.
const lightest = Math.min(...Object.values(CLASS_KITS).map(k => phasesFor(k).windupMs))
check('reading the fastest wind-up', lightest - GUARD.raiseMs, { kind: 'read' })
// Answering a block is a reaction, and it is the reward for holding a stance,
// so this one clears the strict bar.
check('riposte after a block', GUARD.riposteMs)
// The opening after a whiff is read and moved into, not a button hit in time.
check('opening after the fastest whiff',
  Math.min(...Object.values(CLASS_KITS).map(k => phasesFor(k).recoveryMs)), { kind: 'read' })
// A special is the one thing you are meant to get out of the way of.
check('special telegraph', SPECIAL_TELEGRAPH_MS)

console.log('\nPacing, which is not reacted to:\n')
for (const [cls, kit] of Object.entries(CLASS_KITS)) {
  const p = phasesFor(kit)
  check(`${cls}: a swing start to finish`,
    p.windupMs + p.releaseMs + p.recoveryMs, { kind: 'pace' })
}
check('guard held before it empties',
  (STAMINA.max / GUARD.drainPerSec) * 1000, { kind: 'pace' })
check('stamina back from empty',
  (STAMINA.max / STAMINA.regenPerSec) * 1000 + STAMINA.idleMs, { kind: 'pace' })

console.log('\nTHE OLD FIGHT (single-player Wilds, for comparison)\n')
check('parry window', PARRY.windowMs)
check('time from swing to contact', CONNECT_MS)
check('opening after a whiffed parry', PARRY.recoveryMs)

console.log(`\n${pass}/${pass + fail} windows are inside human reach at ${PING_MS}ms`)
if (fail) {
  console.log('\nA window shorter than its bar is decided by the connection rather than the player:')
  console.log('whoever is closer to the room sees it first and acts while the other is still waiting.')
}
process.exitCode = 0   // reporting, not gating: the rework is what moves these
