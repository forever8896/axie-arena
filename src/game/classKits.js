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
    hp: 3100, speed: 232,
    hitSfx: 'ronke_punch_hit',
    basic: {
      name: 'Haymaker', desc: 'A wide, heavy swing',
      kind: 'cone', range: 104, arc: 120, damage: 325, cooldown: 700, knockback: 250,
      sfx: 'ronke_punch',
      anim: 'attack',
    },
    special: {
      // Thrown short and low: he is being sick on the ground in front of him,
      // not lobbing it over anyone. The patch is the point — it denies the
      // ground he is standing on the other side of.
      name: 'Bad Rice', desc: 'Brings up a patch of rice that sickens anyone standing in it',
      // Thrown no further than he is actually sick: the animation puts the rice
      // at his feet, and a patch that lands anywhere else is a hitbox the
      // player cannot see. Short and wide beats long and invisible.
      kind: 'lob', maxRange: 95, radius: 120,
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

  /**
   * Ronka bites what is close and spits a heart at what is not.
   *
   * Less health than Ronke and a shorter reach, paid back by a special that
   * crosses the field: she wants the fight at arm's length, not in it.
   */
  ronka: {
    title: 'Ronka',
    tagline: 'Bites up close, throws her heart across the field',
    hp: 3050, speed: 244,
    hitSfx: 'ronka_bite_hit',
    basic: {
      name: 'Chomp', desc: 'A quick snapping bite',
      kind: 'cone', range: 100, arc: 100, damage: 345, cooldown: 580, knockback: 190,
      sfx: 'ronka_bite',
      anim: 'attack',
    },
    special: {
      name: 'Heartbreaker', desc: 'Spits an enormous heart that hurts whatever it reaches',
      kind: 'spread', count: 1, spread: 0,
      damage: 700, projectileSpeed: 470, projectileRange: 580,
      sfx: 'ronka_heart',
      anim: 'special',
    },
    ultimate: {
      name: 'Heartstopper', desc: 'A wall of hearts driven through everyone in front of her',
      damage: 820, range: 420, width: 150, knockback: 260,
      sfx: 'ronka_heart',
      anim: 'special',
    },
  },

  /**
   * Horske is the fastest thing on the field and cannot stop quickly.
   *
   * The charge is both its special and its character: committed, unturnable
   * once begun, and worth it because whoever it catches loses a moment.
   */
  horske: {
    title: 'Horske',
    tagline: 'Fast, and hard to get out of the way of',
    hp: 2850, speed: 290,
    hitSfx: 'horske_hit',
    basic: {
      name: 'Stomp', desc: 'Front hooves down, hard and close',
      kind: 'cone', range: 106, arc: 115, damage: 330, cooldown: 600, knockback: 240,
      sfx: 'horske_stomp',
      anim: 'attack',
    },
    special: {
      name: 'Trample', desc: 'Charges straight ahead, hurting and stunning whoever it catches',
      kind: 'charge', damage: 520, speed: 860, duration: 360,
      knockback: 380, stun: 650,
      sfx: 'horske_charge',
      anim: 'special',
    },
    ultimate: {
      name: 'Stampede', desc: 'A full gallop driven through everyone in its path',
      damage: 780, range: 440, width: 130, knockback: 420,
      sfx: 'horske_charge',
      anim: 'special',
    },
  },
}
