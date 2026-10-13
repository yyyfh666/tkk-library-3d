import * as THREE from 'three'
import { SHELF_UNITS_L0 } from './hallLayout.js'
import { BOOKS } from '../state/mockBooks.js'

/**
 * 书架智能显示屏 + 书籍拾取（场景三）。
 *
 * 两个实现选择，都是刻意的：
 *
 * ① **屏幕用 CanvasTexture，不用 CSS3DRenderer。**
 *    CSS3D 方案要再起一个 DOM 渲染器、每帧和 WebGL 同步，还要处理两套渲染的层级/遮挡 ——
 *    在这个"单 WebGLRenderer + HTML 覆盖层"的架构里是纯负债。CanvasTexture 直接贴进 3D：
 *    透视/遮挡/昼夜全自动正确，悬停换内容只是重画一张 256×160 的 canvas（微秒级）。
 *    （队友提示词里写的正是"CSS3DRenderer **或** CanvasTexture"，这里选后者。）
 *
 * ② **书名的拾取自己算，不用 InstancedMesh.raycast。**
 *    three 对 InstancedMesh 的 raycast 会逐实例做三角面测试，三千多本书 = 四万多次三角形求交，
 *    鼠标一动就卡。这里的书全是轴对齐盒子，直接做**射线-AABB（slab 法）**，三千多次整数比较，
 *    每帧跑都毫无压力。
 */

/* ------------------------------------------------------------------ *
 * 屏幕贴图（canvas 现画）
 * ------------------------------------------------------------------ */

const SCREEN_W = 256
const SCREEN_H = 160

function drawScreen(ctx, { shelfId, category, capacity, book, board = null }) {
  // 深蓝底 + 顶部一条青色标带（像块小 e-ink 屏）
  ctx.fillStyle = '#0d1b26'
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
  ctx.fillStyle = '#123243'
  ctx.fillRect(0, 0, SCREEN_W, 30)

  ctx.textAlign = 'left'
  ctx.fillStyle = '#7fe0ff'
  ctx.font = 'bold 15px "Microsoft YaHei", sans-serif'
  ctx.fillText(`${shelfId}`, 12, 21)
  ctx.fillStyle = '#bfe6f2'
  ctx.font = '14px "Microsoft YaHei", sans-serif'
  ctx.fillText(category, 52, 21)

  if (book) {
    // 悬停/选中：显示这本书的封面块 + 书名 + 索书号 + 在馆状态
    ctx.fillStyle = book.status === '在馆' ? '#2f6f4f' : '#6f3030'
    ctx.fillRect(12, 42, 44, 62) // "封面"色块
    ctx.fillStyle = '#eaf6fb'
    ctx.textAlign = 'center'
    ctx.font = '13px "Microsoft YaHei", sans-serif'
    ctx.fillText('封面', 34, 76)

    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 17px "Microsoft YaHei", sans-serif'
    ctx.fillText(book.title.slice(0, 11), 66, 60)
    ctx.fillStyle = '#9fc4d4'
    ctx.font = '14px "Microsoft YaHei", sans-serif'
    ctx.fillText(`${book.author}`.slice(0, 12), 66, 82)
    ctx.fillStyle = '#7fe0ff'
    ctx.fillText(book.callNumber, 66, 104)

    const ok = book.status === '在馆'
    ctx.fillStyle = ok ? '#5ce08f' : '#ff8a8a'
    ctx.beginPath()
    ctx.arc(72, 130, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = ok ? '#a8f0c4' : '#ffbdbd'
    ctx.fillText(`${book.status} · 第 ${book.board} 层`, 84, 135)
  } else {
    // 默认：这架书的分类与在馆情况
    ctx.fillStyle = '#eaf6fb'
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif'
    ctx.fillText('馆藏导航屏', 12, 58)
    ctx.fillStyle = '#9fc4d4'
    ctx.font = '14px "Microsoft YaHei", sans-serif'
    ctx.fillText(`在馆 ${capacity.on} / ${capacity.total} 种`, 12, 84)
    // 指着的是"有书脊但没编目"的那本：至少把层数报出来（演示书目只覆盖一部分层板）
    ctx.fillText(board ? `第 ${board} 层 · 暂无编目` : '鼠标悬停书目查看详情', 12, 108)
    ctx.fillStyle = '#5ce08f'
    ctx.beginPath()
    ctx.arc(18, 132, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#8fd8b0'
    ctx.font = '13px "Microsoft YaHei", sans-serif'
    ctx.fillText('系统在线', 30, 136)
  }
}

/* ------------------------------------------------------------------ *
 * 屏幕实体
 * ------------------------------------------------------------------ */

export function createShelfScreens() {
  const group = new THREE.Group()
  const screens = new Map() // shelfId -> { mesh, ctx, texture, pop }

  for (const unit of SHELF_UNITS_L0) {
    const books = BOOKS.filter((b) => b.shelfId === unit.id)
    if (!books.length) continue
    const category = books[0].category
    const capacity = { total: books.length, on: books.filter((b) => b.status === '在馆').length }

    const canvas = document.createElement('canvas')
    canvas.width = SCREEN_W
    canvas.height = SCREEN_H
    const ctx = canvas.getContext('2d')
    drawScreen(ctx, { shelfId: unit.id, category, capacity, book: null })

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4

    const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), mat)

    // 屏幕装在书架朝过道的那一面：方向 = 书架 → 中庭（就是机器人/读者的站位方向）
    const len = Math.hypot(unit.x, unit.z) || 1
    const dirX = -unit.x / len
    const dirZ = -unit.z / len
    mesh.position.set(unit.x + dirX * 0.34, 1.78, unit.z + dirZ * 0.34)
    mesh.rotation.y = Math.atan2(dirX, dirZ)
    mesh.renderOrder = 2
    group.add(mesh)

    screens.set(unit.id, { mesh, ctx, texture, meta: { shelfId: unit.id, category, capacity }, book: null, board: null, pop: 0 })
  }

  return {
    group,
    /**
     * 把某个书架屏切到某本书，并弹一下。
     * `book = null` 恢复默认内容；这时若给了 `board`，就报"第 N 层 · 暂无编目"——
     * 指着的那本书没有编目条目时也总得有点反馈，不然屏幕一动就退回默认页，像是坏了。
     */
    show(shelfId, book, board = null) {
      const s = screens.get(shelfId)
      if (!s) return
      const nextBoard = book ? null : (board ?? null)
      if ((s.book?.id ?? null) === (book?.id ?? null) && s.board === nextBoard) return
      s.book = book ?? null
      s.board = nextBoard
      drawScreen(s.ctx, { ...s.meta, book: s.book, board: s.board })
      s.texture.needsUpdate = true
      s.pop = 1 // 触发弹出动画
    },
    /** 每帧调：弹出动画（弹性缩放，手写的小 tween —— 不引 GSAP） */
    tick(dt) {
      for (const s of screens.values()) {
        if (s.pop <= 0) continue
        s.pop = Math.max(0, s.pop - dt / 0.45)
        const k = 1 + 0.16 * Math.sin(s.pop * Math.PI) // 0→1→0 的弹性
        s.mesh.scale.setScalar(k)
      }
    },
    /** 屏幕面板的世界坐标（给"高亮框/相机"参考） */
    positionOf(shelfId) {
      return screens.get(shelfId)?.mesh.position ?? null
    },
    dispose() {
      for (const s of screens.values()) {
        s.mesh.geometry.dispose()
        s.mesh.material.map?.dispose()
        s.mesh.material.dispose()
      }
    },
  }
}

