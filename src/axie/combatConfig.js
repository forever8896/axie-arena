/**
 * The reworked combat: what a fight asks of a player, in milliseconds.
 *
 * Every window here is sized against what a person can actually do over a
 * network — about 250ms of reaction time, plus the ~193ms this game's own
 * netcode puts between the room and the screen. Nothing a player must hit on
 * reaction is shorter than 400ms. See docs/COMBAT.md for where these come from
 * and scripts/check-windows.mjs for the check that keeps them honest.
 *
 * The old numbers are still in classKits.js, still used by the single-player
 * Wilds, so the two can be played against each other.
 */

/**
 * An attack in three parts, the way Mordhau does it: you commit, then it
 * happens, then you are open. The skill is choosing when to start and reading
 * what the other player started — not reacting inside a gate.
 */
export const SWING = {
  /**
   * Visible wind-up: the warning, and the whole window in which to move, guard
   * or decide to trade. Sized to clear reaction time plus this game's own
   * netcode staleness with room to spare — see scripts/check-windows.mjs.
   * Mordhau's windups run 500-900ms and For Honor's 600-800ms, so this is not
   * unusually slow for a game built on reading a commitment.
   */
  windupMs: 560,
  /** After this much wind-up it cannot be called off. Feinting lives here. */
  commitMs: 140,
  /** The blow is live for this long, so contact is a moment with width. */
  releaseMs: 120,
  /** Open afterwards. This is what a whiff costs you, and it has to be long
   *  enough that the other player can actually take it. */
  recoveryMs: 460,
  /** You are slowed while winding up: committing means planting your feet. */
  moveFactor: 0.45,
}

/**
 * The guard replaces the parry. It is held rather than timed, so it is a
 * decision with a cost instead of a 200ms coin flip decided by ping.
 */
export const GUARD = {
  /** Front only: facing is still the thing you manage. */
  arcDeg: 200,
  /** What a blow does to a guarded fighter. Guarding is not immunity. */
  damageTaken: 0.3,
  /** Held guard drains this much stamina a second. */
  drainPerSec: 26,
  /** Raising it costs this much, so tapping it constantly is not free. */
  raiseCost: 6,
  /** It takes this long to come up. Short, because the decision to raise it is
   *  the interesting part, not the dexterity of raising it. */
  raiseMs: 90,
  /** Blocking a blow opens this long to answer. Generous: it is a reward. */
  riposteMs: 500,
  /** A riposte hits this much harder. */
  riposteDamage: 1.5,
  /** A riposte's wind-up is this much shorter: the opening is real. */
  riposteWindup: 0.5,
  /** Out of stamina while guarding: your guard breaks and you are open. */
  breakStunMs: 600,
  /** Slowed while holding it. */
  moveFactor: 0.5,
}

/**
 * One bar behind attacking, dashing and guarding. Running it dry is how a
 * fight is lost by overreaching rather than by being slower on a button.
 */
export const STAMINA = {
  max: 100,
  /** Refills this fast once you stop spending. */
  regenPerSec: 30,
  /** Nothing refills for this long after a spend. */
  idleMs: 550,
  attack: 20,
  dash: 26,
  /** Below this you cannot start an attack or a dash. */
  floor: 12,
}

/**
 * A swing's phases, for one class.
 *
 * A single fixed wind-up for everyone turned out to erase the classes: the
 * swing takes longer than any cooldown, so the only thing that mattered was
 * damage per blow, and the heavy hitters simply won. Weight decides speed here
 * the way it does in Mordhau — a heavier blow is slower to start and longer to
 * recover from, and costs more of the bar.
 *
 * The floors are not negotiable: they are what keeps every window inside human
 * reach at the latency this game actually runs at.
 */
export function phasesFor(kit) {
  const damage = kit?.basic?.damage ?? 250
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  return {
    windupMs: Math.round(clamp(400 + damage * 0.85, SWING.windupMs, 780)),
    releaseMs: SWING.releaseMs,
    recoveryMs: Math.round(clamp(300 + damage * 0.55, SWING.recoveryMs, 640)),
    /** A lighter blow draws less from the bar, so fast classes swing more. */
    stamina: Math.round(clamp(10 + damage / 22, 12, 30)),
  }
}

/** Damage scaling, so fights last long enough to hold two decisions. */
export const PACE = {
  /** Every blow deals this much of its old damage, before the rate below. */
  damage: 0.72,
}

/**
 * What one blow is worth now that blows are rarer.
 *
 * A class used to be fast or heavy, and the cooldown carried that difference.
 * A swing now takes longer than any cooldown, so the fast classes lost their
 * identity and most of their damage with it — bird was swinging every 320ms and
 * is now committing for 1140ms, four times less often, for the same 155.
 *
 * So a blow is worth what the class used to deal over the same stretch of time:
 * the balance that was measured over hundreds of matches is preserved, while
 * every swing becomes a commitment. PACE then slows the whole thing down, once,
 * where damage is taken.
 */
export function damageFor(kit) {
  const phases = phasesFor(kit)
  const wasCycle = (kit?.basic?.cooldown ?? 520) + 165   // old cooldown plus its contact delay
  const nowCycle = phases.windupMs + phases.releaseMs + phases.recoveryMs
  // No PACE here: takeDamage applies it to every source of damage in one
  // place, and applying it twice was quietly halving every blow.
  return (kit?.basic?.damage ?? 250) * (nowCycle / wasCycle)
}

/** Damage scaling, so fights last long enough to hold two decisions. */
/**
 * Specials wind up for longer here than in the single-player game, for the same
 * reason everything else does: a 260ms telegraph cannot be answered by someone
 * seeing the room 193ms late.
 */
export const SPECIAL_TELEGRAPH_MS = 560
