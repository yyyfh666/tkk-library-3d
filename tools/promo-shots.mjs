/**
 * 宣传片静帧采集：按固定剧本逐张拍 2400×1350 的高分辨率 3D 图（CDP + 无头 Edge）。
 *
 * 和 capture.mjs 的区别：这里的镜头表是写死的，改一个数组就能整批重拍；
 * 支持"干净出图"（隐掉所有 HTML UI，只留 canvas）以及逐镜换页面/昼夜。
 *
 * 用法：node tools/promo-shots.mjs --out=目录 [--only=名字,名字] [--w=2400 --h=1350]
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (name, dflt = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = arg('out', 'shots-3d')
const ONLY = (arg('only') || '').split(',').filter(Boolean)
const W = Number(arg('w', '2400'))
const H = Number(arg('h', '1350'))
const PROFILE = `${process.env.TEMP}\\promo-shots-profile`
const PORT = 9339
const BASE = 'http://localhost:5174/'

// 已由 preview-interior.mjs 验证过的机位；ROOM 让第一视角下墙、顶、外景都正常
const ROOM = `(() => {
  const h = __stage.app.worlds.hall
  h.setCeilingVisible(true); h.setOuterVisible(true); h.setWallsLocked(true)
})()`
const inside = (pos, target, fov = 62) =>
  `(async () => {
    const h = __stage.app.worlds.hall
    h.setCeilingVisible(true); h.setOuterVisible(true); h.setWallsLocked(true)
    h.gotoView('inside')
    const pos = ${JSON.stringify(pos)}, target = ${JSON.stringify(target)}, fov = ${fov}
    await new Promise((r) => setTimeout(r, 500))
    for (let i = 0; i < 160; i++) {
      const c = __stage.debug.camera.position
      const settled = Math.abs(c.x - pos[0]) < 0.02 && Math.abs(c.y - pos[1]) < 0.02 && Math.abs(c.z - pos[2]) < 0.02
      __stage.setCamera({ pos, target, fov })
      if (settled) return 'ok'
      await new Promise((r) => setTimeout(r, 250))
    }
    return 'timeout'
  })()`
const NO_HS = `__stage.app.worlds.hall.setHotspotsVisible(false)`

const SHOTS = [
  {
    name: 'island-day', url: BASE, clean: true, wait: 2600,
    js: `(() => {
      const w = __stage.app.worlds.island
      w.setAutoRotate(false); w.setHotspotsVisible(false)
      __stage.setCamera({ pos: [152, 96, 196], target: [0, 8, 0], fov: 33 })
    })()`,
  },
  {
    name: 'island-night', url: BASE, clean: true, wait: 4600,
    js: `(() => {
      const w = __stage.app.worlds.island
      w.setAutoRotate(false); w.setHotspotsVisible(false)
      __stage.setCamera({ pos: [152, 96, 196], target: [0, 8, 0], fov: 33 })
      __stage.app.setPhaseTarget(1)
    })()`,
  },
  {
    name: 'island-hud', url: BASE, clean: false, wait: 3400,
    js: `__stage.app.worlds.island.setAutoRotate(false); __stage.app.setPhaseTarget(0)`,
  },
  {
    name: 'hall-dollhouse-ui', url: `${BASE}?scene=hall`, clean: false, wait: 2600,
    js: `__stage.app.worlds.hall.setAutoRotate(false); __stage.app.worlds.hall.gotoView('dollhouse')`,
  },
  {
    name: 'hall-dollhouse', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `__stage.app.worlds.hall.setAutoRotate(false); __stage.app.worlds.hall.gotoView('dollhouse'); ${NO_HS}`,
  },
  {
    name: 'hall-entry', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([0, 1.65, 9.6], [0, 1.7, -6], 70)}`,
  },
  {
    name: 'hall-atrium-up', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([0, 1.65, 8.2], [0, 9.6, -1.5], 64)}`,
  },
  {
    name: 'hall-gallery', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([10.5, 5.85, 9.0], [-3, 3.2, -3], 60)}`,
  },
  {
    name: 'hall-shelf', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([10.6, 1.65, 7.6], [15.2, 1.4, 7.6], 62)}`,
  },
  {
    name: 'hall-terrace', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([0, 1.65, 9.2], [0, 2.4, 1.0], 64)}`,
  },
  {
    name: 'hall-stair', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([14.2, 1.65, -1.4], [14.2, 3.2, -9], 64)}`,
  },
  {
    name: 'hall-night-entry', url: `${BASE}?scene=hall`, clean: true, wait: 2600,
    js: `__stage.app.setPhaseTarget(1); ${NO_HS}; ${inside([0, 1.65, 9.6], [0, 1.7, -6], 70)}`,
  },
  {
    name: 'hall-night-atrium', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([0, 1.65, 9.0], [0, 2.2, -4], 66)}`,
  },
  {
    name: 'feat-screen', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([-10.9, 1.62, 8.7], [-13.2, 1.95, 6.35], 52)}`,
  },
  {
    name: 'feat-vr', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([-14.0, 1.65, 9.7], [-17.4, 1.75, 9.8], 58)}`,
  },
  {
    name: 'feat-holo', url: `${BASE}?scene=hall`, clean: false, wait: 5200,
    js: `(() => {
      const h = __stage.app.worlds.hall
      h.setHotspotsVisible(false)
      h.enterWalkInstant(); __stage.setWalkPose(0, -6.1, 0, 0.05, 0)
    })()`,
  },
  {
    name: 'hall-inside-default', url: `${BASE}?scene=hall`, clean: true, wait: 10000,
    js: `(() => { const h = __stage.app.worlds.hall; h.setCeilingVisible(true); h.setOuterVisible(true); h.setWallsLocked(true); h.setHotspotsVisible(false); h.gotoView('inside') })()`,
  },
  {
    name: 'hall-entry2', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([0, 1.70, 4.6], [0, 2.6, -8.5], 66)}`,
  },
  {
    name: 'hall-atrium-up2', url: `${BASE}?scene=hall`, clean: true, wait: 1400,
    js: `${NO_HS}; ${inside([0, 1.70, 5.2], [0, 10.5, -2.5], 72)}`,
  },
  {
    name: 'feat-vr2a', url: `${BASE}?scene=hall`, clean: true, wait: 5200,
    js: `(() => {
      const h = __stage.app.worlds.hall
      h.setHotspotsVisible(false); h.setCeilingVisible(true); h.setOuterVisible(true); h.setWallsLocked(true)
      h.enterWalkInstant(); __stage.setWalkPose(-14.8, 8.6, -1.57, -0.02, 0)
    })()`,
  },
  {
    name: 'feat-vr2b', url: `${BASE}?scene=hall`, clean: true, wait: 5200,
    js: `(() => {
      const h = __stage.app.worlds.hall
      h.setHotspotsVisible(false); h.setCeilingVisible(true); h.setOuterVisible(true); h.setWallsLocked(true)
      h.enterWalkInstant(); __stage.setWalkPose(-14.8, 8.6, 1.57, -0.02, 0)
    })()`,
  },
  {
    name: 'feat-vr3', url: `${BASE}?scene=hall`, clean: true, wait: 6000,
    js: `(() => {
      const h = __stage.app.worlds.hall
      h.setHotspotsVisible(false); h.setCeilingVisible(true); h.setOuterVisible(true); h.setWallsLocked(true)
      h.enterWalkInstant(); __stage.setWalkPose(-13.4, 8.6, 1.57, 0.01, 0)
    })()`,
  },
]

if (ONLY.length) SHOTS.splice(0, SHOTS.length, ...SHOTS.filter((s) => ONLY.includes(s.name)))

mkdirSync(OUT, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
  `--window-size=${W},${H}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' })

let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(350)
  try {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null
  } catch { /* 端口没起来 */ }
}
if (!wsUrl) { edge.kill(); throw new Error('Edge 调试端口没起来') }

