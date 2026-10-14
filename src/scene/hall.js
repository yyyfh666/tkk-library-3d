import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { bakeBoxUV } from './textures.js'
import {
  HALL,
  FLOORS,
  CEILING_RECTS_BY_LEVEL,
  COLUMNS,
  STAIRS,
  RAMPS,
  TERRACES,
  CARVING,
  ATRIUM_DRESSING,
  GALLERY_SOFAS,
  RAILINGS,
  SHELF_UNITS,
  TABLES,
  COUNTER,
  VR_AREA,
  WALLS,
  ROBOT_PATH,
  HOTSPOT_ANCHORS,
  cutRects,
} from './hallLayout.js'

/**
 * 三楼大厅（室内）—— **真实米制的可走空间**，2026-10-13 按实拍照片重建。
 *
 * 布局数字全部在 hallLayout.js（唯一真相）；这里只负责把数据"砌"成几何。
 *
 * 两条工程规矩：
 *  ① **几何与碰撞同源**：addBox() 建 mesh 的同时按包围盒登记 collider，
 *     杜绝"改了模型忘了改碰撞"。碰撞清单也就 ~150 条 AABB，每帧线性扫，
 *     不做空间划分（比更新一次矩阵还便宜，别加八叉树）。
 *  ② **静态件按材质合并**：同一材质的几百个盒子 merge 成 1 个 mesh，
 *     全厅 draw call 控制在 ~45（重建前是老式的一千个独立 mesh）。
 *
 * ⚠️ 布置仍然是**按照片对标的示意性重建**（没有图纸），对外别写成"实景还原"。
 */

const rand = (() => {
  let seed = 771028
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
})()
const range = (a, b) => a + rand() * (b - a)

/** 每个材质的阴影策略：cast=投影，receive=接影 */
const SHADOW = {
  hallFloor: { cast: false, receive: true },
  hallFloorDark: { cast: false, receive: true },
  hallCeiling: { cast: false, receive: false },
  hallBrick: { cast: true, receive: true },
  hallWall: { cast: true, receive: true },
  hallColumn: { cast: true, receive: true },
  hallGranite: { cast: true, receive: true },
  hallWood: { cast: true, receive: true },
  hallRailWood: { cast: true, receive: true },
  hallMetal: { cast: true, receive: false },
  hallStairTread: { cast: true, receive: true },
  hallStairNosing: { cast: false, receive: true },
  hallLeaf: { cast: false, receive: false },
  hallGlass: { cast: false, receive: false },
  hallSkylight: { cast: false, receive: false },
  hallBackdrop: { cast: false, receive: false },
  hallLightPanel: { cast: false, receive: false },
  hallCurtain: { cast: true, receive: true },
  hallExhibit: { cast: true, receive: true },
  hallBook: { cast: true, receive: false },
  hallGranitePolish: { cast: false, receive: true }, // 踏面只接影，自己不投影（薄板上投影全是硬边）
  hallVitrine: { cast: false, receive: false }, // 透明玻璃投影会变成一块灰板
  hallRope: { cast: false, receive: false },
  hallPot: { cast: true, receive: true },
  hallShrub: { cast: true, receive: false },
  hallSofa: { cast: true, receive: true },
  hallSofaCushion: { cast: false, receive: true },
  desk: { cast: true, receive: true },
  chair: { cast: true, receive: true },
  wood: { cast: true, receive: true },
  leaf: { cast: true, receive: true },
  leafLight: { cast: true, receive: true },
  rug: { cast: false, receive: true },
  screen: { cast: false, receive: false },
  vrChair: { cast: true, receive: true },
  vrHeadset: { cast: false, receive: false },
  robotBody: { cast: true, receive: false },
  robotAccent: { cast: false, receive: false },
  robotEye: { cast: false, receive: false },
  bookA: { cast: false, receive: false },
  bookB: { cast: false, receive: false },
  bookC: { cast: false, receive: false },
  bookD: { cast: false, receive: false },
}

const BOOK_COLORS = ['#C4573A', '#4E6E8C', '#D9A441', '#6E9E55', '#7A5A8C', '#3F6B31', '#8C3A3A', '#D8CFC0']

/** 玻璃罩里那件"展品"的颜色（示意：不是真展品，就是几块上色的小方块） */
const RELIC_COLORS = ['#D9A441', '#C4573A', '#6E9E55', '#4E6E8C', '#8C7A9E', '#B5762F']
/** 展台灌木的深浅（走 instanceColor，所以 hallShrub 材质本身必须接近纯白） */
const SHRUB_COLORS = ['#6E9E55', '#7FB264', '#5E8A4A', '#86B06A']

