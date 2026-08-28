import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'

const DEBUG_PORT = process.env.DEBUG_PORT ?? '9223'
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173/'

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
  const consoleLogs = []
  let id = 0

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push({
        type: message.params.type,
        args: message.params.args.map((arg) => arg.value ?? arg.description),
      })
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

  return { ws, send, consoleLogs }
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.result.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.text)
  }
  return result.result.result.value
}

function browserExpression() {
  return `(
  async function () {
    const rect = (node) => {
      if (!node) return null
      const r = node.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    }

    const glbRequests = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('ddj-flx4-controller.glb'))
      .map((entry) => ({
        name: entry.name,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        duration: Math.round(entry.duration),
      }))

    const before = {
      viewport: { w: innerWidth, h: innerHeight },
      track: rect(document.querySelector('.track-display-bar')),
      toolbar: rect(document.querySelector('.studio-toolbar')),
      stage: rect(document.querySelector('.controller-stage')),
      wrapper: rect(document.querySelector('.three-scene-wrapper')),
      canvas: rect(document.querySelector('.three-scene-canvas canvas')),
      debug: !!document.querySelector('.three-debug-overlay'),
      textHasMilestone: /M11|M12|M12B/.test(document.body.innerText),
      glbRequests,
    }

    ;[...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Music Library')
      ?.click()
    await new Promise((resolve) => setTimeout(resolve, 300))

    const input = document.querySelector('.library-search input')
    input?.focus()
    if (input) {
      input.value = ''
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
      for (const ch of 'test track 123') {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }))
        input.value += ch
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }))
        input.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }))
      }
      input.setSelectionRange(4, 4)
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
      input.value = input.value.slice(0, 3) + input.value.slice(4)
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
    }

    const drawer = {
      open: document.querySelector('.studio-drawer')?.classList.contains('open'),
      title: document.querySelector('.drawer-header h1')?.textContent,
      rect: rect(document.querySelector('.studio-drawer')),
      typed: input?.value,
      activeTag: document.activeElement?.tagName,
    }

    ;[...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Debug')
      ?.click()
    await new Promise((resolve) => setTimeout(resolve, 300))

    return {
      before,
      drawer,
      debugAfterToggle: !!document.querySelector('.three-debug-overlay'),
    }
  }
)()`
}

const { ws, send, consoleLogs } = await connectPage()
await send('Runtime.enable')
await send('Page.enable')
await send('Network.enable')

async function verifyViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.navigate', { url: APP_URL })
  await new Promise((resolve) => setTimeout(resolve, 5000))
  await send('Page.reload', { ignoreCache: true })
  await new Promise((resolve) => setTimeout(resolve, 5000))
  const result = await evaluate(send, browserExpression())
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = path.resolve(`.tmp-studio-${width}x${height}.png`)
  fs.writeFileSync(file, Buffer.from(screenshot.result.data, 'base64'))
  return { width, height, result, screenshot: file }
}

const desktop = await verifyViewport(1728, 900)
const compact = await verifyViewport(1366, 768)
await send('Emulation.clearDeviceMetricsOverride')

console.log(JSON.stringify({ desktop, compact, consoleLogs }, null, 2))
ws.close()
