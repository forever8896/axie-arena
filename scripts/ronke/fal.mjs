/**
 * The fal.ai queue, as one small client the other scripts share.
 *
 * The pipeline this feeds is the one from dot-arena: generate a character on a
 * flat green field, drive it with image-to-video, then cut the frames out with
 * ffmpeg's colorkey. Everything here is the first half of that — getting pixels
 * back from fal and onto disk.
 *
 * The key never lives in the repo. Put it in the environment:
 *   set -a; . ~/.config/ronkacy/env; set +a
 */
/**
 * Checked where it is used rather than on import: several scripts import this
 * file for one helper and never call the API, and exiting at import time made
 * those fail for want of a key they did not need.
 */
function key() {
  const k = process.env.FAL_KEY
  if (!k) {
    console.error('Set FAL_KEY (see ~/.config/ronkacy/env).')
    process.exit(1)
  }
  return k
}

const QUEUE = 'https://queue.fal.run'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const auth = () => ({ Authorization: `Key ${key()}` })

/** A local image as a data URI, which every fal model takes in place of a URL. */
export async function dataUri(path) {
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(path)
  const ext = path.split('.').pop().toLowerCase()
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * Submit, wait, and hand back the finished payload.
 *
 * fal's queue answers immediately with an id and leaves you to poll; a model
 * that takes three minutes is normal here, so the wait is long and the status
 * is printed as it changes rather than silently.
 */
export async function run(model, input, { timeoutMs = 600000, label = model } = {}) {
  const started = Date.now()
  const res = await fetch(`${QUEUE}/${model}`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`${label}: submit failed ${res.status} ${(await res.text()).slice(0, 300)}`)
  const { request_id: id, status_url: statusUrl, response_url: responseUrl } = await res.json()

  let last = null
  for (;;) {
    if (Date.now() - started > timeoutMs) throw new Error(`${label}: still running after ${timeoutMs}ms (${id})`)
    const s = await (await fetch(statusUrl ?? `${QUEUE}/${model}/requests/${id}/status`, { headers: auth() })).json()
    if (s.status !== last) {
      last = s.status
      console.log(`  ${label}: ${s.status} (${Math.round((Date.now() - started) / 1000)}s)`)
    }
    if (s.status === 'COMPLETED') break
    if (s.status === 'FAILED' || s.error) throw new Error(`${label}: ${JSON.stringify(s).slice(0, 400)}`)
    await sleep(3000)
  }

  const out = await (await fetch(responseUrl ?? `${QUEUE}/${model}/requests/${id}`, { headers: auth() })).json()
  return out
}

/** Pull every file a result points at onto disk, and say what landed where. */
export async function download(result, dir, stem) {
  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(dir, { recursive: true })
  const urls = []
  const walk = v => {
    if (!v) return
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return
    if (Array.isArray(v)) return v.forEach(walk)
    if (typeof v === 'object') {
      if (typeof v.url === 'string') urls.push(v.url)
      Object.values(v).forEach(walk)
    }
  }
  walk(result)
  const saved = []
  for (const [i, url] of urls.entries()) {
    const ext = (url.split('?')[0].split('.').pop() || 'bin').slice(0, 4)
    const file = `${dir}/${stem}${urls.length > 1 ? `-${i + 1}` : ''}.${ext}`
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    await writeFile(file, buf)
    saved.push(`${file} (${(buf.length / 1024).toFixed(0)}kB)`)
  }
  return saved
}
