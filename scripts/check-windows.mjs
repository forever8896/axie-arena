#!/usr/bin/env node
/**
 * Can a person actually do what the combat asks of them, over a network?
 *
 * Every window a player has to hit — a parry, a riposte, a dodge out of a
 * telegraph — is compared against what a person can manage: about 250ms of
 * simple visual reaction time, plus the staleness this game's own netcode adds
 * before the player has seen anything to react to.
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
const staleness = PING_MS + INTERP_MS + TICK_MS * SNAPSHOT_EVERY
const needed = REACTION_MS + staleness

let pass = 0
let fail = 0
const check = (name, ms, { mustReact = true } = {}) => {
  const ok = !mustReact || ms >= needed
  if (ok) pass++
  else fail++
  const verdict = ok ? 'PASS' : 'FAIL'
  const margin = Math.round(ms - needed)
  console.log(`${verdict} ${name.padEnd(34)} ${String(Math.round(ms)).padStart(5)}ms` +
    (mustReact ? `   ${margin >= 0 ? '+' : ''}${margin}ms against what a person needs` : '   (not a reaction)'))
}

console.log(`A player sees the room ${Math.round(staleness)}ms late:`)
console.log(`  ${PING_MS}ms round trip + ${INTERP_MS}ms interpolation + ${Math.round(TICK_MS * SNAPSHOT_EVERY)}ms between snapshots`)
console.log(`So a window they must hit on reaction needs to be at least ${Math.round(needed)}ms.\n`)

// --- The reworked fight, in src/sim ----------------------------------------

console.log('THE REWORKED FIGHT (multiplayer)\n')
// The wind-up is the warning: the whole window in which to move, guard, or
// decide to trade. It is per class now — a heavier blow is slower to start —
// so the lightest one is the one that has to clear the bar.
for (const [cls, kit] of Object.entries(CLASS_KITS)) {
  check(`${cls}: warning before its blow`, phasesFor(kit).windupMs)
}
// After the guard is up, blocking is automatic — but it has to be raised in
// time, which is the decision this replaces the parry with.
const lightest = Math.min(...Object.values(CLASS_KITS).map(k => phasesFor(k).windupMs))
check('raising a guard against the fastest', lightest - GUARD.raiseMs)
check('riposte after a block', GUARD.riposteMs)
check('opening after the fastest whiff',
  Math.min(...Object.values(CLASS_KITS).map(k => phasesFor(k).recoveryMs)))
check('special telegraph', SPECIAL_TELEGRAPH_MS)

console.log('\nPacing, which is not reacted to:\n')
for (const [cls, kit] of Object.entries(CLASS_KITS)) {
  const p = phasesFor(kit)
  check(`${cls}: a swing start to finish`,
    p.windupMs + p.releaseMs + p.recoveryMs, { mustReact: false })
}
check('guard held before it empties',
  (STAMINA.max / GUARD.drainPerSec) * 1000, { mustReact: false })
check('stamina back from empty',
  (STAMINA.max / STAMINA.regenPerSec) * 1000 + STAMINA.idleMs, { mustReact: false })

console.log('\nTHE OLD FIGHT (single-player Wilds, for comparison)\n')
check('parry window', PARRY.windowMs)
check('time from swing to contact', CONNECT_MS)
check('opening after a whiffed parry', PARRY.recoveryMs)

console.log(`\n${pass}/${pass + fail} windows are inside human reach at ${PING_MS}ms`)
if (fail) {
  console.log('\nA window shorter than that is decided by the connection rather than the player:')
  console.log('whoever is closer to the room sees it first and acts while the other is still waiting.')
}
process.exitCode = 0   // reporting, not gating: the rework is what moves these
