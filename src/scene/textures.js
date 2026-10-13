import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { C } from './palette.js'

/**
 * 程序化贴图工厂：全部用 canvas 画出来，**零外部图片文件**。
 *
 * 三条硬规矩（违反任何一条都会出怪图）：
 *  ① 颜色图 colorSpace = SRGBColorSpace；凹凸图必须留在 NoColorSpace，
 *     否则会被二次 gamma 污染，凹凸强度看起来完全不对。
 *  ② 随机数一律走固定种子 —— 每次刷新纹理长得一模一样，截图回归才可复现。
 *  ③ 平铺**不用 texture.repeat**（合并几何 / instancing 后一个材质只能有一个
 *     repeat），而是用 bakeBoxUV() 把平铺密度按"世界坐标"烘进 UV ——
 *     好处是相邻盒子的砖缝天然对齐，怎么挪位置都不串缝。
 *
 * 配色全部取自 palette.js 的 C.hall* 一组（源头唯一），本文件只负责画细节。
 * 砖/木/石这些"实物材质"把颜色画进贴图本身，由 materials.js 里对应的
 * spec.nightColor 负责夜里压暗；白墙/吊顶/瓷砖这类近白材质则画成浅灰贴图，
 * 颜色交给 spec.color 当 tint —— 两种做法都在 materials.js 里逐个标注。
 */

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

/** 固定种子随机数（LCG，和 hall.js 里同一个套路） */
function seededRand(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)))
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbStr = ([r, g, b], a = 1) => (a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`)

/** 明度/冷暖抖动：让每块砖不完全一样 */
function jitter(rgb, rnd, { l = 0.08, w = 0.04 } = {}) {
  const k = 1 + (rnd() - 0.5) * 2 * l
  const warm = (rnd() - 0.5) * 2 * w
  return [clamp255(rgb[0] * k * (1 + warm)), clamp255(rgb[1] * k), clamp255(rgb[2] * k * (1 - warm))]
}
const shade = (rgb, k) => rgb.map((v) => clamp255(v * k))
const mixRgb = (a, b, t) => a.map((v, i) => clamp255(v + (b[i] - v) * t))

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

function toTexture(canvas, { srgb, maxAnisotropy }) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = maxAnisotropy
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace // 颜色图必须标 sRGB
  return tex
}

/** 撒细噪点（灰浆的颗粒感） */
function speckle(ctx, w, h, rnd, { count = 8000, alpha = 0.05, size = 1.4 } = {}) {
  for (let i = 0; i < count; i++) {
    const dark = rnd() < 0.5
    ctx.fillStyle = dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`
    ctx.fillRect(rnd() * w, rnd() * h, size, size)
  }
}

