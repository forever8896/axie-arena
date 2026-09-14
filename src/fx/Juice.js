import Phaser from 'phaser'

/**
 * Impact feel. Nothing here knows what an Axie is, so all of it survives the
 * swap to real art — this is the layer that makes hits land.
 */

/** One-off textures the emitters draw from. Called once, from the scene. */
export function createFxTextures(scene) {
  const g = scene.add.graphics()

  g.fillStyle(0xffffff, 1).fillCircle(8, 8, 8)
  g.generateTexture('fx-dot', 16, 16)
  g.clear()

  g.fillStyle(0xffffff, 1)
  g.fillTriangle(0, 3, 14, 0, 14, 6)
  g.generateTexture('fx-shard', 14, 8)
  g.clear()

  g.fillStyle(0xffffff, 0.22).fillCircle(32, 32, 32)
  g.fillStyle(0xffffff, 0.5).fillCircle(32, 32, 16)
  g.generateTexture('fx-soft', 64, 64)
  g.destroy()
}

/** Sparks, a ring, a flash and a shove of the camera. */
export function impact(scene, x, y, color = 0xffffff, power = 1) {
  const shards = scene.add.particles(x, y, 'fx-shard', {
    speed: { min: 140 * power, max: 340 * power },
    angle: { min: 0, max: 360 },
    scale: { start: 0.9 * power, end: 0 },
    lifespan: { min: 180, max: 380 },
    quantity: Math.round(9 * power),
    tint: [color, 0xffffff],
    blendMode: 'ADD',
    emitting: false,
  })
  shards.explode()
  scene.time.delayedCall(600, () => shards.destroy())

  const ring = scene.add.circle(x, y, 6, color, 0)
  ring.setStrokeStyle(3, color, 0.9).setDepth(y + 1).setBlendMode(Phaser.BlendModes.ADD)
  scene.tweens.add({
    targets: ring,
    radius: 46 * power,
    alpha: 0,
    duration: 280,
    ease: 'Cubic.easeOut',
    onUpdate: () => ring.setStrokeStyle(3, color, ring.alpha),
    onComplete: () => ring.destroy(),
  })

  const flash = scene.add.image(x, y, 'fx-soft')
    .setTint(color).setBlendMode(Phaser.BlendModes.ADD)
    .setScale(0.7 * power).setAlpha(0.75).setDepth(y + 2)
  scene.tweens.add({
    targets: flash, alpha: 0, scale: 1.5 * power,
    duration: 200, ease: 'Quad.easeOut', onComplete: () => flash.destroy(),
  })

  scene.cameras.main.shake(110, 0.005 * power)
}

/** Dust kicked up while running. One emitter per fighter, followed. */
export function dustEmitter(scene, follow) {
  return scene.add.particles(0, 0, 'fx-dot', {
    follow,
    followOffset: { x: 0, y: 16 },
    speed: { min: 10, max: 45 },
    angle: { min: 200, max: 340 },
    scale: { start: 0.35, end: 0 },
    alpha: { start: 0.5, end: 0 },
    lifespan: 480,
    frequency: 70,
    tint: 0xd9c9a0,
    emitting: false,
  })
}

/** Floating motes so the arena is never visually static. */
export function ambientMotes(scene, bounds) {
  return scene.add.particles(0, 0, 'fx-dot', {
    x: { min: bounds.left, max: bounds.right },
    y: { min: bounds.top, max: bounds.bottom },
    speed: { min: 4, max: 18 },
    angle: { min: 250, max: 290 },
    scale: { start: 0.16, end: 0.02 },
    alpha: { start: 0, end: 0.5, ease: 'Sine.easeInOut' },
    lifespan: 6000,
    frequency: 240,
    tint: [0xfdf6e3, 0xffd964, 0xc0d890],
    blendMode: 'ADD',
  }).setDepth(-5)
}

export function damageNumber(scene, x, y, text, color = '#ffffff', amount = 0) {
  // Bigger hits get bigger numbers, so a special reads as a special.
  const size = Math.round(Phaser.Math.Clamp(16 + amount / 40, 16, 34))
  const label = scene.add.text(x + Phaser.Math.Between(-10, 10), y - 30, text, {
    fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif',
    fontSize: `${size}px`,
    color,
    stroke: '#16200f',
    strokeThickness: 5,
  }).setOrigin(0.5).setDepth(10000)

  scene.tweens.add({
    targets: label,
    y: y - 80,
    alpha: 0,
    scale: { from: 1.4, to: 0.9 },
    duration: 700,
    ease: 'Quad.easeOut',
    onComplete: () => label.destroy(),
  })
}

/**
 * Local hit-stop, after Sakurai: scales with damage, capped, the same length for
 * attacker and defender, halved for projectiles. Only the fighters involved
 * stop — in a six-way free-for-all, freezing the arena lets a third party
 * walk in and punish someone else's freeze.
 */
export function hitStopFor(fighters, damage, projectile = false) {
  let ms = Phaser.Math.Clamp(35 + damage / 9, 35, 115)
  if (projectile) ms *= 0.5
  for (const f of fighters) f?.freeze?.(ms)
}
