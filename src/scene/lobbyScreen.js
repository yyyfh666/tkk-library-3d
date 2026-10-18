import * as THREE from 'three'
import { LOBBY_SCREEN } from './hallLayout.js'
import { getLobbyProgram, SLIDE_SECONDS } from '../state/lobbyPrograms.js'

/**
 * 一楼数字展屏（老师建议里的"虚拟显示屏"）。
 *
 * 和书架屏 / VR 幕布同一套做法：canvas 现画 → CanvasTexture → MeshBasicMaterial。
 * 不引视频文件、不引外部图片，屏幕上的讲座、校园宣传、展览、新书与公告都由数据驱动。
 *
 * 屏幕本体是一块 16:9 的发光面；边框、底座和碰撞盒在 hall.js 里砌，
 * 位置只认 hallLayout.js 的 LOBBY_SCREEN。
 */

const W = 1536
const H = 864
const REDRAW_INTERVAL = 0.12 // 约 8fps：进度条在动，但不必每帧上传一张 1536×864 贴图

const FONT_CN = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif'
const FONT_SERIF = 'Georgia, "Songti SC", "SimSun", serif'

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function wrap(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const ch of String(text)) {
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

function fillWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const lines = wrap(ctx, text, maxWidth).slice(0, maxLines)
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight))
  return y + (lines.length - 1) * lineHeight
}

function drawBrick(ctx, x, y, w, h, accent, alpha = 0.5) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  const bh = h / 8
  const bw = w / 5
  for (let r = 0; r < 8; r++) {
    const offset = r % 2 ? bw / 2 : 0
    for (let c = -1; c < 6; c++) {
      ctx.strokeRect(x + c * bw + offset, y + r * bh, bw, bh)
    }
  }
  ctx.restore()
}

function drawWaves(ctx, x, y, w, h, accent) {
  ctx.save()
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  for (let i = 0; i < 7; i++) {
    ctx.globalAlpha = 0.22 + i * 0.07
    ctx.beginPath()
    for (let px = 0; px <= w; px += 8) {
      const t = px / w
      const yy = y + h * 0.25 + i * 14 + Math.sin(t * Math.PI * 3 + i * 0.7) * (10 + i * 2)
      px ? ctx.lineTo(x + px, yy) : ctx.moveTo(x + px, yy)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function drawBooks(ctx, x, y, w, h, accent) {
  const colors = [accent, '#E8D9B5', '#7FA7A1', '#C4573A', '#D9A441', '#8FA6C4']
  const n = 7
  const bw = w / n
  for (let i = 0; i < n; i++) {
    const bh = h * (0.55 + ((i * 37) % 40) / 100)
    ctx.fillStyle = colors[i % colors.length]
    ctx.globalAlpha = 0.9
    roundedRect(ctx, x + i * bw + 5, y + h - bh, bw - 10, bh, 4)
    ctx.fill()
    ctx.globalAlpha = 0.45
    ctx.fillStyle = '#0B141B'
    ctx.fillRect(x + i * bw + 12, y + h - bh + 18, bw - 24, 3)
  }
  ctx.globalAlpha = 1
}

function drawCalendar(ctx, x, y, w, h, accent) {
  ctx.save()
  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.55
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 5; c++) {
      const cw = w / 5
      const ch = h / 6
      ctx.strokeRect(x + c * cw, y + r * ch, cw, ch)
      if ((r * 5 + c) % 7 === 3) {
        ctx.globalAlpha = 0.85
        ctx.fillStyle = accent
        roundedRect(ctx, x + c * cw + 10, y + r * ch + 10, cw - 20, ch - 20, 6)
        ctx.fill()
        ctx.globalAlpha = 0.55
      }
    }
  }
  ctx.restore()
}

function drawArch(ctx, x, y, w, h, accent) {
  ctx.save()
  ctx.strokeStyle = accent
  ctx.lineWidth = 4
  ctx.globalAlpha = 0.7
  const baseY = y + h
  for (const fx of [0.16, 0.5, 0.84]) {
    ctx.beginPath()
    ctx.moveTo(x + w * fx, baseY)
    ctx.lineTo(x + w * fx, y + h * 0.3)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(x + w * 0.5, y + h * 0.3, w * 0.34, Math.PI, 0)
  ctx.stroke()
  ctx.globalAlpha = 0.24
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = accent
    ctx.fillRect(x + w * 0.08, y + h * (0.42 + i * 0.13), w * 0.84, 6)
  }
  ctx.restore()
}

function drawFrames(ctx, x, y, w, h, accent) {
  ctx.save()
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 0.2 + i * 0.16
    roundedRect(ctx, x + i * 18, y + i * 14, w - i * 36, h - i * 28, 10)
    ctx.stroke()
  }
  ctx.globalAlpha = 0.6
  ctx.fillStyle = accent
  ctx.fillRect(x + w * 0.18, y + h * 0.62, w * 0.46, 4)
  ctx.fillRect(x + w * 0.18, y + h * 0.7, w * 0.3, 4)
  ctx.restore()
}

