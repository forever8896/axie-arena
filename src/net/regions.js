/**
 * Where the rooms are, and how far away each one is from here.
 *
 * Each region is a separate server with its own rooms. That is the whole point
 * of listing them: a room in Singapore and a room in Amsterdam with the same
 * name are two different places, and two friends who pick different regions
 * would never meet. So the choice is made in front of the player, with the
 * distance to each one measured rather than guessed, and the nearest suggested.
 *
 * Measured with a plain HTTP request to /healthz, which needs no socket and
 * joins no room: pinging should cost nothing and commit to nothing.
 */

/** Rooms are the same everywhere; only the distance differs. */
export const REGIONS = [
  { id: 'eu', name: 'Europe', where: 'Amsterdam', origin: 'https://lunacy.up.railway.app' },
  { id: 'sg', name: 'Asia', where: 'Singapore', origin: 'https://lunacy-sg-production.up.railway.app' },
]

/** Anything more than this and the game is worth playing somewhere closer. */
export const FAR_MS = 120

/** How much closer another region must be before it is worth suggesting. */
export const WORTH_SWITCHING_MS = 60

const KEY = 'lunacy.region'

/**
 * Playing against a server on this machine: development, or a copy of the game
 * hosted somewhere without a region list. The page's own origin always works.
 */
export function here() {
  if (typeof location === 'undefined') return null
  const origin = location.origin
  const known = REGIONS.find(r => r.origin === origin)
  if (known) return null
  return { id: 'local', name: 'This server', where: originLabel(origin), origin }
}

const originLabel = origin => {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** The regions to offer, including whatever is serving this page. */
export function available() {
  const local = here()
  return local ? [local, ...REGIONS] : REGIONS
}

export const wsUrl = region => `${region.origin.replace(/^http/, 'ws')}/ws`
export const roomsUrl = region => `${region.origin}/api/rooms`

/**
 * Time a few requests to a region and keep the best: the fastest of several is
 * a better picture of the distance than the average, which any one stalled
 * request would spoil.
 */
export async function measure(region, { samples = 3, timeoutMs = 4000 } = {}) {
  let best = Infinity
  for (let i = 0; i < samples; i++) {
    const at = performance.now()
    try {
      const done = await withTimeout(fetch(`${region.origin}/healthz`, { cache: 'no-store' }), timeoutMs)
      if (!done.ok) throw new Error(String(done.status))
      best = Math.min(best, performance.now() - at)
    } catch {
      // Unreachable regions stay at Infinity and are shown as unavailable
      // rather than quietly dropped: a region that is down is worth knowing.
    }
  }
  return best === Infinity ? null : Math.round(best)
}

/** Every region, measured at once, with the results in the same order. */
export async function measureAll(regions = available(), opts) {
  const pings = await Promise.all(regions.map(r => measure(r, opts)))
  return regions.map((region, i) => ({ region, ping: pings[i] }))
}

/** The closest region that answered. */
export function nearest(measured) {
  const reachable = measured.filter(m => m.ping != null)
  if (!reachable.length) return null
  return reachable.reduce((a, b) => (b.ping < a.ping ? b : a))
}

/**
 * Whether to say something. Only when another region is meaningfully closer —
 * nagging a player about twenty milliseconds would be noise.
 */
export function suggestion(measured, chosenId) {
  const mine = measured.find(m => m.region.id === chosenId)
  const best = nearest(measured)
  if (!best || !mine || best.region.id === chosenId) return null
  if (mine.ping == null) return { region: best.region, ping: best.ping, why: 'unreachable' }
  if (mine.ping - best.ping < WORTH_SWITCHING_MS) return null
  return { region: best.region, ping: best.ping, was: mine.ping, why: 'closer' }
}

// --- What the player chose last time ----------------------------------------

export function remember(id) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Storage blocked: the choice lasts this session instead of forever.
  }
}

export function remembered() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(reject, ms, new Error('timeout'))),
  ])
}
