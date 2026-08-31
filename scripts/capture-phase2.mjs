import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'

const DEBUG_PORT = process.env.DEBUG_PORT ?? '9222'
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
const OUT_DIR = path.resolve('ref/phase2')

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolve(JSON.parse(body)))
    }).on('error', reject)
  })
}

async function connectPage() {
  const tabs = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json`)
  const appOrigin = new URL(APP_URL).origin
  const tab = tabs.find((t) => t.url.startsWith(appOrigin)) ?? tabs.find((t) => t.type === 'page')
  if (!tab?.webSocketDebuggerUrl) throw new Error('No debuggable Chrome page found')
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
  return { ws, send }
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text)
  return result.result.result.value
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function setViewport(send, width, height, zoom = 1) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    scale: zoom,
  })
  await send('Page.navigate', { url: APP_URL })
  await wait(4200)
}

async function screenshot(send, file) {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const out = path.join(OUT_DIR, file)
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  return out
}

async function clickButton(send, text) {
  await evaluate(send, `([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === ${JSON.stringify(text)}) ?? null)?.click()`)
  await wait(500)
}

async function clickButtonStarts(send, text) {
  await evaluate(send, `([...document.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith(${JSON.stringify(text)})) ?? null)?.click()`)
  await wait(500)
}

async function setTheme(send, themeText) {
  await clickButton(send, 'Settings')
  await clickButton(send, 'Appearance')
  await clickButton(send, themeText)
  await wait(900)
  await clickButton(send, 'Settings')
}

async function addSticker(send) {
  await clickButton(send, 'Settings')
  await clickButton(send, 'Customization')
  await evaluate(send, `
    (function () {
      const input = document.querySelector('input[type=file][accept="image/*"]')
      const data = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="18" fill="#f6a33a"/><path d="M23 74h82v15H23zM31 37h66v18H31z" fill="#07090c"/></svg>')
      window.__PHASE2_ADD_STICKER__?.(data)
      return !!input
    })()
  `)
  await wait(700)
}

async function metrics(send) {
  return evaluate(send, `
    (function () {
      const rect = (selector) => {
        const node = document.querySelector(selector)
        if (!node) return null
        const r = node.getBoundingClientRect()
        return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      }
      return {
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        header: rect('.track-display-bar'),
        toolbar: rect('.studio-toolbar'),
        stage: rect('.controller-stage'),
        labels: document.querySelectorAll('.control-label-callout').length,
        stickerEditing: document.querySelector('.sticker-layer')?.classList.contains('editing') ?? false
      }
    })()
  `)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const { ws, send } = await connectPage()
await send('Runtime.enable')
await send('Page.enable')

const captures = []
await setViewport(send, 1728, 900)
captures.push(await screenshot(send, 'controller-labels-off.png'))
await clickButtonStarts(send, 'Labels')
captures.push(await screenshot(send, 'controller-labels-on.png'))
await clickButtonStarts(send, 'Labels')
captures.push(await screenshot(send, 'controller-labels-full.png'))
captures.push(await screenshot(send, 'pad-labels-closeup.png'))
captures.push(await screenshot(send, 'mixer-labels-closeup.png'))
captures.push(await screenshot(send, 'header-1728.png'))

await setViewport(send, 1920, 1080)
captures.push(await screenshot(send, 'header-1920.png'))
await setViewport(send, 1366, 768)
await clickButtonStarts(send, 'Labels')
await clickButtonStarts(send, 'Labels')
captures.push(await screenshot(send, 'header-1366.png'))

await setViewport(send, 1728, 900, 0.9)
captures.push(await screenshot(send, 'header-zoom90.png'))
await setViewport(send, 1728, 900, 1.1)
captures.push(await screenshot(send, 'header-zoom110.png'))

await setViewport(send, 1728, 900)
await setTheme(send, 'Glossy black')
captures.push(await screenshot(send, 'glossy-theme.png'))

await addSticker(send)
captures.push(await screenshot(send, 'sticker-edit.png'))
await clickButton(send, 'Finish editing')
await clickButton(send, 'Settings')
captures.push(await screenshot(send, 'sticker-normal-mode.png'))

const result = await metrics(send)
console.log(JSON.stringify({ captures, result }, null, 2))
ws.close()
