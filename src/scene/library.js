import * as THREE from 'three'
import { grassHeightAt } from './island.js'

/**
 * 嘉庚图书馆主楼。
 *
 * 体块依据《三视图线框示意》的正立面：中央主楼最高（正立面一条竖向蓝玻璃天窗），
 * 两侧翼楼逐级降低，正南居中一处入口柱廊；细节依据外观照片：
 * 白立面上等距的竖向壁柱、深蓝灰玻璃、闽南红瓦坡屋顶（脊端起翘＝燕尾脊）、
 * 楼前一大片石板广场。西侧另有一栋带柱廊的矮辅楼。
 *
 * 所有尺寸都是"米"量级的抽象单位，只保证彼此比例对得上，不对应真实尺寸。
 */

export const PODIUM_TOP = 4.5 // 台基顶面标高，建筑都站在这个高度上

/** 各体块的尺寸与位置，后面热点、广场构图都要读它 */
export const BLOCKS = {
  main: { w: 38, d: 34, h: 44, x: 0, z: -34, roof: 9 },
  innerWingL: { w: 20, d: 30, h: 32, x: -30, z: -33, roof: 7.5 },
  innerWingR: { w: 20, d: 30, h: 32, x: 30, z: -33, roof: 7.5 },
  outerWingL: { w: 18, d: 26, h: 24, x: -50, z: -30, roof: 6.2 },
  outerWingR: { w: 18, d: 26, h: 24, x: 50, z: -30, roof: 6.2 },
  rear: { w: 30, d: 24, h: 30, x: 0, z: -66, roof: 7 },
}

export const MAIN_BLOCK = BLOCKS.main
export const MAIN_FRONT_Z = BLOCKS.main.z + BLOCKS.main.d / 2 // 主楼南立面（入口面）

/* ------------------------------------------------------------------ *
 * 零件
 * ------------------------------------------------------------------ */

/**
 * 四坡顶（带正脊）。three 没有现成的"四坡顶"，用 6 个顶点手搓：
 * 底面 4 个角 + 正脊 2 个端点，共 8 个三角面。
 * 正脊长度 = 半宽 - 半深（同坡度的自然结果），方方正正的楼就是近乎攒尖顶。
 */
function hipRoofGeometry(halfWidth, halfDepth, height) {
  const ridge = Math.max(0, halfWidth - halfDepth)
  const A = [-halfWidth, 0, -halfDepth]
  const B = [halfWidth, 0, -halfDepth]
  const C = [halfWidth, 0, halfDepth]
  const D = [-halfWidth, 0, halfDepth]
  const R1 = [-ridge, height, 0]
  const R2 = [ridge, height, 0]

  // 非索引：每个三角面独占顶点，computeVertexNormals 自然给出平直的面法线
  const triangles = [
    D, C, R2, D, R2, R1, // 南坡
    B, A, R1, B, R1, R2, // 北坡
    A, D, R1, // 西侧坡
    C, B, R2, // 东侧坡
  ]
  const positions = new Float32Array(triangles.flat())
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * 正脊两端的起翘（燕尾脊）。
 * 关键是两块板要**压在正脊身上**再往外挑，不能悬在脊上方 ——
 * 第一版放在 height + 1.0 处、方向还朝下，看着像几根飘着的红木棍。
 */
function addRidgeTails(group, materials, { halfWidth, halfDepth, height }) {
  const ridge = Math.max(0, halfWidth - halfDepth)
  if (ridge < 1.2) return

  for (const sign of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.2, 1.1), materials.roof)
    fin.position.set(sign * (ridge + 1.2), height + 0.5, 0)
    fin.rotation.z = sign * 0.62 // 对称的盒子：+x 端往外往上挑
    group.add(fin)

    const tip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.85, 0.85), materials.roof)
    tip.position.set(sign * (ridge + 3.4), height + 1.7, 0)
    tip.rotation.z = sign * 1.05
    group.add(tip)
  }
}

/**
 * 一顶屋顶：外挑的檐口板 + 四坡顶 + 燕尾脊。
 * 檐口挑出得比一般建筑多（闽南大屋顶的味道就靠它）。
 */