const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })

let nextId = 1
const pending = new Map()
const errors = []
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    return
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const t = msg.params.exceptionDetails
    errors.push(t.exception?.description ?? t.text)
  }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++; pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'evaluate 失败')
  return result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })

const CLEAN_CSS = `html.promo-clean .app > *:not(.stage){opacity:0 !important}
html.promo-clean .hotspot-layer{display:none !important}
html.promo-clean .crosshair,html.promo-clean .walk-overlay{display:none !important}`

let currentUrl = null
for (const shot of SHOTS) {
  if (shot.url !== currentUrl) {
    await send('Page.navigate', { url: shot.url })
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('.stage canvas')`).catch(() => false)) break
      await sleep(200)
    }
    await sleep(2600)
    currentUrl = shot.url
    await evaluate(`(() => {
      const style = document.createElement('style'); style.id = 'promo-clean'; style.textContent = ${JSON.stringify(CLEAN_CSS)}
      document.head.appendChild(style)
    })()`)
  }
  await evaluate(`document.documentElement.classList.toggle('promo-clean', ${shot.clean ? 'true' : 'false'})`)
  if (shot.js) await evaluate(shot.js)
  await sleep(shot.wait)
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}\\${shot.name}.png`, Buffer.from(data, 'base64'))
  console.log(`  截图 → ${shot.name}.png`)
}

console.log('\n--- 页面异常 ---')
console.log(errors.length ? errors.join('\n') : '无')
await send('Browser.close').catch(() => {})
ws.close()
await sleep(400)
edge.kill()