/** 大块柔和斑驳（墙面/石材的自然深浅） */
function mottle(ctx, w, h, rnd, { count = 40, alpha = 0.04, rMin = 30, rMax = 120 } = {}) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = rMin + rnd() * (rMax - rMin)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const dark = rnd() < 0.5
    g.addColorStop(0, dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

/* ------------------------------------------------------------------ *
 * 各贴图的画法
 * ------------------------------------------------------------------ */

/** 红砖：错缝顺砖（照片 07/08）。贴图跨 1.92m = 8 列 × 24 行 0.24×0.08 的砖 */
function drawBrickColor(ctx, w, h) {
  const rnd = seededRand(20261013)
  const brick = hexToRgb(C.hallBrick)
  const mortar = hexToRgb(C.hallMortar)
  ctx.fillStyle = rgbStr(mortar)
  ctx.fillRect(0, 0, w, h)

  const bw = w / 8
  const bh = h / 24
  const joint = bw * 0.05
  for (let row = 0; row < 24; row++) {
    const off = row % 2 ? bw / 2 : 0
    for (let col = -1; col < 9; col++) {
      const x = col * bw + off + joint / 2
      const y = row * bh + joint / 2
      let c = jitter(brick, rnd, { l: 0.11, w: 0.05 })
      if (rnd() < 0.09) c = shade(c, 0.8) // 偶发深砖
      ctx.fillStyle = rgbStr(c)
      ctx.fillRect(x, y, bw - joint, bh - joint)
      // 砖面上下微高光/暗边（配 bump 一起看才是"砌出来的"）
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      ctx.fillRect(x, y, bw - joint, bh * 0.1)
      ctx.fillStyle = 'rgba(0,0,0,0.10)'
      ctx.fillRect(x, y + bh - joint - bh * 0.1, bw - joint, bh * 0.1)
    }
  }
  speckle(ctx, w, h, rnd, { count: 9000, alpha: 0.05 })
}

function drawBrickBump(ctx, w, h) {
  const rnd = seededRand(20261014)
  ctx.fillStyle = '#3A3A3A' // 砖缝：凹
  ctx.fillRect(0, 0, w, h)
  const bw = w / 8
  const bh = h / 24
  const joint = bw * 0.05
  for (let row = 0; row < 24; row++) {
    const off = row % 2 ? bw / 2 : 0
    for (let col = -1; col < 9; col++) {
      const x = col * bw + off + joint / 2
      const y = row * bh + joint / 2
      const g = ctx.createLinearGradient(0, y, 0, y + bh - joint)
      g.addColorStop(0, '#F2F2F2')
      g.addColorStop(0.5, '#CFCFCF')
      g.addColorStop(1, '#8F8F8F')
      ctx.fillStyle = g
      ctx.fillRect(x, y, bw - joint, bh - joint)
    }
  }
  speckle(ctx, w, h, rnd, { count: 4000, alpha: 0.06 })
}

/** 灰泥白墙：近白底 + 轻微斑驳（颜色交给 spec.color 当 tint） */
function drawPlasterColor(ctx, w, h) {
  const rnd = seededRand(771001)
  ctx.fillStyle = '#F7F5F0'
  ctx.fillRect(0, 0, w, h)
  mottle(ctx, w, h, rnd, { count: 46, alpha: 0.035 })
  speckle(ctx, w, h, rnd, { count: 10000, alpha: 0.03 })
}

function drawPlasterBump(ctx, w, h) {
  const rnd = seededRand(771002)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, w, h)
  mottle(ctx, w, h, rnd, { count: 40, alpha: 0.10, rMin: 20, rMax: 80 })
  speckle(ctx, w, h, rnd, { count: 14000, alpha: 0.10 })
}