export function buildHall(materials) {
  const group = new THREE.Group()
  const colliders = []
  const ramps = [...RAMPS.map((r) => ({ ...r }))]

  /** 合并桶：材质键 → geometry 数组 */
  const buckets = new Map()
  const addGeo = (key, geo) => {
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(geo)
  }

  /** 登记碰撞体（从已摆放好的几何直接取包围盒，保证和视觉一致） */
  function registerGeometryCollider(geo, tag, groundOnly = false) {
    geo.computeBoundingBox()
    const bb = geo.boundingBox
    colliders.push({
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
      tag,
      groundOnly,
    })
  }

  function addColliderBox(cx, cy, cz, w, h, d, tag, groundOnly = false) {
    colliders.push({
      min: [cx - w / 2, cy - h / 2, cz - d / 2],
      max: [cx + w / 2, cy + h / 2, cz + d / 2],
      tag,
      groundOnly,
    })
  }

  /**
   * 建一个盒子：烘 UV（按世界坐标平铺）→ 旋转 → 平移 → 进合并桶。
   * collide=true 时按最终包围盒登记碰撞。
   */
  function addBox(
    matKey,
    { w, h, d, x = 0, y = 0, z = 0, ry = 0, rx = 0, collide = true, tile = 2.4, tag = 'solid', groundOnly = false },
  ) {
    const geo = bakeBoxUV(new THREE.BoxGeometry(w, h, d), { tile, world: [x, y, z] })
    if (rx) geo.rotateX(rx)
    if (ry) geo.rotateY(ry)
    geo.translate(x, y, z)
    addGeo(matKey, geo)
    if (collide) registerGeometryCollider(geo, tag, groundOnly)
    return geo
  }

  /* ================================================================
   * 1. 楼板与吊顶
   * ================================================================ */

  const slab = (rect, y, matKey) =>
    addBox(matKey, {
      w: rect.x1 - rect.x0,
      h: HALL.slabThickness,
      d: rect.z1 - rect.z0,
      x: (rect.x0 + rect.x1) / 2,
      y: y - HALL.slabThickness / 2,
      z: (rect.z0 + rect.z1) / 2,
      tile: 2.4,
      tag: 'floor',
    })

  for (const rect of FLOORS.lower) slab(rect, HALL.lowerFloorY, 'hallFloorDark')
  for (const rect of FLOORS.level0) slab(rect, HALL.floorY[0], 'hallFloor')
  for (const rect of FLOORS.level1) slab(rect, HALL.floorY[1], 'hallFloor')
  for (const rect of FLOORS.level2) slab(rect, HALL.floorY[2], 'hallFloor')

  // 吊顶（只覆盖环廊；中庭沿边留一条开敞带宽 1.3m，抬头能看穿到天窗）
  // 单独一个 Group：只在第一视角模式显示（俯视总览要能看进去）
  const ceiling = new THREE.Group()
  const ceilingBuckets = new Map()
  const addCeilingBox = (rect, y) => {
    const geo = bakeBoxUV(
      new THREE.BoxGeometry(rect.x1 - rect.x0, 0.12, rect.z1 - rect.z0),
      { tile: 1.2, world: [(rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2] },
    )
    geo.translate((rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2)
    if (!ceilingBuckets.has('hallCeiling')) ceilingBuckets.set('hallCeiling', [])
    ceilingBuckets.get('hallCeiling').push(geo)
  }
  for (let i = 0; i < HALL.levels; i++) {
    const y = HALL.floorY[i] + HALL.levelHeight - HALL.ceilingDrop
    for (const rect of CEILING_RECTS_BY_LEVEL[i]) addCeilingBox(rect, y)
  }

  // 吊顶上的灯具：筒灯盘 + 条形灯带（发光面，夜里就是"馆灯初上"的光源外观）
  const lightGeos = []
  for (let i = 0; i < HALL.levels; i++) {
    const y = HALL.floorY[i] + HALL.levelHeight - HALL.ceilingDrop - 0.08
    for (const rect of CEILING_RECTS_BY_LEVEL[i]) {
      // 筒灯：2.4m 网格
      for (let x = rect.x0 + 1.6; x < rect.x1 - 1.0; x += 2.4) {
        for (let z = rect.z0 + 1.6; z < rect.z1 - 1.0; z += 2.4) {
          const disc = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12)
          disc.translate(x, y, z)
          lightGeos.push(disc)
        }
      }
      // 条形灯带：贴着吊顶的长条
      if (rect.x1 - rect.x0 > rect.z1 - rect.z0) {
        for (let z = rect.z0 + 1.2; z < rect.z1 - 0.8; z += 4.8) {
          const strip = new THREE.BoxGeometry(rect.x1 - rect.x0 - 1.2, 0.06, 0.32)
          strip.translate((rect.x0 + rect.x1) / 2, y - 0.02, z)
          lightGeos.push(strip)
        }
      } else {
        for (let x = rect.x0 + 1.2; x < rect.x1 - 0.8; x += 4.8) {
          const strip = new THREE.BoxGeometry(0.32, 0.06, rect.z1 - rect.z0 - 1.2)
          strip.translate(x, y - 0.02, (rect.z0 + rect.z1) / 2)
          lightGeos.push(strip)
        }
      }
    }
  }
  // 灯具挂在吊顶 Group 下（俯视总览藏吊顶时，灯也跟着藏，不然会看到一片浮空的光盘）
  for (const g of lightGeos) {
    if (!ceilingBuckets.has('hallLightPanel')) ceilingBuckets.set('hallLightPanel', [])
    ceilingBuckets.get('hallLightPanel').push(g)
  }

  /* ================================================================
   * 2. 外墙（每侧一个 Group，空调屋时按相机方位藏近侧墙）
   * ================================================================ */

  const walls = { north: new THREE.Group(), south: new THREE.Group(), east: new THREE.Group(), west: new THREE.Group() }
  const wallBuckets = { north: new Map(), south: new Map(), east: new Map(), west: new Map() }
  const addWallGeo = (side, matKey, geo) => {
    if (!wallBuckets[side].has(matKey)) wallBuckets[side].set(matKey, [])
    wallBuckets[side].get(matKey).push(geo)
  }

  const halfW = HALL.width / 2
  const halfD = HALL.depth / 2
  const t = HALL.wallThickness

  for (const side of WALLS.sides) {
    const alongX = side.key === 'north' || side.key === 'south'
    const fixed = side.key === 'north' ? -halfD - t / 2 : side.key === 'south' ? halfD + t / 2 : side.key === 'east' ? halfW + t / 2 : -halfW - t / 2

    for (let li = -1; li < HALL.levels; li++) {
      // li = -1 是楼下的实体墙；0/1/2 是各层
      const y0 = li < 0 ? HALL.lowerFloorY : HALL.floorY[li]
      const y1 = li < 0 ? HALL.floorY[0] : HALL.floorY[li] + HALL.levelHeight

      const u0 = alongX ? -halfW : -halfD
      const u1 = alongX ? halfW : halfD
      const holes = []
      if (li >= 0) {
        for (const o of side.openings ?? []) {
          holes.push({
            x0: alongX ? o.x0 : o.z0,
            x1: alongX ? o.x1 : o.z1,
            z0: y0 + o.y0,
            z1: y0 + o.y1,
          })
        }
        if (li === 0 && side.door) {
          holes.push({ x0: side.door.x0, x1: side.door.x1, z0: y0, z1: y0 + side.door.y })
        }
      }

      for (const rect of cutRects({ x0: u0, x1: u1, z0: y0, z1: y1 }, holes)) {
        const cy = (rect.z0 + rect.z1) / 2
        const h = rect.z1 - rect.z0
        const cu = (rect.x0 + rect.x1) / 2
        const w = rect.x1 - rect.x0
        const geo = alongX
          ? bakeBoxUV(new THREE.BoxGeometry(w, h, t), { tile: 2.4, world: [cu, cy, fixed] })
          : bakeBoxUV(new THREE.BoxGeometry(t, h, w), { tile: 2.4, world: [fixed, cy, cu] })
        geo.translate(alongX ? cu : fixed, cy, alongX ? fixed : cu)
        addWallGeo(side.key, 'hallWall', geo)
        // 只有整面到地的墙才登记碰撞（窗带那一层楼板本来就挡人）
        if (rect.z0 <= y0 + 0.01 && rect.z1 >= y1 - 0.01 && rect.x1 - rect.x0 > 0.2) {
          colliders.push(
            alongX
              ? { min: [rect.x0, y0, fixed - t / 2], max: [rect.x1, y1, fixed + t / 2], tag: 'wall', groundOnly: false }
              : { min: [fixed - t / 2, y0, rect.x0], max: [fixed + t / 2, y1, rect.x1], tag: 'wall', groundOnly: false },
          )
        }
      }

      // 窗玻璃 + 竖梃 + 窗帘（只做有 window 的层）
      if (li >= 0) {
        for (const o of side.openings ?? []) {
          const ou0 = alongX ? o.x0 : o.z0
          const ou1 = alongX ? o.x1 : o.z1
          const oy0 = y0 + o.y0
          const oy1 = y0 + o.y1
          const oc = (ou0 + ou1) / 2
          const ow = ou1 - ou0
          const oh = oy1 - oy0
          const cyw = (oy0 + oy1) / 2
          // 玻璃
          const glass = alongX
            ? bakeBoxUV(new THREE.BoxGeometry(ow - 0.1, oh - 0.1, 0.06), { tile: 2.4, world: [oc, cyw, fixed] })
            : bakeBoxUV(new THREE.BoxGeometry(0.06, oh - 0.1, ow - 0.1), { tile: 2.4, world: [fixed, cyw, oc] })
          glass.translate(alongX ? oc : fixed, cyw, alongX ? fixed : oc)
          addWallGeo(side.key, 'hallGlass', glass)
          // 竖梃：每 ~2m 一根
          const n = Math.max(1, Math.round(ow / 2))
          for (let k = 0; k <= n; k++) {
            const m = ou0 + (ow * k) / n
            const mull = alongX
              ? bakeBoxUV(new THREE.BoxGeometry(0.09, oh, 0.14), { tile: 2.4, world: [m, cyw, fixed] })
              : bakeBoxUV(new THREE.BoxGeometry(0.14, oh, 0.09), { tile: 2.4, world: [fixed, cyw, m] })
            mull.translate(alongX ? m : fixed, cyw, alongX ? fixed : m)
            addWallGeo(side.key, 'hallWall', mull)
          }
          // 上下框
          for (const yy of [oy0, oy1]) {
            const rail = alongX
              ? bakeBoxUV(new THREE.BoxGeometry(ow, 0.1, 0.16), { tile: 2.4, world: [oc, yy, fixed] })
              : bakeBoxUV(new THREE.BoxGeometry(0.16, 0.1, ow), { tile: 2.4, world: [fixed, yy, oc] })
            rail.translate(alongX ? oc : fixed, yy, alongX ? fixed : oc)
            addWallGeo(side.key, 'hallWall', rail)
          }
          // 窗帘：窗两侧的白纱（做成 0.5m 宽的直板，够用）
          if (side.key !== 'north') {
            for (const e of [ou0 + 0.3, ou1 - 0.3]) {
              const curt = alongX
                ? bakeBoxUV(new THREE.BoxGeometry(0.5, oh, 0.16), { tile: 2.4, world: [e, cyw, fixed - 0.3] })
                : bakeBoxUV(new THREE.BoxGeometry(0.16, oh, 0.5), { tile: 2.4, world: [fixed - 0.3, cyw, e] })
              curt.translate(alongX ? e : fixed - 0.3, cyw, alongX ? fixed - 0.3 : e)
              addWallGeo(side.key, 'hallCurtain', curt)
            }
          }
        }

        // 南墙入口：玻璃门（挡住人 + 看起来像图书馆的玻璃门厅）
        if (li === 0 && side.door) {
          const dw = side.door.x1 - side.door.x0
          const door = new THREE.BoxGeometry(dw, side.door.y, 0.08)
          door.translate((side.door.x0 + side.door.x1) / 2, side.door.y / 2, fixed)
          addWallGeo(side.key, 'hallGlass', door)
          registerGeometryCollider(door, 'wall')
        }
      }

      // 北墙的红砖展墙（照片 07 的那段砖墙）
      if (li === 0 && side.brick) {
        const b = side.brick
        const bw = b.x1 - b.x0
        const geo = bakeBoxUV(new THREE.BoxGeometry(bw, b.y1 - b.y0, 0.12), { tile: 1.92, world: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, -halfD + 0.06] })
        geo.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, -halfD + 0.06)
        addWallGeo(side.key, 'hallBrick', geo)
      }
    }
  }

  /* ================================================================
   * 3. 柱：底层红砖墩柱 + 上面两层白色凹槽圆柱（贯穿三层）
   * ================================================================ */

  for (const pier of COLUMNS.piers) {
    const { x, z, size, y0, y1 } = pier
    // 花岗岩柱基与压顶
    addBox('hallGranite', { w: size + 0.2, h: 0.22, d: size + 0.2, x, y: y0 + 0.11, z, tile: 1.2, collide: false })
    addBox('hallGranite', { w: size + 0.2, h: 0.18, d: size + 0.2, x, y: y1 - 0.09, z, tile: 1.2, collide: false })
    // 砖墩本体（碰撞就靠它）
    addBox('hallBrick', {
      w: size,
      h: y1 - y0 - 0.4,
      d: size,
      x,
      y: (y0 + y1) / 2,
      z,
      tile: 1.92,
      tag: 'column',
    })
  }

  for (const row of COLUMNS.round) {
    for (const [x, z] of row.spots) {
      const h = row.y1 - row.y0
      // 柱脚 / 柱头（方板），柱身圆
      addBox('hallGranite', { w: 0.9, h: 0.12, d: 0.9, x, y: row.y0 + 0.06, z, tile: 1.2, collide: false })
      addBox('hallColumn', { w: 0.86, h: 0.2, d: 0.86, x, y: row.y1 - 0.1, z, tile: 1.2, collide: false })
      const shaft = new THREE.CylinderGeometry(HALL.columnRadius, HALL.columnRadius, h - 0.32, 28, 1)
      shaft.translate(x, row.y0 + 0.12 + (h - 0.32) / 2, z)
      addGeo('hallColumn', shaft)
      addColliderBox(x, row.y0 + h / 2, z, 0.75, h, 0.75, 'column')
    }
  }

  /* ================================================================
   * 4. 楼梯（两侧对称双跑）+ 中庭南缘的层叠看台
   * ================================================================ */

  for (const s of STAIRS) {
    const width = s.maxX - s.minX - 0.12
    const cx = (s.minX + s.maxX) / 2
    const zLow = s.dir > 0 ? Math.min(s.z0, s.z1) : Math.max(s.z0, s.z1) // 低端所在的 z
    for (let i = 0; i < s.steps; i++) {
      const top = s.y0 + (i + 1) * s.rise // 这一级的顶
      const z = zLow + s.dir * (i + 0.5) * s.run
      // 实心踏步：从梯底砌到本级顶（像照片里的石梯那样是实心的，侧看是斜剖面）
      addBox('hallStairTread', {
        w: width,
        h: top - s.y0,
        d: s.run,
        x: cx,
        y: s.y0 + (top - s.y0) / 2,
        z,
        tile: 1.2,
        collide: false,
      })
      // 前缘的浅色包边（照片 04 的浅色防滑条）
      addBox('hallStairNosing', {
        w: width,
        h: 0.05,
        d: 0.07,
        x: cx,
        y: top - 0.02,
        z: z + s.dir * (s.run / 2 - 0.035),
        tile: 1.2,
        collide: false,
      })
    }

    // 扶手：沿坡度倾斜的黑钢扶手 + 立柱（视觉件）
    const len = Math.hypot(s.steps * s.run, s.y1 - s.y0)
    const angle = Math.atan2(s.y1 - s.y0, s.steps * s.run)
    const midZ = zLow + (s.dir * (s.steps * s.run)) / 2
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(0.06, 0.06, len)
      railGeo.rotateX(s.dir > 0 ? angle : -angle)
      railGeo.translate(cx + side * (width / 2 + 0.05), (s.y0 + s.y1) / 2 + 0.92, midZ)
      addGeo('hallMetal', railGeo)
      for (let i = 0; i <= 5; i++) {
        const k = i / 5
        const pz = zLow + s.dir * k * s.steps * s.run
        const py = s.y0 + k * (s.y1 - s.y0)
        addBox('hallMetal', {
          w: 0.05,
          h: 0.92,
          d: 0.05,
          x: cx + side * (width / 2 + 0.05),
          y: py + 0.46,
          z: pz,
          collide: false,
        })
      }
      // 侧向阻挡：沿梯段分 4 段，每段一个盒子砌到该段最高处（玩家不能从侧面钻进梯体）
      for (let k = 0; k < 4; k++) {
        const zA = zLow + s.dir * (k / 4) * s.steps * s.run
        const zB = zLow + s.dir * ((k + 1) / 4) * s.steps * s.run
        const localTop = s.y0 + ((k + 1) / 4) * (s.y1 - s.y0)
        addColliderBox(
          cx + side * (width / 2 + 0.1),
          s.y0 + (localTop - s.y0) / 2,
          (zA + zB) / 2,
          0.2,
          localTop - s.y0,
          Math.abs(zB - zA),
          'stairRail',
        )
      }
    }
  }

  // 层叠看台：collider 只做"地面候选"（groundOnly），人能一级级迈上去
  // 踏面用抛光石（hallGranitePolish）—— 照片 04 里这层地面是照得见影子的，
  // 而立柱/柱基/花槽仍用哑光的 hallGranite，两者对比才对
  for (const tier of TERRACES) {
    addBox('hallGranitePolish', {
      w: tier.x1 - tier.x0,
      h: tier.top + 0.5,
      d: tier.z1 - tier.z0,
      x: (tier.x0 + tier.x1) / 2,
      y: (tier.top - 0.5) / 2,
      z: (tier.z0 + tier.z1) / 2,
      tile: 1.6,
      tag: 'terrace',
      groundOnly: true,
    })
  }

  /* ================================================================
   * 5. 根雕展品（层叠看台顶上的深色木雕，照片 09）
   * ================================================================ */

  {
    const { x, y, z } = CARVING
    addBox('hallGranite', { w: 2.6, h: 0.3, d: 2.0, x, y: y + 0.15, z, tile: 1.2, collide: false })
    // 根雕：一团深色扭曲木块（胶囊 + 拉长的球，随机旋转堆叠），不追求具体形象，
    // 要的是照片 09 里那种"一坨盘根错节的深色木头"的剪影
    for (let i = 0; i < 14; i++) {
      const g =
        i % 3 === 2
          ? new THREE.SphereGeometry(range(0.3, 0.55), 8, 6).scale(range(1, 1.8), range(0.7, 1.1), range(1, 1.6))
          : new THREE.CapsuleGeometry(range(0.13, 0.34), range(0.7, 1.9), 4, 8)
      g.rotateZ(range(-1.1, 1.1))
      g.rotateY(range(0, Math.PI * 2))
      g.rotateX(range(-0.6, 0.6))
      g.translate(x + range(-0.8, 0.8), y + 0.25 + range(0.3, 1.15), z + range(-0.55, 0.55))
      addGeo('hallCarving', g)
    }
    addColliderBox(x, y + 0.75, z, 2.2, 1.5, 1.6, 'solid')
  }

  /* ================================================================
   * 实例化的小工具（5b 与第 9 段的家具都用）
   * 走 InstancedMesh 的都是"同一种几何 × 多个摆放"的小件；静态大件仍然走 addGeo
   * 按材质合并 —— 两条路都只吃 1 个 draw call，区别在于实例化能带**逐实例的颜色与变换**。
   * ================================================================ */

  const UP_AXIS = new THREE.Vector3(0, 1, 0)
  const iMat4 = new THREE.Matrix4()
  const iQuat = new THREE.Quaternion()
  const iVec = new THREE.Vector3()
  const iScale = new THREE.Vector3()

  const makeInstanced = (geo, matKey, count) => {
    const mesh = new THREE.InstancedMesh(geo, materials[matKey], count)
    const policy = SHADOW[matKey] ?? { cast: true, receive: true }
    mesh.castShadow = policy.cast
    mesh.receiveShadow = policy.receive
    mesh.frustumCulled = false // 实例散在大半个厅里，包围球跨半厅，剔除反而害事（同书）
    group.add(mesh)
    return mesh
  }
  const place = (mesh, i, x, y, z, ry = 0, s = 1) => {
    iQuat.setFromAxisAngle(UP_AXIS, ry)
    iVec.set(x, y, z)
    iScale.set(s, s, s)
    iMat4.compose(iVec, iQuat, iScale)
    mesh.setMatrixAt(i, iMat4)
  }

  /* ================================================================
   * 5b. 中庭陈设（照片 04）：台阶上的小玻璃罩、台缘的盆栽带、围住展台的红绳
   *
   * 这一节是这个厅里除了书之外**第一处不走 addGeo 的东西**：addGeo 是"同材质合并成
   * 一个不带实例色的大几何"的路子，上不了逐实例的颜色与摆放；而罩子/绳子/盆栽正需要
   * 实例化（队友点名的性能要求）。所以它们走 InstancedMesh，碰撞照样逐条手动登记。
   * ================================================================ */

  {
    const D = ATRIUM_DRESSING

    // —— 玻璃展柜：罩子 + 底座 + 里面那件"展品" ——
    const vs = D.vitrine
    const glass = makeInstanced(
      new THREE.BoxGeometry(vs.w, vs.h, vs.d).translate(0, vs.h / 2, 0),
      'hallVitrine',
      D.vitrines.length,
    )
    const vBase = makeInstanced(
      new THREE.BoxGeometry(vs.w + 0.06, 0.06, vs.d + 0.06).translate(0, 0.03, 0),
      'hallGranite',
      D.vitrines.length,
    )
    const relic = makeInstanced(
      new THREE.BoxGeometry(0.13, 0.15, 0.13).translate(0, 0.14, 0),
      'hallRelic',
      D.vitrines.length,
    )
    D.vitrines.forEach((sp, i) => {
      place(vBase, i, sp.x, sp.y, sp.z)
      place(glass, i, sp.x, sp.y + 0.06, sp.z)
      place(relic, i, sp.x, sp.y + 0.06, sp.z, i * 0.7)
      relic.setColorAt(i, new THREE.Color(RELIC_COLORS[i % RELIC_COLORS.length]))
      // 罩子 0.42 高 > 玩家步高 0.36 —— 矮于步高的盒子会被当成"能迈过去的路缘"放过去
      addColliderBox(sp.x, sp.y + 0.06 + vs.h / 2, sp.z, vs.w, vs.h, vs.d, 'vitrine')
    })
    glass.instanceMatrix.needsUpdate = true
    vBase.instanceMatrix.needsUpdate = true
    relic.instanceMatrix.needsUpdate = true
    if (relic.instanceColor) relic.instanceColor.needsUpdate = true

    // —— 红绳围挡：金柱一圈 + 两柱之间两段斜绳拼出的下垂弧 ——
    const R = D.rope
    const ringTop = (k) => {
      const a = (k / R.posts) * Math.PI * 2
      return new THREE.Vector3(R.cx + Math.cos(a) * R.rx, R.y + R.postH, R.cz + Math.sin(a) * R.rz)
    }
    const posts = makeInstanced(
      mergeGeometries([
        new THREE.CylinderGeometry(0.032, 0.045, R.postH, 8).translate(0, R.postH / 2, 0),
        new THREE.SphereGeometry(0.055, 8, 6).translate(0, R.postH + 0.02, 0),
      ]),
      'gold',
      R.posts,
    )
    for (let i = 0; i < R.posts; i++) {
      const p = ringTop(i)
      place(posts, i, p.x, R.y, p.z)
      addColliderBox(p.x, R.y + R.postH / 2, p.z, 0.12, R.postH, 0.12, 'ropePost')
    }
    posts.instanceMatrix.needsUpdate = true

    const segments = []
    for (let i = 0; i < R.posts; i++) {
      const p0 = ringTop(i)
      const p1 = ringTop(i + 1)
      const mid = p0.clone().add(p1).multiplyScalar(0.5)
      mid.y -= R.sag
      segments.push([p0, mid], [mid, p1])
    }
    const ropes = makeInstanced(new THREE.CylinderGeometry(0.026, 0.026, 1, 6), 'hallRope', segments.length)
    segments.forEach(([p0, p1], i) => {
      const dir = p1.clone().sub(p0)
      const len = dir.length()
      iQuat.setFromUnitVectors(UP_AXIS, dir.normalize())
      iVec.copy(p0).add(p1).multiplyScalar(0.5)
      iScale.set(1, len, 1)
      iMat4.compose(iVec, iQuat, iScale)
      ropes.setMatrixAt(i, iMat4)
    })
    ropes.instanceMatrix.needsUpdate = true

    // 围挡要封成"人进不去"的一圈：椭圆用四条薄 AABB 近似（柱与柱之间还有 1.4m 的缝）
    const bandY = R.y + 0.5
    const bandD = 0.1
    addColliderBox(R.cx, bandY, R.cz + R.rz, R.rx * 2, 1.0, bandD, 'rope')
    addColliderBox(R.cx, bandY, R.cz - R.rz, R.rx * 2, 1.0, bandD, 'rope')
    addColliderBox(R.cx - R.rx, bandY, R.cz, bandD, 1.0, R.rz * 2, 'rope')
    addColliderBox(R.cx + R.rx, bandY, R.cz, bandD, 1.0, R.rz * 2, 'rope')

    // —— 盆栽：台缘一整排 + 四角大株 ——
    const rowCount = Math.round((D.potRow.x1 - D.potRow.x0) / D.potRow.step) + 1
    const potSpots = [
      ...Array.from({ length: rowCount }, (_, i) => ({
        x: D.potRow.x0 + i * D.potRow.step,
        y: D.potRow.y,
        z: D.potRow.z,
        s: 1,
      })),
      ...D.bigPots.map((p) => ({ ...p, s: D.bigPotScale })),
    ]
    const pot = makeInstanced(
      new THREE.CylinderGeometry(0.16, 0.12, 0.26, 8).translate(0, 0.13, 0),
      'hallPot',
      potSpots.length,
    )
    const shrub = makeInstanced(
      new THREE.IcosahedronGeometry(0.24, 0).translate(0, 0.46, 0),
      'hallShrub',
      potSpots.length,
    )
    potSpots.forEach((sp, i) => {
      place(pot, i, sp.x, sp.y, sp.z, i * 1.1, sp.s)
      place(shrub, i, sp.x, sp.y, sp.z, i * 0.6, sp.s * (0.9 + (i % 3) * 0.12))
      shrub.setColorAt(i, new THREE.Color(SHRUB_COLORS[i % SHRUB_COLORS.length]))
    })
    pot.instanceMatrix.needsUpdate = true
    shrub.instanceMatrix.needsUpdate = true
    if (shrub.instanceColor) shrub.instanceColor.needsUpdate = true
    // ⚠️ 台缘那一排小盆栽**故意不加碰撞盒**：它们是紧挨着的一整排（间距 1.0、盆宽 0.34，
    // 只剩 0.66 的缝），加了碰撞就等于在看台上砌了一道墙 —— 而"能一级级走上看台"
    // 是已经交付的功能（README 写着），不能为这点装饰把它废掉。四角那几株大盆是散开的，
    // 加碰撞不影响通行。
    for (const sp of D.bigPots) {
      const s = D.bigPotScale
      addColliderBox(sp.x, sp.y + 0.3 * s, sp.z, 0.5 * s, 0.6 * s, 0.5 * s, 'planter')
    }
  }

  /* ================================================================
   * 6. 栏杆（中庭每层一圈 + 楼梯井洞边）：黑钢密杆 + 木扶手
   * ================================================================ */

  for (const [x0, z0, x1, z1, y] of RAILINGS) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len < 0.1) continue
    const ux = (x1 - x0) / len
    const alongX = Math.abs(ux) > 0.5 // 段沿 x 还是沿 z
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    // 木扶手 + 底部横杆
    addBox('hallRailWood', {
      w: alongX ? len : 0.08,
      h: 0.06,
      d: alongX ? 0.08 : len,
      x: cx,
      y: y + HALL.railHeight,
      z: cz,
      tile: 1.2,
      collide: false,
    })
    addBox('hallMetal', {
      w: alongX ? len : 0.05,
      h: 0.05,
      d: alongX ? 0.05 : len,
      x: cx,
      y: y + 0.1,
      z: cz,
      tile: 1.2,
      collide: false,
    })
    // 密杆
    const bars = Math.max(2, Math.round(len / 0.15))
    for (let i = 0; i <= bars; i++) {
      const k = i / bars
      const bx = x0 + (x1 - x0) * k
      const bz = z0 + (z1 - z0) * k
      addBox('hallMetal', { w: 0.025, h: HALL.railHeight - 0.06, d: 0.025, x: bx, y: y + HALL.railHeight / 2, z: bz, collide: false })
    }
    // 立柱
    const posts = Math.max(1, Math.round(len / 2.4))
    for (let i = 0; i <= posts; i++) {
      const k = i / posts
      addBox('hallMetal', {
        w: 0.06,
        h: HALL.railHeight,
        d: 0.06,
        x: x0 + (x1 - x0) * k,
        y: y + HALL.railHeight / 2,
        z: z0 + (z1 - z0) * k,
        collide: false,
      })
    }
    // 栏杆整体一条碰撞（挡住人不许掉下去）
    addColliderBox(cx, y + HALL.railHeight / 2, cz, alongX ? len : 0.16, HALL.railHeight, alongX ? 0.16 : len, 'rail')
  }

  /* ================================================================
   * 7. 垂吊绿植（廊边一溜垂蔓，照片 03/04 的标志性细节）
   * ================================================================ */

  const leafGeos = []
  const plantEdge = (x0, z0, x1, z1, y) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const count = Math.floor(len / 1.4)
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
    // 花槽放在**栏杆里侧**（站在廊上），垂蔓伸到**栏杆外/楼板边之外**挂下去 ——
    // 照片里就是"槽在廊上、藤垂进中庭"；全都摆在栏杆线上会跟钢条穿在一起。
    const mx = (x0 + x1) / 2
    const mz = (z0 + z1) / 2
    const ml = Math.hypot(mx, mz) || 1
    const inX = (mx / ml) * 0.28 // 朝廊内（远离中庭）
    const inZ = (mz / ml) * 0.28
    const outX = -(mx / ml) * 0.3 // 朝中庭
    const outZ = -(mz / ml) * 0.3
    for (let i = 0; i < count; i++) {
      const k = (i + 0.5) / count
      const px = x0 + (x1 - x0) * k
      const pz = z0 + (z1 - z0) * k
      // 花槽（在栏杆里侧的廊面上）
      const box = new THREE.BoxGeometry(alongX ? 1.0 : 0.24, 0.22, alongX ? 0.24 : 1.0)
      box.translate(px + inX, y + 0.1, pz + inZ)
      addGeo('hallGranite', box)
      // 垂蔓片（两面可见，挂在栏杆外侧、楼板边缘外）
      for (let j = 0; j < 2; j++) {
        const plane = new THREE.PlaneGeometry(1.1, 1.15 + j * 0.3)
        if (!alongX) plane.rotateY(Math.PI / 2)
        plane.translate(
          px + outX + (alongX ? 0 : (j - 0.5) * 0.1),
          y - 0.45 - j * 0.3,
          pz + outZ + (alongX ? (j - 0.5) * 0.1 : 0),
        )
        leafGeos.push(plane)
      }
    }
  }
  for (const [x0, z0, x1, z1, y] of RAILINGS) {
    // 只给中庭那两圈挂绿植（y 是 4.2 / 8.4 的才算）
    if (y !== HALL.floorY[1] && y !== HALL.floorY[2]) continue
    plantEdge(x0, z0, x1, z1, y)
  }
  for (const g of leafGeos) addGeo('hallLeaf', g)

  /* ================================================================
   * 8. 书架（深木端板 + 黑钢架）+ 书（InstancedMesh）
   * ================================================================ */

  const shelfW = 2.0
  const shelfD = 0.6
  const shelfH = 2.4
  const boardYs = [0.28, 0.73, 1.18, 1.63, 2.08]
  const bookItems = []
  const bookMeta = [] // 每本书的实例元数据：世界包围盒 + 书架号 + 层数（拾取/找书用）

  for (const sh of SHELF_UNITS) {
    const y0 = HALL.floorY[sh.level]
    const ry = sh.ry
    const cos = Math.cos(ry)
    const sin = Math.sin(ry)
    // 局部坐标 (u 沿柜宽, v 沿柜深) 转世界
    const toWorld = (u, v) => [sh.x + u * cos + v * sin, sh.z - u * sin + v * cos]

    // 端板（两块，深木）
    for (const e of [-1, 1]) {
      const [wx, wz] = toWorld(e * (shelfW / 2 - 0.03), 0)
      addBox('hallWood', { w: 0.06, h: shelfH, d: shelfD, x: wx, y: y0 + shelfH / 2, z: wz, ry: ry, tile: 1.2, collide: false })
    }
    // 顶板 / 底板
    for (const yy of [shelfH - 0.03, 0.06]) {
      const [wx, wz] = toWorld(0, 0)
      addBox('hallWood', { w: shelfW, h: 0.06, d: shelfD, x: wx, y: y0 + yy, z: wz, ry: ry, tile: 1.2, collide: false })
    }
    // 黑钢竖框 + 层板
    for (const u of [-1, -0.33, 0.33, 1]) {
      const [wx, wz] = toWorld(u * (shelfW / 2 - 0.04), 0)
      addBox('hallMetal', { w: 0.05, h: shelfH, d: 0.05, x: wx, y: y0 + shelfH / 2, z: wz, collide: false })
    }
    for (const by of boardYs) {
      const [wx, wz] = toWorld(0, 0.02)
      addBox('hallMetal', { w: shelfW - 0.1, h: 0.03, d: shelfD - 0.08, x: wx, y: y0 + by - 0.015, z: wz, ry: ry, collide: false })
    }
    // 整体碰撞（一个盒子）
    addColliderBox(
      sh.x,
      y0 + shelfH / 2,
      sh.z,
      ry === 0 ? shelfW : shelfD,
      shelfH,
      ry === 0 ? shelfD : shelfW,
      'shelf',
    )

    // —— 书：沿柜宽排，颜色/厚度/高矮随机（固定种子）——
    for (let bi = 0; bi < boardYs.length; bi++) {
      const by = boardYs[bi]
      let u = -shelfW / 2 + 0.1
      while (u < shelfW / 2 - 0.12) {
        const bw = range(0.028, 0.052) // 书厚 2.8~5.2cm（真实值）
        const bh = range(0.19, 0.28) // 书高 19~28cm
        const [wx, wz] = toWorld(u + bw / 2, 0)
        const cy = y0 + by + bh / 2 + 0.015
        const m = new THREE.Matrix4()
        m.compose(
          new THREE.Vector3(wx, cy, wz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
          new THREE.Vector3(bw, bh, 0.17),
        )
        const color = new THREE.Color(BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)])
        bookItems.push({ m, c: color, shelfId: sh.id, board: bi + 1 })
        // 轴对齐包围盒：ry 只可能是 0 或 ±90°，宽/深对调即可（拾取用，别指望它精确到书脊弧度）
        const hx = ry === 0 ? bw / 2 : 0.085
        const hz = ry === 0 ? 0.085 : bw / 2
        bookMeta.push({
          min: [wx - hx, cy - bh / 2, wz - hz],
          max: [wx + hx, cy + bh / 2, wz + hz],
          shelfId: sh.id,
          board: bi + 1,
          index: bookItems.length - 1,
        })
        u += bw + 0.006
        if (bookItems.length >= 5200) break
      }
      if (bookItems.length >= 5200) break
    }
  }

  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.hallBook, bookItems.length)
  bookItems.forEach((it, i) => {
    books.setMatrixAt(i, it.m)
    books.setColorAt(i, it.c)
  })
  books.instanceMatrix.needsUpdate = true
  if (books.instanceColor) books.instanceColor.needsUpdate = true
  books.castShadow = true
  books.receiveShadow = false
  books.frustumCulled = false // 一本书的包围球跨全厅，剔除反而害事
  group.add(books)

  /* ================================================================
   * 9. 家具：阅览桌 + 蓝椅、服务台、VR 区、绿植、展签
   * ================================================================ */

  // —— 一层回廊的红沙发（照片 13）：坐体 + 靠背 + 两扶手合成一个几何，坐垫另一档红 ——
  {
    const body = mergeGeometries([
      new THREE.BoxGeometry(1.7, 0.42, 0.78).translate(0, 0.21, 0), // 坐体
      new THREE.BoxGeometry(1.7, 0.46, 0.2).translate(0, 0.65, -0.29), // 靠背
      new THREE.BoxGeometry(0.18, 0.26, 0.78).translate(0.76, 0.55, 0), // 扶手
      new THREE.BoxGeometry(0.18, 0.26, 0.78).translate(-0.76, 0.55, 0),
    ])
    const cushionGeo = mergeGeometries([
      new THREE.BoxGeometry(0.72, 0.1, 0.6).translate(0.44, 0.47, 0.02),
      new THREE.BoxGeometry(0.72, 0.1, 0.6).translate(-0.44, 0.47, 0.02),
    ])
    const sofas = makeInstanced(body, 'hallSofa', GALLERY_SOFAS.length)
    const cushions = makeInstanced(cushionGeo, 'hallSofaCushion', GALLERY_SOFAS.length)
    GALLERY_SOFAS.forEach((sf, i) => {
      place(sofas, i, sf.x, sf.y, sf.z, sf.ry)
      place(cushions, i, sf.x, sf.y, sf.z, sf.ry)
      // ry 是 ±90°，长边从 x 换到了 z —— AABB 得跟着对调，不然碰撞盒是横的
      const along = Math.abs(Math.sin(sf.ry)) > 0.5
      addColliderBox(sf.x, sf.y + 0.45, sf.z, along ? 0.9 : 1.9, 0.9, along ? 1.9 : 0.9, 'sofa')
    })
    sofas.instanceMatrix.needsUpdate = true
    cushions.instanceMatrix.needsUpdate = true
  }

  for (const tb of TABLES) {
    addBox('desk', { w: 2.4, h: 0.06, d: 1.0, x: tb.x, y: 0.75, z: tb.z, tile: 1.2, collide: true, tag: 'table' })
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addBox('desk', { w: 0.07, h: 0.72, d: 0.07, x: tb.x + sx * 1.1, y: 0.36, z: tb.z + sz * 0.4, collide: false })
      }
    }
    // 桌上的三两本书
    for (let i = 0; i < 3; i++) {
      addBox(['bookA', 'bookB', 'bookC', 'bookD'][Math.floor(rand() * 4)], {
        w: 0.34,
        h: 0.05,
        d: 0.24,
        x: tb.x + range(-0.9, 0.9),
        y: 0.81,
        z: tb.z + range(-0.3, 0.3),
        ry: range(-0.4, 0.4),
        collide: false,
      })
    }
    // 蓝椅：长边各三把
    for (const side of [-1, 1]) {
      for (let c = 0; c < 3; c++) {
        const cx = tb.x - 0.8 + c * 0.8
        const cz = tb.z + side * 0.95
        const ry = side > 0 ? Math.PI : 0
        addBox('chair', { w: 0.46, h: 0.06, d: 0.46, x: cx, y: 0.45, z: cz, ry, collide: false })
        addBox('chair', { w: 0.46, h: 0.5, d: 0.05, x: cx + (side > 0 ? 0 : 0), y: 0.72, z: cz + side * 0.21, ry, collide: false })
        for (const lx of [-1, 1]) {
          for (const lz of [-1, 1]) {
            addBox('chair', { w: 0.04, h: 0.45, d: 0.04, x: cx + lx * 0.19, y: 0.22, z: cz + lz * 0.19, collide: false })
          }
        }
        addColliderBox(cx, 0.4, cz, 0.5, 0.8, 0.5, 'solid')
      }
    }
  }

  // 服务台（L 形，木面 + 花岗岩台面）
  {
    const { x0, x1, z0, z1, h } = COUNTER
    addBox('hallWood', { w: x1 - x0, h: h - 0.06, d: 0.6, x: (x0 + x1) / 2, y: (h - 0.06) / 2, z: z0 + 0.3, tile: 1.2, collide: false })
    addBox('hallGranite', { w: x1 - x0 + 0.1, h: 0.06, d: 0.7, x: (x0 + x1) / 2, y: h, z: z0 + 0.3, tile: 1.2, collide: false })
    addColliderBox((x0 + x1) / 2, h / 2, z0 + 0.3, x1 - x0, h, 0.6, 'counter')
    addBox('hallWood', { w: 0.6, h: h - 0.06, d: (z1 - z0) - 0.6, x: x1 - 0.3, y: (h - 0.06) / 2, z: (z0 + 0.6 + z1) / 2, tile: 1.2, collide: false })
    addColliderBox(x1 - 0.3, h / 2, (z0 + 0.6 + z1) / 2, 0.6, h, z1 - z0 - 0.6, 'counter')
  }

  // VR 阅读区（西侧窗边：地毯 + 三张躺椅 + 幕布）
  {
    const rug = new THREE.PlaneGeometry(6, 5).rotateX(-Math.PI / 2)
    rug.translate(VR_AREA.x, 0.02, VR_AREA.z)
    addGeo('rug', rug)
    for (let i = 0; i < 3; i++) {
      const x = VR_AREA.x - 2.2 + i * 2.2
      const z = VR_AREA.z + 0.4
      addBox('vrChair', { w: 1.1, h: 0.12, d: 1.5, x, y: 0.42, z, collide: false })
      addBox('vrChair', { w: 1.1, h: 1.1, d: 0.14, x, y: 0.9, z: z - 0.72, rx: -0.25, collide: false })
      addBox('vrHeadset', { w: 0.3, h: 0.16, d: 0.22, x, y: 1.12, z: z - 0.5, collide: false })
      addColliderBox(x, 0.5, z, 1.2, 1.0, 1.6, 'solid')
    }
    const screen = new THREE.BoxGeometry(0.1, 2.4, 4.0)
    screen.translate(-halfW + 0.5, 2.0, VR_AREA.z + 1.2)
    addGeo('screen', screen)
    addColliderBox(-halfW + 0.5, 2.0, VR_AREA.z + 1.2, 0.4, 2.4, 4.0, 'solid') // 幕布也要挡人
  }

  // 绿植（角落）
  const plantSpots = [
    [-16.6, -10.6],
    [16.6, -10.6],
    [16.6, 10.6],
    [-9.6, 10.4],
    [9.6, 10.4],
    [-16.4, 5.2],
  ]
  for (const [x, z] of plantSpots) {
    const pot = new THREE.CylinderGeometry(0.34, 0.26, 0.5, 10)
    pot.translate(x, 0.25, z)
    addGeo('wood', pot)
    const bush = new THREE.IcosahedronGeometry(0.55, 0)
    bush.translate(x, 1.0, z)
    addGeo('leaf', bush)
    const bush2 = new THREE.IcosahedronGeometry(0.38, 0)
    bush2.translate(x + 0.25, 1.45, z - 0.15)
    addGeo('leafLight', bush2)
    addColliderBox(x, 0.6, z, 0.8, 1.2, 0.8, 'planter')
  }

  // 展签 / 条幅（北墙展墙上挂三幅）
  for (let i = 0; i < 3; i++) {
    addBox('hallExhibit', { w: 1.3, h: 2.0, d: 0.06, x: -4 + i * 4, y: 1.7, z: -halfD + 0.2, tile: 1.2, collide: true, tag: 'exhibit' })
  }

  /* ================================================================
   * 10. 天窗 + 窗外背景板
   * ================================================================ */

  // "外景组"：俯视总览时藏掉的东西（窗外背景板、天窗玻璃）——
  // 它们在俯视时会横在相机和屋子中间 / 糊住中庭，却是室内视角的加分项。
  // 注意：**不要给环廊加"屋顶环带"** —— 一加，俯视总览就只能看见一个白盖子，
  // 整个屋子都看不进去了（第一版就栽在这）。去掉吊顶的俯视本来就是"切开的模型"。
  const outer = new THREE.Group()
  {
    const roofGlass = new THREE.BoxGeometry(HALL.atriaHalfX * 2, 0.08, HALL.atriaHalfZ * 2)
    roofGlass.translate(0, HALL.topY - 0.1, 0)
    const glassMesh = new THREE.Mesh(roofGlass, materials.hallSkylight)
    glassMesh.castShadow = false
    glassMesh.receiveShadow = false
    outer.add(glassMesh)

    // 天窗框架（留在主体里，俯视看是一条细梁，不碍事）
    for (let i = -1; i <= 1; i++) {
      addBox('hallWall', { w: 0.18, h: 0.22, d: HALL.atriaHalfZ * 2, x: i * HALL.atriaHalfX * 0.5, y: HALL.topY - 0.05, z: 0, tile: 1.2, collide: false })
      addBox('hallWall', { w: HALL.atriaHalfX * 2, h: 0.22, d: 0.18, x: 0, y: HALL.topY - 0.05, z: i * HALL.atriaHalfZ * 0.5, tile: 1.2, collide: false })
    }

    // 窗外背景板：树带 + 天空（不吃光，昼夜靠材质 color 插值）
    const backdropGeos = []
    for (const [px, pz, ry] of [
      [0, halfD + 4.5, 0],
      [halfW + 4.5, 0, Math.PI / 2],
      [-halfW - 4.5, 0, Math.PI / 2],
    ]) {
      const plane = new THREE.PlaneGeometry(48, 16)
      plane.rotateY(ry)
      plane.translate(px, 5.2, pz)
      backdropGeos.push(plane)
    }
    const backdropMesh = new THREE.Mesh(mergeGeometries(backdropGeos), materials.hallBackdrop)
    backdropMesh.castShadow = false
    backdropMesh.receiveShadow = false
    outer.add(backdropMesh)
  }

  /* ================================================================
   * 11. 合并落盘
   * ================================================================ */

  for (const [key, geos] of buckets) {
    const merged = mergeGeometries(geos)
    const mesh = new THREE.Mesh(merged, materials[key])
    const policy = SHADOW[key] ?? { cast: true, receive: true }
    mesh.castShadow = policy.cast
    mesh.receiveShadow = policy.receive
    group.add(mesh)
  }

  for (const [key, geos] of ceilingBuckets) {
    const merged = mergeGeometries(geos)
    const mesh = new THREE.Mesh(merged, materials[key])
    mesh.castShadow = false // 刻意取巧：吊顶不投影，阳光才能"漏"进室内（注释见 materials.js）
    mesh.receiveShadow = false
    ceiling.add(mesh)
  }

  for (const side of Object.keys(walls)) {
    for (const [key, geos] of wallBuckets[side]) {
      const merged = mergeGeometries(geos)
      const mesh = new THREE.Mesh(merged, materials[key])
      const policy = SHADOW[key] ?? { cast: true, receive: true }
      mesh.castShadow = policy.cast
      mesh.receiveShadow = policy.receive
      walls[side].add(mesh)
    }
    group.add(walls[side])
  }

  /* ================================================================
   * 12. 导览机器人（米制：约 1.4m 高）
   * ================================================================ */

  const robot = buildRobot(materials)
  group.add(robot)

  return { group, robot, walls, ceiling, outer, colliders, ramps, books: { mesh: books, items: bookMeta } }
}

