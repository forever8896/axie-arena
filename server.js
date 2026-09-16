#!/usr/bin/env node
/**
 * Serves the built game, and hosts the rooms it connects to.
 *
 * The file server is still what it was: static files, no framework, with
 * fingerprinted bundles under /assets cached hard and everything else
 * revalidated so a redeploy is picked up without a stale index.
 *
 * Alongside it, /ws carries the room authority (src/net) and /api/rooms is
 * what the lobby reads. The rooms run on this process's clock whether or not
 * anybody is connected, which is what makes the Wilds endless.
 */
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { attachNet } from './src/net/wsServer.js'

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

/**
 * The health check and the room list are read by the game running on the other
 * region's origin: that is how a player is shown what each server costs them in
 * milliseconds before they pick one. Both are public and read-only — a room
 * count and the word "ok" — so they are readable from anywhere. Nothing that
 * changes anything is exposed this way, and /ws is not subject to this at all.
 */
const PUBLIC = {
  'Access-Control-Allow-Origin': '*',
  'Timing-Allow-Origin': '*',
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed')

  // Health check for the platform, before touching the disk.
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/healthz') return send(res, 200, 'ok', PUBLIC)

  // What the lobby reads: the live rooms, as the authority sees them.
  if (url.pathname === '/api/rooms') {
    return send(res, 200, JSON.stringify({ rooms: net.host.roomList() }), {
      'Content-Type': 'application/json; charset=utf-8',
      ...PUBLIC,
    })
  }

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
})

const net = attachNet(server)

server.listen(PORT, () => {
  console.log(`Lunacy is being served from ${ROOT} on :${PORT}`)
  console.log(`Rooms are live on ws://…:${PORT}/ws — ${net.host.defs.length} in the lobby`)
})
