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

/**
 * "泵帧"：无头软渲染只有 1~2fps，`await sleep(1600)` 可能连**一帧**都没走完，
 * 于是"按了键没动"这类断言会随机红。截图会强制走一帧，用它来推进（不落盘）。
 */
const pump = async (n = 1) => {
  for (let i = 0; i < n; i++) await send('Page.captureScreenshot', { format: 'jpeg', quality: 1 })
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
const kbBefore = await evaluate(`(() => {
  const w = __stage.app.worlds.hall.walker
  return { z: w.getPose().z, enabled: w.enabled, active: __stage.walkActive() }
})()`)
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`)
await pump(4) // 见 pump 的注释：只 sleep 的话可能一帧都没有
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`)
const after = await evaluate(`__stage.app.worlds.hall.walker.getPose().z`)
console.log(
  `\n键盘接线：${Math.abs(after - kbBefore.z) > 0.02 ? `✔ W 键生效（z ${kbBefore.z.toFixed(2)} → ${after.toFixed(2)}）` : `✘ 按了 W 没动（enabled=${kbBefore.enabled} walkActive=${kbBefore.active}）`}`,
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

/* ==================================================================
 * 场景二/三：机器人 A* 找书 + 打卡、全息触发、书目拾取
 * 全走"UI 那条路"（填输入框 → 点结果按钮 → 机器人出发），但不依赖文案：
 * 元素都用类名找，所以改标题/按钮字不会把这段弄断。
 * ================================================================== */
console.log('\n三套新交互（导览机器人 / 全息投影 / 书架信息屏）')
await evaluate(`__stage.app.setPhaseTarget(0)`) // 上一段停在夜里，这里回白天，图和探针才好读
await sleep(2500)

// ① A* 规划：从南环到北环必须绕过中庭 —— 中庭在一层是楼板上的一个洞，
//    碰撞盒里没有任何一条能表达它，靠的是 hallLayout.ACCESS.voidRects 显式封禁。
const nav = await evaluate(`(() => {
  const p = __stage.navPlan([0, 8.1], [0, -8.0])
  if (!p) return { ok: false }
  let len = 0
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  return {
    ok: true,
    points: p.length,
    len: +len.toFixed(1),
    throughAtrium: p.some(([x, z]) => Math.abs(x) < 8 && Math.abs(z) < 5.5),
  }
})()`)
console.log(
  nav.ok
    ? `A* 南环→北环：${nav.points} 个拐点 / 全长 ${nav.len}m（直线 16.1m）` +
      `${nav.throughAtrium ? ' ✘ 穿了中庭（机器人会飘在空中）' : ' ✔ 绕开了中庭'}` +
      `${nav.len > 25 ? '' : ' ⚠️ 比绕行应有的长度短，可疑'}`
    : '✘ A* 找不到路径',
)

// ①b 机器人"坐标确实在动" + 能派去借还服务台（队友点名要确认的两条）
const rb0 = await evaluate(`__stage.robotState()`)
await evaluate(`__stage.simulateRobot(1.5)`)
const rb1 = await evaluate(`__stage.robotState()`)
const rbMoved = Math.hypot(rb1.x - rb0.x, rb1.z - rb0.z)
console.log(
  rbMoved > 0.3
    ? `✔ 机器人坐标确实在动：巡航 1.5s 挪了 ${rbMoved.toFixed(2)}m`
    : `✘ 机器人没动：1.5s 只挪了 ${rbMoved.toFixed(2)}m`,
)
// 派去借还服务台（ROBOT_POIS.desk = [15.0, 1.1]，在服务台北侧的空地上）。
// 用"一步一步推到到达"而不是推固定秒数：到达后会 idle 6 秒再回巡航，推太久反而测不到。
await evaluate(`__stage.commandRobot([15.0, 1.1], '前往借还服务台')`)
const atDesk = await evaluate(`(() => {
  for (let i = 0; i < 60; i++) {
    __stage.simulateRobot(1)
    const s = __stage.robotState()
    if (s.mode === 'idle') return s
  }
  return __stage.robotState()
})()`)
const deskDist = Math.hypot(atDesk.x - 15.0, atDesk.z - 1.1)
console.log(
  deskDist < 1.6
    ? `✔ 能派到借还服务台：停在 (${atDesk.x.toFixed(2)}, ${atDesk.z.toFixed(2)})，离目标 ${deskDist.toFixed(2)}m`
    : `✘ 没到服务台：停在 (${atDesk.x.toFixed(2)}, ${atDesk.z.toFixed(2)})，离目标 ${deskDist.toFixed(2)}m`,
)

// ② 找书：填搜索框 → 点第一条结果 → 60Hz 推进到机器人到达 → 看书卡
await evaluate(`(() => {
  const input = document.querySelector('.hud-search__input')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, '建筑')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  // 用 requestSubmit 而不是 click()：这条走的就是"按回车"那条路（React 的 onSubmit）
  document.querySelector('.hud-search').requestSubmit()
  return true
})()`)
await waitFor(`document.querySelectorAll('.hud-result').length > 0`, '搜索结果渲染出来', 20000)
const wantBook = await evaluate(`document.querySelector('.hud-result__title').textContent`)
await evaluate(`document.querySelector('.hud-result').click()`)
const enRoute = await evaluate(`__stage.robotState()`)
console.log(`找书「建筑」→ 点了第一条「${wantBook}」：机器人 ${enRoute.mode} / ${enRoute.label}`)
await evaluate(`__stage.simulateRobot(60)`)
const card = await evaluate(`(() => {
  const st = __stage.hallState()
  const r = __stage.robotState()
  return {
    selected: st.selectedBook?.title ?? null,
    board: st.selectedBook?.board ?? null,
    shelf: st.selectedBook?.shelfId ?? null,
    domCard: !!document.querySelector('.hud-card__title'),
    x: +r.x.toFixed(2),
    z: +r.z.toFixed(2),
  }
})()`)
console.log(
  card.selected === wantBook
    ? `✔ 机器人已到达（x ${card.x} z ${card.z}）并弹出书卡：《${card.selected}》${card.shelf} 第 ${card.board} 层${card.domCard ? '（DOM 也在）' : ' ⚠️ 但 DOM 书卡没渲染'}`
    : `✘ 没到/没弹卡：selectedBook=${card.selected}（期望 ${wantBook}），机器人停在 x ${card.x} z ${card.z}`,
)
await shoot('interior-21-find-book')

// ③ 打卡：点"签到打卡" → 推进 → 计数 +1 且横幅出现
await evaluate(`document.querySelector('.hud-actions .hud-btn--primary').click()`)
await evaluate(`__stage.simulateRobot(45)`)
await sleep(900)
const checkinView = await evaluate(`(() => {
  const st = __stage.hallState()
  return { count: st.checkin.count, visible: st.checkin.visible, toast: !!document.querySelector('.checkin-toast') }
})()`)
console.log(
  checkinView.count === 1 && checkinView.toast
    ? '✔ 签到打卡：机器人走到中庭打卡点，横幅出现（第 1 次）'
    : `✘ 打卡异常：count=${checkinView.count} visible=${checkinView.visible} toast=${checkinView.toast}`,
)
await shoot('interior-22-checkin')

// ④ 全息演出：走进触发圈 → 投影从虚到实，同时进入"观看态"（常规漫游 UI 整层不渲染）
await evaluate(`__stage.setWalkPose(0, -6.6, 0, 0.06, 0)`)
let holo = null
for (let i = 0; i < 16 && !(holo?.cinematic && holo.fade > 0.9); i++) {
  await pump()
  await sleep(220)
  holo = await evaluate(`(() => ({
    ...__stage.hologramState(),
    theatre: !!document.querySelector('.cinema__line'),
    nodes: document.querySelectorAll('.holo-node').length,
    chips: !!document.querySelector('.chips'),
    controls: !!document.querySelector('.scene-controls'),
    caption: (document.querySelector('.cinema__line')?.textContent ?? '').slice(0, 20),
  }))()`)
}
console.log(
  holo?.cinematic && holo.fade > 0.9
    ? `✔ 全息演出：走到 ${holo.distance}m 触发（fade ${holo.fade.toFixed(2)}，章节 ${holo.chapterId}），黑边+字幕+${holo.nodes} 个时间轴节点都在`
    : `✘ 演出没进：cinematic=${holo?.cinematic} fade=${holo?.fade} distance=${holo?.distance}`,
)
console.log(
  !holo.chips && !holo.controls
    ? '✔ 观看态：常规漫游 UI 已收掉（胶囊条 / 控制键都不在 DOM）'
    : `✘ 漫游 UI 还在：chips=${holo.chips} controls=${holo.controls}`,
)
console.log(`  字幕：${holo.caption}…`)
await shoot('interior-29-holo-show')

// ⑤ 点时间轴第 3 个节点 → 换章：贴图重画 + 字幕/名言跟着换
const holoBefore = await evaluate(`(() => {
  const h = __stage.hologramState()
  return { chapter: h.chapterId, redraws: h.redraws }
})()`)
await evaluate(`document.querySelectorAll('.holo-node')[2].click()`)
await pump(2)
await sleep(300)
const holoAfter = await evaluate(`(() => {
  const h = __stage.hologramState()
  return {
    chapter: h.chapterId,
    redraws: h.redraws,
    store: __stage.hallState().holo.chapterId,
    caption: (document.querySelector('.cinema__line')?.textContent ?? '').slice(0, 20),
    quote: document.querySelector('.cinema__quote')?.textContent ?? '',
  }
})()`)
console.log(
  holoAfter.chapter === holoAfter.store && holoAfter.chapter !== holoBefore.chapter && holoAfter.redraws > holoBefore.redraws
    ? `✔ 时间轴换章：${holoBefore.chapter} → ${holoAfter.chapter}（贴图重画 ${holoBefore.redraws} → ${holoAfter.redraws}），字幕也换了`
    : `✘ 换章没生效：store=${holoAfter.store} 引擎=${holoAfter.chapter} redraws ${holoBefore.redraws}→${holoAfter.redraws}`,
)
console.log(`  名言：${holoAfter.quote}`)
await shoot('interior-30-holo-chapter3')

// ⑥ 旁白防重叠：开声，快速连点四个节点 —— 每条互不相同，且每次都"先掐后念"
await evaluate(`__stage.hallState().toggleHoloMuted()`)
const speechBefore = await evaluate(`__stage.speechLog().cancels`)
await evaluate(`(() => {
  const nodes = [...document.querySelectorAll('.holo-node')]
  nodes[0].click(); nodes[4].click(); nodes[2].click(); nodes[1].click()
  return true
})()`)
await pump(1)
const speech = await evaluate(`__stage.speechLog()`)
const spokeIds = speech.log.slice(-4).map((e) => e.id)
console.log(
  spokeIds.length === 4 && new Set(spokeIds).size === 4 && speech.cancels - speechBefore >= 4
    ? `✔ 旁白防重叠：连点 4 个节点 → 4 条互不相同的旁白（${spokeIds.join(' ')}），"先掐后念"执行了 ${speech.cancels - speechBefore} 次`
    : `✘ 旁白有重叠/漏发：${JSON.stringify(spokeIds)}，掐断 ${speech.cancels - speechBefore} 次`,
)
console.log(`  语音 provider：${speech.provider}（可用=${speech.available}）—— 浏览器 TTS，不是本人原声`)

// ⑦ Esc 退出观看：字幕黑边收掉、漫游 UI 回来、走路恢复
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))`)
await pump(2)
await sleep(300)
const exited = await evaluate(`(() => {
  const h = __stage.hologramState()
  return {
    cinematic: h.cinematic,
    near: h.near,
    theatre: !!document.querySelector('.cinema__line'),
    chips: !!document.querySelector('.chips'),
    controls: !!document.querySelector('.scene-controls'),
  }
})()`)
console.log(
  !exited.cinematic && !exited.theatre && exited.chips && exited.controls
    ? `✔ Esc 退出观看：黑边字幕收掉、漫游 UI 回来；投影还亮着（人${exited.near ? '仍在触发圈内' : '已在圈外'}）`
    : `✘ 没退出干净：cinematic=${exited.cinematic} theatre=${exited.theatre} chips=${exited.chips} controls=${exited.controls}`,
)
const moved = await evaluate(`(() => {
  const z0 = __stage.app.worlds.hall.walker.getPose().z
  const p = __stage.simulateWalk(['KeyW'], 0.8, [0, -6.6, 0, 0, 0])
  return { z0, z1: p.z, locked: __stage.app.worlds.hall.walker.moveLocked, cinematic: __stage.hologramState().cinematic }
})()`)
console.log(
  Math.abs(moved.z1 - moved.z0) > 0.2 && !moved.locked && !moved.cinematic
    ? `✔ 走路已恢复：z ${moved.z0.toFixed(2)} → ${moved.z1.toFixed(2)}（没被重新拉回演出）`
    : `✘ 走路没恢复：z ${moved.z0.toFixed(2)} → ${moved.z1.toFixed(2)} moveLocked=${moved.locked} cinematic=${moved.cinematic}`,
)

// ⑧ 书目拾取：第一视角盯着书脊 → 书架屏翻到那本书（DOM 侧给出书名）
// 书在层板上一排排摞着，层与层之间是有空隙的 —— 俯仰角差一点就打空，所以给几个候选机位。
const BOOK_POSES = [
  [12.0, 8.9, -1.5708, -0.3, 0],
  [12.4, 8.9, -1.5708, -0.45, 0],
  [12.0, 6.4, -1.5708, -0.3, 0],
]
let hover = null
let usedPose = null
for (const pose of BOOK_POSES) {
  await evaluate(`__stage.setWalkPose(${pose.join(',')})`)
  for (let i = 0; i < 4 && !hover; i++) {
    await pump()
    await sleep(200)
    hover = await evaluate(`__stage.hallState().hoveredBook`)
  }
  if (hover) {
    usedPose = pose
    break
  }
}
console.log(
  hover
    ? `✔ 书目拾取：站在 ${JSON.stringify(usedPose)} 盯着书脊 → 命中《${hover.title}》${hover.callNumber} 第 ${hover.board} 层 ${hover.status}`
    : '✘ 三个候选机位都没拾取到书',
)
await shoot('interior-24-book-pick')

// ⑨ 书架信息屏：正脸看 S04 那块屏（书名是第 ② 步找书"钉"住的那本，悬停移开也不会掉）
await evaluate(`__stage.setWalkPose(2.65, -6.55, -0.384, 0.06, 0)`)
await pump(2)
await sleep(300)
await shoot('interior-25-shelf-screen')

// ⑩ VR 沉浸阅读舱（场景四）：踩上地毯幕布亮 → 翻页 → 走开收回
// 站位取地毯南侧的空档（三张躺椅在 z 8.2~9.8 都有碰撞盒，正中站着会被推开）
await evaluate(`__stage.setWalkPose(-15, 10.5, 1.287, 0, 0)`)
let vr = null
for (let i = 0; i < 16 && !(vr?.fade > 0.9); i++) {
  await pump()
  await sleep(220)
  vr = await evaluate(`(() => ({
    ...__stage.vrState(),
    card: !!document.querySelector('.hud-card--vr'),
  }))()`)
}
console.log(
  vr?.active && vr.fade > 0.9
    ? `✔ VR 阅读舱：踩上西侧地毯幕布亮起（fade ${vr.fade.toFixed(2)}，${vr.bookId} 第 ${vr.page + 1}/${vr.total} 页，右栏卡片在）`
    : `✘ 幕布没亮：active=${vr?.active} fade=${vr?.fade} 卡片=${vr?.card}`,
)
await shoot('interior-26-vr-reading')

// 翻页：点右栏的"下一页"，store 与幕布必须同步
await evaluate(`document.querySelectorAll('.vr-pager__btn')[1].click()`)
await pump(2)
await sleep(300)
const turned = await evaluate(`(() => ({
  store: __stage.hallState().vr.page,
  screen: __stage.vrState().page,
  dom: (document.querySelector('.vr-pager__num')?.textContent ?? '').trim(),
}))()`)
console.log(
  turned.store === 1 && turned.screen === 1
    ? `✔ 翻页：store 与幕布同步到第 ${turned.store + 1} 页（右栏显示 ${turned.dom}）`
    : `✘ 翻页不同步：store=${turned.store} 幕布=${turned.screen} 右栏=${turned.dom}`,
)
await shoot('interior-27-vr-page2')

// 三本书 12 页全过一遍：只断言"不崩 + 页号同步"（12 张图没必要都截，看 3 张就够）
await evaluate(`document.querySelectorAll('.vr-book')[2].click()`)
await pump(1)
await shoot('interior-28-vr-book3')
const sweep = []
for (let b = 0; b < 3; b++) {
  await evaluate(`document.querySelectorAll('.vr-book')[${b}].click()`)
  for (let p = 0; p < 4; p++) {
    const row = await evaluate(`(() => {
      const s = __stage.hallState().vr
      const v = __stage.vrState()
      return { store: s.page, screen: v.page, book: s.bookId, dom: !!document.querySelector('.vr-pager__num') }
    })()`)
    sweep.push(`${row.book}#${row.store + 1}${row.store === row.screen ? '' : '(不同步!)'}`)
    if (p < 3) await evaluate(`document.querySelectorAll('.vr-pager__btn')[1].click()`)
  }
}
console.log(
  sweep.every((s) => !s.includes('不同步'))
    ? `✔ 三本书 12 页翻遍无异常，页号始终同步：${sweep.join(' ')}`
    : `✘ 有页不同步：${sweep.join(' ')}`,
)

