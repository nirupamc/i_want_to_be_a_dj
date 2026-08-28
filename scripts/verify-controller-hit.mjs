import * as http from 'node:http'
import * as fs from 'node:fs'

const tabs = await new Promise((resolve, reject) => {
  http.get('http://127.0.0.1:9223/json', (response) => {
    let body = ''
    response.on('data', (chunk) => { body += chunk })
    response.on('end', () => resolve(JSON.parse(body)))
  }).on('error', reject)
})

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'
const tabOrigin = new URL(APP_URL).origin
const tab = tabs.find((entry) => entry.url.startsWith(tabOrigin))
if (!tab?.webSocketDebuggerUrl) throw new Error('No debuggable localhost page')

const ws = new WebSocket(tab.webSocketDebuggerUrl)
const pending = new Map()
let id = 0
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
}
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

function send(method, params = {}) {
  id += 1
  return new Promise((resolve) => {
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text)
  return result.result.result.value
}

await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1728, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: APP_URL })
await new Promise((resolve) => setTimeout(resolve, 5000))
await send('Page.reload', { ignoreCache: true })
await new Promise((resolve) => setTimeout(resolve, 5000))
const cleanScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
fs.writeFileSync('.tmp-studio-clean.png', Buffer.from(cleanScreenshot.result.data, 'base64'))

const debugEnabled = await evaluate(`(() => {
  [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Debug')?.click()
  return !!document.querySelector('.three-debug-overlay')
})()`)
await new Promise((resolve) => setTimeout(resolve, 500))

const canvas = await evaluate(`(() => {
  const r = document.querySelector('.three-scene-canvas canvas').getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})()`)
const debugScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
fs.writeFileSync('.tmp-studio-hitboxes.png', Buffer.from(debugScreenshot.result.data, 'base64'))

const requiredIds = [
  'deck.left.play', 'deck.left.cue', 'deck.left.pad.01',
  'deck.right.play', 'deck.right.cue', 'deck.right.pad.01',
  'mixer.channel1.trim', 'mixer.channel1.eq.high', 'mixer.channel1.fader',
  'mixer.crossfader', 'deck.left.tempo', 'deck.left.jog', 'deck.right.jog',
  'browse.encoder', 'fx.levelDepth'
]
const candidates = await evaluate(`(globalThis.__DDJ_FLX4_CONTROL_PROBES__ ?? []).filter((probe) => ${JSON.stringify(requiredIds)}.includes(probe.id))`)
const visiblePositions = {
  'deck.left.play': [369, 754], 'deck.left.cue': [369, 683], 'deck.left.pad.01': [430, 714],
  'deck.left.tempo': [635, 672], 'deck.left.jog': [522, 472],
  'deck.right.play': [1076, 754], 'deck.right.cue': [1076, 683], 'deck.right.pad.01': [1137, 714],
  'deck.right.tempo': [1093, 672], 'deck.right.jog': [1209, 472],
  'mixer.channel1.trim': [821, 307], 'mixer.channel1.eq.high': [821, 359],
  'mixer.channel1.fader': [821, 623], 'mixer.crossfader': [864, 778],
  'browse.encoder': [865, 253], 'fx.levelDepth': [989, 648]
}
for (const probe of candidates) {
  const position = visiblePositions[probe.id]
  if (position) [probe.x, probe.y] = position
}
const hits = []
for (const probe of candidates) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: probe.x, y: probe.y })
  await new Promise((resolve) => setTimeout(resolve, 15))
  const overlay = await evaluate(`document.querySelector('.three-debug-overlay')?.innerText ?? ''`)
  const value = overlay.split('\n')[1] ?? '—'
  hits.push({ id: probe.id, x: probe.x, y: probe.y, value, hoverMatched: value === probe.id })
}
for (const id of ['deck.left.tempo', 'mixer.channel1.fader']) {
  const current = hits.find((hit) => hit.id === id)
  if (!current || current.hoverMatched) continue
  for (let y = 250; y <= 500 && !current.hoverMatched; y += 10) {
    for (let x = current.x - 40; x <= current.x + 40; x += 10) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await new Promise((resolve) => setTimeout(resolve, 15))
      const overlay = await evaluate(`document.querySelector('.three-debug-overlay')?.innerText ?? ''`)
      const value = overlay.split('\n')[1] ?? '—'
      if (value === id) {
        current.x = x
        current.y = y
        current.value = value
        current.hoverMatched = true
        break
      }
    }
  }
}
const callbacks = []
for (const hit of hits) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 })
  await new Promise((resolve) => setTimeout(resolve, 25))
  const pressedOverlay = await evaluate(`document.querySelector('.three-debug-overlay')?.innerText ?? ''`)
  if (!hit.id.endsWith('.jog') && !hit.id.includes('.play') && !hit.id.includes('.cue') && !hit.id.includes('.pad.')) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.x, y: hit.y - 30, buttons: 1 })
  }
  await new Promise((resolve) => setTimeout(resolve, 25))
  const draggedOverlay = await evaluate(`document.querySelector('.three-debug-overlay')?.innerText ?? ''`)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 })
  await new Promise((resolve) => setTimeout(resolve, 40))
  const overlay = await evaluate(`document.querySelector('.three-debug-overlay')?.innerText ?? ''`)
  callbacks.push({
    id: hit.id,
    callbackObserved: [pressedOverlay, draggedOverlay, overlay].some((text) => text.includes(`DOWN ${hit.id}`) || text.includes(`UP   ${hit.id}`) || text.includes(`VAL  ${hit.id}`) || text.includes(`JOG+ ${hit.id}`)),
    pressed: pressedOverlay.split('\n').slice(0, 4).join(' / '),
    dragged: draggedOverlay.split('\n').slice(0, 6).join(' / ')
  })
}
const diagnostics = await evaluate(`(globalThis.__DDJ_FLX4_HITBOX_DIAGNOSTICS__ ?? []).filter((diagnostic) => ${JSON.stringify(requiredIds)}.includes(diagnostic.id))`)
console.log(JSON.stringify({ canvas, debugEnabled, hits, callbacks, diagnostics, screenshot: '.tmp-studio-clean.png', debugScreenshot: '.tmp-studio-hitboxes.png' }, null, 2))
ws.close()
