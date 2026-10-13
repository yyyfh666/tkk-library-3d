/**
 * 室内截图回路（CDP，不依赖 Playwright / Puppeteer）。
 *
 * 和 preview-shot.mjs 的区别：这个脚本**不点任何按钮**，全程走
 *   `?scene=hall` URL 参数 + `window.__stage` 测试钩子（仅 DEV 暴露），
 * 所以 UI 改文案不会把它弄断。preview-shot.mjs 是回归基线（照旧点按钮），别动它。
 *
 * 起好 dev server 后： node tools/preview-interior.mjs
 * 截图落在 %TEMP%\pano-preview\shots3d\interior-*.png
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL_APP = `${process.env.PREVIEW_URL || 'http://localhost:5174'}/?scene=hall`
const OUT_DIR = 'C:\\Users\\袁帅哥\\AppData\\Local\\Temp\\pano-preview\\shots3d'
const PROFILE = 'C:\\Users\\袁帅哥\\AppData\\Local\\Temp\\pano-preview\\profile-interior'
const PORT = 9336
const W = 1600
const H = 900

const ROOM = `__stage.app.worlds.hall.setCeilingVisible(true);
__stage.app.worlds.hall.setOuterVisible(true);
__stage.app.worlds.hall.setWallsLocked(true)`

/** 机位清单：[名字, 执行的 JS, 之后的等待毫秒] */
const SHOTS = [
  ['interior-01-dollhouse', `__stage.app.worlds.hall.gotoView('dollhouse')`, 1700],
  ['interior-02-topdown', `__stage.setCamera({ pos: [0.01, 64, 0], target: [0, 0, 0], fov: 40 })`, 500],
  ['interior-03-inside', `__stage.app.worlds.hall.gotoView('inside')`, 1700],
  ['interior-04-entry', `${ROOM}; __stage.setCamera({ pos: [0, 1.65, 9.6], target: [0, 1.7, -6], fov: 70 })`, 500],
  ['interior-05-atrium-edge', `${ROOM}; __stage.setCamera({ pos: [0, 1.65, 7.4], target: [0, 3.4, -2], fov: 70 })`, 400],
  ['interior-06-gallery', `${ROOM}; __stage.setCamera({ pos: [10.5, 5.85, 9.0], target: [-3, 3.2, -3], fov: 70 })`, 400],
  ['interior-07-shelf-aisle', `${ROOM}; __stage.setCamera({ pos: [11.0, 1.65, 7.6], target: [15.2, 1.4, 7.6], fov: 70 })`, 400],
  ['interior-08-terrace', `${ROOM}; __stage.setCamera({ pos: [0, 1.65, 9.2], target: [0, 2.4, 1.0], fov: 70 })`, 400],
  ['interior-09-stair', `${ROOM}; __stage.setCamera({ pos: [14.2, 1.65, -1.4], target: [14.2, 3.2, -9], fov: 70 })`, 400],
  ['interior-10-night-entry', `__stage.app.setPhaseTarget(1); ${ROOM}; __stage.setCamera({ pos: [0, 1.65, 9.6], target: [0, 1.7, -6], fov: 70 })`, 2800],
  ['interior-11-night-atrium', `${ROOM}; __stage.setCamera({ pos: [0, 1.65, 7.4], target: [0, 3.4, -2], fov: 70 })`, 400],
]

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
    '--use-angle=swiftshader',
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

const waitFor = async (expression, label, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true
    await sleep(200)
  }
  throw new Error(`等待超时：${label}`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })

console.log(`打开 ${URL_APP}`)
await send('Page.navigate', { url: URL_APP })
await waitFor(`!!document.querySelector('.stage canvas')`, 'canvas 出现')
await waitFor(`!!window.__stage`, '__stage 测试钩子出现')
await sleep(3200) // 等场景建好、纹理与阴影稳定

for (const [name, js, wait] of SHOTS) {
  await evaluate(js)
  await sleep(wait)
  await shoot(name)
}

// —— 曝光探针：用数字守住"过曝 / 死黑"，不靠肉眼看截图 ——
const probe = await evaluate(`__stage.probe(8, 5)`)
const lum = probe.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b)
const max = Math.max(...lum)
const min = Math.min(...lum)
console.log(`\n曝光探针（当前机位 40 点）：max ${max.toFixed(0)} / min ${min.toFixed(0)}（0-255）`)
console.log(max > 250 ? '  ⚠️ 有过曝点' : '  ✔ 无过曝')
console.log(min < 16 ? '  ⚠️ 有死黑点' : '  ✔ 无死黑')

const info = await evaluate(`__stage.info()`)
console.log(`渲染统计：draw calls ${info.calls} / 三角面 ${info.triangles} / 几何体 ${info.geometries} / 贴图 ${info.textures}`)

console.log('\n--- 页面 console ---')
console.log(consoleAll.length ? consoleAll.join('\n') : '（无）')
console.log('--- 未捕获异常 ---')
console.log(pageErrors.length ? pageErrors.join('\n') : '无')

await send('Browser.close').catch(() => {})
ws.close()
await sleep(400)
edge.kill()