// 走开 → 幕布收回（active 立刻翻假，淡出是指数逼近，得等它真的退下去）
await evaluate(`__stage.setWalkPose(0, 9.4, 0, 0, 0)`)
let vrOff = { active: true, fade: 1 }
for (let i = 0; i < 16 && vrOff.fade > 0.08; i++) {
  await pump()
  await sleep(220)
  vrOff = await evaluate(`(() => { const s = __stage.vrState(); return { active: s.active, fade: s.fade } })()`)
}
console.log(
  vrOff.active === false && vrOff.fade <= 0.08
    ? `✔ 走开后幕布收回（fade ${vrOff.fade.toFixed(3)}，面板已隐藏）`
    : `✘ 走开了还没收回：active=${vrOff.active} fade=${vrOff.fade.toFixed(3)}`,
)

// ⑪ 中庭陈设（台阶上的玻璃罩 / 台缘盆栽 / 围住展台的红绳）+ 它们的碰撞
await evaluate(`__stage.setWalkPose(0, 9.2, 0, -0.14, 0)`)
await pump(2)
await sleep(300)
await shoot('interior-31-atrium-dressing')

// 队友点名要的"防止第一视角穿模"：同一条起跑线、同样走 1.5s，
// x=2.07 那条道上正对玻璃罩、x=1.03 那条道在罩子中间（间距 2.067、罩宽 0.34，缝够宽）——
// 只要前者被挡在罩子前、后者能一路走上台阶，就说明碰撞真的生效了（不是只看代码）。
// ⚠️ 别拿 x=0 测：那条道的罩子**故意去掉了**（让给阶梯中线的红毯），测了会"绿灯但测空"。
const laneBlocked = await evaluate(`__stage.simulateWalk(['KeyW'], 1.5, [2.07, 7.0, 0, 0, 0])`)
const laneFree = await evaluate(`__stage.simulateWalk(['KeyW'], 1.5, [1.03, 7.0, 0, 0, 0])`)
console.log(
  laneBlocked.z > 5.3 && laneFree.z < 5.0
    ? `✔ 玻璃罩挡人：正对罩子那条道停在 z=${laneBlocked.z.toFixed(2)}，从缝里走那条到了 z=${laneFree.z.toFixed(2)}`
    : `✘ 碰撞不对：正对罩子 z=${laneBlocked.z.toFixed(2)}（期望 >5.3），缝里 z=${laneFree.z.toFixed(2)}（期望 <5.0）`,
)

