/**
 * One kit per class: stats plus two abilities.
 *
 * Single source of truth — the selection screen, the fighter and the ability
 * implementations all read this, so a card cannot advertise something the Axie
 * does not do.
 *
 * `vfx` names the Origins skill plate the special plays. Those atlases come
 * from the kit revision licensed by Official Rules section 5.
 */
export const CLASS_KITS = {
  beast: {
    title: 'Beast',
    tagline: 'Closes the gap and hits like a truck',
    hp: 6, speed: 225,
    basic: {
      name: 'Horn Swipe', desc: 'Slow, wide, heavy',
      kind: 'cone', range: 112, arc: 115, damage: 2, cooldown: 720, knockback: 260,
    },
    special: {
      name: 'Impale', desc: 'Charge forward, goring everything you pass through',
      kind: 'charge', cooldown: 6000, damage: 2, speed: 700, duration: 300, vfx: 'beast_gore',
    },
  },
  aquatic: {
    title: 'Aquatic',
    tagline: 'Controls the space around it',
    hp: 5, speed: 240,
    basic: {
      name: 'Tidal Slash', desc: 'Quick two-hit swipe',
      kind: 'cone', range: 94, arc: 95, damage: 1, cooldown: 460, knockback: 150, hits: 2,
    },
    special: {
      name: 'Undertow', desc: 'A wave that knocks rivals back and slows them',
      kind: 'wave', cooldown: 8000, damage: 1, range: 190, arc: 150,
      knockback: 380, slow: { factor: 0.5, duration: 2200 }, vfx: 'aquatic_slash',
    },
  },
  plant: {
    title: 'Plant',
    tagline: 'Denies ground and outlasts',
    hp: 7, speed: 205,
    basic: {
      name: 'Chomp', desc: 'Short reach, steady damage',
      kind: 'cone', range: 80, arc: 75, damage: 2, cooldown: 600, knockback: 130,
    },
    special: {
      name: 'Sporeburst', desc: 'Lob a seed that leaves a damaging patch',
      kind: 'lob', cooldown: 9000, maxRange: 340, radius: 96,
      zoneDuration: 3200, tickDamage: 1, tickRate: 620, vfx: 'plant_projectile',
    },
  },
  bird: {
    title: 'Bird',
    tagline: 'Fastest and longest reach, thinnest skin',
    hp: 4, speed: 265,
    basic: {
      name: 'Peck', desc: 'Rapid jabs at range',
      kind: 'cone', range: 152, arc: 42, damage: 1, cooldown: 320, knockback: 90,
    },
    special: {
      name: 'Featherfall', desc: 'Fan five feathers across a wide spread',
      kind: 'spread', cooldown: 7000, count: 5, spread: 44,
      damage: 1, projectileSpeed: 540, projectileRange: 430, vfx: 'bird_throw',
    },
  },
  bug: {
    title: 'Bug',
    tagline: 'Wears rivals down and interrupts them',
    hp: 5, speed: 230,
    basic: {
      name: 'Venom Bite', desc: 'Leaves poison behind',
      kind: 'cone', range: 90, arc: 80, damage: 1, cooldown: 540, knockback: 120,
      poison: { damage: 1, ticks: 3, interval: 900 },
    },
    special: {
      name: 'Swarm', desc: 'A seeking shot that stuns on contact',
      kind: 'seeker', cooldown: 8000, damage: 1, projectileSpeed: 360,
      projectileRange: 520, turnRate: 2.6, stun: 1300, vfx: 'bug_projectile',
    },
  },
  reptile: {
    title: 'Reptile',
    tagline: 'Punishes anyone who surrounds it',
    hp: 6, speed: 215,
    basic: {
      name: 'Tail Whip', desc: 'Sweeps a wide arc',
      kind: 'cone', range: 98, arc: 205, damage: 1, cooldown: 660, knockback: 170,
    },
    special: {
      name: 'Tail Sweep', desc: 'Strike every rival around you at once',
      kind: 'radial', cooldown: 7000, damage: 2, radius: 140, knockback: 300,
      vfx: 'reptile_projectile',
    },
  },
}
