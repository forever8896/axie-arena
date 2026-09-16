/**
 * Timings the simulation and the renderer must agree on.
 *
 * CONNECT_MS also lives in src/axie/AxieSprite.js, which squeezes the authored
 * attack clip so its impact frame lands exactly here. The simulation cannot
 * import that file (it pulls in Phaser), so the number lives here and the
 * sprite is checked against it.
 */
export const CONNECT_MS = 165
