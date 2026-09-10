/**
 * One kit per class: stats plus the two abilities.
 *
 * This is the single source of truth — the selection screen reads it, and the
 * ability system will too, so a card can never advertise something the fighter
 * does not do.
 *
 * `vfx` names the Origins skill plate each special will play. Those atlases are
 * vendored from the kit revision licensed by Official Rules section 5.
 */
export const CLASS_KITS = {
  beast: {
    title: 'Beast',
    tagline: 'Closes the gap and hits like a truck',
    hp: 6, speed: 225,
    basic: { name: 'Horn Swipe', desc: 'Slow, wide, heavy' },
    special: { name: 'Impale', desc: 'Charge forward, goring everything you pass through', vfx: 'beast_gore', cooldown: 6000 },
  },
  aquatic: {
    title: 'Aquatic',
    tagline: 'Controls the space around it',
    hp: 5, speed: 240,
    basic: { name: 'Tidal Slash', desc: 'Quick two-hit swipe' },
    special: { name: 'Undertow', desc: 'A wave that knocks rivals back and slows them', vfx: 'aquatic_slash', cooldown: 8000 },
  },
  plant: {
    title: 'Plant',
    tagline: 'Denies ground and outlasts',
    hp: 7, speed: 205,
    basic: { name: 'Chomp', desc: 'Short reach, steady damage' },
    special: { name: 'Sporeburst', desc: 'Lob a seed that leaves a damaging patch', vfx: 'plant_projectile', cooldown: 9000 },
  },
  bird: {
    title: 'Bird',
    tagline: 'Fastest and longest reach, thinnest skin',
    hp: 4, speed: 265,
    basic: { name: 'Peck', desc: 'Rapid jabs at range' },
    special: { name: 'Featherfall', desc: 'Fan five feathers across a wide spread', vfx: 'bird_throw', cooldown: 7000 },
  },
  bug: {
    title: 'Bug',
    tagline: 'Wears rivals down and interrupts them',
    hp: 5, speed: 230,
    basic: { name: 'Venom Bite', desc: 'Leaves poison behind' },
    special: { name: 'Swarm', desc: 'A seeking shot that stuns on contact', vfx: 'bug_projectile', cooldown: 8000 },
  },
  reptile: {
    title: 'Reptile',
    tagline: 'Punishes anyone who surrounds it',
    hp: 6, speed: 215,
    basic: { name: 'Tail Whip', desc: 'Sweeps a wide arc' },
    special: { name: 'Tail Sweep', desc: 'Strike every rival around you at once', vfx: 'reptile_projectile', cooldown: 7000 },
  },
}
