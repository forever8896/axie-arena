#!/usr/bin/env node
/**
 * Generates Lunacy's soundtrack with the Venice audio API, then transcodes it
 * for the web.
 *
 * The tracks are instrumental and written to loop: the game crossfades each
 * one into itself (src/fx/Music.js), so they are asked for as continuous beds
 * without a hard ending.
 *
 * Costs real credit. Run with --quote first to see the price, and pass ids to
 * regenerate only some tracks:
 *   VENICE_API_KEY=... node scripts/audio/generate-music.mjs --quote
 *   VENICE_API_KEY=... node scripts/audio/generate-music.mjs theme
 *
 * Needs ffmpeg. Writes public/music/<id>.ogg.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const KEY = process.env.VENICE_API_KEY
const BASE = process.env.VENICE_BASE_URL ?? 'https://api.venice.ai/api/v1'
if (!KEY) {
  console.error('Set VENICE_API_KEY (and optionally VENICE_BASE_URL).')
  process.exit(1)
}

/** Each track: what it plays under, and the prompt that made it. */
export const TRACKS = {
  theme: {
    model: 'elevenlabs-music-v2-5',
    duration: 60,
    plays: 'home screen, class select and the lobby',
    prompt: [
      'Upbeat, bouncy fantasy game menu theme for a cute creature arena in a moonlit meadow.',
      'Catchy marimba and plucked ukulele hook doubled by bright glockenspiel, walking bass line,',
      'claps and shakers with a lively hand-percussion groove, cheerful brass and whistle flourishes.',
      'Major key, energetic 118 BPM, adventurous and playful, the feeling of a festival about to start.',
      'Fully instrumental, no vocals. Full energy from the first bar, even dynamics throughout',
      'and no ending, so it loops seamlessly.',
    ].join(' '),
  },
  // Alternatives for the front end, deliberately without the marimba and
  // ukulele that made the first attempts sound like a cheerful video intro.
  'theme-moonlit': {
    model: 'elevenlabs-music-v2-5',
    duration: 60,
    plays: 'candidate: front end',
    prompt: [
      'Nocturnal, mysterious fantasy game theme for a moonlit arena where creatures hunt each other.',
      'Low string ostinato and deep frame drums, a breathy wooden flute melody, distant wordless choir pad,',
      'soft metallic bell accents, warm analogue bass underneath.',
      'Minor key with a hopeful lift, hypnotic mid tempo around 104 BPM, atmospheric and a little dangerous.',
      'No ukulele, no marimba, no glockenspiel, nothing bouncy or comedic.',
      'Fully instrumental, no vocals, constant intensity with no intro and no ending, so it loops.',
    ].join(' '),
  },
  'theme-hunt': {
    model: 'elevenlabs-music-v2-5',
    duration: 60,
    plays: 'candidate: front end',
    prompt: [
      'Cool, tense lobby theme for a competitive creature arena, the calm before a hunt.',
      'Pulsing analogue synth bass, tight tribal percussion and shakers, muted plucked electric guitar,',
      'low brass swells and a single haunting flute line, sparse hits rather than melody.',
      'Minor key, confident 112 BPM groove, moody and stylish, the feeling of waiting to drop in.',
      'No ukulele, no marimba, nothing cute or comedic.',
      'Fully instrumental, no vocals, even intensity throughout with no intro and no ending, so it loops.',
    ].join(' '),
  },
  arena: {
    model: 'elevenlabs-music-v2-5',
    duration: 60,
    plays: 'in a room of the Endless Wilds',
    prompt: [
      'Playful adventure combat loop for a top-down creature brawler in a sunlit meadow.',
      'Driving hand percussion and light taiko-style toms, plucked strings and staccato marimba ostinato,',
      'bright brass stabs used sparingly, warm bass line, occasional glockenspiel sparkle.',
      'Energetic but friendly rather than dark or heroic, 124 BPM, steady groove.',
      'Fully instrumental, no vocals. Constant intensity with no intro fade-in and no ending,',
      'so the track can loop continuously under gameplay.',
    ].join(' '),
  },
  bloodmoon: {
    model: 'stable-audio-25',
    duration: 30,
    instrumental: false,
    plays: 'while a Blood Moon is up',
    prompt: [
      'Tense loopable game music bed: low pulsing synth bass, urgent tribal drums,',
      'distant metallic bells and a slow rising string swell, minor key, 128 BPM,',
      'ominous but still playful, instrumental, no vocals, constant intensity for looping.',
    ].join(' '),
  },
}

/**
 * Menu sounds. Short, dry and quiet: they play on every hover, so anything
 * with a tail or a sting becomes unbearable within a minute.
 */
