/**
 * 全息投影每个章节的**贴图**：1024×768 的 alpha 图（透明底、白色剪影，颜色交给 Shader 染）。
 *
 * 为什么是剪影而不是建模：约束里写着"尽量用透明贴图 + Shader，避免高面数模型"。
 * 一章节一张图 = 加章节只加一张图和一条数据，几何体一个都不加。
 *
 * 构图（从下往上）：前景一排学子的背影 → 台阶 → 站在台阶上说话的人 → 章节专属背景剪影。
 * 这样从第一视角看过去，是"你也在听众里"的位置。
 *
 * ⚠️ 画的是**示意剪影**，不是陈嘉庚先生的肖像，也不是任何真人影像。
 */

const W = 1024
const H = 768

/** 白色填充 + 可选透明度（alpha 图里"白"就是最终被 shader 染色的地方） */
const fill = (ctx, alpha = 1) => {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`
}
const stroke = (ctx, width, alpha = 1) => {
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function poly(ctx, pts) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

/* ------------------------------------------------------------------ *
 * 共用构件
 * ------------------------------------------------------------------ */

/** 中心光晕：让整块面板有一层"投影在发光"的底（很淡，重了就压住剪影） */
function drawGlow(ctx) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.46, 20, W * 0.5, H * 0.46, W * 0.5)
  g.addColorStop(0, 'rgba(255,255,255,0.10)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

/** 台阶：三级，从上到下变宽（近大远小） */
function drawSteps(ctx) {
  const tiers = [
    { y: 560, h: 34, w: 560 },
    { y: 594, h: 38, w: 720 },
    { y: 632, h: 44, w: 900 },
  ]
  for (const t of tiers) {
    fill(ctx, 0.62)
    ctx.fillRect(W / 2 - t.w / 2, t.y, t.w, t.h)
    fill(ctx, 0.9)
    ctx.fillRect(W / 2 - t.w / 2, t.y, t.w, 5) // 踏面高光
  }
}

/** 站在台阶上的演讲者：长衫立姿 + 一手抬起 */
function drawSpeaker(ctx, cx, baseY) {
  fill(ctx, 1)
  // 头
  ctx.beginPath()
  ctx.ellipse(cx, baseY - 258, 31, 38, 0, 0, Math.PI * 2)
  ctx.fill()
  // 颈
  ctx.fillRect(cx - 11, baseY - 232, 22, 26)
  // 抬起的那条手臂（先画，压在身体下面）
  stroke(ctx, 26)
  ctx.beginPath()
  ctx.moveTo(cx - 50, baseY - 196)
  ctx.quadraticCurveTo(cx - 96, baseY - 226, cx - 112, baseY - 272)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx - 116, baseY - 284, 15, 0, Math.PI * 2)
  ctx.fill()
  // 垂下的手臂
  stroke(ctx, 26)
  ctx.beginPath()
  ctx.moveTo(cx + 50, baseY - 196)
  ctx.quadraticCurveTo(cx + 74, baseY - 130, cx + 72, baseY - 74)
  ctx.stroke()
  // 长衫：肩窄下摆宽
  poly(ctx, [
    [cx - 62, baseY - 206],
    [cx - 30, baseY - 222],
    [cx + 30, baseY - 222],
    [cx + 62, baseY - 206],
    [cx + 88, baseY - 4],
    [cx - 88, baseY - 4],
  ])
  ctx.fill()
  // 衣襟（挖一道缝，Shader 会把半透明的边界描成发光线）
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  stroke(ctx, 6)
  ctx.beginPath()
  ctx.moveTo(cx + 4, baseY - 214)
  ctx.lineTo(cx + 22, baseY - 8)
  ctx.stroke()
  ctx.restore()
}

/** 前景听众：一排背影（头 + 肩），越靠下越大 */
function drawAudience(ctx) {
  const back = [
    [120, 700, 40],
    [296, 712, 44],
    [470, 704, 41],
    [644, 714, 45],
    [826, 702, 42],
  ]
  for (const [x, y, r] of back) {
    fill(ctx, 0.78)
    ctx.beginPath()
    ctx.ellipse(x, y, r * 0.86, r, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - r * 1.9, y + r * 2.0)
    ctx.quadraticCurveTo(x, y + r * 0.75, x + r * 1.9, y + r * 2.0)
    ctx.closePath()
    ctx.fill()
  }
  // 更远一排（小、高一点、淡一点）
  for (let i = 0; i < 7; i++) {
    const x = 80 + i * 146
    const y = 668
    const r = 26
    fill(ctx, 0.55)
    ctx.beginPath()
    ctx.ellipse(x, y, r * 0.86, r, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - r * 1.9, y + r * 1.9)
    ctx.quadraticCurveTo(x, y + r * 0.75, x + r * 1.9, y + r * 1.9)
    ctx.closePath()
    ctx.fill()
  }
}

/* ------------------------------------------------------------------ *
 * 章节背景剪影（都画在画面上半部）
 * ------------------------------------------------------------------ */

/** 1913 集美小学：一间小学堂 + 旗杆 */
function backdropPrimary(ctx) {
  fill(ctx, 0.88)
  ctx.fillRect(300, 300, 424, 260)
  poly(ctx, [
    [268, 300],
    [512, 190],
    [756, 300],
  ])
  ctx.fill()
  // 门与窗（挖成透明）
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillRect(478, 430, 68, 130)
  for (const wx of [340, 620]) {
    ctx.fillRect(wx, 350, 72, 84)
    ctx.fillRect(wx, 462, 72, 84)
  }
  ctx.restore()
  // 旗杆
  stroke(ctx, 7, 0.9)
  ctx.beginPath()
  ctx.moveTo(200, 560)
  ctx.lineTo(200, 250)
  ctx.stroke()
  fill(ctx, 0.9)
  ctx.fillRect(200, 258, 66, 40)
}

/** 1918 集美学校：三栋校舍 + 中央钟楼 */
function backdropSchool(ctx) {
  fill(ctx, 0.86)
  ctx.fillRect(150, 358, 244, 202)
  ctx.fillRect(630, 358, 244, 202)
  poly(ctx, [
    [128, 358],
    [272, 286],
    [416, 358],
  ])
  ctx.fill()
  poly(ctx, [
    [608, 358],
    [752, 286],
    [896, 358],
  ])
  ctx.fill()
  fill(ctx, 0.92)
  ctx.fillRect(420, 250, 184, 310)
  poly(ctx, [
    [400, 250],
    [512, 172],
    [624, 250],
  ])
  ctx.fill()
  // 钟面
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(512, 316, 30, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  stroke(ctx, 5, 0.95)
  ctx.beginPath()
  ctx.arc(512, 316, 30, 0, Math.PI * 2)
  ctx.stroke()
  // 窗
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (const wx of [180, 250, 320, 660, 730, 800]) ctx.fillRect(wx, 420, 44, 62)
  ctx.fillRect(452, 400, 40, 160)
  ctx.fillRect(532, 400, 40, 160)
  ctx.restore()
}

/** 1921 厦门大学：柱廊主楼 */
function backdropUniversity(ctx) {
  fill(ctx, 0.9)
  ctx.fillRect(180, 340, 664, 220)
  // 屋顶
  poly(ctx, [
    [148, 340],
    [512, 216],
    [876, 340],
  ])
  ctx.fill()
  // 柱廊：先挖出拱洞，再用实心柱子把洞切开
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 7; i++) {
    const x = 226 + i * 92
    ctx.beginPath()
    ctx.moveTo(x, 556)
    ctx.lineTo(x, 448)
    ctx.arc(x + 30, 448, 30, Math.PI, 0)
    ctx.lineTo(x + 60, 556)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  stroke(ctx, 6, 0.95)
  for (let i = 0; i < 7; i++) {
    const x = 226 + i * 92
    ctx.beginPath()
    ctx.moveTo(x, 556)
    ctx.lineTo(x, 448)
    ctx.arc(x + 30, 448, 30, Math.PI, 0)
    ctx.lineTo(x + 60, 556)
    ctx.stroke()
  }
  // 山墙
  fill(ctx, 0.95)
  poly(ctx, [
    [472, 300],
    [512, 250],
    [552, 300],
  ])
  ctx.fill()
}

/** 1923—1933 集美学村：一片屋顶 + 水面 */
function backdropVillage(ctx) {
  const roofs = [
    [110, 380, 150, 96],
    [280, 350, 180, 120],
    [480, 392, 140, 84],
    [640, 356, 168, 110],
    [826, 386, 130, 92],
  ]
  for (const [x, y, w, h] of roofs) {
    fill(ctx, 0.88)
    ctx.fillRect(x, y + h * 0.42, w, 190)
    poly(ctx, [
      [x - 14, y + h * 0.42],
      [x + w / 2, y],
      [x + w + 14, y + h * 0.42],
    ])
    ctx.fill()
  }
  // 海面
  fill(ctx, 0.5)
  for (let i = 0; i < 5; i++) {
    const y = 592 + i * 12
    ctx.fillRect(40 + i * 8, y, W - 80 - i * 16, 3)
  }
}

/** 1939 南侨机工：盘山公路 + 卡车 */
function backdropDrivers(ctx) {
  fill(ctx, 0.8)
  for (const [mx, mw, mh] of [
    [40, 340, 190],
    [280, 400, 250],
    [610, 380, 210],
  ]) {
    poly(ctx, [
      [mx, 560],
      [mx + mw / 2, 560 - mh],
      [mx + mw, 560],
    ])
    ctx.fill()
  }
  // 公路
  stroke(ctx, 26, 0.95)
  ctx.beginPath()
  ctx.moveTo(30, 520)
  ctx.bezierCurveTo(300, 380, 560, 560, 994, 430)
  ctx.stroke()
  ctx.save()
  ctx.setLineDash([22, 20])
  stroke(ctx, 4, 0.9)
  ctx.beginPath()
  ctx.moveTo(30, 520)
  ctx.bezierCurveTo(300, 380, 560, 560, 994, 430)
  ctx.stroke()
  ctx.restore()
  // 卡车（简化成方头车）
  fill(ctx, 1)
  ctx.fillRect(430, 452, 92, 40)
  ctx.fillRect(518, 462, 40, 30)
  ctx.beginPath()
  ctx.arc(452, 496, 14, 0, Math.PI * 2)
  ctx.arc(540, 496, 14, 0, Math.PI * 2)
  ctx.fill()
}

const BACKDROPS = {
  primary: backdropPrimary,
  school: backdropSchool,
  university: backdropUniversity,
  village: backdropVillage,
  drivers: backdropDrivers,
}

/* ------------------------------------------------------------------ *
 * 一章 = 一张图
 * ------------------------------------------------------------------ */

export function drawChapter(ctx, chapter) {
  ctx.clearRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'

  drawGlow(ctx)
  // 背景整体压到三成多：它是"底"，不压的话和台阶/人叠在一起会被叠加混合糊成一团白
  // （一个 globalAlpha 同时缩放背景里所有 fill 与 destination-out 的强度）
  const backdrop = BACKDROPS[chapter.art] ?? backdropVillage
  ctx.save()
  ctx.globalAlpha = 0.34
  backdrop(ctx)
  ctx.restore()

  drawSteps(ctx)
  drawSpeaker(ctx, 452, 604) // 站在第二级台阶上
  drawAudience(ctx)
}

export { W as HOLO_FIGURE_W, H as HOLO_FIGURE_H }
