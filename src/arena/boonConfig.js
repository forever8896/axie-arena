/**
 * What the boons and the closing field are worth, as plain data.
 *
 * The simulation (src/sim/) runs on a server with no renderer, so these
 * numbers cannot live in the files that draw them: those import Phaser. The
 * drawing modules re-export from here, so there is still one definition.
 */

/**
 * Power-ups: orbs that appear on the field, taken by walking over them.
 *
 * After Dota's power runes and Quake's timed items (docs/DESIGN.md, section 6):
 * they spawn on a schedule, never repeat a type until every type has appeared,
 * and whoever holds one shows it, so rivals can choose to run or to fight it.
 * Timed buffs are short because matches are: about a minute, with a ~5.5s
 * time-to-kill.
 */
export const POWERUPS = {
  fury: {
    name: 'FURY', desc: '+30% damage', icon: 'buff_dmg_boost', plate: 'dmg_boost', sfx: 'damage_boost',
    color: 0xff7a4a, durationMs: 7000, damageMult: 1.3,
  },
  bulwark: {
    name: 'BULWARK', desc: 'Shield of 25% max health', icon: 'buff_shield_boost', plate: 'shield_boost', sfx: 'shield',
    color: 0x7ce8ff, durationMs: 8000, shieldFrac: 0.25,
  },
  tailwind: {
    name: 'TAILWIND', desc: '+35% speed, dash twice as often', icon: 'buff_summerbreeze', plate: 'buff_apply', sfx: 'buff',
    color: 0x9dffb0, durationMs: 7000, speedMult: 1.35, dashCooldownMult: 0.5,
  },
  moonrise: {
    name: 'MOONRISE', desc: 'Special fully charged', icon: 'power_energy_master', plate: 'power_awaken', sfx: 'power_awaken',
    color: 0xffd964, instant: true,
  },
}

export const POWERUP_RULES = {
  firstAt: 8000,       // before the field starts at 20s, so the opening has a point of interest
  every: 11000,
  maxOnField: 2,
  warnMs: 1500,        // a shimmer on the ground before it can be taken: a race, not a lottery
  lifetimeMs: 20000,
  pickupRadius: 30,    // added to the fighter's body radius
}

/** Icons the HUD and the orbs draw, loaded at boot. */
export const POWERUP_ICONS = [...Object.values(POWERUPS).map(p => p.icon), 'buff_leaf', 'buff_mushroom']


/**
 * Moonwells: healing ground that blooms somewhere on the field now and then.
 *
 * Built from four researched rules (docs/DESIGN.md, section 6):
 * - It blooms visibly before it heals, like Brawl Stars' Healing Mushrooms, so
 *   it is a place to race to rather than a free top-up for whoever stood there.
 * - It favours lone fighters over crowds, as Showdown's mushrooms do.
 * - Taking damage from a rival shuts your healing off for a moment, as damage
 *   cuts Dota's Regeneration rune: it rewards disengaging, it cannot win a
 *   trade on its own.
 * - It holds a limited pool shared by everyone inside, and shrinks as it
 *   drains, so it can be contested and denied, like League's Honeyfruit.
 */
export const MOONWELL = {
  firstAt: 15000,
  every: 17000,
  jitter: 3000,
  bloomMs: 2500,
  activeMs: 7000,
  radius: 115,
  healFracPerSec: 0.08,   // of max health: between HotS fountains (2%/s) and Showdown's mushrooms
  tickMs: 250,
  hurtLockoutMs: 1200,
  pool: 2400,             // total health it can give, shared
}


/**
 * The Wilds close in.
 *
 * After Brawl Stars' Showdown gas: from a set time the safe field shrinks
 * toward the centre, and anyone outside it takes damage that escalates the
 * longer they stay. Matches end because the arena makes them end.
 *
 * Tuned gentler than Showdown's 20% max health per second at the start, and
 * capped there, since here most rivals are bots that should still get a fight.
 */
export const CLOSE = {
  // Showdown starts its gas at 20s. At 30s, a 60-match simulation averaged
  // 132s per match with most fighters surviving until the field forced it.
  startsAt: 20000,
  // Closes all the way. A 280u floor let several fighters survive inside
  // indefinitely: half of a 60-match simulation ended in a stalemate.
  duration: 70000,
  minRadius: 0,
  tickMs: 500,
  baseFrac: 0.04,        // of max health per second, on first stepping out
  growthPerSec: 0.025,   // added per second spent outside
  maxFrac: 0.2,          // Showdown's rate, as the ceiling
}