export const SOUNDS = {
  ui_hover: { model: 'elevenlabs-sound-effects-v2', duration: 1, gain: 0.5, prompt: 'A single very short soft wooden marimba tick, one note, clean and dry UI hover blip for a cute game menu, no reverb, no music' },
  ui_select: { model: 'elevenlabs-sound-effects-v2', duration: 1, gain: 0.6, prompt: 'Two quick ascending marimba notes, bright and cute, a confirm blip for a cartoon game menu, dry, no reverb tail' },
  ui_back: { model: 'elevenlabs-sound-effects-v2', duration: 1, gain: 0.55, prompt: 'Two quick descending soft wooden notes, a gentle back or cancel blip for a cartoon game menu, dry, no reverb' },
  ui_start: { model: 'elevenlabs-sound-effects-v2', duration: 2, gain: 0.7, prompt: 'A short cheerful three note ascending flourish with a soft bell and light shaker, a game starting, warm and magical, about one second, no vocals' },
  ui_deny: { model: 'elevenlabs-sound-effects-v2', duration: 1, gain: 0.5, prompt: 'A short soft muted wooden thud, action not allowed, gentle and low, dry, no harsh buzzer' },
}

const out = join('public', 'music')
mkdirSync(out, { recursive: true })
const args = process.argv.slice(2)
const quoteOnly = args.includes('--quote')
const wanted = args.filter(a => !a.startsWith('--'))
const ids = (wanted.length ? wanted : [...Object.keys(TRACKS), ...Object.keys(SOUNDS)]).map(a => a.split('=')[0])

/** Queue ids from an earlier run, as track=id, so a crash costs nothing extra. */
const resume = Object.fromEntries(args.filter(a => a.includes('=')).map(a => a.split('=')))

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res
}

let spent = 0
for (const id of ids) {
  const isSound = Boolean(SOUNDS[id])
  const track = TRACKS[id] ?? SOUNDS[id]
  if (!track) {
    console.error(`unknown track: ${id}`)
    continue
  }
  const body = {
    model: track.model,
    prompt: track.prompt,
    duration_seconds: track.duration,
  }
  // Only some models take the instrumental switch; the rest are asked in prose,
  // and sound-effect models reject it outright.
  if (track.instrumental !== false && !isSound) body.force_instrumental = true

  // The quote endpoint prices the model and length only.
  const quoteRes = await post('/audio/quote', { model: track.model, duration_seconds: track.duration })
  
  const quote = await quoteRes.json().catch(() => null)
  const price = quote?.quote ?? quote?.usd ?? quote?.price?.usd
  console.log(`${id.padEnd(10)} ${track.model} ${track.duration}s  quote ${price != null ? '$' + price : JSON.stringify(quote)}`)
  if (quoteOnly) continue

  // Queue the job, then wait on it: /audio/complete takes the queue id and
  // returns the audio itself once the model is done.
  let queueId = resume[id]
  if (queueId) {
    console.log(`  resuming ${queueId}`)
  } else {
    const queued = await post('/audio/queue', body)
    const job = await queued.json().catch(() => null)
    queueId = job?.queue_id ?? job?.id ?? job?.data?.queue_id
    if (!queued.ok || !queueId) {
      console.error(`  queue failed (${queued.status}): ${JSON.stringify(job).slice(0, 400)}`)
      continue
    }
    console.log(`  queued ${queueId}`)
  }

  // Poll until the audio itself comes back. /audio/retrieve answers with JSON
  // ({"status":"PROCESSING"}) while the model renders, and with the sound file
  // once it is done; a job takes about a minute. (/audio/complete is not the
  // wait call: it answers {"success":false} forever.)
  let res = null
  let last = ''
  for (let attempt = 0; attempt < 120; attempt++) {
    res = await post('/audio/retrieve', { model: track.model, queue_id: queueId })
    const contentType = res.headers.get('content-type') ?? ''
    if (res.ok && !contentType.includes('application/json')) break
    last = await res.text()
    if (!res.ok) break
    process.stdout.write('.')
    await new Promise(r => setTimeout(r, 5000))
  }
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || type.includes('application/json')) {
    console.error(`\n  failed (${res.status}): ${last.slice(0, 300)}`)
    continue
  }
  process.stdout.write('\n')

  const ext = type.includes('wav') ? 'wav' : type.includes('flac') ? 'flac' : 'mp3'
  const raw = join(tmpdir(), `lunacy-${id}.${ext}`)
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()))

  // Mono-safe, quiet enough to sit under the effects, and normalised so the
  // tracks match each other.
  // Menu sounds go to public/sfx/ trimmed of silence; music to public/music/.
  const ogg = isSound ? join('public', 'sfx', `${id}.ogg`) : join(out, `${id}.ogg`)
  const filters = isSound
    ? `silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0:detection=peak,loudnorm=I=-18:TP=-2:LRA=7,volume=${track.gain}`
    : 'loudnorm=I=-20:TP=-2:LRA=11'
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
    '-af', filters, '-ac', isSound ? '1' : '2', '-ar', isSound ? '48000' : '44100', '-c:a', 'libvorbis', '-q:a', '3', ogg])
  spent += typeof price === 'number' ? price : 0
  console.log(`  -> ${ogg} (${(statSync(raw).size / 1024 / 1024).toFixed(1)}MB ${ext} -> ${(statSync(ogg).size / 1024).toFixed(0)}KB ogg)`)
}
if (!quoteOnly) console.log(`\nquoted total: $${spent.toFixed(2)}`)
