import * as THREE from 'three'
import { ISLAND_RADIUS, grassHeightAt, createPond } from './island.js'

/**
 * 岛上除主楼之外的一切：广场、牌坊、树、湖、小径、路灯、长椅、小人。
 *
 * 摆位原则（跟参考图学的）：**成簇，不要均匀撒**。参考图里树是一坨一坨的，
 * 均匀撒出去会变成"草地贴图"，成簇才有"人布置过"的感觉。
 */

const rand = (() => {
  // 固定种子的随机数：每次刷新场景长得一模一样，方便截图比对
  let seed = 20261013
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
})()

const range = (a, b) => a + rand() * (b - a)

/** 主楼台基 + 广场的占地范围，摆树时要避开 */
const BUILDING_FOOTPRINT = { minX: -66, maxX: 66, minZ: -84, maxZ: -8 }
const PLAZA_FOOTPRINT = { minX: -52, maxX: 52, minZ: -10, maxZ: 58 }

function isFreeSpot(x, z, margin = 5) {
  const inside = (box, m) => x > box.minX - m && x < box.maxX + m && z > box.minZ - m && z < box.maxZ + m
  if (inside(BUILDING_FOOTPRINT, margin) || inside(PLAZA_FOOTPRINT, margin)) return false
  return Math.hypot(x, z) < ISLAND_RADIUS - 9
}

/* ------------------------------------------------------------------ *
 * 地面铺装
 * ------------------------------------------------------------------ */

export function buildPlaza(materials) {
  const group = new THREE.Group()

  const slab = new THREE.Mesh(new THREE.BoxGeometry(104, 5, 68), materials.plaza)
  slab.position.set(0, 0, 24) // 顶面 y = 2.5
  slab.receiveShadow = true
  group.add(slab)

  // 几道深色分格线，让大片石板不至于是一整块死白
  for (let i = 1; i < 6; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(104, 0.3, 0.9), materials.path)
    line.position.set(0, 2.55, -8 + i * 11)
    group.add(line)
  }
  for (let i = 1; i < 4; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 68), materials.path)
    line.position.set(-52 + i * 26, 2.55, 24)
    group.add(line)
  }

  return group
}

/** 铺一条小径：沿折线摆一串扁石板，各自贴在草地高度上 */
function createPath(materials, points, width = 4.5) {
  const group = new THREE.Group()
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i]
    const [x1, z1] = points[i + 1]
    const length = Math.hypot(x1 - x0, z1 - z0)
    const midX = (x0 + x1) / 2
    const midZ = (z0 + z1) / 2
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, length + 1.5), materials.path)
    slab.position.set(midX, grassHeightAt(Math.hypot(midX, midZ)) - 0.1, midZ)
    slab.rotation.y = Math.atan2(x1 - x0, z1 - z0)
    group.add(slab)
  }
  return group
}

/* ------------------------------------------------------------------ *
 * 嘉庚式石柱牌坊（广场南端）
 * ------------------------------------------------------------------ */

export function buildGate(materials, { x = 0, z = 74 } = {}) {
  const group = new THREE.Group()
  const baseY = grassHeightAt(Math.hypot(x, z)) - 0.4
  const columnHeight = 17
  const spacing = 11

  for (let i = 0; i < 4; i++) {
    const px = -1.5 * spacing + i * spacing
    const column = new THREE.Mesh(new THREE.BoxGeometry(2.6, columnHeight, 2.6), materials.wall)
    column.position.set(px, columnHeight / 2, 0)
    column.castShadow = true
    group.add(column)

    // 柱头
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 3.4), materials.wallShade)
    cap.position.set(px, columnHeight + 0.4, 0)
    group.add(cap)
  }

  // 顶上的白色格架
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.5 * spacing + 8, 1.6, 5), materials.wall)
  beam.position.set(0, columnHeight + 2.2, 0)
  beam.castShadow = true
  group.add(beam)

  for (let i = 0; i < 7; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 7.5), materials.wall)
    slat.position.set(-1.5 * spacing + 2 + i * ((3 * spacing - 4) / 6), columnHeight + 3.5, 0)
    group.add(slat)
  }

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(1.5 * spacing + 6, 1.2, 4), materials.wallShade)
  topBeam.position.set(0, columnHeight + 4.6, 0)
  group.add(topBeam)

  group.position.set(x, baseY, z)
  return group
}

/* ------------------------------------------------------------------ *
 * 植物与街道家具
 * ------------------------------------------------------------------ */

/**
 * 蒲葵 / 棕榈：一根杆 + 一圈**往下垂**的叶片。
 *
 * 叶片挂在杆顶的一个 pivot 上：pivot 只负责转到方位角，叶片自己在 pivot 里
 * 绕 z 轴下压 —— 这样方位和下压角互不干扰，不用去猜 Euler 顺序。
 * 第一版把叶片摆成水平放射状，远看是一颗绿星星，不像树。
 */
