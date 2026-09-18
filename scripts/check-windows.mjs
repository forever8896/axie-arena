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

// --- The windows the combat asks a player to hit ----------------------------

check('parry window', PARRY.windowMs)
check('special telegraph', TELEGRAPH_MS)
check('time from swing to contact', CONNECT_MS)

// A whiffed parry leaves an opening the other player must see and punish.
check('opening after a whiffed parry', PARRY.recoveryMs)

// Cooldowns are not reactions; they are pacing. Shown for context.
check('parry cooldown', PARRY.cooldownMs, { mustReact: false })

for (const [cls, kit] of Object.entries(CLASS_KITS)) {
  check(`${cls}: recovery between blows`, kit.basic.cooldown, { mustReact: false })
}

console.log(`\n${pass}/${pass + fail} windows are inside human reach at ${PING_MS}ms`)
if (fail) {
  console.log('\nA window shorter than that is decided by the connection rather than the player:')
  console.log('whoever is closer to the room sees it first and acts while the other is still waiting.')
}
process.exitCode = 0   // reporting, not gating: the rework is what moves these