/** 深胡桃木：竖纹 + 少量结疤（书架端板 / 木作） */
function drawWalnutColor(ctx, w, h) {
  const rnd = seededRand(20261015)
  const base = hexToRgb(C.hallWood)
  ctx.fillStyle = rgbStr(base)
  ctx.fillRect(0, 0, w, h)

  for (let i = 0; i < 110; i++) {
    const x0 = rnd() * w
    const amp = 2 + rnd() * 7
    const freq = 0.004 + rnd() * 0.01
    const phase = rnd() * Math.PI * 2
    const light = rnd() < 0.45
    const c = light ? shade(base, 1.35) : shade(base, 0.62)
    ctx.strokeStyle = rgbStr(c, 0.1 + rnd() * 0.15)
    ctx.lineWidth = 0.8 + rnd() * 2.4
    ctx.beginPath()
    for (let y = 0; y <= h; y += 8) {
      const x = x0 + Math.sin(y * freq + phase) * amp
      if (y === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // 结疤：几圈同心椭圆
  for (let k = 0; k < 4; k++) {
    const x = rnd() * w
    const y = rnd() * h
    for (let r = 5; r < 26; r += 4) {
      ctx.strokeStyle = rgbStr(shade(base, 0.55), 0.35)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.7, r, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  speckle(ctx, w, h, rnd, { count: 5000, alpha: 0.05 })
}

function drawWalnutBump(ctx, w, h) {
  const rnd = seededRand(20261016)
  ctx.fillStyle = '#8A8A8A'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 110; i++) {
    const x0 = rnd() * w
    const amp = 2 + rnd() * 7
    const freq = 0.004 + rnd() * 0.01
    const phase = rnd() * Math.PI * 2
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(70,70,70,0.5)' : 'rgba(190,190,190,0.4)'
    ctx.lineWidth = 0.8 + rnd() * 2
    ctx.beginPath()
    for (let y = 0; y <= h; y += 10) {
      const x = x0 + Math.sin(y * freq + phase) * amp
      if (y === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

/** 抛光白瓷砖：贴图跨 2.4m，每 0.6m 一块，每 2.4m 一条深色镶边带（照片 06/11） */
function drawFloorTileColor(ctx, w, h) {
  const rnd = seededRand(20261017)
  const tile = new Uint8Array(hexToRgb(C.hallFloor))
  const band = hexToRgb(C.hallFloorDark)
  ctx.fillStyle = rgbStr(tile)
  ctx.fillRect(0, 0, w, h)

  // 瓷砖细斑（抛光后的水磨石颗粒）
  speckle(ctx, w, h, rnd, { count: 9000, alpha: 0.035, size: 1.2 })

  const cell = w / 4 // 0.6m
  // 砖缝
  ctx.strokeStyle = 'rgba(120,115,104,0.55)'
  ctx.lineWidth = 1.6
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * cell, 0)
    ctx.lineTo(i * cell, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * cell)
    ctx.lineTo(w, i * cell)
    ctx.stroke()
  }

  // 深色镶边带：沿上边与左边各一条（平铺后 = 每 2.4m 一格的黑色嵌线）
  const bandW = Math.round((0.12 / 2.4) * w) // 0.12m 宽
  for (const [x, y, bw, bh] of [
    [0, 0, w, bandW],
    [0, 0, bandW, h],
  ]) {
    ctx.fillStyle = rgbStr(band)
    ctx.fillRect(x, y, bw, bh)
    // 镶边里再分小格
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    if (bw > bh) {
      for (let i = 1; i < 8; i++) ctx.fillRect(i * (w / 8), 0, 1.5, bandW)
    } else {
      for (let i = 1; i < 8; i++) ctx.fillRect(0, i * (h / 8), bandW, 1.5)
    }
  }
}

function drawFloorTileBump(ctx, w, h) {
  ctx.fillStyle = '#C4C4C4'
  ctx.fillRect(0, 0, w, h)
  const cell = w / 4
  ctx.strokeStyle = '#6E6E6E'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * cell, 0)
    ctx.lineTo(i * cell, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * cell)
    ctx.lineTo(w, i * cell)
    ctx.stroke()
  }
  const bandW = Math.round((0.12 / 2.4) * w)
  ctx.fillStyle = '#9A9A9A'
  ctx.fillRect(0, 0, w, bandW)
  ctx.fillRect(0, 0, bandW, h)
}

/** 中庭深色拼花地砖：深砖 + 白色圆环纹样（照片 08） */
function drawAtriumFloorColor(ctx, w, h) {
  const rnd = seededRand(20261018)
  const base = hexToRgb(C.hallFloorDark)
  ctx.fillStyle = rgbStr(base)
  ctx.fillRect(0, 0, w, h)
  const cell = w / 4
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * cell, 0)
    ctx.lineTo(i * cell, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * cell)
    ctx.lineTo(w, i * cell)
    ctx.stroke()
  }
  // 同心白圈
  ctx.strokeStyle = rgbStr(hexToRgb(C.hallFloorRing), 0.9)
  ctx.lineWidth = w * 0.045
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = w * 0.016
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, w * 0.41, 0, Math.PI * 2)
  ctx.stroke()
  speckle(ctx, w, h, rnd, { count: 7000, alpha: 0.05 })
}

function drawAtriumFloorBump(ctx, w, h) {
  ctx.fillStyle = '#A0A0A0'
  ctx.fillRect(0, 0, w, h)
  const cell = w / 4
  ctx.strokeStyle = '#5A5A5A'
  ctx.lineWidth = 2
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * cell, 0)
    ctx.lineTo(i * cell, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * cell)
    ctx.lineTo(w, i * cell)
    ctx.stroke()
  }
  ctx.strokeStyle = '#BEBEBE'
  ctx.lineWidth = w * 0.045
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2)
  ctx.stroke()
}

