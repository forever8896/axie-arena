/**
 * Timings the simulation and the renderer must agree on.
 *
 * CONNECT_MS also lives in src/axie/AxieSprite.js, which squeezes the authored
 * attack clip so its impact frame lands exactly here. The simulation cannot
 * import that file (it pulls in Phaser), so the number lives here and the
 * sprite is checked against it.
 */
export const CONNECT_MS = 165

/**
 * What a fighter is doing, packed into one number in every snapshot.
 *
 * The authority sets these and the renderer reads them, twenty times a second
 * per fighter, so they are bits rather than a bag of booleans. They live here
 * because both ends must agree: a renderer that decoded `DASHING` as `STUNNED`
 * would play the wrong animation for a state it never saw go wrong.
 */
export const FLAGS = {
  DASHING: 1,
  STUNNED: 2,
  PARRYING: 4,
  PARRY_RECOVER: 8,
  CASTING: 16,
  SHIELDED: 32,
  CHARGING: 64,
  HIDDEN: 128,
}

export const has = (flags, bit) => (flags & bit) !== 0