function createHipRoof(materials, { w, d, rise, overhang = 3.4, tails = true }) {
  const group = new THREE.Group()
  const halfWidth = (w + overhang * 2) / 2
  const halfDepth = (d + overhang * 2) / 2

  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + overhang * 2, 1.0, d + overhang * 2), materials.roof)
  eave.position.y = 0.5
  eave.castShadow = true
  group.add(eave)

  const cone = new THREE.Mesh(hipRoofGeometry(halfWidth, halfDepth, rise), materials.roof)
  cone.position.y = 1.0
  cone.castShadow = true
  group.add(cone)

  // 檐下一圈暗色，让屋面和白墙之间有个交代
  const shadowBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 1.4, d + 0.4), materials.roofDark)
  shadowBand.position.y = -0.5
  group.add(shadowBand)

  if (tails) addRidgeTails(group, materials, { halfWidth, halfDepth, height: rise + 1.0 })

  return group
}

/**
 * 在体块的某一面摊一片窗户。
 * 窗户是独立材质（materials.window），夜里整片亮起来 —— 夜景的主角就是它们。
 */
function addWindowGrid(parent, materials, { w, h, d, face, cols, rows, marginX = 2.4, marginY = 2.6 }) {
  const usableW = w - marginX * 2
  const usableH = h - marginY * 2
  if (usableW <= 0 || usableH <= 0) return

  const winW = usableW / (cols + (cols - 1) * 0.85)
  const gapW = winW * 0.85
  const winH = usableH / (rows + (rows - 1) * 1.15)
  const gapH = winH * 1.15

  const horizontal = face === 'front' || face === 'back'
  const spanW = horizontal ? w : d
  const totalW = cols * winW + (cols - 1) * gapW
  const totalH = rows * winH + (rows - 1) * gapH

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const u = -totalW / 2 + winW / 2 + c * (winW + gapW)
      const v = -totalH / 2 + winH / 2 + r * (winH + gapH)

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.7), materials.window)
      if (face === 'front') mesh.position.set(u, v, d / 2)
      else if (face === 'back') mesh.position.set(-u, v, -d / 2)
      else if (face === 'left') mesh.position.set(-w / 2, v, -u)
      else mesh.position.set(w / 2, v, u)

      if (!horizontal) mesh.rotation.y = Math.PI / 2
      parent.add(mesh)
    }
  }
  return { spanW, winW }
}

/**
 * 一个体块：白墙盒子 + 四坡顶 + 四面窗。
 * 返回 group，原点在体块底面中心。
 */
function createBlock(materials, { w, d, h, rise, windows = { cols: 3, rows: 3 }, overhang }) {
  const group = new THREE.Group()

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.wall)
  body.position.y = h / 2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const grid = new THREE.Group()
  grid.position.y = h / 2
  addWindowGrid(grid, materials, { w, h, d, face: 'front', ...windows })
  addWindowGrid(grid, materials, { w, h, d, face: 'back', cols: windows.cols, rows: windows.rows })
  addWindowGrid(grid, materials, { w, h, d, face: 'left', cols: Math.max(2, windows.cols - 1), rows: windows.rows })
  addWindowGrid(grid, materials, { w, h, d, face: 'right', cols: Math.max(2, windows.cols - 1), rows: windows.rows })
  group.add(grid)

  const roof = createHipRoof(materials, { w, d, rise, overhang })
  roof.position.y = h
  group.add(roof)

  return group
}

/**
 * 主楼南立面的竖向壁柱 —— 照片上最 signature 的一道节奏。
 * 中央留出玻璃天窗的位置，壁柱分列两侧。
 */
function addPilasters(parent, materials, { w, h, d, glassWidth }) {
  const sideWidth = (w - glassWidth) / 2
  const count = 3 // 每侧 3 根，加上两端的转角壁柱
  const step = sideWidth / count

  for (const sign of [-1, 1]) {
    for (let i = 0; i <= count; i++) {
      const x = sign * (glassWidth / 2 + i * step)
      const pilaster = new THREE.Mesh(new THREE.BoxGeometry(1.7, h * 0.94, 1.8), materials.wall)
      pilaster.position.set(x, h * 0.47, d / 2 + 0.5)
      pilaster.castShadow = true
      parent.add(pilaster)
    }
  }

  // 顶部一道横向压顶线脚，把壁柱"收"住
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.6, 1.9), materials.wallShade)
  lintel.position.set(0, h * 0.95, d / 2 + 0.5)
  parent.add(lintel)
}

