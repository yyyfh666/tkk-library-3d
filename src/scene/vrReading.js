import * as THREE from 'three'
import { VR_READ } from './hallLayout.js'
import { getVrBook } from '../state/vrBooks.js'

/**
 * VR 沉浸阅读舱（场景四）：西墙幕布上"放映"一本书的导读页。
 *
 * 做法和书架信息屏（shelfInteraction.js）同源 —— canvas 现画 → CanvasTexture →
 * MeshBasicMaterial({ toneMapped:false })。区别只是尺寸与版式：这边是 1024×576 的一整页，
 * 有页眉页脚、左图右文，翻页时先淡下去再涨回来（"换页"的手感）。
 *
 * 之所以不用 CSS3DRenderer：那要再起一个 DOM 渲染器每帧和 WebGL 同步，在这个
 * "单 WebGLRenderer + HTML 覆盖层"的架构里是纯负债（书架屏那边已经论证过一次）。
 *
 * 面板本身是自发光质感（Basic 材质不吃昼夜），位置来自 hallLayout 的 VR_READ ——
 * hall.js 里那块 `screen` 盒子是它的边框/背板，两者同心。
 */

const W = 1024
const H = 576

/* ------------------------------------------------------------------ *
 * 画布小工具
 * ------------------------------------------------------------------ */

/** 确定性伪随机（同一页每次重画都一样，翻回来不会看到另一张图） */
function rnd(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function poly(ctx, pts) {
  ctx.beginPath()
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
  ctx.closePath()
}

/** 按字符折行（中文没有词边界，逐字量宽度就够；数字与英文也不会被拆得太难看） */
function wrapText(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

/* ------------------------------------------------------------------ *
 * 插图：12 张，全用 canvas 现画（不引任何外部素材）
 * 每张的签名都是 (ctx, x, y, w, h)，只在自己那块框里画
 * ------------------------------------------------------------------ */

/** 海水分层 + 一点透下来的光 */
function seaProfile(ctx, x, y, w, h) {
  const bands = [
    ['#7fc4e8', 0.0, 0.12],
    ['#4f9dc8', 0.12, 0.3],
    ['#2f6f96', 0.3, 0.55],
    ['#1d4a68', 0.55, 0.78],
    ['#12303f', 0.78, 1.0],
  ]
  for (const [color, a, b] of bands) {
    ctx.fillStyle = color
    ctx.fillRect(x, y + h * a, w, h * (b - a) + 1)
  }
  // 透光
  ctx.save()
  ctx.globalAlpha = 0.22
  ctx.fillStyle = '#eaf7ff'
  for (let i = 0; i < 7; i++) {
    const sx = x + (i + 0.5) * (w / 7)
    poly(ctx, [
      [sx - 16, y],
      [sx + 16, y],
      [sx + 46, y + h * 0.8],
      [sx + 6, y + h * 0.8],
    ])
    ctx.fill()
  }
  ctx.restore()
  // 海面波纹
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let i = 0; i <= w; i += 8) {
    const yy = y + 6 + Math.sin(i / 26) * 4
    i ? ctx.lineTo(x + i, yy) : ctx.moveTo(x + i, yy)
  }
  ctx.stroke()
  // 深度刻度
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '15px "Microsoft YaHei", sans-serif'
  const marks = [['200m 弱光', 0.2], ['1000m', 0.45], ['4000m 深渊', 0.78]]
  for (const [label, t] of marks) {
    ctx.fillRect(x + 10, y + h * t, 26, 2)
    ctx.fillText(label, x + 42, y + h * t + 6)
  }
}

/** 海底地形剖面：洋中脊 → 深海平原 → 海沟 */
function seaFloor(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#2b6f96')
  g.addColorStop(1, '#0d2130')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  const bed = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    let yy = 0.62
    yy -= 0.2 * Math.exp(-((t - 0.42) ** 2) / 0.012) // 洋中脊
    yy += 0.34 * Math.exp(-((t - 0.82) ** 2) / 0.004) // 海沟
    bed.push([x + t * w, y + yy * h])
  }
  ctx.fillStyle = '#5b4636'
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  bed.forEach(([px, py]) => ctx.lineTo(px, py))
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = '15px "Microsoft YaHei", sans-serif'
  ctx.fillText('洋中脊', x + w * 0.33, y + h * 0.34)
  ctx.fillText('深海平原', x + w * 0.58, y + h * 0.7)
  ctx.fillText('海沟', x + w * 0.76, y + h * 0.5)
}