// 红绳围挡：从看台第 1 级朝中央展台走 3s，看是不是被"四段薄 AABB 封成的圈"拦住。
// 两个坑都踩过一遍，写在这儿免得下次再踩：
//  ① 起跑点必须在**台面上**（z=5.2 在第 1 级上）。中庭 z<0.5 是空的，站在空处会直接
//     出生在 -4.2 的下层地面，人就从绳底下走过去了，测不到围挡；
//  ② x 必须**在根雕碰撞盒（±1.1）之外、围挡（±2.4）之内**。取 1.03 的话拦住人的其实是
//     根雕自己（停在 2.12），断言会"绿灯但测错了东西"。这里取 1.55（也在罩子缝里）。
const ropeStop = await evaluate(`__stage.simulateWalk(['KeyW'], 3.0, [1.55, 5.2, 0, 0, 0])`)
console.log(
  ropeStop.z > 1.6 && ropeStop.z < 2.0
    ? `✔ 红绳围挡拦得住：朝中央展台直走 3s，停在 z=${ropeStop.z.toFixed(2)}（围挡在 1.45，根雕在 1.8 之前够不着）`
    : `✘ 围挡没拦住：3s 后到了 z=${ropeStop.z.toFixed(2)}（期望停在 1.6~2.0）`,
)

