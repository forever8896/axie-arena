/**
 * WebSockets in front of the room authority.
 *
 * This file is the only part of the server that knows what a socket is. It
 * translates frames into messages for RoomHost and back, and defends the tick
 * loop from the network: small payloads, a cap on how fast a client may talk,
 * and a heartbeat so a half-open connection does not hold a seat in a room.
 */
import { WebSocketServer } from 'ws'
import RoomHost, { Client } from './host.js'
import { LIVE_ROOM } from '../wilds/config.js'
import * as P from './protocol.js'

/** An input is a few dozen bytes; anything large is not a client of ours. */
const MAX_PAYLOAD = 4096

/** Inputs run at 60/s. Past this a client is shouting, and gets dropped. */
const MAX_MSGS_PER_SEC = 180

/** No pong within two beats and the socket is gone, whatever it claims. */
const HEARTBEAT_MS = 15000

export function attachNet(server, { path = '/ws', rooms = [LIVE_ROOM], ...opts } = {}) {
  const host = new RoomHost({ rooms, ...opts }).start()
  const wss = new WebSocketServer({ server, path, maxPayload: MAX_PAYLOAD })

  wss.on('connection', socket => {
    const client = host.add(new Client(msg => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg))
    }))

    socket.isAlive = true
    let windowAt = Date.now()
    let count = 0

    socket.on('pong', () => { socket.isAlive = true })

    socket.on('message', raw => {
      const now = Date.now()
      if (now - windowAt >= 1000) {
        windowAt = now
        count = 0
      }
      if (++count > MAX_MSGS_PER_SEC) {
        client.send(P.oops('too-fast'))
        socket.close(1008, 'too fast')
        return
      }
      const msg = P.parse(raw)
      if (!host.handle(client, msg)) client.send(P.oops('unknown'))
    })

    socket.on('close', () => host.drop(client))
    socket.on('error', () => host.drop(client))
  })

  const beat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate()
        continue
      }
      socket.isAlive = false
      socket.ping()
    }
  }, HEARTBEAT_MS)
  beat.unref?.()

  return {
    host,
    wss,
    close() {
      clearInterval(beat)
      host.stop()
      for (const socket of wss.clients) socket.terminate()
      return new Promise(resolve => wss.close(resolve))
    },
  }
}
