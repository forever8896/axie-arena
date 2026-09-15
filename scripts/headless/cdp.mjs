/**
 * Minimal Chrome DevTools Protocol driver: headless Chromium, no dependencies
 * (Node's built-in WebSocket). Used by check-flow.mjs.
 *
 * Headless Chromium renders WebGL in software, so a match runs at a few frames
 * per second: wait on game state, never on wall-clock time.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 9333
const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function launch({ width = 1480, height = 812 } = {}) {
  const proc = spawn('/usr/bin/chromium', [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--autoplay-policy=no-user-gesture-required', `--window-size=${width},${height}`,
    `--user-data-dir=${join(tmpdir(), 'lunacy-chrome-profile')}`,
    'about:blank',
  ], { stdio: 'ignore' })

  let version
  for (let i = 0; i < 50 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json() } catch { await sleep(200) }
  }
  if (!version) throw new Error('chromium did not start')

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

  let id = 0
  const pending = new Map()
  const logs = []
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text))
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      logs.push(msg.params.type.toUpperCase() + ' ' + msg.params.args.map(a => a.value ?? a.description).join(' '))
    }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify({ id: n, method, params }))
  })

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })

  return {
    logs,
    async goto(url) { await send('Page.navigate', { url }); await sleep(500) },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    },
    async waitFor(expression, timeoutMs = 60000) {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        try { if (await this.eval(expression)) return true } catch {}
        await sleep(400)
      }
      throw new Error('timed out waiting for: ' + expression)
    },
    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(file, Buffer.from(r.data, 'base64'))
      return file
    },
    close() { try { ws.close() } catch {} proc.kill('SIGKILL') },
  }
}