// ⑫ 看台外缘护栏 —— **回归红线**：曾经真的能从看台走进中庭的洞里，落到 -4.2 的下层，
// 而且再也上不来（下层没有楼梯通上去）。三个方向各撞一次，人要稳稳留在台面上。
const LEDGES = [
  ['北缘', ['KeyW'], [2.5, 1.0, 0, 0, 1.1], 1.1],
  ['东缘', ['KeyD'], [5.5, 3.0, 0, 0, 0.66], 0.66],
  ['西缘', ['KeyA'], [-5.5, 3.0, 0, 0, 0.66], 0.66],
]
const ledgeOut = []
let ledgeOk = true
for (const [name, keys, setup, expectY] of LEDGES) {
  const p = await evaluate(`__stage.simulateWalk(${JSON.stringify(keys)}, 2.5, ${JSON.stringify(setup)})`)
  const held = p.y > expectY - 0.25
  ledgeOk = ledgeOk && held
  ledgeOut.push(`${name}${held ? '✔' : '✘'} y=${p.y.toFixed(2)}`)
}
console.log(
  ledgeOk
    ? `✔ 看台外缘护栏拦得住（不会掉进中庭）：${ledgeOut.join('  ')}`
    : `✘ 有人掉进中庭了（y 应该留在台面高度）：${ledgeOut.join('  ')}`,
)

