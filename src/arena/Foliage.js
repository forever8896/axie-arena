import Phaser from 'phaser'

/**
 * Cover in the paddies: clumps of rice and reeds standing in the water.
 *
 * These were lobed hedges — the meadow's cover, round and chunky. A flooded
 * terrace does not grow hedges, so the same footprint is now a stand of
 * blades: many thin stalks fanning from one base, dark against the water, with
 * ripe heads nodding over on a few of them.
 *
 * Painted once with Canvas 2D, which has the gradients and clean round joins
 * Phaser's Graphics lacks, then used as a texture. The signature and the
 * ellipse it fills are unchanged, so the collision layout never learns that
 * the world moved.
 */

const INK = '#0c1a16'
const BLADE_TOP = '#6f9f72'
const BLADE_MID = '#3f5d4a'
const BLADE_LOW = '#22402f'
const SHINE = 'rgba(190, 228, 196, 0.5)'
/** Ripe rice, and the two blooms that still belong here. */
const HEADS = [['#f4ead8', '#ffc247'], ['#ffc247', '#f4ead8'], ['#ff8fc4', '#f4ead8']]

/**
 * A clump texture fitted to an ellipse of rx by ry, keyed by `key`. The texture
 * is centred on the clump, with margin for the outline, the blades that lean
 * past the rim, and the shadow.
 */
export function paintBush(scene, key, rx, ry, { seed = key, flowers = 3, shadow = true } = {}) {
  if (scene.textures.exists(key)) return key
  const rng = new Phaser.Math.RandomDataGenerator([seed])
  const margin = 44
  const w = Math.ceil((rx + margin) * 2)
  const h = Math.ceil((ry + margin) * 2)
  const tex = scene.textures.createCanvas(key, w, h)
  const ctx = tex.getContext()
  const cx = w / 2
  const cy = h / 2

  // Every blade rises from somewhere along the base of the ellipse and leans
  // out as it goes, so the clump is widest at the top and reads as growth.
  const count = Math.max(16, Math.round((rx + ry) / 3.2))
  const blades = []
  for (let i = 0; i < count; i++) {
    const t = rng.realInRange(-1, 1)
    const baseX = cx + t * rx * 0.82
    const baseY = cy + ry * 0.42 - Math.abs(t) * ry * 0.18
    const tall = ry * rng.realInRange(1.15, 1.95)
    blades.push({
      x: baseX,
      y: baseY,
      tipX: baseX + t * rx * 0.5 + rng.realInRange(-10, 10),
      tipY: baseY - tall,
      width: rng.realInRange(3.4, 6.2),
      head: rng.realInRange(0, 1) < 0.22,
      lean: rng.realInRange(-0.5, 0.5),
    })
  }
  // Painted back to front so the near blades overlap the far ones.
  blades.sort((a, b) => a.y - b.y)

  const stroke = (b, grow, style) => {
    ctx.strokeStyle = style
    ctx.lineWidth = b.width + grow
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.quadraticCurveTo(
      b.x + (b.tipX - b.x) * 0.3 + b.lean * 18,
      b.y + (b.tipY - b.y) * 0.55,
      b.tipX, b.tipY,
    )
    ctx.stroke()
  }

  if (shadow) {
    ctx.fillStyle = 'rgba(4, 10, 24, 0.34)'
    ctx.beginPath()
    ctx.ellipse(cx + 6, cy + ry * 0.52, rx * 1.02, ry * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 1. One dark silhouette under everything, so the clump reads as one shape
  // against the water rather than as a pile of separate strokes.
  for (const b of blades) stroke(b, 5, INK)

  // 2. The blades themselves, lit from the top.
  const grad = ctx.createLinearGradient(0, cy - ry * 1.6, 0, cy + ry * 0.6)
  grad.addColorStop(0, BLADE_TOP)
  grad.addColorStop(0.55, BLADE_MID)
  grad.addColorStop(1, BLADE_LOW)
  for (const b of blades) stroke(b, 0, grad)

  // 3. A moonlit edge down the leading side of roughly every third blade.
  for (const b of blades) {
    if (rng.realInRange(0, 1) > 0.34) continue
    ctx.strokeStyle = SHINE
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(b.x - 1, b.y - 2)
    ctx.quadraticCurveTo(
      b.x + (b.tipX - b.x) * 0.3 + b.lean * 18 - 1.4,
      b.y + (b.tipY - b.y) * 0.55,
      b.tipX - 1.4, b.tipY + 2,
    )
    ctx.stroke()
  }

  // 4. Ripe heads, nodding over at the tip, outlined so they carry at distance.
  const heads = blades.filter(b => b.head).slice(0, Math.max(2, flowers * 2))
  for (const b of heads) {
    const [grain, tip] = rng.pick(HEADS)
    const droop = 7
    ctx.lineCap = 'round'
    ctx.strokeStyle = INK
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(b.tipX, b.tipY)
    ctx.quadraticCurveTo(b.tipX + droop, b.tipY + 3, b.tipX + droop * 1.5, b.tipY + 11)
    ctx.stroke()
    ctx.strokeStyle = grain
    ctx.lineWidth = 3.6
    ctx.beginPath()
    ctx.moveTo(b.tipX, b.tipY)
    ctx.quadraticCurveTo(b.tipX + droop, b.tipY + 3, b.tipX + droop * 1.5, b.tipY + 11)
    ctx.stroke()
    ctx.fillStyle = tip
    ctx.beginPath()
    ctx.arc(b.tipX + droop * 1.5, b.tipY + 11, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }

  tex.refresh()
  return key
}
