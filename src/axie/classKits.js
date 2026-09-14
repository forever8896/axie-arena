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

export const CLASS_KITS = {
  beast: {
    title: 'Beast',
    tagline: 'Closes the gap and hits like a truck',
    hp: 3400, speed: 225,
    hitSfx: 'beast_projectile_hit',
    basic: {
      name: 'Horn Swipe', desc: 'Slow, wide, heavy',
      kind: 'cone', range: 112, arc: 115, damage: 400, cooldown: 720, knockback: 260,
      sfx: 'beast_bite_attack',
    },
    special: {
      name: 'Impale', desc: 'Charge forward, goring everything you pass through',
      kind: 'charge', damage: 700, speed: 700, duration: 300,
      vfx: 'beast_gore', sfx: 'beast_gore_attack',
    },
  },
  aquatic: {
    title: 'Aquatic',
    tagline: 'Controls the space around it',
    hp: 2800, speed: 240,
    hitSfx: 'aquatic_projectile_hit',
    basic: {
      name: 'Tidal Slash', desc: 'Quick two-hit swipe',
      kind: 'cone', range: 94, arc: 95, damage: 125, cooldown: 460, knockback: 150, hits: 2,
      sfx: 'aquatic_slash_attack',
    },
    special: {
      name: 'Undertow', desc: 'A wave that knocks rivals back and slows them',
      kind: 'wave', damage: 400, range: 190, arc: 150,
      knockback: 380, slow: { factor: 0.5, duration: 2200 },
      vfx: 'aquatic_slash', sfx: 'aquatic_slash_attack',
    },
  },
  plant: {
    title: 'Plant',
    tagline: 'Denies ground and outlasts',
    hp: 3800, speed: 205,
    hitSfx: 'plant_projectile_hit',
    basic: {
      name: 'Chomp', desc: 'Short reach, steady damage',
      kind: 'cone', range: 80, arc: 75, damage: 330, cooldown: 600, knockback: 130,
      sfx: 'plant_bite_attack',
    },
    special: {
      name: 'Sporeburst', desc: 'Lob a seed that leaves a damaging patch',
      kind: 'lob', maxRange: 340, radius: 96,
      zoneDuration: 3200, tickDamage: 180, tickRate: 620,
      vfx: 'plant_projectile', sfx: 'plant_projectile_attack',
    },
  },
  bird: {
    title: 'Bird',
    tagline: 'Fastest and longest reach, thinnest skin',
    hp: 2200, speed: 265,
    hitSfx: 'bird_throw_hit',
    basic: {
      name: 'Peck', desc: 'Rapid jabs at range',
      kind: 'cone', range: 152, arc: 42, damage: 180, cooldown: 320, knockback: 90,
      sfx: 'bird_bite_attack',
    },
    special: {
      name: 'Featherfall', desc: 'Fan five feathers across a wide spread',
      kind: 'spread', count: 5, spread: 44,
      // Slowed from 540 so a feather is dodgeable after a 250ms reaction
      // from typical engagement range. See docs/DESIGN.md.
      damage: 260, projectileSpeed: 460, projectileRange: 430,
      vfx: 'bird_throw', sfx: 'bird_throw_attack',
    },
  },
  bug: {
    title: 'Bug',
    tagline: 'Wears rivals down and interrupts them',
    hp: 2800, speed: 230,
    hitSfx: 'bug_projectile_hit',
    basic: {
      name: 'Venom Bite', desc: 'Leaves poison behind',
      kind: 'cone', range: 90, arc: 80, damage: 220, cooldown: 540, knockback: 120,
      poison: { damage: 90, ticks: 3, interval: 900 },
      sfx: 'bug_bite_attack',
    },
    special: {
      name: 'Swarm', desc: 'A seeking shot that stuns on contact',
      kind: 'seeker', damage: 350, projectileSpeed: 330,
      projectileRange: 520, turnRate: 2.4, stun: 1000,
      vfx: 'bug_projectile', sfx: 'bug_projectile_attack',
    },
  },
  reptile: {
    title: 'Reptile',
    tagline: 'Punishes anyone who surrounds it',
    hp: 3200, speed: 215,
    hitSfx: 'reptile_projectile_hit',
    basic: {
      name: 'Tail Whip', desc: 'Sweeps a wide arc',
      kind: 'cone', range: 98, arc: 205, damage: 300, cooldown: 660, knockback: 170,
      sfx: 'reptile_slash_attack',
    },
    special: {
      name: 'Tail Sweep', desc: 'Strike every rival around you at once',
      kind: 'radial', damage: 650, radius: 140, knockback: 300,
      vfx: 'reptile_projectile', sfx: 'reptile_projectile_attack',
    },
  },
}