/** 花岗岩：浅灰底 + 密集斑点（柱基 / 栏杆压顶） */
function drawGraniteColor(ctx, w, h) {
  const rnd = seededRand(20261019)
  const base = hexToRgb(C.hallGranite)
  ctx.fillStyle = rgbStr(base)
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 2600; i++) {
    const t = rnd()
    const c = t < 0.4 ? shade(base, 1.35) : t < 0.8 ? shade(base, 0.7) : shade(base, 0.45)
    ctx.fillStyle = rgbStr(c, 0.5 + rnd() * 0.5)
    const s = 1 + rnd() * 2.4
    ctx.fillRect(rnd() * w, rnd() * h, s, s)
  }
}

function drawGraniteBump(ctx, w, h) {
  const rnd = seededRand(20261020)
  ctx.fillStyle = '#909090'
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'
    const s = 1 + rnd() * 2
    ctx.fillRect(rnd() * w, rnd() * h, s, s)
  }
}

/** 白色格栅吊顶：矿棉板 0.6m 方板 + 压条（照片 02） */
function drawCeilingColor(ctx, w, h) {
  const rnd = seededRand(20261021)
  const base = hexToRgb(C.hallCeiling)
  ctx.fillStyle = rgbStr(base)
  ctx.fillRect(0, 0, w, h)
  // 矿棉板的细孔
  speckle(ctx, w, h, rnd, { count: 16000, alpha: 0.045, size: 1 })
  // 每 0.6m 的压条（贴图跨 1.2m → 2 格）
  const cell = w / 2
  ctx.strokeStyle = rgbStr(hexToRgb(C.hallCeilingBar))
  ctx.lineWidth = 5
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.moveTo(i * cell, 0)
    ctx.lineTo(i * cell, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * cell)
    ctx.lineTo(w, i * cell)
    ctx.stroke()
  }
}

function drawCeilingBump(ctx, w, h) {
  const rnd = seededRand(20261022)
  ctx.fillStyle = '#B8B8B8'
  ctx.fillRect(0, 0, w, h)
  speckle(ctx, w, h, rnd, { count: 8000, alpha: 0.1 })
  const cell = w / 2
  ctx.strokeStyle = '#4E4E4E' // 压条略凸
  ctx.lineWidth = 5
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.moveTo(i * cell, 0)
    ctx.lineTo(i * cell, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * cell)
    ctx.lineTo(w, i * cell)
    ctx.stroke()
  }
}

/** 书脊：近白底（颜色由 instanceColor 乘出来）+ 底部索书号白标条（照片 05） */
function drawBookSpine(ctx, w, h) {
  const rnd = seededRand(20261023)
  // 书脊弧面明暗：两侧暗、中间亮
  const g = ctx.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, '#C9C9C9')
  g.addColorStop(0.5, '#FFFFFF')
  g.addColorStop(1, '#C9C9C9')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // 底部的白色索书号标条（canvas 底 = 贴图 v≈0 的一侧）
  const bandTop = h * 0.8
  ctx.fillStyle = '#FDFDFB'
  ctx.fillRect(w * 0.08, bandTop, w * 0.84, h * 0.13)
  // 标条上的两行小字（抽象成短横线）
  ctx.fillStyle = 'rgba(60,60,60,0.85)'
  ctx.fillRect(w * 0.16, bandTop + h * 0.025, w * 0.5, 1.6)
  ctx.fillRect(w * 0.16, bandTop + h * 0.06, w * 0.62, 1.6)
  speckle(ctx, w, h, rnd, { count: 900, alpha: 0.05 })
}