// ⑬ 北墙卷轴墙 + 阶梯红毯
// 卷轴墙：10 幅画面各不相同但只占 1 个 draw call（图集 + 逐幅烘 UV 再合并）——
// 所以截图要能看出"每幅不一样"（有白纸黑字的、有朱红块的、有反白的）。
// 站位注意：卷轴在 z=-11.86，全息投影面板在 z=-10.1，别站太后让投影挡住墙。
await evaluate(`__stage.setWalkPose(-5.6, -6.2, -0.35, 0.03, 0)`)
await pump(2)
await sleep(300)
await shoot('interior-32-scroll-wall')

// 红毯：从南面看，一条红毯沿台阶中线通到围挡
await evaluate(`__stage.setWalkPose(0, 8.2, 0, -0.2, 0)`)
await pump(2)
await sleep(300)
await shoot('interior-33-red-carpet')

/* ==================================================================
 * ⑭ 曝光体检：7 个机位各采一次（回应队友那句"画面过曝偏色"）
 * 以前只在"入口内一步"这一个机位测过 —— 一个机位证明不了整场不过曝。
 *
 * ⚠️ **必须用 setWalkPose，不能用 setCamera**：非第一视角下**吊顶是隐藏的**
 * （娃娃屋要能看进屋里），镜头往上一抬采到的就是页面底色（米白 ~240）——
 * 第一版用 setCamera 做，6 个机位里 4 个"过曝"，全是假报警。
 * 采样是 8×5=40 点的**网格采样**，不是全画面统计；判据沿用"形态"那套：
 * 过曝点（亮度 >250）超过 2 个、或平均亮度越界、或有死黑，才算问题。
 * ================================================================== */