/* ------------------------------------------------------------------ *
 * 机器人
 * ------------------------------------------------------------------ */

function buildRobot(materials) {
  const robot = new THREE.Group()
  const buckets = new Map()
  const add = (key, geo) => {
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(geo)
  }
  const part = (key, geoFactory) => {
    const g = geoFactory()
    add(key, g)
  }

  part('robotBody', () => new THREE.CylinderGeometry(0.22, 0.26, 0.16, 16).translate(0, 0.08, 0))
  part('robotBody', () => new THREE.CylinderGeometry(0.2, 0.22, 0.5, 16).translate(0, 0.42, 0))
  part('robotBody', () => new THREE.SphereGeometry(0.19, 16, 12).translate(0, 0.78, 0))
  part('robotAccent', () => new THREE.BoxGeometry(0.24, 0.09, 0.06).translate(0, 0.78, 0.16))
  for (const sx of [-1, 1]) {
    part('robotEye', () => new THREE.SphereGeometry(0.035, 8, 6).translate(sx * 0.07, 0.8, 0.19))
    part('robotBody', () => new THREE.CapsuleGeometry(0.045, 0.22, 4, 8).translate(sx * 0.25, 0.5, 0))
  }
  part('robotAccent', () => new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6).translate(0, 1.0, 0))
  part('robotAccent', () => new THREE.SphereGeometry(0.035, 8, 6).translate(0, 1.1, 0))

  for (const [key, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), materials[key])
    mesh.castShadow = key === 'robotBody'
    robot.add(mesh)
  }
  return robot
}

/* ------------------------------------------------------------------ *
 * 巡航 / 藏墙
 * ------------------------------------------------------------------ */

/** 机器人的运动改由 robotAgent.js 接管（巡航环线 = hallLayout 的 ROBOT_PATH），这里只剩藏墙 */

/**
 * 娃娃屋的看家本领：相机在哪一侧，就藏掉那一侧的墙。
 * 第一视角下 wallsLocked = true，四面临墙全回来（见 worlds.js）。
 */
export function updateWalls(walls, cameraPosition, locked = false) {
  if (locked) {
    for (const w of Object.values(walls)) w.visible = true
    return
  }
  const margin = 3
  walls.south.visible = cameraPosition.z <= HALL.depth / 2 - margin
  walls.north.visible = cameraPosition.z >= -HALL.depth / 2 + margin
  walls.east.visible = cameraPosition.x <= HALL.width / 2 - margin
  walls.west.visible = cameraPosition.x >= -HALL.width / 2 + margin
}

export { HOTSPOT_ANCHORS }
