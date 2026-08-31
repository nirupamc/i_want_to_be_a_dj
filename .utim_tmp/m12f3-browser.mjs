import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'

const APP_URL = 'http://127.0.0.1:5173/'
const DEBUG_PORT = '9223'
const OUT_DIR = 'ref/final-interaction'
const TRACK_A = path.resolve(OUT_DIR, 'm12f3-track-a.wav')
const TRACK_B = path.resolve(OUT_DIR, 'm12f3-track-b.wav')

function writeWav(filePath, frequency, bpm, durationSeconds) {
  const sampleRate = 44100
  const samples = Math.floor(sampleRate * durationSeconds)
  const bytesPerSample = 2
  const dataSize = samples * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28)
  buffer.writeUInt16LE(bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  const beatInterval = 60 / bpm
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate
    const beatPhase = (t % beatInterval) / beatInterval
    const transient = Math.exp(-beatPhase * 34)
    const tone = Math.sin(2 * Math.PI * frequency * t) * 0.18
    const sub = Math.sin(2 * Math.PI * frequency * 0.5 * t) * 0.11
    const value = Math.max(-1, Math.min(1, tone + sub + transient * 0.72))
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * bytesPerSample)
  }
  fs.writeFileSync(filePath, buffer)
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve(JSON.parse(body)))
    }).on('error', reject)
  })
}

async function connect() {
  const tabs = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json`)
  const tab = tabs.find((entry) => entry.url.startsWith(APP_URL)) ?? tabs.find((entry) => entry.type === 'page')
  if (!tab?.webSocketDebuggerUrl) throw new Error('No app tab')
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
  const send = (method, params = {}) => new Promise((resolve) => {
    pending.set(++id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { ws, send }
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.exception?.description ?? result.result.exceptionDetails.text)
  return result.result.result.value
}

async function capture(send, fileName) {
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(path.join(OUT_DIR, fileName), Buffer.from(screenshot.result.data, 'base64'))
}

async function mouseClick(send, x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await new Promise((resolve) => setTimeout(resolve, 50))
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await new Promise((resolve) => setTimeout(resolve, 50))
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

fs.mkdirSync(OUT_DIR, { recursive: true })
writeWav(TRACK_A, 130, 120, 10)
writeWav(TRACK_B, 235, 96, 11)

const { ws, send } = await connect()
await send('Runtime.enable')
await send('Page.enable')
await send('DOM.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1728, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: APP_URL })
await new Promise((resolve) => setTimeout(resolve, 5500))
await send('Page.reload', { ignoreCache: true })
await new Promise((resolve) => setTimeout(resolve, 5500))

await evaluate(send, `(() => {
  if (!document.querySelector('input[type=file][accept="audio/*"]')) {
    Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Music Library')?.click()
  }
})()`)
await new Promise((resolve) => setTimeout(resolve, 500))
const input = await send('DOM.getDocument').then(async (doc) => {
  const found = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input[type=file][accept="audio/*"]' })
  return found.result.nodeId
})
if (!input) throw new Error('Import input not found')
await send('DOM.setFileInputFiles', { nodeId: input, files: [TRACK_A, TRACK_B] })
await new Promise((resolve) => setTimeout(resolve, 4500))

const loadButtons = await evaluate(send, `(() => {
  const center = (button) => {
    const r = button.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: button.textContent.trim() }
  }
  const rows = Array.from(document.querySelectorAll('.library-row'))
  return [
    center(rows[0]?.querySelector('.load-a-btn')),
    center(rows[1]?.querySelector('.load-b-btn')),
  ]
})()`)
await mouseClick(send, loadButtons[0].x, loadButtons[0].y)
await new Promise((resolve) => setTimeout(resolve, 2500))
await mouseClick(send, loadButtons[1].x, loadButtons[1].y)
await new Promise((resolve) => setTimeout(resolve, 5000))

const closeButton = await evaluate(send, `(() => {
  const button = Array.from(document.querySelectorAll('button')).find((entry) => entry.textContent.trim() === 'Close')
  const r = button.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
})()`)
await mouseClick(send, closeButton.x, closeButton.y)
await new Promise((resolve) => setTimeout(resolve, 1000))
await capture(send, 'waveform-after.png')

const seekProof = await evaluate(send, `(() => {
  const engine = globalThis.__LEN_DJ_ENGINE__
  if (!engine) return null
  engine.dispatch({ type: 'SEEK', deck: 0, seconds: 4.2 })
  engine.dispatch({ type: 'SEEK', deck: 1, seconds: 3.4 })
  engine.dispatch({ type: 'PAD_DOWN', deck: 0, padIndex: 0 })
  engine.dispatch({ type: 'PAD_UP', deck: 0, padIndex: 0 })
  engine.dispatch({ type: 'PAD_DOWN', deck: 1, padIndex: 1 })
  engine.dispatch({ type: 'PAD_UP', deck: 1, padIndex: 1 })
  engine.dispatch({ type: 'LOOP_4_BEAT', deck: 0 })
  return engine.getState().decks.map((deck) => ({ position: deck.position, loop: deck.loop, hotCues: deck.hotCues.filter((cue) => cue.active) }))
})()`)
await new Promise((resolve) => setTimeout(resolve, 500))
await capture(send, 'waveform-beatgrid.png')

const playDispatch = await evaluate(send, `(() => {
  const engine = globalThis.__LEN_DJ_ENGINE__
  if (!engine) return null
  engine.dispatch({ type: 'PLAY', deck: 0 })
  engine.dispatch({ type: 'PLAY', deck: 1 })
  return engine.getState().decks.map((deck) => ({ playing: deck.isPlaying, position: deck.position }))
})()`)
await new Promise((resolve) => setTimeout(resolve, 1600))
await capture(send, 'waveform-playing-both.png')

const proof = await evaluate(send, `(() => {
  const stateText = (selector) => document.querySelector(selector)?.textContent ?? ''
  const canvasInfo = Array.from(document.querySelectorAll('.dj-waveform')).map((canvas) => {
    const r = canvas.getBoundingClientRect()
    return { testid: canvas.getAttribute('data-testid'), w: Math.round(r.width), h: Math.round(r.height), backingW: canvas.width, backingH: canvas.height }
  })
  return {
    leftText: stateText('.track-display.deck-left'),
    rightText: stateText('.track-display.deck-right'),
    canvasInfo,
    debugVisible: !!document.querySelector('.three-debug-overlay'),
    playDispatch: ${JSON.stringify(playDispatch)},
    seekProof: ${JSON.stringify(seekProof)},
  }
})()`)

console.log(JSON.stringify({ trackA: TRACK_A, trackB: TRACK_B, proof }, null, 2))
ws.close()