/** 正南入口：玻璃竖条底部、雨篷、四根柱子、圆形徽记 */
function createEntrance(materials, { frontZ }) {
  const group = new THREE.Group()

  // 玻璃竖条（主楼的"天窗"，白天深蓝灰，夜里点亮）
  const glass = new THREE.Mesh(new THREE.BoxGeometry(11, 34, 1.2), materials.window)
  glass.position.set(0, 19, frontZ + 0.35)
  group.add(glass)

  // 玻璃两侧的竖向分隔
  for (const sign of [-1, 1]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(1.2, 34, 1.6), materials.wall)
    mullion.position.set(sign * 6, 19, frontZ + 0.6)
    group.add(mullion)
  }

  // 入口洞（深色）+ 上方的雨篷
  const doorway = new THREE.Mesh(new THREE.BoxGeometry(15, 10, 1.4), materials.wallShade)
  doorway.position.set(0, 5.6, frontZ + 0.4)
  group.add(doorway)

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(19, 1.4, 7), materials.roof)
  canopy.position.set(0, 11.6, frontZ + 3.2)
  canopy.castShadow = true
  group.add(canopy)

  // 雨篷下的四根柱子
  for (const x of [-7.4, -2.6, 2.6, 7.4]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 6.6, 10), materials.wall)
    column.position.set(x, 7.9, frontZ + 5.4)
    column.castShadow = true
    group.add(column)
  }

  // 门口的圆形徽记
  const emblem = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.6, 24), materials.gold)
  emblem.rotation.x = Math.PI / 2
  emblem.position.set(0, 16.5, frontZ + 0.9)
  group.add(emblem)

  return group
}

/** 西侧辅楼：矮一些，正面一排柱廊（照片里主楼左边那栋就是这种） */
function createAnnex(materials) {
  const group = new THREE.Group()
  const w = 34
  const d = 22
  const h = 15

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.wall)
  body.position.y = h / 2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  addWindowGrid(group, materials, {
    w, h, d, face: 'front', cols: 5, rows: 2, marginY: 2.2,
  })

  // 柱廊：一排方柱 + 上面的横梁
  const colonnadeDepth = 4.5
  for (let i = 0; i < 6; i++) {
    const column = new THREE.Mesh(new THREE.BoxGeometry(1.5, h * 0.62, 1.5), materials.wall)
    column.position.set(-w / 2 + 3 + i * ((w - 6) / 5), h * 0.31, d / 2 + colonnadeDepth / 2)
    column.castShadow = true
    group.add(column)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, colonnadeDepth + 1), materials.wallShade)
  beam.position.set(0, h * 0.63, d / 2 + colonnadeDepth / 2 - 0.5)
  group.add(beam)

  const roof = createHipRoof(materials, { w: w + 2, d: d + colonnadeDepth, rise: 5.4, overhang: 2.8 })
  roof.position.y = h
  group.add(roof)

  return group
}

/* ------------------------------------------------------------------ *
 * 组装
 * ------------------------------------------------------------------ */

export function buildLibrary(materials) {
  const group = new THREE.Group()

  // 台基（石板）
  const podium = new THREE.Mesh(new THREE.BoxGeometry(124, 7, 66), materials.stone)
  podium.position.set(0, PODIUM_TOP - 3.5, -45)
  podium.receiveShadow = true
  podium.castShadow = true
  group.add(podium)

  // 台基到广场的那一级台阶
  const step = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 5), materials.stone)
  step.position.set(0, PODIUM_TOP - 1, -10.5)
  group.add(step)

  // 六个体块
  for (const key of ['main', 'innerWingL', 'innerWingR', 'outerWingL', 'outerWingR', 'rear']) {
    const spec = BLOCKS[key]
    const block = createBlock(materials, {
      w: spec.w,
      d: spec.d,
      h: spec.h,
      rise: spec.roof,
      windows: {
        cols: key === 'main' || key === 'rear' ? 4 : 3,
        rows: key === 'main' ? 5 : key.startsWith('outer') ? 3 : 4,
      },
    })
    block.position.set(spec.x, PODIUM_TOP, spec.z)
    group.add(block)

    // 主楼的立面单独特化：壁柱 + 入口
    if (key === 'main') {
      const facade = new THREE.Group()
      facade.position.set(spec.x, PODIUM_TOP, spec.z)
      addPilasters(facade, materials, { w: spec.w, h: spec.h, d: spec.d, glassWidth: 11 })
      facade.add(createEntrance(materials, { frontZ: spec.d / 2 }))
      group.add(facade)
    }
  }

  // 西侧辅楼（坐在草地上，不在台基上）
  const annex = createAnnex(materials)
  const annexX = -78
  const annexZ = 12
  annex.position.set(annexX, grassHeightAt(Math.hypot(annexX, annexZ)) - 0.6, annexZ)
  annex.rotation.y = 0.18
  group.add(annex)

  return group
}
