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

  // —— 真正的第一视角模式（enterWalkInstant + setWalkPose，不走 PointerLock）——
  ['interior-12-walk-entry', `__stage.app.setPhaseTarget(0); __stage.setWalkPose(0, 9.4, 0, -0.02, 0)`, 2600],
  ['interior-13-walk-atrium', `__stage.setWalkPose(0, 7.0, 0, 0.16, 0)`, 400],
  ['interior-14-walk-gallery', `__stage.setWalkPose(10.8, 8.6, 0.9, -0.05, 4.2)`, 400],
  ['interior-15-walk-shelf', `__stage.setWalkPose(11.2, 7.4, -1.57, -0.04, 0)`, 400],
  ['interior-16-walk-stair', `__stage.setWalkPose(14.2, -1.4, 0, 0.14, 0)`, 400],
  ['interior-17-walk-terrace', `__stage.setWalkPose(0, 6.6, 0, 0.03, 0)`, 400],
  ['interior-18-walk-night', `__stage.app.setPhaseTarget(1); __stage.setWalkPose(0, 7.0, 0, 0.1, 0)`, 2800],
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

// —— 准星拾取实测：站在中庭边上把准星对准"中庭挑空"热点，看提示有没有出来 ——
await evaluate(`__stage.setWalkPose(0, 8, 0, 0.29, 0)`)
// 软件渲染只有 1~2 fps，React 把提示渲染出来可能要好几帧 —— 轮询等它，别读一次就下结论
let prompt = ''
for (let i = 0; i < 12 && !prompt; i++) {
  await sleep(400)
  prompt = await evaluate(`document.querySelector('.walk-prompt')?.textContent ?? ''`)
}
const pickDiag = await evaluate(`(() => {
  const hall = __stage.app.worlds.hall
  const cfg = hall.pickHotspot()
  return { active: hall.walkActive, hit: cfg ? cfg.id : null, prompts: document.querySelectorAll('.walk-prompt').length }
})()`)
console.log(`\n准星拾取：${prompt ? `✔ 命中「${prompt}」` : '✘ 没有命中任何热点（提示条没出来）'}`)
console.log(`  诊断：walkActive=${pickDiag.active} 射线命中=${pickDiag.hit ?? 'null'} DOM 提示条=${pickDiag.prompts}`)
await shoot('interior-19-walk-pick')

// —— 键盘接线自检：合成一次真实 keydown，确认事件能到控制器（只验证"动了一下"）——
await evaluate(`__stage.setWalkPose(0, 9.4, 0, 0, 0)`)
await sleep(600)
const before = await evaluate(`__stage.app.worlds.hall.walker.getPose().z`)
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`)
await sleep(1600)
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`)
const after = await evaluate(`__stage.app.worlds.hall.walker.getPose().z`)
console.log(
  `\n键盘接线：${Math.abs(after - before) > 0.02 ? `✔ W 键生效（z ${before.toFixed(2)} → ${after.toFixed(2)}）` : '✘ 按了 W 没动'}`,
)

// —— 走路仿真（60Hz 步进，不受渲染帧率影响）——
console.log('\n走路仿真（期望：看台 y 0.4~1.1 / 楼梯到 y≈4.2 / 一层栏杆 x≈8.4 且 y=0 / 二层 y=4.2 不坠落）')
const simWalk = async (label, setup, seconds, keys = ['KeyW']) => {
  const p = await evaluate(`__stage.simulateWalk(${JSON.stringify(keys)}, ${seconds}, ${setup})`)
  console.log(`  ${label}: x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`)
}
await simWalk('走上看台（0,9.4 向北 2.5s）', '[0, 9.4, 0, 0, 0]', 2.5)
await simWalk('爬上楼梯到二层（14.2,-1 向北 4.6s）', '[14.2, -1.0, 0, 0, 0]', 4.6)
await simWalk('一层撞中庭栏杆（10.5,0 向西 2.5s）', '[10.5, 0, 1.5708, 0, 0]', 2.5)
await simWalk('二层回廊撞栏杆（10.8,8.6 向中庭 3s）', '[10.8, 8.6, 0.9, 0, 4.2]', 3.0)
await simWalk('书巷里走（11,7.4 向东 2s）', '[11, 7.4, -1.5708, 0, 0]', 2.0)
await simWalk('下楼梯（14.2,-10 向南 5s）', '[14.2, -10, 3.1416, 0, 4.2]', 5.0)

// —— 曝光探针：用数字守住"过曝 / 死黑"，不靠肉眼看截图 ——
// 固定机位再测：白天、入口内一步（最亮的白瓷砖 + 顶光都在这张画面里）
await evaluate(`__stage.app.setPhaseTarget(0); __stage.setWalkPose(0, 8.6, 0, 0, 0)`)
await sleep(5000) // 相位过渡在 1~2fps 下要好几秒才走完
await shoot('interior-20-probe-view') // 和探针同一机位，方便对着找最亮的那个点
const probe = await evaluate(`__stage.probe(8, 5)`)
const lum = probe.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b)
const max = Math.max(...lum)
const min = Math.min(...lum)
const mean = lum.reduce((a, b) => a + b, 0) / lum.length
const hot = lum.filter((v) => v > 250).length
console.log(`\n曝光探针（当前机位 40 点）：max ${max.toFixed(0)} / min ${min.toFixed(0)} / 平均 ${mean.toFixed(0)}（0-255）`)
// 判据是"形态"而不是单个点的极值：光亮的抛光面上总会有零星的镜面高光点（正常），
// 真正要防的是**整片死白**（过曝点成堆）和**整厅发灰**（平均亮度偏离）。
console.log(`  过曝点 ${hot}/40 ${hot > 2 ? '⚠️ 偏多，可能有整片死白' : '✔ 只有零星高光'}`)
console.log(`  平均亮度 ${mean.toFixed(0)} ${mean < 25 || mean > 200 ? '⚠️ 整体过暗/过亮' : '✔ 正常'}`)
console.log(min < 16 ? '  ⚠️ 有死黑点' : '  ✔ 无死黑')
if (hot > 2) {
  // 过曝点在哪、是什么材质：对着屏幕坐标打射线问场景（比盯着截图猜快一万倍）
  const hotPoints = lum
    .map((v, i) => ({ v, x: ((i % 8) + 0.5) / 8, y: (Math.floor(i / 8) + 0.5) / 5 }))
    .filter((s) => s.v > 250)
  const what = await evaluate(`(() => {
    const { THREE, scene, camera } = __stage.debug
    const rc = new THREE.Raycaster()
    return ${JSON.stringify(hotPoints.map((s) => [s.x, s.y]))}.map(([u, v]) => {
      rc.setFromCamera(new THREE.Vector2(u * 2 - 1, -(v * 2 - 1)), camera)
      const hit = rc.intersectObjects(scene.children, true)[0]
      if (!hit) return '未命中'
      const m = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material
      return \`\${m?.name || hit.object.type} d=\${hit.distance.toFixed(1)}m\`
    })
  })()`)
  console.log(`  过曝点 ${hotPoints.map((s, i) => `(${(s.x * 100).toFixed(0)}%,${(s.y * 100).toFixed(0)}%)→${what[i]}`).join('  ')}`)
}

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
