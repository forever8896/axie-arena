/**
 * One kit per class: stats plus two abilities.
 *
 * Single source of truth — the selection screen, the fighter and the ability
 * implementations all read this, so a card cannot advertise something Ronke
 * does not do.
 *
 * The numbers are not guesses. docs/DESIGN.md records the research behind them
 * (Battlerite, Brawl Stars, League, Sakurai on hit-stop) and the time-to-kill
 * each basic was tuned toward: roughly 5–6.5s against a 3000 HP target.
 *
 * `sfx` names a sound in public/sfx, generated for this game.
 */

/** How much of a special one connecting basic buys. ~4–5 hits to full. */
export const CHARGE_PER_HIT = 0.22

/** Passive trickle so a player who is being kited is never locked out. */
export const CHARGE_PER_SECOND = 0.045

/** Specials wind up for this long, drawn on the ground, before firing. */
export const TELEGRAPH_MS = 260

/**
 * Parry. Every number is sourced in docs/DESIGN.md section 5.
 *
 * A basic lands 165ms after its swing starts, faster than the ~250ms human
 * reaction benchmark, so parrying a basic is a read, not a reaction: attack
 * into a parry and get staggered, hold off and hand over free time, or bait it
 * and punish the recovery. Specials telegraph for 260ms, so they can be parried
 * on reaction.
 */
export const PARRY = {
  windowMs: 200,        // SF3 ~167ms, Dark Souls 200ms; Sekiro's 500ms reads as a counter
  recoveryMs: 380,      // SF3 locks out another parry for 23 frames (383ms) after an attempt
  cooldownMs: 1400,     // no spamming it as a default defence
  staggerMs: 650,       // For Honor guarantees ~600ms of punish after a parry
  arcDeg: 200,          // only blows from the front: facing matters
  chargeReward: 0.35,   // more than a landed hit (0.22): resource refills reward the read
  freezeMs: 140,        // the whole-moment freeze ULTRAKILL uses to sell a parry
  moveFactor: 0.4,      // committed: you plant your feet while parrying or recovering
  // One 60fps frame of leniency at the edge, the kind ULTRAKILL gives by letting
  // a hit wait a few frames. Without it, 52 of 115 measured bot parries missed
  // by exactly 0ms: the blow resolved on the frame the window closed.
  graceMs: 17,
}

/**
 * The one kit.
 *
 * There were six, and the six were the balance problem: every number here used
 * to be a trade against five other sets of numbers. One fighter means the fight
 * is about the moveset and where you point it, not about which class you drew.
 *
 * He punches what is in front of him and lashes his tongue at what is not.
 */
export const CLASS_KITS = {
  ronke: {
    title: 'Ronke',
    tagline: 'Punches what is close, licks what is not',
    hp: 3200, speed: 232,
    hitSfx: 'ronke_punch_hit',
    basic: {
      name: 'Haymaker', desc: 'A wide, heavy swing',
      kind: 'cone', range: 108, arc: 120, damage: 350, cooldown: 700, knockback: 250,
      sfx: 'ronke_punch',
      anim: 'attack',
    },
    special: {
      // Thrown short and low: he is being sick on the ground in front of him,
      // not lobbing it over anyone. The patch is the point — it denies the
      // ground he is standing on the other side of.
      name: 'Bad Rice', desc: 'Brings up a patch of rice that sickens anyone standing in it',
      kind: 'lob', maxRange: 190, radius: 112,
      zoneDuration: 3600, tickDamage: 155, tickRate: 560,
      sfx: 'ronke_lick',
      anim: 'special',
    },
    ultimate: {
      name: 'Rice Storm', desc: 'A wide spray of rice driven through everyone in front of him',
      damage: 760, range: 360, width: 170, knockback: 240,
      sfx: 'ronke_lick_hit',
      anim: 'special',
    },
  },
}