/* ------------------------------------------------------------------ *
 * 书籍拾取：射线 - AABB（slab 法）
 * ------------------------------------------------------------------ */

function rayBox(origin, dir, min, max) {
  let tmin = 0
  let tmax = Infinity
  for (let i = 0; i < 3; i++) {
    const inv = 1 / (dir[i] || 1e-9)
    let t1 = (min[i] - origin[i]) * inv
    let t2 = (max[i] - origin[i]) * inv
    if (t1 > t2) {
      const tmp = t1
      t1 = t2
      t2 = tmp
    }
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmax < tmin) return null
  }
  return tmin
}

/**
 * 拾取最近的一本书。
 * @param {Array} items hall.js 里随实例登记的 { min, max, shelfId, board, index }
 * @returns {{item, t}|null}
 */
export function pickBook(items, origin, dir, maxDist = 7) {
  let best = null
  for (const it of items) {
    const t = rayBox(origin, dir, it.min, it.max)
    if (t !== null && t < maxDist && (!best || t < best.t)) best = { item: it, t }
  }
  return best
}

/** 高亮框：一个半透明发光盒子，套在目标书上（显示/隐藏由调用方控制） */
export function createHighlightMarker(color = 0xffb35c) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
  mesh.visible = false
  mesh.renderOrder = 5
  return {
    object3d: mesh,
    show(box) {
      mesh.position.set((box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2)
      mesh.scale.set(box.max[0] - box.min[0] + 0.06, box.max[1] - box.min[1] + 0.06, box.max[2] - box.min[2] + 0.06)
      mesh.visible = true
    },
    hide() {
      mesh.visible = false
    },
    dispose() {
      mesh.geometry.dispose()
      mat.dispose()
    },
  }
}
