/**
 * The reworked combat: what a fight asks of a player, in milliseconds.
 *
 * Answering something on reaction over this game's netcode takes about 443ms:
 * ~172ms before you see it, ~250ms to react, ~22ms for the answer to get back.
 * The first cut of these numbers sized EVERY window past that, and the result
 * was a fight that bored the person playing it.
 *
 * The mistake was treating the wind-up as a gate. It is not: a guard here is
 * held, not raised in answer to a particular swing, so a wind-up is something
 * you read for spacing and commitment rather than something you must beat. It
 * only has to be legible — clearly longer than the ~172ms of staleness, so it
 * reads as a distinct act rather than a twitch.
 *
 * The things that genuinely are reactions — dodging a special, answering with a
 * riposte — still clear the full 443ms. See scripts/check-windows.mjs, which
 * now separates the two rather than holding everything to the same bar.
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
   * Mordhau's windups run 500-900ms, but Mordhau is a duel at walking pace with
   * a mouse-drag to read on top of the timing. This is a top-down arena with
   * six fighters and an extraction to think about, so the floor sits just above
   * what a person can answer rather than well past it.
   */
  windupMs: 320,
  /** After this much wind-up it cannot be called off. Feinting lives here. */
  commitMs: 100,
  /** The blow is live for this long, so contact is a moment with width. */
  releaseMs: 100,
  /** Open afterwards. This is what a whiff costs you, and it has to be long
   *  enough that the other player can actually take it. */
  recoveryMs: 260,
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
  raiseMs: 60,
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
  /**
   * Dropping a guard takes this long before you can swing.
   *
   * Without it the guard was free: hold it always, release into an attack at no
   * cost, and there was never a reason to lower it. Now it is a stance you
   * commit to and pay a beat to leave — unless you earned a riposte, which is
   * the whole point of holding it in the first place.
   */
  lowerMs: 100,
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
    windupMs: Math.round(clamp(200 + damage * 0.55, SWING.windupMs, 440)),
    releaseMs: SWING.releaseMs,
    recoveryMs: Math.round(clamp(160 + damage * 0.35, SWING.recoveryMs, 360)),
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
 * A special is the one blow you are expected to get out of the way of on
 * reaction, so unlike a basic's wind-up this does have to clear the full 443ms
 * a reaction costs over this netcode. It is rare enough to afford it.
 */
export const SPECIAL_TELEGRAPH_MS = 460

/**
 * The Moonshot: one aimed blow, held and pointed rather than pressed.
 *
 * Every other action in this fight is decided by when you press it. This one is
 * decided by where you point it, which is the part of the rework worth pushing
 * hardest: you stand still, you are visible to everyone while you do it, and
 * you get one line through the arena in exchange.
 *
 * It costs a meter of its own that fills at half the special's rate, so it
 * arrives about half as often, and it is worth about twice a special when it
 * lands. The two do not compete: spending a special does not touch this.
 */
export const LANCE = {
  /** Fills at half the special's rate, so it takes twice as long to come up. */
  chargeFactor: 0.5,
  /**
   * You must hold it at least this long before it will fire. Short of this a
   * release cancels and the meter comes back — a Moonshot cannot be flicked
   * out, it has to be aimed.
   */
  minAimMs: 340,
  /** Held past this it goes off on its own, so it cannot be held all match. */
  maxAimMs: 2600,
  /**
   * Slowed while aiming, but not rooted.
   *
   * At 0.22 this was measured costing the thin classes their whole advantage:
   * standing still for the aim is survivable for 3550hp of plant and close to
   * suicide for 2100hp of bird, so the same ability was worth +8pt to one and
   * -10pt to the other. The price of aiming has to be a price everyone can
   * pay.
   */
  moveFactor: 0.38,
  /** The lance travels this fast once released, in px/sec. */
  speed: 1500,
  /**
   * What a Moonshot is worth against the class's own special. The per-class
   * numbers in classKits are set to this; it is the intent behind them, and the
   * fallback for a class that has not been given one.
   */
  damageFactor: 2,
}
