/**
 * 无头 Edge 自动截图回路（CDP，不依赖 Playwright / Puppeteer）。
 * 起好 dev server 后： node tools/preview-shot.mjs
 * 截图落在 %TEMP%\pano-preview\shots\
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL_APP = process.env.PREVIEW_URL || 'http://localhost:5174'
const OUT_DIR = 'C:\\Users\\袁帅哥\\AppData\\Local\\Temp\\pano-preview\\shots3d'
const PROFILE = 'C:\\Users\\袁帅哥\\AppData\\Local\\Temp\\pano-preview\\profile3d'
const PORT = 9334
const W = 1600
const H = 900

mkdirSync(OUT_DIR, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const edge = spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    `--window-size=${W},${H}`,
    '--use-angle=swiftshader', // 无 GPU 时靠软件光栅才有 WebGL
    '--enable-unsafe-swiftshader',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(350)
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
  } catch {
    /* 端口还没起来 */
  }
}
if (!wsUrl) {
  edge.kill()
  throw new Error('Edge 调试端口没起来')
}

const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})

let nextId = 1
const pending = new Map()
const consoleAll = []
const pageErrors = []

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    return
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    consoleAll.push(`[${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
  }
})

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'evaluate 失败')
  return result.value
}

const shoot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT_DIR}\\${name}.png`, Buffer.from(data, 'base64'))
  console.log(`  截图 → ${OUT_DIR}\\${name}.png`)
}

const waitFor = async (expression, label, timeoutMs = 25000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true
    await sleep(200)
  }
  throw new Error(`等待超时：${label}`)
}

// 鼠标绕着中心慢慢划过，让自动漫游之外还有一点交互痕迹（也顺便触发 pointer 事件）
const mouseMove = (x, y, buttons = 0) =>
  send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons, pointerType: 'mouse' })

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })

console.log(`1. 打开 ${URL_APP}`)
await send('Page.navigate', { url: URL_APP })
await waitFor(`!!document.querySelector('.stage canvas')`, 'canvas 出现')

const gl = await evaluate(`(() => {
  const c = document.querySelector('.stage canvas');
  const ctx = c.getContext('webgl2') || c.getContext('webgl');
  return ctx ? ctx.getParameter(ctx.VERSION) : 'NO WEBGL';
})()`)
console.log(`   WebGL: ${gl}`)

await sleep(3500) // 等场景建好、纹理/阴影稳定
console.log('2. 白天')
await shoot('01-island-day')

console.log('3. 切夜晚')
await evaluate(`document.querySelector('.phase-toggle').click()`)
await sleep(2600) // 等昼夜过渡走完
await shoot('02-island-night')

console.log('4. 切回白天，点一个热点看信息卡')
await evaluate(`document.querySelector('.phase-toggle').click()`)
await sleep(2400)
await evaluate(`[...document.querySelectorAll('.chip')].find(b => b.textContent.includes('东侧湖'))?.click()`)
await sleep(1500)
await shoot('03-island-hotspot')

console.log('5. 走进大厅')
await evaluate(`[...document.querySelectorAll('.ctl')].find(b => b.textContent.includes('走进大厅'))?.click()`)
await sleep(2400)
await shoot('04-hall-dollhouse')

console.log('6. 切贴近视角')
await evaluate(`[...document.querySelectorAll('.ctl')].find(b => b.textContent.includes('俯视'))?.click()`)
await sleep(2200)
await shoot('05-hall-inside')

console.log('7. 回校园')
await evaluate(`[...document.querySelectorAll('.ctl')].find(b => b.textContent.includes('回到校园'))?.click()`)
await sleep(2000)
await shoot('06-back-to-island')

console.log('\n--- 页面 console ---')
console.log(consoleAll.length ? consoleAll.join('\n') : '（无）')
console.log('--- 未捕获异常 ---')
console.log(pageErrors.length ? pageErrors.join('\n') : '无')

await send('Browser.close').catch(() => {})
ws.close()
await sleep(400)
edge.kill()
