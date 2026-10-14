/**
 * The fighter's animation clips, one image-to-video call each.
 *
 * Every clip starts from the same still (art/base/ronke-stance.png), which is
 * what keeps the character the same Ronke across all of them — the model is
 * given the look rather than asked to invent it. Each prompt pins the camera
 * and the green field, because anything that moves the background or lights it
 * differently is a frame that will not key out cleanly later.
 *
 * Clips cost about $0.19 each, so this takes the list it is given rather than
 * regenerating everything:
 *   node scripts/ronke/make-animations.mjs idle run punch
 */
import { run, download, dataUri } from './fal.mjs'

const MODEL = 'fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video'

/**
 * Held still in every prompt, so the clips differ only in what the body does.
 *
 * Most of this is style lock rather than direction. Handed a crude drawing,
 * the model's instinct is to improve it — to round the belly into 3D, light it,
 * smooth the wobbly outline — and an improved Ronke is not Ronke. So the art is
 * described as deliberate and the model is told, repeatedly, to leave it alone.
 */
const HOLD = `Keep the art style EXACTLY as the source image: crude, flat, hand-drawn MS-Paint cartoon with wobbly black outlines and flat solid colours. Do NOT make it 3D, do NOT render it, do NOT smooth or polish or beautify it, do NOT add shading, gradients, lighting, texture, fur detail or depth. It is meant to look rough and badly drawn — keep it that way.
Keep the character identical: fat round light-blue belly, dark blue arms and head, long grey muzzle, heavy brow, big staring eyes, thin spindly arms and legs, small blue hands and feet, the tiny RON tag on his waist.
The camera is locked off and completely static — no pan, no zoom, no shake.
The background stays flat, even, pure chroma key green at all times, unchanged and unlit, with no shadow cast onto it.
He stays fully inside the frame, nothing cropped, feet on the same ground line.
No text, no logo, no watermark, no new scenery, no other characters.`

const CLIPS = {
  idle: `He stands still and breathes, his big belly rising and settling, arms hanging loose and swaying a little, head bobbing slightly. A small, calm, looping idle. He does not walk or turn. ${HOLD}`,
  run: `He runs in place facing right, his thin legs cycling in a full run, little arms pumping, belly bouncing heavily with each step. A clean looping run cycle, staying in the same spot. ${HOLD}`,
  punch: `He throws one punch with his right fist: he leans back slightly, then drives his thin arm straight forward until the fist is fully extended in front of him, then pulls it back. One clear single punch. ${HOLD}`,
  vomit: `He lurches forward, hunches over, and vomits a thick spray of white rice out of his mouth onto the ground in front of him to the right, the rice piling in a heap just in front of his feet. Then he straightens back up. The rice stays close to him — it lands on the ground near his feet, it does not fly far away. ${HOLD}`,
  hurt: `He is hit and recoils backwards, head snapping back, arms flailing up, belly wobbling, then settles back upright. One short hit reaction. ${HOLD}`,
  guard: `He raises both thin arms up in front of his face and belly to block, hunching down behind them, braced and holding. ${HOLD}`,
}

const wanted = process.argv.slice(2).filter(a => CLIPS[a])
if (!wanted.length) {
  console.error(`Pick clips: ${Object.keys(CLIPS).join(' ')}`)
  process.exit(1)
}

const image = await dataUri(new URL('../../art/base/ronke-plate.png', import.meta.url).pathname)
console.log(`${wanted.length} clip(s), about $${(wanted.length * 0.19).toFixed(2)}\n`)

const results = await Promise.all(wanted.map(async name => {
  try {
    const out = await run(MODEL, { prompt: CLIPS[name], image_url: image, prompt_optimizer: false },
      { label: name, timeoutMs: 900000 })
    return `${name}: ${(await download(out, 'art/clips', name)).join(', ')}`
  } catch (err) {
    return `${name}: FAILED ${err.message.slice(0, 200)}`
  }
}))
console.log('\n' + results.join('\n'))
