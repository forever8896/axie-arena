/**
 * Hit effects, by the same route as the fighter.
 *
 * The Origins kit drew every impact in this game and left with the licence, so
 * punches currently land with a sound, a number and nothing to look at. These
 * are generated the same way Ronke was — a still on a green field, driven to
 * video, keyed and packed — so they live in the same pipeline and cut with the
 * same tools.
 *
 * Effects are generated rather than drawn from the character plate: there is no
 * source art for a puff of impact, so each starts from its own description.
 *
 * Usage: node scripts/ronke/make-effects.mjs impact rice
 */
import { run, download } from './fal.mjs'

const STILL = 'fal-ai/nano-banana'
const VIDEO = 'fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video'

const LOOK = `Flat hand-drawn MS-Paint cartoon style with wobbly black outlines and flat solid colours, crude and rough on purpose, matching a cheaply drawn meme cartoon. No 3D, no rendering, no shading, no gradients, no glow, no lighting.
Centred in frame on a completely flat pure chroma key green background filling every pixel. No character, no ground, no scenery, no text, no watermark.`

const EFFECTS = {
  impact: {
    still: `A single cartoon impact burst: a jagged spiky white and pale-yellow star-shaped POW splash, drawn as one flat shape. ${LOOK}`,
    video: `The jagged impact burst snaps into existence at full size, flashes, and shrinks away to nothing. Fast and punchy, one single hit. The green background never changes. The camera is completely static.`,
  },
  rice: {
    still: `A messy scattered pile of white rice grains with a few pale green sick splashes around it, seen from above, drawn as flat simple shapes. ${LOOK}`,
    video: `The pile of rice splatters outward across the ground and settles, grains scattering and coming to rest, bubbling slightly. The green background never changes. The camera is completely static.`,
  },
  heart: {
    still: `A single big flat cartoon love heart, bright pink with a bold black outline, bursting apart into a few smaller hearts and sparkles around it. ${LOOK}`,
    video: `The heart bursts outward, the small hearts and sparkles flying apart and fading. One single pop. The green background never changes. The camera is completely static.`,
  },
  dust: {
    still: `A low scuffed cloud of brown dirt and dust kicked up off the ground, drawn as flat chunky shapes with a few pebbles flying out. ${LOOK}`,
    video: `The dust cloud puffs outward along the ground and settles, pebbles flying out and dropping. One single scuff. The green background never changes. The camera is completely static.`,
  },
  heal: {
    still: `A soft cartoon healing sparkle: a few chunky pale green plus signs and simple four-pointed sparkles in a loose cluster. ${LOOK}`,
    video: `The plus signs and sparkles rise gently upwards and fade away. Calm and soft. The green background never changes. The camera is completely static.`,
  },
  power: {
    still: `A bold cartoon power-up burst: chunky upward-pointing yellow and orange arrows and spiky rays radiating from a centre point. ${LOOK}`,
    video: `The arrows and rays burst outward from the centre and flare, then fade. Energetic, one single surge. The green background never changes. The camera is completely static.`,
  },
}

const wanted = process.argv.slice(2).filter(a => EFFECTS[a])
if (!wanted.length) {
  console.error(`Pick effects: ${Object.keys(EFFECTS).join(' ')}`)
  process.exit(1)
}
console.log(`${wanted.length} effect(s), about $${(wanted.length * 0.23).toFixed(2)}\n`)

for (const name of wanted) {
  const spec = EFFECTS[name]
  try {
    const still = await run(STILL, { prompt: spec.still, num_images: 1, output_format: 'png' },
      { label: `${name} still` })
    const url = still?.images?.[0]?.url
    if (!url) throw new Error('no still came back')
    const clip = await run(VIDEO, { prompt: spec.video, image_url: url, prompt_optimizer: false },
      { label: `${name} clip`, timeoutMs: 900000 })
    console.log(`  ${(await download(clip, 'art/clips', `fx_${name}`)).join(', ')}`)
  } catch (err) {
    console.log(`  ${name}: FAILED ${err.message.slice(0, 180)}`)
  }
}
