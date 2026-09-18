/**
 * One kit per class: stats plus two abilities.
 *
 * Single source of truth — the selection screen, the fighter and the ability
 * implementations all read this, so a card cannot advertise something the Axie
 * does not do.
 *
 * The numbers are not guesses. docs/DESIGN.md records the research behind them
 * (Battlerite, Brawl Stars, League, Sakurai on hit-stop) and the time-to-kill
 * each basic was tuned toward: roughly 5–6.5s against a 3000 HP target.
 *
 * `vfx` and `sfx` name Origins kit assets, licensed by Official Rules section 5.
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

export const CLASS_KITS = {
  beast: {
    title: 'Beast',
    tagline: 'Closes the gap and hits like a truck',
    hp: 3150, speed: 225,
    hitSfx: 'beast_projectile_hit',
    basic: {
      name: 'Horn Swipe', desc: 'Slow, wide, heavy',
      kind: 'cone', range: 112, arc: 115, damage: 360, cooldown: 720, knockback: 260,
      sfx: 'beast_bite_attack',
      anim: 'attack/melee/horn-gore',
      vfx: 'beast_bite',
    },
    special: {
      name: 'Impale', desc: 'Charge forward, goring everything you pass through',
      kind: 'charge', damage: 480, speed: 700, duration: 300,
      vfx: 'beast_gore', sfx: 'beast_gore_attack',
      anim: 'attack/melee/horn-gore',
    },
    /**
     * Each class points the same lance and gets a different one: reach, width
     * and the one thing it does on top are the whole difference.
     */
    ultimate: {
      name: 'Crescent Rush', desc: 'A goring line that hurls everything it passes aside',
      damage: 1000, range: 420, width: 84, knockback: 420,
      vfx: 'beast_gore', sfx: 'beast_gore_attack',
      anim: 'attack/melee/horn-gore',
    },
  },
  aquatic: {
    title: 'Aquatic',
    tagline: 'Controls the space around it',
    hp: 2800, speed: 240,
    hitSfx: 'aquatic_projectile_hit',
    basic: {
      name: 'Tidal Slash', desc: 'Quick two-hit swipe',
      kind: 'cone', range: 94, arc: 95, damage: 140, cooldown: 460, knockback: 150, hits: 2,
      sfx: 'aquatic_slash_attack',
      anim: 'attack/melee/tail-multi-slap',
      vfx: 'aquatic_gore',
    },
    special: {
      name: 'Undertow', desc: 'An unparryable wave that knocks rivals back and slows them',
      kind: 'wave', damage: 400, range: 190, arc: 150,
      knockback: 380, slow: { factor: 0.5, duration: 2200 },
      vfx: 'aquatic_slash', sfx: 'aquatic_slash_attack',
      anim: 'attack/melee/tail-thrash',
    },
    ultimate: {
      name: 'Tidebreak', desc: 'A short, wide surge that throws rivals back and leaves them slowed',
      damage: 850, range: 300, width: 150, knockback: 520,
      slow: { factor: 0.5, duration: 2400 },
      vfx: 'aquatic_slash', sfx: 'aquatic_slash_attack',
      anim: 'attack/melee/tail-thrash',
    },
  },
  plant: {
    title: 'Plant',
    tagline: 'Denies ground and outlasts',
    hp: 3550, speed: 220,
    hitSfx: 'plant_projectile_hit',
    basic: {
      name: 'Chomp', desc: 'Short reach, steady damage',
      kind: 'cone', range: 92, arc: 75, damage: 330, cooldown: 600, knockback: 130,
      sfx: 'plant_bite_attack',
      anim: 'attack/melee/mouth-bite',
      vfx: 'plant_bite',
    },
    special: {
      name: 'Sporeburst', desc: 'Lob a seed that leaves a damaging patch',
      kind: 'lob', maxRange: 340, radius: 96,
      zoneDuration: 3200, tickDamage: 220, tickRate: 620,
      vfx: 'plant_projectile', sfx: 'plant_projectile_attack',
      anim: 'attack/ranged/cast-high',
    },
    ultimate: {
      name: 'Moonbloom', desc: 'A creeping line that poisons everything it touches',
      damage: 480, range: 380, width: 88, knockback: 160,
      vfx: 'plant_projectile', sfx: 'plant_projectile_attack',
      anim: 'attack/ranged/cast-high',
    },
  },
  bird: {
    title: 'Bird',
    tagline: 'Fastest and longest reach, thinnest skin',
    hp: 2100, speed: 255,
    hitSfx: 'bird_throw_hit',
    basic: {
      name: 'Peck', desc: 'Rapid jabs at range',
      kind: 'cone', range: 138, arc: 42, damage: 155, cooldown: 320, knockback: 90,
      sfx: 'bird_bite_attack',
      anim: 'attack/melee/normal-attack',
      vfx: 'bird_bite',
    },
    special: {
      name: 'Featherfall', desc: 'Fan five feathers across a wide spread',
      kind: 'spread', count: 5, spread: 44,
      // Slowed from 540 so a feather is dodgeable after a 250ms reaction
      // from typical engagement range. See docs/DESIGN.md.
      damage: 260, projectileSpeed: 460, projectileRange: 430,
      vfx: 'bird_throw', sfx: 'bird_throw_attack',
      anim: 'attack/ranged/cast-multi',
    },
    ultimate: {
      name: 'Moonfeather', desc: 'One long, thin feather that pierces the whole arena',
      damage: 1150, range: 620, width: 80, knockback: 120,
      vfx: 'bird_throw', sfx: 'bird_throw_attack',
      anim: 'attack/ranged/cast-multi',
    },
  },
  bug: {
    title: 'Bug',
    tagline: 'Wears rivals down and interrupts them',
    hp: 2800, speed: 240,
    hitSfx: 'bug_projectile_hit',
    basic: {
      name: 'Venom Bite', desc: 'Leaves poison behind',
      kind: 'cone', range: 90, arc: 80, damage: 210, cooldown: 540, knockback: 120,
      // Back to 90: raised to 120 while poison was silently dealing nothing,
      // which would overshoot now that it ticks.
      poison: { damage: 80, ticks: 3, interval: 900 },
      sfx: 'bug_bite_attack',
      anim: 'attack/melee/multi-attack',
      vfx: 'bug_bite',
    },
    special: {
      name: 'Swarm', desc: 'A seeking shot that stuns on contact',
      kind: 'seeker', damage: 350, projectileSpeed: 330,
      projectileRange: 520, turnRate: 2.4, stun: 800,
      vfx: 'bug_projectile', sfx: 'bug_projectile_attack',
      anim: 'attack/melee/shrimp',
    },
    ultimate: {
      name: 'Hivelance', desc: 'A seeking lance that stuns everything in its path',
      damage: 1060, range: 420, width: 108, knockback: 140, stun: 900,
      vfx: 'bug_projectile', sfx: 'bug_projectile_attack',
      anim: 'attack/ranged/cast-multi',
    },
  },
  reptile: {
    title: 'Reptile',
    tagline: 'Punishes anyone who surrounds it',
    hp: 3350, speed: 230,
    hitSfx: 'reptile_projectile_hit',
    basic: {
      name: 'Tail Whip', desc: 'Sweeps a wide arc',
      kind: 'cone', range: 98, arc: 205, damage: 340, cooldown: 660, knockback: 170,
      sfx: 'reptile_slash_attack',
      anim: 'attack/melee/tail-smash',
      vfx: 'reptile_slash',
    },
    special: {
      name: 'Tail Sweep', desc: 'Strike every rival around you at once',
      kind: 'radial', damage: 650, radius: 160, knockback: 300,
      vfx: 'reptile_projectile', sfx: 'reptile_projectile_attack',
      anim: 'attack/melee/tail-roll',
    },
    ultimate: {
      name: 'Tailspike', desc: 'A heavy spike driven straight through anyone in front of it',
      damage: 840, range: 340, width: 118, knockback: 360,
      vfx: 'reptile_projectile', sfx: 'reptile_projectile_attack',
      anim: 'attack/melee/tail-roll',
    },
  },
}