function createPalm(materials, scale = 1) {
  const group = new THREE.Group()
  const height = range(9.5, 13.5) * scale
  const frondLength = 8.4 * scale

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.15, height, 7), materials.trunk)
  trunk.position.y = height / 2
  trunk.castShadow = true
  group.add(trunk)

  const frondCount = 9
  for (let i = 0; i < frondCount; i++) {
    const pivot = new THREE.Group()
    pivot.position.y = height - 0.6
    pivot.rotation.y = (i / frondCount) * Math.PI * 2 + rand() * 0.25
    group.add(pivot)

    // 叶片从水平再往下压 25°~45°，尖端低于杆顶
    const below = 0.44 + rand() * 0.35
    const frond = new THREE.Mesh(new THREE.ConeGeometry(1.35, frondLength, 4), materials.palmLeaf)
    frond.scale.z = 0.2 // 压扁成叶片
    frond.rotation.z = -(Math.PI / 2 + below) // 圆锥的轴从 +y 转到水平再下压
    frond.position.set(Math.cos(below) * frondLength * 0.5, -Math.sin(below) * frondLength * 0.5, 0)
    frond.castShadow = true
    pivot.add(frond)
  }

  // 杆顶一撮
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 5), materials.palmLeaf)
  crown.position.y = height - 0.8
  group.add(crown)

  return group
}

/** 阔叶树：树干 + 两三团球 */
function createTree(materials, scale = 1) {
  const group = new THREE.Group()
  const height = range(6.5, 9.5) * scale

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, height, 6), materials.trunk)
  trunk.position.y = height / 2
  trunk.castShadow = true
  group.add(trunk)

  const blobs = 2 + Math.floor(rand() * 2)
  for (let i = 0; i < blobs; i++) {
    const radius = range(2.5, 3.7) * scale
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 0),
      rand() > 0.45 ? materials.leaf : materials.leafLight,
    )
    blob.position.set(range(-2.4, 2.4), height + range(-0.6, 2.4), range(-2.4, 2.4))
    blob.rotation.set(rand() * 3, rand() * 3, rand() * 3)
    blob.castShadow = true
    group.add(blob)
  }

  return group
}

/** 路灯：杆 + 灯头（夜里靠 lampGlass 的 emissive 亮起来） */
function createLamp(materials) {
  const group = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 9.5, 6), materials.metal)
  pole.position.y = 4.75
  pole.castShadow = true
  group.add(pole)

  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.5), materials.metal)
  arm.position.set(0.9, 9.4, 0)
  group.add(arm)

  const head = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), materials.lampGlass)
  head.position.set(1.8, 8.7, 0)
  group.add(head)

  return group
}

/** 广场中央的喷水池：石盆 + 水面 + 中间的柱子 */
function createFountain(materials) {
  const group = new THREE.Group()

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.6, 2.4, 28), materials.stone)
  basin.position.y = 1.2
  basin.castShadow = true
  basin.receiveShadow = true
  group.add(basin)

  const water = new THREE.Mesh(new THREE.CircleGeometry(8.2, 28).rotateX(-Math.PI / 2), materials.water)
  water.position.y = 2.35
  group.add(water)

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, 6, 10), materials.stone)
  pillar.position.y = 4.6
  pillar.castShadow = true
  group.add(pillar)

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1.6, 1.6, 12), materials.stone)
  bowl.position.y = 7.4
  group.add(bowl)

  const spray = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.5, 8), materials.water)
  spray.position.y = 10.4
  group.add(spray)

  return group
}

/** 广场两侧的绿篱，把大片石板"收"住，顺便填掉空地 */
function createHedge(materials, length) {
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, 2.6, 2.2), materials.leaf)
  body.position.y = 1.3
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const top = new THREE.Mesh(new THREE.BoxGeometry(length - 1.2, 0.9, 1.7), materials.leafLight)
  top.position.y = 2.9
  group.add(top)
  return group
}

/**
 * 草坪色块：比草皮浅一点的一片软边色斑，给大片绿色一点层次。
 * 用 canvas 画一张径向渐变贴图 —— 直接用 CircleGeometry 是个硬边圆盘，
 * 在草地上看着像拿圆规画的圈。
 */
let lawnTexture = null
function getLawnTexture() {
  if (lawnTexture) return lawnTexture

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(163, 206, 132, 0.9)')
  gradient.addColorStop(0.5, 'rgba(163, 206, 132, 0.55)')
  gradient.addColorStop(1, 'rgba(163, 206, 132, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  lawnTexture = new THREE.CanvasTexture(canvas)
  lawnTexture.colorSpace = THREE.SRGBColorSpace
  return lawnTexture
}

function createLawnPatch(radius, x, z) {
  const material = new THREE.MeshBasicMaterial({
    map: getLawnTexture(),
    transparent: true,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), material)
  mesh.position.set(x, grassHeightAt(Math.hypot(x, z)) + 0.08, z)
  mesh.renderOrder = 1
  return mesh
}

function createBench(materials) {
  const group = new THREE.Group()
  const seat = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 1.6), materials.wood)
  seat.position.y = 1.5
  seat.castShadow = true
  group.add(seat)

  const back = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.6, 0.4), materials.wood)
  back.position.set(0, 2.4, -0.6)
  group.add(back)

  for (const x of [-2.1, 2.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 1.3), materials.wood)
    leg.position.set(x, 0.75, 0)
    group.add(leg)
  }
  return group
}