console.log('\n曝光体检（7 个机位 × 40 点网格采样，第一视角）')
// 俯视总览先测、并且**放在进第一视角之前**：它是 gotoView('dollhouse') 起的补间，
// 若放在第一视角之后测，补间会在后面几帧继续飞相机、把最后那条基线探针搅掉
// （第一版就是这么把基线探针的平均亮度从 111 搅成 210 的）。
const topPx = await evaluate(`(() => {
  __stage.app.worlds.hall.gotoView('dollhouse')
  __stage.setCamera({ pos: [0.01, 64, 0], target: [0, 0, 0], fov: 40 })
  return __stage.probe(8, 5)
})()`)

const AUDIT = `[
  ['入口内一步', [0, 8.6, 0, 0, 0]],
  ['中庭抬头看天窗', [0, 7.4, 0, 0.8, 0]],
  ['正对北墙卷轴墙', [0, -6.4, 0, 0.12, 0]],
  ['西窗白墙', [-15.0, 8.6, 1.5708, 0, 0]],
  ['看台上低头看展柜', [1.03, 5.2, 0, -0.25, 0]],
]`
const auditDay = await evaluate(`(() => {
  return ${AUDIT}.map(([name, pose]) => {
    __stage.setWalkPose(...pose)
    return { name, px: __stage.probe(8, 5) }
  })
})()`)
const stats = (px) => {
  const lum = px.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b)
  return {
    max: Math.max(...lum),
    mean: lum.reduce((a, b) => a + b, 0) / lum.length,
    hot: lum.filter((v) => v > 250).length,
    dark: lum.filter((v) => v < 16).length,
  }
}
// 判据里"死黑"取 `> 2` 而不是 `> 0`：黑钢栏杆、深色木雕本来就压在这个阈值以下，
// 一个两个点很正常；真出事（整屏发黑）会是 40 个点全黑，照样抓得到。
let auditBad = 0
for (const row of auditDay) {
  const s = stats(row.px)
  const ok = s.hot <= 2 && s.mean > 25 && s.mean < 200 && s.dark <= 2
  if (!ok) auditBad++
  console.log(
    `  ${ok ? '✔' : '⚠️'} 白天·${row.name}：max ${s.max.toFixed(0)} / 平均 ${s.mean.toFixed(0)} / 过曝 ${s.hot} / 死黑 ${s.dark}`,
  )
}
// 夜里再来一次（灯池 4 盏点光全开 + 灯带自发光，另一套曝光条件）
await evaluate(`__stage.app.setPhaseTarget(1)`)
await sleep(5200) // 相位过渡在 1~2fps 下要好几秒
const auditNight = await evaluate(`(() => {
  __stage.setWalkPose(0, 8.6, 0, 0, 0)
  return __stage.probe(8, 5)
})()`)
const ns = stats(auditNight)
const nightOk = ns.hot <= 2 && ns.mean > 25 && ns.mean < 200 && ns.dark <= 2
if (!nightOk) auditBad++
console.log(
  `  ${nightOk ? '✔' : '⚠️'} 夜里·入口内一步：max ${ns.max.toFixed(0)} / 平均 ${ns.mean.toFixed(0)} / 过曝 ${ns.hot} / 死黑 ${ns.dark}`,
)
console.log(
  auditBad === 0
    ? `✔ 曝光体检：7 个机位都没有整片死白 / 死黑（采样 40 点/机位，不是全画面统计）`
    : `⚠️ 曝光体检：${auditBad} 个机位越界，去上面那几行看是哪个 ————`,
)
// 俯视总览单独说明：它是**按设计切开看**的（吊顶/外景组隐藏），画面上半部就是页面底色，
// 不参与上面的判据 —— 但数字还是打出来，免得下次有人当问题报。
const ts = stats(topPx)
console.log(
  `  ℹ 俯视总览（按设计切开看，画面上半是页面底色）：max ${ts.max.toFixed(0)} / 平均 ${ts.mean.toFixed(0)} / 过曝 ${ts.hot}`,
)
await evaluate(`__stage.app.setPhaseTarget(0)`)
await sleep(2600) // 回白天，别影响后面几步
await shoot('interior-34-exposure-audit-view')

// 收尾：把机器人放回巡航（后面几张图别让它停在书巷里）
await evaluate(`__stage.commandRobot(null)`)
await evaluate(`__stage.simulateRobot(20)`)

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