/** 海底黑烟囱 */
function vent(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#123243')
  g.addColorStop(1, '#071319')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  ctx.fillStyle = '#3a2f27'
  ctx.fillRect(x, y + h * 0.78, w, h * 0.22)
  const r = rnd(7)
  for (const cx of [0.3, 0.46, 0.66]) {
    const base = y + h * 0.78
    const tall = h * (0.26 + r() * 0.22)
    const half = 16 + r() * 10
    poly(ctx, [
      [x + w * cx - half * 1.5, base + 8],
      [x + w * cx - half, base - tall],
      [x + w * cx + half, base - tall],
      [x + w * cx + half * 1.5, base + 8],
    ])
    ctx.fillStyle = '#4a3a2e'
    ctx.fill()
    // 喷出的黑烟
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#2b2b30'
    ctx.beginPath()
    ctx.ellipse(x + w * cx, base - tall - 18, half * 0.9, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.28
    ctx.beginPath()
    ctx.ellipse(x + w * cx + 6, base - tall - 42, half * 1.1, 14, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/** 热液口的生物：管虫 + 盲虾 */
function creature(ctx, x, y, w, h) {
  ctx.fillStyle = '#0e2430'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#3b3128'
  ctx.beginPath()
  ctx.moveTo(x, y + h * 0.72)
  ctx.bezierCurveTo(x + w * 0.3, y + h * 0.6, x + w * 0.6, y + h * 0.82, x + w, y + h * 0.7)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h)
  ctx.closePath()
  ctx.fill()

  const r = rnd(21)
  // 管虫
  for (let i = 0; i < 16; i++) {
    const bx = x + w * (0.2 + r() * 0.26)
    const by = y + h * (0.62 + r() * 0.1)
    const len = h * (0.2 + r() * 0.16)
    const tilt = (r() - 0.5) * 0.5
    ctx.strokeStyle = '#e6dccb'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.lineTo(bx + Math.sin(tilt) * len, by - Math.cos(tilt) * len)
    ctx.stroke()
    ctx.fillStyle = '#c8453c'
    ctx.beginPath()
    ctx.arc(bx + Math.sin(tilt) * len, by - Math.cos(tilt) * len, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  // 盲虾
  ctx.fillStyle = '#f0a08a'
  for (let i = 0; i < 22; i++) {
    ctx.beginPath()
    ctx.arc(x + w * (0.62 + r() * 0.34), y + h * (0.3 + r() * 0.4), 3 + r() * 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 集美学村：红瓦屋顶的轮廓 + 水面倒影 */
function village(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#cfe6f2')
  g.addColorStop(0.66, '#eef4f7')
  g.addColorStop(1, '#8fb2c4')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  const roofs = [
    [0.06, 0.46, 0.2, 0.2],
    [0.3, 0.36, 0.26, 0.3],
    [0.6, 0.44, 0.18, 0.22],
    [0.78, 0.5, 0.16, 0.16],
  ]
  for (const [rx, ry, rw, rh] of roofs) {
    const bx = x + w * rx
    const by = y + h * ry
    const bw = w * rw
    const bh = h * rh
    ctx.fillStyle = '#f2efe6'
    ctx.fillRect(bx, by + bh * 0.42, bw, bh * 0.58)
    ctx.fillStyle = '#a8492f'
    poly(ctx, [
      [bx - bw * 0.08, by + bh * 0.42],
      [bx + bw * 0.5, by],
      [bx + bw * 1.08, by + bh * 0.42],
    ])
    ctx.fill()
    // 翘起的脊
    ctx.strokeStyle = '#8c3a25'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(bx - bw * 0.08, by + bh * 0.42)
    ctx.quadraticCurveTo(bx - bw * 0.16, by - bh * 0.02, bx - bw * 0.02, by - bh * 0.04)
    ctx.moveTo(bx + bw * 1.08, by + bh * 0.42)
    ctx.quadraticCurveTo(bx + bw * 1.16, by - bh * 0.02, bx + bw * 1.02, by - bh * 0.04)
    ctx.stroke()
  }
  // 水面与倒影
  ctx.fillStyle = 'rgba(122,168,196,0.85)'
  ctx.fillRect(x, y + h * 0.72, w, h * 0.28)
  ctx.save()
  ctx.globalAlpha = 0.22
  ctx.scale(1, -1)
  ctx.translate(0, -(2 * (y + h * 0.72)))
  ctx.fillStyle = '#a8492f'
  for (const [rx, ry, rw, rh] of roofs) {
    const bx = x + w * rx
    const by = y + h * ry
    poly(ctx, [
      [bx - w * rw * 0.08, by + h * rh * 0.42],
      [bx + w * rw * 0.5, by],
      [bx + w * rw * 1.08, by + h * rh * 0.42],
    ])
    ctx.fill()
  }
  ctx.restore()
}

/** 下南洋：一条虚线航线 + 小帆船 */
function voyage(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#e8f1f6')
  g.addColorStop(1, '#7fb0c9')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  const a = [x + w * 0.12, y + h * 0.26]
  const b = [x + w * 0.88, y + h * 0.72]
  ctx.save()
  ctx.setLineDash([9, 9])
  ctx.strokeStyle = '#3d6f8c'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(...a)
  ctx.quadraticCurveTo(x + w * 0.56, y + h * 0.06, ...b)
  ctx.stroke()
  ctx.restore()

  for (const [p, label] of [
    [a, '福建'],
    [b, '新加坡'],
  ]) {
    ctx.fillStyle = '#c4573a'
    ctx.beginPath()
    ctx.arc(p[0], p[1], 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2b3a44'
    ctx.font = '16px "Microsoft YaHei", sans-serif'
    ctx.fillText(label, p[0] + 12, p[1] + 6)
  }

  // 帆船
  const sx = x + w * 0.5
  const sy = y + h * 0.3
  ctx.fillStyle = '#2b3a44'
  ctx.beginPath()
  ctx.moveTo(sx - 26, sy + 26)
  ctx.lineTo(sx + 26, sy + 26)
  ctx.lineTo(sx + 14, sy + 34)
  ctx.lineTo(sx - 14, sy + 34)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#eef4f7'
  poly(ctx, [
    [sx, sy - 26],
    [sx + 18, sy + 22],
    [sx, sy + 22],
  ])
  ctx.fill()
  ctx.fillStyle = '#dfe9ee'
  poly(ctx, [
    [sx - 4, sy - 18],
    [sx - 20, sy + 22],
    [sx - 4, sy + 22],
  ])
  ctx.fill()
}

/** 倾资兴学：带拱廊的校舍 */
function schoolhouse(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#dceaf2')
  g.addColorStop(1, '#b9cfdb')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  const bx = x + w * 0.1
  const by = y + h * 0.3
  const bw = w * 0.8
  const bh = h * 0.5
  ctx.fillStyle = '#f4f1e8'
  ctx.fillRect(bx, by, bw, bh)
  // 屋顶
  ctx.fillStyle = '#a8492f'
  poly(ctx, [
    [bx - w * 0.04, by],
    [bx + bw * 0.5, by - h * 0.14],
    [bx + bw * 1.04, by],
  ])
  ctx.fill()
  // 拱廊
  const n = 6
  for (let i = 0; i < n; i++) {
    const cx = bx + ((i + 0.5) * bw) / n
    ctx.fillStyle = '#5b6b74'
    ctx.beginPath()
    ctx.moveTo(cx - 20, by + bh * 0.86)
    ctx.lineTo(cx - 20, by + bh * 0.46)
    ctx.arc(cx, by + bh * 0.46, 20, Math.PI, 0)
    ctx.lineTo(cx + 20, by + bh * 0.86)
    ctx.closePath()
    ctx.fill()
  }
  // 旗杆
  ctx.strokeStyle = '#6f7d86'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(bx + bw * 0.5, by - h * 0.14)
  ctx.lineTo(bx + bw * 0.5, by - h * 0.34)
  ctx.stroke()
  ctx.fillStyle = '#c4573a'
  ctx.fillRect(bx + bw * 0.5, by - h * 0.34, 34, 22)
}

/** 南侨机工：盘山公路与卡车 */
function railtruck(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#cfe0ea')
  g.addColorStop(1, '#8ea9b8')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  ctx.fillStyle = '#7f9a8c'
  for (const [mx, mw, mh2] of [
    [0.05, 0.36, 0.34],
    [0.3, 0.42, 0.5],
    [0.62, 0.4, 0.4],
  ]) {
    const px = x + w * mx
    const pw = w * mw
    poly(ctx, [
      [px, y + h * 0.78],
      [px + pw * 0.5, y + h * (0.78 - mh2)],
      [px + pw, y + h * 0.78],
    ])
    ctx.fill()
  }
  // 公路
  ctx.strokeStyle = '#b09a7a'
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(x + w * 0.02, y + h * 0.86)
  ctx.bezierCurveTo(x + w * 0.34, y + h * 0.6, x + w * 0.6, y + h * 0.98, x + w * 0.98, y + h * 0.76)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 10])
  ctx.beginPath()
  ctx.moveTo(x + w * 0.02, y + h * 0.86)
  ctx.bezierCurveTo(x + w * 0.34, y + h * 0.6, x + w * 0.6, y + h * 0.98, x + w * 0.98, y + h * 0.76)
  ctx.stroke()
  ctx.setLineDash([])
  // 卡车
  const tx = x + w * 0.5
  const ty = y + h * 0.78
  ctx.fillStyle = '#3f4a51'
  ctx.fillRect(tx - 30, ty - 20, 44, 20)
  ctx.fillRect(tx + 14, ty - 14, 18, 14)
  ctx.fillStyle = '#1f262b'
  for (const dx of [-22, 24]) {
    ctx.beginPath()
    ctx.arc(tx + dx, ty, 6, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 红砖拼花：人字纹 */
function brickPattern(ctx, x, y, w, h) {
  ctx.fillStyle = '#8f3f31'
  ctx.fillRect(x, y, w, h)
  const bw = 58
  const bh = 21
  const step = 30
  for (let row = -1; row * step < h + 40; row++) {
    const yy = y + row * step
    for (let i = -1; i * 36 < w + 60; i++) {
      const xx = x + i * 36 + (row % 2 ? 18 : 0)
      ctx.save()
      ctx.translate(xx + 18, yy + 14)
      ctx.rotate(((i + row) % 2 ? 1 : -1) * 0.46)
      ctx.fillStyle = (row + i) % 3 === 0 ? '#b4553c' : '#a44a33'
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
      ctx.strokeStyle = 'rgba(238,220,200,0.4)'
      ctx.lineWidth = 2
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh)
      ctx.restore()
    }
  }
}

/** 龟背纹（六边形套叠的砖砌花格） */
function lattice(ctx, x, y, w, h) {
  ctx.fillStyle = '#9c4433'
  ctx.fillRect(x, y, w, h)
  const R = 34
  for (let row = -1; row * R * 1.5 < h + R * 2; row++) {
    for (let col = -1; col * R * Math.sqrt(3) < w + R * 2; col++) {
      const cx = x + col * R * Math.sqrt(3) + (row % 2 ? (R * Math.sqrt(3)) / 2 : 0)
      const cy = y + row * R * 1.5
      ctx.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k
        const px = cx + Math.cos(a) * R
        const py = cy + Math.sin(a) * R
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.closePath()
      ctx.fillStyle = '#c9694f'
      ctx.fill()
      ctx.strokeStyle = '#efe0d2'
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.strokeStyle = '#efc9b4'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k
        const px = cx + Math.cos(a) * R * 0.55
        const py = cy + Math.sin(a) * R * 0.55
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
}

/** 燕尾脊：屋顶正脊两端翘成叉形 */
function swallowtail(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#9fc4d8')
  g.addColorStop(1, '#e5eef3')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  const ry = y + h * 0.6
  // 屋面
  ctx.fillStyle = '#a8492f'
  poly(ctx, [
    [x + w * 0.04, ry],
    [x + w * 0.96, ry],
    [x + w * 0.88, y + h * 0.98],
    [x + w * 0.12, y + h * 0.98],
  ])
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  for (let i = 1; i < 12; i++) {
    const t = i / 12
    ctx.beginPath()
    ctx.moveTo(x + w * (0.04 + 0.08 * t), ry + (y + h * 0.98 - ry) * t)
    ctx.lineTo(x + w * (0.96 - 0.08 * t), ry + (y + h * 0.98 - ry) * t)
    ctx.stroke()
  }
  // 正脊 + 两端燕尾
  ctx.strokeStyle = '#7b3220'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(x + w * 0.04, ry)
  ctx.lineTo(x + w * 0.96, ry)
  ctx.stroke()
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x + w * 0.07, ry + 4)
  ctx.quadraticCurveTo(x - w * 0.02, ry - h * 0.1, x + w * 0.14, ry - h * 0.16)
  ctx.moveTo(x + w * 0.93, ry + 4)
  ctx.quadraticCurveTo(x + w * 1.02, ry - h * 0.1, x + w * 0.86, ry - h * 0.16)
  ctx.stroke()
  ctx.lineCap = 'butt'
}

/** 嘉庚风格：中式屋顶 + 西式拱券柱廊 */
function arcade(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#dbe9f1')
  g.addColorStop(1, '#a9c2cf')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)

  const bx = x + w * 0.06
  const by = y + h * 0.24
  const bw = w * 0.88
  const bh = h * 0.62
  ctx.fillStyle = '#b4553c'
  ctx.fillRect(bx, by, bw, bh)
  // 中式坡顶
  ctx.fillStyle = '#a8492f'
  poly(ctx, [
    [bx - w * 0.05, by],
    [bx + bw * 0.5, by - h * 0.16],
    [bx + bw * 1.05, by],
  ])
  ctx.fill()
  ctx.strokeStyle = '#7b3220'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(bx - w * 0.05, by)
  ctx.lineTo(bx + bw * 1.05, by)
  ctx.stroke()
  // 白石拱券柱廊
  const n = 5
  for (let i = 0; i < n; i++) {
    const cx = bx + ((i + 0.5) * bw) / n
    const r = bw / n / 2 - 10
    const baseY = by + bh * 0.9
    const topY = by + bh * 0.52
    ctx.fillStyle = '#f1ede2'
    ctx.beginPath()
    ctx.moveTo(cx - r, baseY)
    ctx.lineTo(cx - r, topY)
    ctx.arc(cx, topY, r, Math.PI, 0)
    ctx.lineTo(cx + r, baseY)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(30,45,55,0.55)'
    ctx.beginPath()
    ctx.moveTo(cx - r + 10, baseY)
    ctx.lineTo(cx - r + 10, topY)
    ctx.arc(cx, topY, r - 10, Math.PI, 0)
    ctx.lineTo(cx + r - 10, baseY)
    ctx.closePath()
    ctx.fill()
  }
  // 白石勒脚
  ctx.fillStyle = '#e8e3d6'
  ctx.fillRect(bx, by + bh * 0.88, bw, bh * 0.12)
}

const ART = {
  seaProfile,
  seaFloor,
  vent,
  creature,
  village,
  voyage,
  schoolhouse,
  railtruck,
  brickPattern,
  lattice,
  swallowtail,
  arcade,
}

/* ------------------------------------------------------------------ *
 * 整页版式
 * ------------------------------------------------------------------ */

function drawPage(ctx, book, index) {
  const page = book.pages[index] ?? book.pages[0]

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#122a3c')
  bg.addColorStop(1, '#08141d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 页眉
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#e8f6fd'
  ctx.font = 'bold 26px "Microsoft YaHei", sans-serif'
  ctx.fillText(book.title, 44, 60)
  ctx.fillStyle = '#7f9db0'
  ctx.font = '19px "Microsoft YaHei", sans-serif'
  ctx.fillText(`${book.author} · ${book.subject}`, 300, 59)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#7fe0ff'
  ctx.font = 'bold 22px "Microsoft YaHei", sans-serif'
  ctx.fillText(`${String(index + 1).padStart(2, '0')} / ${String(book.pages.length).padStart(2, '0')}`, 980, 59)
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(127,224,255,0.3)'
  ctx.fillRect(44, 78, 936, 2)

  // 插图
  const fx = 44
  const fy = 104
  const fw = 396
  const fh = 344
  ctx.save()
  roundedRect(ctx, fx, fy, fw, fh, 12)
  ctx.clip()
  const art = ART[page.art] ?? ART.brickPattern
  art(ctx, fx, fy, fw, fh)
  ctx.restore()
  ctx.strokeStyle = 'rgba(127,224,255,0.4)'
  ctx.lineWidth = 2
  roundedRect(ctx, fx, fy, fw, fh, 12)
  ctx.stroke()

  // 右栏：小标题 + 正文
  const tx = 484
  const tw = 496
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 34px "Microsoft YaHei", sans-serif'
  ctx.fillText(page.title, tx, fy + 44)

  ctx.fillStyle = 'rgba(127,224,255,0.55)'
  ctx.fillRect(tx, fy + 66, 64, 3)

  ctx.fillStyle = '#c6dbe6'
  ctx.font = '21px "Microsoft YaHei", sans-serif'
  const lines = wrapText(ctx, page.body, tw)
  lines.forEach((line, i) => ctx.fillText(line, tx, fy + 118 + i * 38))

  // 页脚
  ctx.fillStyle = 'rgba(127,224,255,0.22)'
  ctx.fillRect(44, 500, 936, 2)
  ctx.fillStyle = '#6d8797'
  ctx.font = '17px "Microsoft YaHei", sans-serif'
  ctx.fillText('导读 · 示意内容', 44, 534)
  ctx.textAlign = 'right'
  ctx.fillText('嘉庚图书馆 · VR 沉浸阅读舱', 980, 534)
  ctx.textAlign = 'left'
}

/* ------------------------------------------------------------------ *
 * 3D 实体
 * ------------------------------------------------------------------ */

export function createVrReading() {
  const group = new THREE.Group()

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  // Basic 材质：幕布是自发光的，不吃昼夜压暗 —— 夜里才像"开着的屏"
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    depthWrite: false, // 透明件别写深度（淡入过程中会跟背后的幕布盒子抢 z）
    side: THREE.FrontSide,
  })

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(VR_READ.width, VR_READ.height), material)
  // rotateY(π/2)：法线朝 +x（面向厅内），画布的 u 轴落在观众的右手方向 —— 文字不会镜像
  panel.rotation.y = Math.PI / 2
  panel.position.set(VR_READ.x, VR_READ.y, VR_READ.z)
  panel.renderOrder = 3
  panel.visible = false
  group.add(panel)

  // 一点很弱的补光：让"幕布在发光"这件事落到地毯和躺椅上。
  // distance 收在 9m，曝光探针的机位离它 16m —— 不会动到那条基线。
  const light = new THREE.PointLight(0x9fd8ff, 0, 9, 2)
  light.position.set(VR_READ.x + 1.6, VR_READ.y, VR_READ.z)
  group.add(light)

  let book = getVrBook('sea')
  let page = 0
  let fade = 0
  let fadeTarget = 0

  const redraw = () => {
    drawPage(ctx, book, page)
    texture.needsUpdate = true
  }
  redraw() // 先画好第 1 页，亮起来就是现成的

  return {
    group,
    /** 幕布中心的世界坐标（相机距离触发用） */
    center: new THREE.Vector3(VR_READ.x, VR_READ.y * 0.85, VR_READ.z),
    show(bookId, nextPage) {
      const nextBook = getVrBook(bookId)
      const total = nextBook.pages.length
      const p = Math.max(0, Math.min(total - 1, nextPage))
      if (nextBook === book && p === page) return
      book = nextBook
      page = p
      redraw()
      // 翻页 = 先淡下去再涨回来（比硬切有"换了一页"的手感，且不用每帧重画）
      if (fade > 0.3) fade = 0.3
    },
    setActive(active) {
      fadeTarget = active ? 1 : 0
    },
    tick(dt) {
      fade += (fadeTarget - fade) * (1 - Math.exp(-dt / 0.38))
      panel.visible = fade > 0.01
      material.opacity = fade
      light.intensity = 2.4 * fade
    },
    state() {
      return { active: fadeTarget === 1, fade, bookId: book.id, page, total: book.pages.length }
    },
    dispose() {
      panel.geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}