/** 腿 + 身子 + 脑袋，4 个单位高，纯粹是用来给出尺度的 */
function createPerson(materials) {
  const group = new THREE.Group()
  const bodyMaterial = [materials.personA, materials.personB, materials.personC][Math.floor(rand() * 3)]

  const legs = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.7, 0.8), materials.wallShade)
  legs.position.y = 0.85
  group.add(legs)

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.9, 2, 7), bodyMaterial)
  body.position.y = 2.7
  body.castShadow = true
  group.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.66, 7, 6), materials.trunk)
  head.position.y = 4.1
  group.add(head)

  return group
}

/* ------------------------------------------------------------------ *
 * 组装
 * ------------------------------------------------------------------ */

export function buildProps(materials) {
  const group = new THREE.Group()

  group.add(buildPlaza(materials))
  group.add(buildGate(materials))

  // 草坪色块：给大片绿一点层次，不然草地是一整块死绿
  for (const [x, z, r] of [
    [-72, -14, 19],
    [84, -34, 16],
    [-44, 62, 17],
    [58, 74, 15],
    [-92, 46, 14],
  ]) {
    group.add(createLawnPatch(r, x, z))
  }

  // 湖：摆在广场东侧的空地上，不压广场
  group.add(createPond(materials, { x: 74, z: 26, radius: 18 }))

  // 广场中央的喷水池 + 两侧绿篱
  const fountain = createFountain(materials)
  fountain.position.set(0, 2.5, 32)
  group.add(fountain)

  for (const sign of [-1, 1]) {
    const hedge = createHedge(materials, 62)
    hedge.position.set(sign * 55, 2.5, 24)
    hedge.rotation.y = Math.PI / 2
    group.add(hedge)
  }

  // 小径：广场南端 → 牌坊；广场西侧 → 辅楼
  group.add(
    createPath(materials, [
      [0, 58],
      [0, 68],
      [0, 78],
    ]),
  )
  group.add(
    createPath(materials, [
      [-48, 30],
      [-64, 26],
      [-74, 22],
    ]),
  )

  // 树：先撒几簇中心，再在簇里撒树 —— 成簇才像布置过的
  const clusters = [
    [-74, -42],
    [-88, -6],
    [-66, 44],
    [72, -44],
    [88, -4],
    [80, 62],
    [-30, -92],
    [34, -90],
    [-84, 30],
    [92, -22],
    [-40, 72],
    [44, 74],
    [17, 84],
    [-19, 86],
  ]
  for (const [cx, cz] of clusters) {
    const count = 4 + Math.floor(rand() * 4)
    for (let i = 0; i < count; i++) {
      const x = cx + range(-13, 13)
      const z = cz + range(-13, 13)
      if (!isFreeSpot(x, z, 6)) continue
      const tree = rand() > 0.45 ? createPalm(materials, range(0.85, 1.15)) : createTree(materials, range(0.85, 1.2))
      tree.position.set(x, grassHeightAt(Math.hypot(x, z)) - 0.6, z)
      tree.rotation.y = rand() * Math.PI * 2
      group.add(tree)
    }
  }

  // 广场两侧的路灯
  for (let i = 0; i < 4; i++) {
    for (const sign of [-1, 1]) {
      const lamp = createLamp(materials)
      lamp.position.set(sign * 48, 2.5, -6 + i * 19)
      lamp.rotation.y = sign > 0 ? Math.PI : 0
      group.add(lamp)
    }
  }

  // 广场边的长椅
  for (const [x, z] of [
    [-20, 8],
    [18, 14],
    [-34, 40],
    [30, 44],
  ]) {
    const bench = createBench(materials)
    bench.position.set(x, 2.5, z)
    bench.rotation.y = z > 30 ? Math.PI : 0
    group.add(bench)
  }

  // 小人：广场上、小径上散布
  for (let i = 0; i < 16; i++) {
    const onPlaza = rand() > 0.4
    const x = onPlaza ? range(-46, 46) : range(-8, 8)
    const z = onPlaza ? range(-4, 52) : range(58, 76)
    if (onPlaza && Math.abs(x) < 20 && z < 0) continue
    const person = createPerson(materials)
    person.position.set(x, onPlaza ? 2.5 : grassHeightAt(Math.hypot(x, z)), z)
    person.rotation.y = rand() * Math.PI * 2
    group.add(person)
  }

  return group
}