/** 垂吊绿植贴片：透明底 + 成串下垂的枝叶（配合 alphaTest 用） */
function drawLeaf(ctx, w, h) {
  const rnd = seededRand(20261024)
  const base = hexToRgb(C.hallLeaf)
  ctx.clearRect(0, 0, w, h)

  const vines = 5
  for (let v = 0; v < vines; v++) {
    const x0 = (v + 0.5) * (w / vines) + (rnd() - 0.5) * w * 0.06
    const len = h * (0.6 + rnd() * 0.4)
    const sway = 8 + rnd() * 14
    // 藤蔓主茎
    ctx.strokeStyle = rgbStr(shade(base, 0.7), 0.9)
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(x0, 0)
    for (let y = 0; y <= len; y += 10) {
      ctx.lineTo(x0 + Math.sin((y / h) * 6 + v) * sway * (y / h), y)
    }
    ctx.stroke()

    // 枝叶：沿茎两侧挂小叶
    const leaves = Math.floor(len / 16)
    for (let i = 0; i < leaves; i++) {
      const t = i / leaves
      const y = t * len
      const x = x0 + Math.sin(t * 6 + v) * sway * t
      const side = i % 2 ? 1 : -1
      const lw = 7 + rnd() * 8
      const lh = lw * (1.5 + rnd() * 0.8)
      const c = jitter(base, rnd, { l: 0.22, w: 0.1 })
      ctx.save()
      ctx.translate(x + side * lw * 0.35, y)
      ctx.rotate(side * (0.9 + rnd() * 0.5) + Math.sin(t * 8) * 0.15)
      ctx.fillStyle = rgbStr(c, 0.92)
      ctx.beginPath()
      ctx.ellipse(0, 0, lw * 0.5, lh * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
}

/** 窗外背景板：天空渐变 + 两层树带（白天亮、夜里由 spec.nightColor 压暗） */
function drawBackdrop(ctx, w, h) {
  const rnd = seededRand(20261025)
  const sky = hexToRgb(C.hallSky)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, rgbStr(shade(sky, 1.05)))
  g.addColorStop(0.55, rgbStr(sky))
  g.addColorStop(0.8, rgbStr(mixRgb(sky, hexToRgb('#DCE8DC'), 0.5))) // 地平线一点点绿雾
  g.addColorStop(1, rgbStr(shade(sky, 0.95)))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const trees = hexToRgb(C.hallTrees)
  // 远树带（浅、带雾）
  ctx.fillStyle = rgbStr(mixRgb(trees, sky, 0.45), 0.7)
  for (let x = 0; x < w; x += 30) {
    const r = 20 + rnd() * 22
    ctx.beginPath()
    ctx.arc(x + rnd() * 18, h * 0.72 + (rnd() - 0.5) * 8, r, Math.PI, 0)
    ctx.fill()
  }
  // 近树带（稍深，但也留透气）
  ctx.fillStyle = rgbStr(mixRgb(trees, sky, 0.12), 0.88)
  for (let x = 0; x < w; x += 40) {
    const r = 24 + rnd() * 26
    ctx.beginPath()
    ctx.arc(x + rnd() * 24, h * 0.86 + (rnd() - 0.5) * 8, r, Math.PI, 0)
    ctx.fill()
  }
  ctx.fillRect(0, h * 0.88, w, h * 0.12)
}

/** 白色凹槽柱的竖向凹槽（bump）：一圈约 24 道槽 */
function drawFluteBump(ctx, w, h) {
  ctx.fillStyle = '#9A9A9A'
  ctx.fillRect(0, 0, w, h)
  const flutes = 24
  const fw = w / flutes
  for (let i = 0; i < flutes; i++) {
    const x = i * fw
    ctx.fillStyle = '#4E4E4E' // 槽底：暗
    ctx.fillRect(x, 0, fw * 0.22, h)
    ctx.fillStyle = '#D2D2D2' // 棱边：亮
    ctx.fillRect(x + fw * 0.22, 0, fw * 0.16, h)
  }
}

/* ------------------------------------------------------------------ *
 * 工厂（模块级单例：StrictMode 下 effect 跑两遍也只画一次）
 * ------------------------------------------------------------------ */

let cache = null

export function createHallTextures({ maxAnisotropy = 4 } = {}) {
  if (cache) return cache
  const a = Math.min(maxAnisotropy, 8)
  // 一步到位：开画布 → 画 → 包成 texture（srgb=false 给凹凸图用）
  const make = (w, h, draw, srgb = true) => {
    const canvas = makeCanvas(w, h)
    draw(canvas.getContext('2d'), w, h)
    return toTexture(canvas, { srgb, maxAnisotropy: a })
  }

  cache = {
    brick: make(1024, 1024, drawBrickColor),
    brickBump: make(512, 512, drawBrickBump, false),
    plaster: make(512, 512, drawPlasterColor),
    plasterBump: make(512, 512, drawPlasterBump, false),
    walnut: make(512, 512, drawWalnutColor),
    walnutBump: make(512, 512, drawWalnutBump, false),
    floorTile: make(512, 512, drawFloorTileColor),
    floorTileBump: make(512, 512, drawFloorTileBump, false),
    atriumFloor: make(512, 512, drawAtriumFloorColor),
    atriumFloorBump: make(512, 512, drawAtriumFloorBump, false),
    granite: make(256, 256, drawGraniteColor),
    graniteBump: make(256, 256, drawGraniteBump, false),
    ceiling: make(512, 512, drawCeilingColor),
    ceilingBump: make(512, 512, drawCeilingBump, false),
    bookSpine: make(128, 256, drawBookSpine),
    leaf: make(256, 512, drawLeaf),
    backdrop: make(512, 256, drawBackdrop),
    fluteBump: make(256, 256, drawFluteBump, false),
  }
  return cache
}

/** 只在 createAppWorld.dispose 的最后统一释放（单例缓存，别在 React effect 里释放） */
export function disposeHallTextures() {
  if (!cache) return
  for (const tex of Object.values(cache)) tex.dispose()
  cache = null
}

/**
 * 程序化环境反射（PMREM 一个小房间，仍是零外部文件）。
 * ⚠️ 只能**逐材质**挂 material.envMap —— 不能用 scene.environment：
 * r186 的 WebGLRenderer 会用 scene.environmentIntensity 覆盖掉每个材质
 * 自己的 envMapIntensity（WebGLRenderer.js:2736），还会波及厅里所有 Lambert。
 */
export function createRoomEnvTexture(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const scene = new RoomEnvironment()
  const rt = pmrem.fromScene(scene, 0.04)
  pmrem.dispose()
  return rt.texture
}

/* ------------------------------------------------------------------ *
 * UV 烘焙：把平铺密度按世界坐标写进 BoxGeometry 的 UV
 * ------------------------------------------------------------------ */

/**
 * BoxGeometry 有 24 个顶点，每 4 个一面，顺序固定：
 *   0:-x? → 实际顺序 [ +x, -x, +y, -y, +z, -z ]，每个面 4 个顶点。
 * 按面选择"世界上哪两个轴当 u/v"，用**世界坐标**做锚点：
 * 好处是相邻盒子、不同大小的盒子，砖缝都天然对齐；
 * 代价是绕 y 轴转过 90° 的盒子，纹理方向跟着转（砖块/木纹看不出差别，可接受）。
 *
 * @param {THREE.BufferGeometry} geometry 必须是 BoxGeometry 系列
 * @param {{tile?: number, world?: [number,number,number]}} opts
 *        tile  = 贴图在世界里跨多少米
 *        world = 这个盒子中心的世界坐标（先摆好位置再烘）
 */
export function bakeBoxUV(geometry, { tile = 2.4, world = [0, 0, 0] } = {}) {
  const pos = geometry.attributes.position
  const uv = geometry.attributes.uv
  const [ox, oy, oz] = world
  for (let i = 0; i < pos.count; i++) {
    const face = Math.floor(i / 4)
    const wx = ox + pos.getX(i)
    const wy = oy + pos.getY(i)
    const wz = oz + pos.getZ(i)
    let u
    let v
    if (face < 2) {
      // ±x 面：看的是 (z, y)
      u = wz / tile
      v = wy / tile
    } else if (face < 4) {
      // ±y 面：看的是 (x, z)
      u = wx / tile
      v = wz / tile
    } else {
      // ±z 面：看的是 (x, y)
      u = wx / tile
      v = wy / tile
    }
    uv.setXY(i, u, v)
  }
  uv.needsUpdate = true
  return geometry
}
