/**
 * 通用抓图 / 探针小工具（CDP，不依赖 Playwright / Puppeteer）。
 *
 * 两条既有回路是"固定剧本"（preview-shot 点按钮 / preview-interior 走 __stage），
 * 这个是为了**临时看一眼**：接一段 JS、拍一张、把 console 与异常带回来。
 *
 * 用法：
 *   node tools/capture.mjs --url=http://localhost:5174/ --shot=名字 --js="__stage.setCamera({pos:[0,26,22],target:[0,2,0]})" --wait=1200 [--out=目录]
 *   可重复 --shot/--js/--wait，按顺序拍；带 --probe 时最后打印 __stage.probe 的曝光统计。
 *   --eval="表达式" 会在每张图前额外跑一次并把返回值打印出来（诊断用）。
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (name, dflt = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const argAll = (name) =>
  argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3))

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL_APP = arg('url', 'http://localhost:5174/')
const OUT_DIR = arg('out', 'C:\\Users\\袁帅哥\\AppData\\Local\\Temp\\pano-preview\\shots3d')
const PROFILE = arg('profile', 'C:\\Users\\袁帅哥\\AppData\\Local\\Temp\\pano-preview\\profile-capture')
const PORT = Number(arg('cdp-port', '9338'))
const W = Number(arg('w', '1600'))
const H = Number(arg('h', '900'))

// 每次 --js= 开一张图：名字取同序的 --shot=，缺省 shot-N
const shots = argAll('js').map((js, i) => ({
  js,
  name: argAll('shot')[i] ?? `shot-${i + 1}`,
  wait: Number(argAll('wait')[i] ?? '1200'),
  evals: argAll('eval'),
}))

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
await sleep(Number(arg('settle', '3500')))

for (const s of shots) {
  if (s.js) await evaluate(s.js)
  await sleep(s.wait)
  for (const e of s.evals) {
    const v = await evaluate(e)
    console.log(`  ${s.name} · ${e} → ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT_DIR}\\${s.name}.png`, Buffer.from(data, 'base64'))
  console.log(`  截图 → ${OUT_DIR}\\${s.name}.png`)
}

if (argv.includes('--probe')) {
  const probe = await evaluate(`__stage.probe(8, 5)`)
  const lum = probe.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b)
  console.log(
    `\n曝光探针：max ${Math.max(...lum).toFixed(0)} / min ${Math.min(...lum).toFixed(0)} / 平均 ${(
      lum.reduce((a, b) => a + b, 0) / lum.length
    ).toFixed(0)}，过曝点 ${lum.filter((v) => v > 250).length}/40`,
  )
  const info = await evaluate(`__stage.info()`)
  console.log(`渲染统计：draw calls ${info.calls} / 三角面 ${info.triangles}`)
}

console.log('\n--- 页面 console ---')
console.log(consoleAll.length ? consoleAll.join('\n') : '（无）')
console.log('--- 未捕获异常 ---')
console.log(pageErrors.length ? pageErrors.join('\n') : '无')

await send('Browser.close').catch(() => {})
ws.close()
await sleep(400)
edge.kill()
