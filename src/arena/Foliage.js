import Phaser from 'phaser'

/**
 * Lunacia foliage, painted in the Axie style: chunky clustered lobes inside
 * one dark outline, soft top-lit gradients, a highlight on every lobe, leaf
 * tips at the rim and a few flowers. Painted once with Canvas 2D, which has
 * the gradients and clean round-joined outlines Phaser's Graphics lacks, then
 * used as a texture.
 */

const INK = '#1f3a17'
const LEAF_TOP = '#96d957'
const LEAF_MID = '#5fb043'
const LEAF_BOTTOM = '#3a8433'
const SHADE = 'rgba(28, 72, 30, 0.42)'
const SHINE = 'rgba(214, 248, 140, 0.75)'
const FLOWERS = [['#ff9ec4', '#ffd964'], ['#fdf6e3', '#ffc93a'], ['#c9b8ff', '#fff2a8']]

/**
 * A bush texture fitted to an ellipse of rx by ry, keyed by `key`. The texture
 * is centred on the bush, with margin for the outline, leaf tips and shadow.
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

  // Lobes: a ring hugging the ellipse and a few filling the middle, painted
  // back to front so lower lobes overlap the ones behind them.
  const base = Math.min(rx, ry)
  const lobes = []
  const ring = Math.max(7, Math.round((rx + ry) / 22))
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + rng.realInRange(-0.15, 0.15)
    lobes.push({
      x: cx + Math.cos(a) * rx * 0.68,
      y: cy + Math.sin(a) * ry * 0.62,
      r: base * rng.realInRange(0.36, 0.48),
    })
  }
  for (let i = 0; i < Math.round(ring / 2); i++) {
    lobes.push({
      x: cx + rng.realInRange(-rx * 0.35, rx * 0.35),
      y: cy + rng.realInRange(-ry * 0.3, ry * 0.2),
      r: base * rng.realInRange(0.45, 0.6),
    })
  }
  lobes.sort((a, b) => a.y - b.y)

  if (shadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
    ctx.beginPath()
    ctx.ellipse(cx + 8, cy + ry * 0.55, rx * 1.02, ry * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Leaf tips poking out past the rim, drawn first so the outline wraps them.
  const tips = []
  for (let i = 0; i < ring + 4; i++) {
    const a = rng.realInRange(0, Math.PI * 2)
    tips.push({ a, x: cx + Math.cos(a) * rx * 0.98, y: cy + Math.sin(a) * ry * 0.95, s: rng.realInRange(12, 20) })
  }
  const leaf = (t, grow) => {
    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.rotate(t.a + Math.PI / 2)
    ctx.beginPath()
    ctx.moveTo(-t.s * 0.55 - grow, 4)
    ctx.quadraticCurveTo(0, -t.s * 1.5 - grow, t.s * 0.55 + grow, 4)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  // 1. One outline around the whole silhouette: every lobe and tip, grown.
  ctx.fillStyle = INK
  for (const t of tips) leaf(t, 3.5)
  for (const l of lobes) {
    ctx.beginPath()
    ctx.arc(l.x, l.y, l.r + 5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 2. Fill, lit from above across the whole bush.
  const grad = ctx.createLinearGradient(0, cy - ry, 0, cy + ry)
  grad.addColorStop(0, LEAF_TOP)
  grad.addColorStop(0.5, LEAF_MID)
  grad.addColorStop(1, LEAF_BOTTOM)
  ctx.fillStyle = grad
  for (const t of tips) leaf(t, 0)

  for (const l of lobes) {
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2)
    ctx.fill()

    // Each lobe shades on its lower right and catches light top left...
    ctx.save()
    ctx.beginPath()
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = SHADE
    ctx.beginPath()
    ctx.arc(l.x + l.r * 0.35, l.y + l.r * 0.45, l.r * 0.95, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = SHINE
    ctx.beginPath()
    ctx.ellipse(l.x - l.r * 0.32, l.y - l.r * 0.42, l.r * 0.34, l.r * 0.18, -0.5, 0, Math.PI * 2)
    ctx.fill()

    // ...and a soft line where it overlaps the lobe behind.
    ctx.strokeStyle = 'rgba(31, 58, 23, 0.45)'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(l.x, l.y, l.r - 1, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
  }

  // 3. Flowers, Axie-bright, each with an outline so they read at a distance.
  for (let i = 0; i < flowers; i++) {
    const a = rng.realInRange(0, Math.PI * 2)
    const d = rng.realInRange(0.1, 0.65)
    const fx = cx + Math.cos(a) * rx * d
    const fy = cy + Math.sin(a) * ry * d - 6
    const [petal, heart] = rng.pick(FLOWERS)
    const size = rng.realInRange(5, 7)
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2 + a
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(fx + Math.cos(pa) * size, fy + Math.sin(pa) * size, size * 0.72 + 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2 + a
      ctx.fillStyle = petal
      ctx.beginPath()
      ctx.arc(fx + Math.cos(pa) * size, fy + Math.sin(pa) * size, size * 0.72, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = heart
    ctx.beginPath()
    ctx.arc(fx, fy, size * 0.55, 0, Math.PI * 2)
    ctx.fill()
  }

  tex.refresh()
  return key
}