function drawMotif(ctx, program, x, y, w, h) {
  switch (program.id) {
    case 'lecture':
      drawArch(ctx, x, y, w, h, program.accent)
      break
    case 'campus':
      drawBrick(ctx, x, y + h * 0.46, w, h * 0.54, program.accent, 0.36)
      break
    case 'jimei':
      drawBrick(ctx, x, y + h * 0.48, w, h * 0.52, program.accent, 0.5)
      break
    case 'research':
      drawWaves(ctx, x, y, w, h, program.accent)
      break
    case 'student':
      drawFrames(ctx, x, y, w, h, program.accent)
      break
    case 'newbooks':
      drawBooks(ctx, x, y, w, h, program.accent)
      break
    case 'notice':
      drawCalendar(ctx, x + w * 0.12, y + h * 0.18, w * 0.76, h * 0.64, program.accent)
      break
    default:
      drawWaves(ctx, x, y, w, h, program.accent)
  }
}

/**
 * 画一帧。slideT 是当前这页已经播了多少秒（0..SLIDE_SECONDS），
 * 用来做进场淡入和底部进度条。
 */
function paint(ctx, program, slide, slideIndex, slideT, playing) {
  const accent = program.accent
  ctx.clearRect(0, 0, W, H)

  // —— 底：深墨绿/深蓝的展屏底色，右侧带一点节目主题色 ——
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0A141B')
  bg.addColorStop(0.58, '#10222A')
  bg.addColorStop(1, '#0B151A')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W * 0.78, H * 0.18, 20, W * 0.78, H * 0.18, W * 0.55)
  glow.addColorStop(0, `${accent}66`)
  glow.addColorStop(0.45, `${accent}18`)
  glow.addColorStop(1, '#00000000')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // 细网格：让屏幕近看有"展陈系统"的质感
  ctx.save()
  ctx.strokeStyle = '#FFFFFF'
  ctx.globalAlpha = 0.035
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  ctx.restore()

  // 进场：每页前 0.45 秒压一层暗幕，内容从下往上托一点
  const enter = Math.min(1, slideT / 0.45)
  const lift = (1 - enter) * 24
  ctx.save()
  ctx.globalAlpha = enter

  // —— 顶栏 ——
  ctx.fillStyle = '#F5EFE2'
  ctx.font = `600 22px ${FONT_CN}`
  ctx.fillText('TAN KAH KEE LIBRARY', 78, 72)
  ctx.fillStyle = '#8FA6A0'
  ctx.font = `15px ${FONT_CN}`
  ctx.fillText('嘉庚图书馆 · 一楼数字展屏', 78, 100)

  ctx.textAlign = 'right'
  ctx.fillStyle = accent
  ctx.font = `600 15px ${FONT_CN}`
  ctx.fillText('● LIVE', W - 78, 70)
  ctx.fillStyle = '#8FA6A0'
  ctx.font = `13px ${FONT_CN}`
  ctx.fillText(program.tag, W - 78, 97)
  ctx.textAlign = 'left'

  ctx.strokeStyle = '#FFFFFF22'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(78, 126)
  ctx.lineTo(W - 78, 126)
  ctx.stroke()

  // —— 左：文字区 ——
  const leftX = 78
  const leftW = W * 0.55
  ctx.fillStyle = accent
  ctx.font = `600 20px ${FONT_CN}`
  ctx.fillText(slide.eyebrow, leftX, 216 + lift)

  ctx.fillStyle = '#F7F2E7'
  ctx.font = `600 74px ${FONT_SERIF}`
  const titleY = fillWrapped(ctx, slide.title, leftX, 318 + lift, leftW, 88, 2)

  ctx.fillStyle = '#C9D5D1'
  ctx.font = `26px ${FONT_CN}`
  let lineY = titleY + 82
  for (const line of slide.lines) {
    ctx.fillText(line, leftX, lineY)
    lineY += 44
  }

  // —— 右：大数字 / 主题图形 ——
  const panelX = W * 0.66
  const panelY = 176
  const panelW = W - panelX - 78
  const panelH = 512
  ctx.save()
  roundedRect(ctx, panelX, panelY, panelW, panelH, 22)
  ctx.fillStyle = '#FFFFFF08'
  ctx.fill()
  ctx.strokeStyle = `${accent}70`
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  drawMotif(ctx, program, panelX + 24, panelY + 24, panelW - 48, panelH - 48)

  ctx.textAlign = 'center'
  const statSize = String(slide.stat).length > 8 ? 58 : 104
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `600 ${statSize}px ${FONT_SERIF}`
  ctx.fillText(slide.stat, panelX + panelW / 2, panelY + panelH * 0.56)
  ctx.fillStyle = accent
  ctx.font = `600 20px ${FONT_CN}`
  ctx.fillText(slide.statLabel, panelX + panelW / 2, panelY + panelH * 0.68)
  ctx.textAlign = 'left'

  // —— 页脚 ——
  ctx.fillStyle = '#7F9690'
  ctx.font = `15px ${FONT_CN}`
  ctx.fillText(slide.footer, 78, H - 58)

  // 页码 + 进度
  const total = program.slides.length
  const progress = Math.max(0, Math.min(1, slideT / SLIDE_SECONDS))
  const barX = 78
  const barY = H - 34
  const barW = W - 156
  ctx.fillStyle = '#FFFFFF18'
  roundedRect(ctx, barX, barY, barW, 4, 2)
  ctx.fill()
  ctx.fillStyle = accent
  const segW = (barW - (total - 1) * 8) / total
  for (let i = 0; i < total; i++) {
    const sx = barX + i * (segW + 8)
    ctx.fillStyle = i < slideIndex ? `${accent}AA` : i === slideIndex ? accent : '#FFFFFF22'
    const w = i === slideIndex ? segW * progress : i < slideIndex ? segW : segW * 0.28
    roundedRect(ctx, sx, barY, Math.max(2, w), 4, 2)
    ctx.fill()
  }
  ctx.textAlign = 'right'
  ctx.fillStyle = '#7F9690'
  ctx.font = `13px ${FONT_CN}`
  ctx.fillText(playing ? `${String(slideIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : 'PAUSED', W - 78, barY + 20)
  ctx.textAlign = 'left'
  ctx.restore()

  // 进场暗幕
  if (enter < 1) {
    ctx.fillStyle = `rgba(4, 9, 12, ${(1 - enter) * 0.72})`
    ctx.fillRect(0, 0, W, H)
  }
}

export function createLobbyScreen() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  const geometry = new THREE.PlaneGeometry(LOBBY_SCREEN.width, LOBBY_SCREEN.height)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: false,
    side: THREE.FrontSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(LOBBY_SCREEN.x, LOBBY_SCREEN.y, LOBBY_SCREEN.z)
  mesh.rotation.y = LOBBY_SCREEN.ry
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.renderOrder = 2

  const group = new THREE.Group()
  group.add(mesh)

  let program = getLobbyProgram(LOBBY_SCREEN.defaultProgramId)
  let playing = true
  let elapsed = 0
  let slideIndex = -1
  let redrawT = 0

  const redraw = () => {
    const total = program.slides.length
    const idx = Math.max(0, Math.min(total - 1, Math.floor(elapsed / SLIDE_SECONDS) % total))
    const slideT = elapsed % SLIDE_SECONDS
    slideIndex = idx
    paint(ctx, program, program.slides[idx], idx, slideT, playing)
    texture.needsUpdate = true
  }

  redraw()

  return {
    group,
    center: new THREE.Vector3(LOBBY_SCREEN.x, LOBBY_SCREEN.y, LOBBY_SCREEN.z),
    setProgram(id) {
      const next = getLobbyProgram(id)
      if (next.id === program.id) return
      program = next
      elapsed = 0
      slideIndex = -1
      redraw()
    },
    setPlaying(next) {
      if (next === playing) return
      playing = next
      redraw()
    },
    tick(dt) {
      if (!playing) return
      elapsed += dt
      redrawT += dt
      if (redrawT < REDRAW_INTERVAL) return
      redrawT = 0
      redraw()
    },
    state() {
      return {
        programId: program.id,
        title: program.title,
        slideIndex,
        slideCount: program.slides.length,
        playing,
        elapsed: +elapsed.toFixed(2),
      }
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}
