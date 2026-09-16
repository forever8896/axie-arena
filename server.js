#!/usr/bin/env node
/**
 * Serves the built game. Dependency-free on purpose: the whole thing is
 * static files, and a deploy should not pull in a web framework to hand out
 * a few megabytes of art.
 *
 * Fingerprinted bundles under /assets are cached hard; everything else is
 * revalidated, so a redeploy is picked up without a stale index.
 */
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'

const ROOT = join(process.cwd(), 'dist')
const PORT = Number(process.env.PORT) || 8080

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers })
  res.end(body)
}

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed')

  // Health check for the platform, before touching the disk.
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/healthz') return send(res, 200, 'ok')

  // Never serve outside dist/, whatever the path says.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(ROOT, rel)
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden')

  let stat = null
  try {
    stat = statSync(file)
    if (stat.isDirectory()) {
      file = join(file, 'index.html')
      stat = statSync(file)
    }
  } catch {
    // One page, so anything unknown falls back to it.
    file = join(ROOT, 'index.html')
    try {
      stat = statSync(file)
    } catch {
      return send(res, 404, 'Not found')
    }
  }

  const ext = extname(file).toLowerCase()
  const immutable = rel.startsWith('/assets/') && ext !== '.html'
  const headers = {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  }
  res.writeHead(200, headers)
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}).listen(PORT, () => {
  console.log(`Lunacy is being served from ${ROOT} on :${PORT}`)
})
