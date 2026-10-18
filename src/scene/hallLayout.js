/**
 * 三楼大厅：**米制布局的唯一真相**（纯数据 + 纯函数，不 import three）。
 *
 * 坐标：x ∈ [-18, 18]，z ∈ [-12, 12]，楼面 0 / 4.2 / 8.4，向下可见 -4.2 的下一层，
 * 向上到 12.6 的玻璃天窗。中庭挑空 16 × 11 居中。
 *
 * 对照 `参考资料/实拍照片` 定的形体（照片 03/04/08）：
 *  · 每层环廊朝中庭敞开，廊边黑栏杆 + 木扶手，栏杆上垂吊绿植
 *  · 底层是红砖墩柱（花岗岩柱基/压顶），上面楼层是白色凹槽圆柱，位置一一对应
 *  · 两侧翼有对称的双跑楼梯（0→1→2 贯通），楼梯井在楼板上开洞
 *  · 中庭南缘一排层叠看台台阶（0→1.1m），顶上安放根雕展品（照片 09）
 *  · 外墙每层开大窗（白竖梃），窗外有背景板；北墙一段红砖墙做展墙（照片 07）
 *
 * 改布局只改这个文件；hall.js 只负责把下面的数据"砌"成几何。
 */

export const HALL = {
  // —— 总体（米）——
  width: 36,
  depth: 24,
  wallThickness: 0.4,

  // —— 楼层 ——
  levels: 3, // 脚下这层 + 2 层回廊
  levelHeight: 4.2,
  floorY: [0, 4.2, 8.4], // 每层楼面
  slabThickness: 0.35,
  lowerFloorY: -4.2, // 中庭往下可见的那层
  ceilingDrop: 0.8, // 吊顶吊在上一块楼板下方多少
  topY: 12.6, // 天窗标高

  // —— 中庭 ——
  atriaHalfX: 8,
  atriaHalfZ: 5.5,

  // —— 构件 ——
  columnSize: 1.0, // 红砖墩柱截面（米）
  columnRadius: 0.35, // 白色凹槽圆柱半径
  railHeight: 1.05, // 栏杆高
  doorwayHalf: 3, // 南墙入口洞口半宽
  windowSill: 0.9, // 窗台高（相对楼面）
  windowHead: 3.2, // 窗顶高
}

const halfW = HALL.width / 2
const halfD = HALL.depth / 2
const { atriaHalfX: AX, atriaHalfZ: AZ } = HALL

/* ------------------------------------------------------------------ *
 * 矩形分解：base 挖掉若干个 hole，返回互不重叠的小矩形
 * （楼板/吊顶都是"一大块挖几个洞"，这样生成最省代码也最好核对）
 * ------------------------------------------------------------------ */

export function cutRects(base, holes = []) {
  const xs = new Set([base.x0, base.x1])
  const zs = new Set([base.z0, base.z1])
  for (const h of holes) {
    // 只收"真的切到 base"的洞的边界
    if (h.x1 <= base.x0 || h.x0 >= base.x1 || h.z1 <= base.z0 || h.z0 >= base.z1) continue
    xs.add(Math.max(base.x0, h.x0))
    xs.add(Math.min(base.x1, h.x1))
    zs.add(Math.max(base.z0, h.z0))
    zs.add(Math.min(base.z1, h.z1))
  }
  const X = [...xs].sort((a, b) => a - b)
  const Z = [...zs].sort((a, b) => a - b)
  const rects = []
  for (let i = 0; i < X.length - 1; i++) {
    for (let j = 0; j < Z.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2
      const cz = (Z[j] + Z[j + 1]) / 2
      const inHole = holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)
      if (!inHole) rects.push({ x0: X[i], x1: X[i + 1], z0: Z[j], z1: Z[j + 1] })
    }
  }
  return rects
}

/* ------------------------------------------------------------------ *
 * 大块矩形
 * ------------------------------------------------------------------ */

const RING = { x0: -halfW, x1: halfW, z0: -halfD, z1: halfD }
const ATRIUM = { x0: -AX, x1: AX, z0: -AZ, z1: AZ }
/** 吊顶比中庭多让出 1.3m 的沿边开敞带（抬头能看穿到天窗） */
const ATRIUM_CEIL = { x0: -AX - 1.3, x1: AX + 1.3, z0: -AZ - 1.3, z1: AZ + 1.3 }

/** 楼梯井开洞（两侧对称）：L1 只挖低跑上方，L2 挖整个井 */
// ⚠️ side=-1 时 x0 > x1，必须 min/max 归一 —— 不然"洞"的判定 (cx > x0 && cx < x1) 永远为假，
// 西侧楼板就挖不出洞（第一版真踩了：西楼梯从楼板里长出来）。
const stairHole = (side, x0, x1) => ({
  x0: Math.min(side * x0, side * x1),
  x1: Math.max(side * x0, side * x1),
  z0: -10.9,
  z1: -2.2,
})
const STAIR_HOLES_L1 = [stairHole(1, 12.2, 16.2), stairHole(-1, 12.2, 16.2)]
const STAIR_HOLES_L2 = [stairHole(1, 8.2, 16.2), stairHole(-1, 8.2, 16.2)]

/* ------------------------------------------------------------------ *
 * 楼层与吊顶
 * ------------------------------------------------------------------ */

export const FLOORS = {
  lower: [{ ...RING }], // -4.2 那层：整块（往下看是它）
  level0: cutRects(RING, [ATRIUM]),
  level1: cutRects(RING, [ATRIUM, ...STAIR_HOLES_L1]),
  level2: cutRects(RING, [ATRIUM, ...STAIR_HOLES_L2]),
}

/**
 * 每层吊顶（只覆盖环廊，中庭沿边留开敞带）。
 * 楼梯井那一段也要给吊顶挖洞，不然楼梯会"顶穿"吊顶从下面看很怪。
 */
const stairCeilingHole = (side, x0, x1) => ({
  x0: Math.min(side * x0, side * x1),
  x1: Math.max(side * x0, side * x1),
  z0: -10.9,
  z1: -2.2,
})
export const CEILING_RECTS_BY_LEVEL = [
  cutRects(RING, [ATRIUM_CEIL, stairCeilingHole(1, 12.2, 16.2), stairCeilingHole(-1, 12.2, 16.2)]),
  cutRects(RING, [ATRIUM_CEIL, stairCeilingHole(1, 8.2, 12.2), stairCeilingHole(-1, 8.2, 12.2)]),
  cutRects(RING, [ATRIUM_CEIL]),
]

/* ------------------------------------------------------------------ *
 * 柱：底层砖墩 + 上面白圆柱（贯穿三层）
 * ------------------------------------------------------------------ */

// 注意：中庭南/北边**正中**（0, ±6）不放柱 —— 入口正对着它，会挡死进厅的第一眼。
const COLUMN_SPOTS = [
  [-8.5, -6.0],
  [-8.5, 6.0],
  [8.5, -6.0],
  [8.5, 6.0],
  [-8.5, 0],
  [8.5, 0],
]

export const COLUMNS = {
  /** 底层红砖墩柱（含花岗岩柱基与压顶） */
  piers: COLUMN_SPOTS.map(([x, z]) => ({
    x,
    z,
    size: HALL.columnSize,
    y0: 0,
    y1: HALL.floorY[1],
  })),
  /** 1/2 层的白色凹槽圆柱 */
  round: HALL.floorY.slice(1).map((y) => ({
    y0: y,
    y1: y + HALL.levelHeight,
    spots: COLUMN_SPOTS,
  })),
}

/* ------------------------------------------------------------------ *
 * 楼梯：两侧对称的双跑（0→4.2→8.4），踏步 0.15/0.30
 * ------------------------------------------------------------------ */

const STEP_RISE = 0.15
const STEP_RUN = 0.3
const FLIGHT_STEPS = HALL.levelHeight / STEP_RISE // 28 级

/** side: 1=东翼, -1=西翼 */
export const STAIRS = [
  // 低跑：从南往北爬升 0 → 4.2（x 12.4~16.0）
  { side: 1, from: 0, to: 1, x0: 12.4, x1: 16.0, z0: -10.8, z1: -2.4, dir: -1 },
  { side: -1, from: 0, to: 1, x0: 12.4, x1: 16.0, z0: -10.8, z1: -2.4, dir: -1 },
  // 高跑：从北往南爬升 4.2 → 8.4（x 8.4~12.0）
  { side: 1, from: 1, to: 2, x0: 8.4, x1: 12.0, z0: -10.8, z1: -2.4, dir: 1 },
  { side: -1, from: 1, to: 2, x0: 8.4, x1: 12.0, z0: -10.8, z1: -2.4, dir: 1 },
].map((s) => ({
  ...s,
  x0: s.side * s.x0, // 西翼镜像：x0 > x1，用 min/max 归一
  x1: s.side * s.x1,
  steps: FLIGHT_STEPS,
  rise: STEP_RISE,
  run: STEP_RUN,
  y0: HALL.floorY[s.from],
  y1: HALL.floorY[s.to],
  minX: Math.min(s.side * s.x0, s.side * s.x1),
  maxX: Math.max(s.side * s.x0, s.side * s.x1),
}))

/** 碰撞用的坡道（每跑一条：沿 z 线性升降） */
export const RAMPS = STAIRS.map((s) => ({
  minX: s.minX,
  maxX: s.maxX,
  minZ: Math.min(s.z0, s.z1),
  maxZ: Math.max(s.z0, s.z1),
  axis: 'z',
  y0: s.dir > 0 ? s.y0 : s.y1, // 在 z=minZ 处的高度（dir>0 表示往 +z 爬升）
  y1: s.dir > 0 ? s.y1 : s.y0, // 在 z=maxZ 处的高度
  snap: STEP_RISE, // 落点吸附到踏步高度，不"悬在斜面上"
}))

/* ------------------------------------------------------------------ *
 * 中庭南缘的层叠看台（0 → 1.10m，五级），顶上放根雕
 * ------------------------------------------------------------------ */

export const TERRACES = Array.from({ length: 5 }, (_, i) => ({
  x0: -7,
  x1: 7,
  z0: AZ - (i + 1) * 1.0, // 从南缘往中庭里退
  z1: AZ - i * 1.0,
  top: 0.22 * (i + 1),
}))

/**
 * 阶梯中线的红毯（照片 04：中庭台阶正中一条红毯通向中央展台）。
 * 每级一块、铺在该级台面上 —— 台阶是阶梯状的，一块平面贴不上去。
 */
export const RED_CARPET = { halfWidth: 0.9, lift: 0.006 }

/**
 * 北墙展区的竖排挂轴（照片 10：白纸黑墨、顶边齐平、从天花吊下来、个别用朱红大色块）。
 *
 * 布点**避开了两处遮挡**：北翼书架占 x −4.4~−2.4 与 2.6~4.6（它俩本来就把原来那 3 幅
 * 展签挡掉了两幅），全息投影面板占 x ±1.2 —— 所以是西侧 4 幅、东侧 4 幅、
 * 中庭两侧各 1 幅，**中间留白给陈嘉庚全息投影**（队友也这么要求）。
 *
 * `z = −11.86` 是离砖展墙面 2cm：砖面在 z = −11.88（12cm 厚的砖面贴在墙内表面 −12.0 前面，
 * 见 hall.js 的墙体生成），队友要的"离墙 2cm"就是这个数。
 */
export const SCROLL_WALL = {
  z: -halfD + 0.14,
  w: 0.8,
  h: 2.5,
  topY: 3.05, // 顶边对齐在这一条线上
  spots: [-7.9, -6.85, -5.8, -4.75, -2.05, 2.05, 4.75, 5.8, 6.85, 7.9],
}

/** 根雕展品的底座平台（放在最高一级看台上：Z 范围 [0.5, 1.5]） */
export const CARVING = { x: 0, z: 1.0, y: 1.1, scale: 1 }

/**
 * 中庭陈设 —— 对着实拍照片 04 摆：台阶踏面上成排的小玻璃罩、台缘一溜盆栽、围住中央展台的红绳。
 * 位置全部**写死**（展柜是网格、盆栽是等距，本来就该是确定的；用随机的话每次构建都变，
 * 截图回归也没法比）。和 HOLOGRAM / VR_READ 一样，这里只是数据，砌几何在 hall.js。
 */
export const ATRIUM_DRESSING = {
  /** 玻璃罩：第 0/1 级看台靠南的踏面前缘各 7 个（照片里就是沿台阶边缘排一排） */
  vitrines: [0, 1]
    .flatMap((tier) =>
      Array.from({ length: 7 }, (_, i) => ({
        x: -6.2 + i * 2.067,
        y: 0.22 * (tier + 1), // 该级台面高
        z: AZ - tier * 1.0 - 0.32, // 该级靠南的前缘往里 0.32
      })),
    )
    .filter((s) => Math.abs(s.x) > 0.5), // 中间那条道留给红毯（正好在 x=0），剩 12 个
  /**
   * 罩子尺寸。**高度取 0.42 而不是照片里看着的 0.34**：玩家的步高是 0.36，
   * 矮于步高的盒子会被 resolveXZ 当成"能迈过去的路缘"直接跳过 —— 那样等于没加碰撞。
   */
  vitrine: { w: 0.34, h: 0.42, d: 0.34 },

  /**
   * 红绳围挡：围着中央展台的椭圆环。
   * ⚠️ **rz 必须收在 0.45 以内** —— 看台只铺到 z=0.5，再大柱子就站到中庭那个洞上了。
   */
  rope: { cx: 0, cz: 1.0, y: 1.1, rx: 2.4, rz: 0.45, posts: 8, postH: 0.95, sag: 0.12 },

  /** 盆栽：台缘一整排（照片里中央展台正前方那一级），外加四角四盆大株 */
  potRow: { y: 0.88, z: 1.65, x0: -6.5, x1: 6.5, step: 1.0 },
  bigPots: [
    { x: -6.6, y: 0.22, z: 5.0 },
    { x: 6.6, y: 0.22, z: 5.0 },
    { x: -6.6, y: 0.88, z: 2.2 },
    { x: 6.6, y: 0.88, z: 2.2 },
  ],
  bigPotScale: 2.2,

  /** 天光与展品补光的灯位（worlds.js 建灯时读） */
  lights: {
    skylight: { angle: 0.42, penumbra: 0.75, intensity: 0.5, y: 11.9 },
    exhibit: { x: 0, y: 3.2, z: 3.4, intensity: 3.0, distance: 14 },
  },
}

/* ------------------------------------------------------------------ *
 * 栏杆：中庭每层一圈 + 楼梯井洞边。
 * 段格式：[x0, z0, x1, z1, y]（楼面标高 y，往 +y 竖 1.05m）
 * ------------------------------------------------------------------ */

/**
 * 中庭四周的栏杆（贴着中庭边）。
 * 脚下这层（y=0）的南边要给层叠看台留缺口（人从缺口迈上看台），其余是整圈。
 */
const atriaRails = (y, southGap = null) => {
  const x0 = -AX - 0.2
  const x1 = AX + 0.2
  const z0 = -AZ - 0.2
  const z1 = AZ + 0.2
  const rails = [
    [x0, z0, x1, z0, y], // 北
    [x0, z0, x0, z1, y], // 西
    [x1, z0, x1, z1, y], // 东
  ]
  if (southGap) rails.push([x0, z1, southGap[0], z1, y], [southGap[1], z1, x1, z1, y])
  else rails.push([x0, z1, x1, z1, y]) // 南
  return rails
}

// 楼梯井洞边：低跑洞（L1）三边；整井洞（L2）四边留出到达口
const stairRailsL1 = (side) => [
  [side * 12.2, -10.9, side * 12.2, -2.2, HALL.floorY[1]],
  [side * 12.2, -2.2, side * 16.2, -2.2, HALL.floorY[1]],
  [side * 16.2, -10.9, side * 16.2, -2.2, HALL.floorY[1]],
]
const stairRailsL2 = (side) => [
  [side * 8.2, -10.9, side * 8.2, -2.2, HALL.floorY[2]],
  [side * 12.2, -2.2, side * 16.2, -2.2, HALL.floorY[2]],
  [side * 16.2, -10.9, side * 16.2, -2.2, HALL.floorY[2]],
  [side * 8.2, -10.9, side * 16.2, -10.9, HALL.floorY[2]],
]

/**
 * 栏杆经过柱子时要**断开**（留柱宽的缺口）——不然栏杆会从柱身里横穿过去（明显穿模）。
 * 柱子和栏杆同在布局层，这里按"柱心到线段的投影"切分。
 */
function splitRailAtColumns(seg) {
  const [x0, z0, x1, z1] = seg
  const len = Math.hypot(x1 - x0, z1 - z0)
  if (len < 0.1) return [seg]
  const ux = (x1 - x0) / len
  const uz = (z1 - z0) / len
  // 计算每个柱心在线段上的投影位置（只收"真的压在这条线上"的）
  const cuts = []
  for (const [cx, cz] of COLUMN_SPOTS) {
    const t = (cx - x0) * ux + (cz - z0) * uz
    if (t <= 0.2 || t >= len - 0.2) continue
    const px = x0 + ux * t
    const pz = z0 + uz * t
    if (Math.hypot(cx - px, cz - pz) > 0.5) continue
    cuts.push([Math.max(0, t - 0.55), Math.min(len, t + 0.55)])
  }
  if (!cuts.length) return [seg]
  cuts.sort((a, b) => a[0] - b[0])
  const out = []
  let cursor = 0
  for (const [a, b] of cuts) {
    if (a > cursor) out.push(railSlice(seg, x0, z0, ux, uz, cursor, a))
    cursor = Math.max(cursor, b)
  }
  if (cursor < len) out.push(railSlice(seg, x0, z0, ux, uz, cursor, len))
  return out
}

const railSlice = (seg, x0, z0, ux, uz, t0, t1) => [
  x0 + ux * t0,
  z0 + uz * t0,
  x0 + ux * t1,
  z0 + uz * t1,
  seg[4],
]

/**
 * 看台外缘的护栏（北缘一条 + 东西缘各五段，跟着每一级的台面做成阶梯状）。
 *
 * ⚠️ 这不是装饰，是**堵漏洞**：看台是 x ±7、z 0.5→5.5 的一块阶梯体，外缘本来就什么都没有 ——
 * 第一视角从任意一级往北或往两侧多走一步，就掉进中庭那个洞，落到 -4.2 的下层地面，
 * 而且**再也上不来**（下层是一整块 36×24，没有任何楼梯通上去；walkControls 的兜底要
 * `pose.y < -6` 才 respawn，-4.2 不触发）。实测：北缘和东缘两个方向都能掉下去。
 * 实拍照片 04 里看台两侧本来也有一路上去的扶手，所以加护栏既堵了洞又更贴近实景。
 */
const terraceRails = () => {
  const zNorth = AZ - 5 // 0.5，最高一级的北缘
  const out = [[-7, zNorth, 7, zNorth, 0.22 * 5]] // 北缘：外面就是中庭的洞
  for (let i = 0; i < 5; i++) {
    const y = 0.22 * (i + 1)
    out.push([7, AZ - (i + 1), 7, AZ - i, y], [-7, AZ - (i + 1), -7, AZ - i, y])
  }
  return out
}

export const RAILINGS = [
  atriaRails(HALL.floorY[0], [-7, 7]), // 一层南边留给层叠看台的缺口
  atriaRails(HALL.floorY[1]),
  atriaRails(HALL.floorY[2]),
  stairRailsL1(1),
  stairRailsL1(-1),
  stairRailsL2(1),
  stairRailsL2(-1),
  terraceRails(), // 看台外缘：堵住"从看台掉进中庭"的洞
]
  .flat()
  .flatMap(splitRailAtColumns)

/* ------------------------------------------------------------------ *
 * 书架：2.4m 高 × 2.0m 宽 × 0.6m 深，成对背靠背摆成"书巷"（照片 01/05）
 * ------------------------------------------------------------------ */

const shelfPair = (level, x, z, ry = 0) => [
  { level, x, z, ry },
  { level, x: ry === 0 ? x : x + 0.6, z: ry === 0 ? z + 0.6 : z, ry }, // 背靠背：中心差一个进深
]

export const SHELVES = [
  // 北翼中间（两侧楼梯井之间）：两对，横放
  ...[0, 1].flatMap((i) => shelfPair(0, -3.4 + i * 7, -9.5, 0)),
  // 东翼南段（楼梯井以南）：两对，竖放；避开机器人巡航路径（x≈10.6）与服务台
  ...[6.4, 8.9].flatMap((z) => shelfPair(0, 13.7, z, Math.PI / 2)),
  // 西翼北段（楼梯井以南、中庭以北）：两对
  ...[0.8, 3.3].flatMap((z) => shelfPair(0, -13.7, z, Math.PI / 2)),
  // 二层东翼延续一排（照片 03 里廊边就是书架）
  ...[6.4, 8.9].flatMap((z) => shelfPair(1, 13.7, z, Math.PI / 2)),
]

/* ------------------------------------------------------------------ *
 * 机器人的目标点（场景二：导览机器人）
 * ------------------------------------------------------------------ */

/** 给每架书架一个可读编号（S01…），mock 书目用它定位 */
export const SHELF_UNITS = SHELVES.map((s, i) => ({ ...s, id: `S${String(i + 1).padStart(2, '0')}` }))

/** 一层（机器人能到的那层）的书架 */
export const SHELF_UNITS_L0 = SHELF_UNITS.filter((s) => s.level === 0)

/** 站在某架书架前的点：从书架中心朝**中庭方向**退 1.1m 就是过道 */
export function shelfStandPoint(shelf) {
  const len = Math.hypot(shelf.x, shelf.z) || 1
  const ux = -shelf.x / len
  const uz = -shelf.z / len
  return [shelf.x + ux * 1.35, shelf.z + uz * 1.35]
}

/** 机器人的固定兴趣点（POI） */
export const ROBOT_POIS = {
  cruise: { label: '中庭巡航' },
  checkin: { label: '中庭前 · 打卡点', point: [0, AZ + 1.9] }, // 正好落在巡航环的南直边上
  desk: { label: '借还服务台', point: [15.0, 1.1] },
  exhibit: { label: '展览区 · 全息投影', point: [0, -8.0] },
}

/**
 * 陈嘉庚全息展台（场景三）的位置。几何在 hologram.js 里砌，但**位置只有这一个出处**：
 * 挡人的碰撞盒、相机触发圈都读它。摆在北墙展区前、两对北翼书架之间的空档里（x≈0 的走道正对着）。
 */
export const HOLOGRAM = {
  x: 0,
  z: -10.1,
  radius: 0.76, // 基座外径（碰撞盒与光柱用）
  triggerRadius: 5, // 相机进这个圈就亮起来
  exitRadius: 8, // 退到这么远才关（5~8m 是滞回带，免得站在边界上反复开关）
}

/**
 * 机器人的可行范围与**显式禁行区**。
 * 一层楼板在中庭处是挖了洞的（`FLOORS.level0` 挖掉 ATRIUM），但碰撞盒里没有任何一条能表达
 * "这里的空气不能站"—— 栏杆只围了边，南边还给层叠看台留了缺口。不封掉的话 A* 会直接从
 * 中庭穿过去（最短路），机器人于是飘在看台上空。
 */
export const ACCESS = {
  bounds: { x0: -halfW + 1.1, x1: halfW - 1.1, z0: -halfD + 1.1, z1: halfD - 1.1 },
  voidRects: [{ x0: -AX - 0.2, x1: AX + 0.2, z0: -AZ - 0.2, z1: AZ + 0.2 }],
}

/* ------------------------------------------------------------------ *
 * 家具：阅览长桌（南窗边）、服务台、VR 区
 * ------------------------------------------------------------------ */

export const TABLES = [
  { x: -11, z: 9.4 },
  { x: -5.5, z: 9.4 },
  { x: 5.5, z: 9.4 },
  { x: 11, z: 9.4 },
]

export const COUNTER = { x0: 12.6, x1: 17.6, z0: 2.0, z1: 4.4, h: 1.05 } // 入口东侧的借还服务台

/**
 * 一层回廊上的红沙发（照片 13）：东西两侧各两张，都朝中庭（ry 让长边沿着 z）。
 * 摆位避开了两处硬障碍：柱位在 (±8.5, 0 / ±6)，一层书架从 x≈13.4 起。
 * 这里回廊是 4.2 那层 —— 所以 y 取 HALL.floorY[1]。
 */
export const GALLERY_SOFAS = [
  { x: 11.2, y: HALL.floorY[1], z: 1.5, ry: -Math.PI / 2 },
  { x: 11.2, y: HALL.floorY[1], z: -1.5, ry: -Math.PI / 2 },
  { x: -11.2, y: HALL.floorY[1], z: 1.5, ry: Math.PI / 2 },
  { x: -11.2, y: HALL.floorY[1], z: -1.5, ry: Math.PI / 2 },
]

export const VR_AREA = { x: -15, z: 8.6 } // 地毯中心

/**
 * VR 沉浸阅读舱（场景四）：西墙上那块幕布 + 相机触发圈。
 * 幕布盒子本身在 hall.js 里砌（`BoxGeometry(0.1, 2.4, 4.0)`，材质键 `screen`），
 * 这里给的是**贴在它前面的那块可显示面板**的尺寸与位置 —— 和 HOLOGRAM 一样，位置只此一处。
 */
export const VR_READ = {
  // 幕布盒子中心 x = -halfW+0.5、厚 0.1 → 朝厅那面在 -17.45，面板必须落在它**前面**
  x: -halfW + 0.62,
  y: 2.0,
  z: VR_AREA.z + 1.2, // 与既有幕布同心
  width: 3.86, // 面板宽（沿 z）
  height: 2.26, // 面板高（沿 y）
  triggerRadius: 4.2, // 相机进这个圈开始"放映"（地毯东缘约 5.6m、毯心约 2.8m）
}

/**
 * 一楼数字展屏（老师建议的"虚拟显示屏"）。
 *
 * 位置放在入口内侧偏西的空地上：从中庭南缘（z = 5.5）再往南退 0.85m，
 * 避开展台与层叠看台；朝 +z（入口方向），进门第一眼就能看到。
 * 屏幕本体在 lobbyScreen.js 里用 CanvasTexture 画，底座/边框在 hall.js 里砌。
 */
export const LOBBY_SCREEN = {
  x: -13.2,
  y: 1.98,
  z: 6.35,
  width: 2.86,
  height: 1.61, // 16:9
  ry: 0, // PlaneGeometry 默认朝 +z
  baseHeight: 1.1,
  baseWidth: 3.12,
  baseDepth: 0.36,
  defaultProgramId: 'lecture',
  triggerRadius: 7,
}

/* ------------------------------------------------------------------ *
 * 外墙开窗（南北东西四面，每层一条窗带；南墙中间是入口）
 * ------------------------------------------------------------------ */

export const WALLS = {
  // 墙按"哪一侧"描述，逐层生成；openings 里 y 是相对该层楼面的高度
  sides: [
    {
      key: 'north', // z = -12：实墙 + 一段红砖展墙（照片 07）
      openings: [],
      brick: { x0: -8, x1: 8, y0: 0, y1: 3.4 },
    },
    {
      key: 'south', // z = +12：中间是入口，两侧开窗
      openings: [
        { x0: -15, x1: -4, y0: 0.9, y1: 3.2 },
        { x0: 4, x1: 15, y0: 0.9, y1: 3.2 },
      ],
      door: { x0: -3, x1: 3, y: 3.0 },
    },
    {
      key: 'east',
      openings: [{ z0: -9, z1: 9, y0: 0.9, y1: 3.2 }],
    },
    {
      key: 'west',
      openings: [{ z0: -9, z1: 9, y0: 0.9, y1: 3.2 }],
    },
  ],
}

/* ------------------------------------------------------------------ *
 * 机位 / 出生点 / 热点锚点 / 机器人巡航路径
 * ------------------------------------------------------------------ */

export const HALL_VIEWS = {
  dollhouse: {
    position: [10, 40, 46],
    target: [0, 4, 0],
    minDistance: 22,
    maxDistance: 120,
    minPolarAngle: 0.42,
    maxPolarAngle: 1.3,
    fov: 36,
    near: 0.5,
    far: 1600,
  },
  inside: {
    position: [3.5, 1.75, 10.4],
    target: [-1.5, 2.4, -4],
    minDistance: 5,
    maxDistance: 42,
    minPolarAngle: 0.7,
    maxPolarAngle: 1.62,
    fov: 55,
    near: 0.1,
    far: 800,
  },
  walk: {
    spawn: [0, 0, 9.6], // 入口内一步
    yaw: 0, // 面朝 -z（望向中庭）
    pitch: -0.02,
    eye: 1.65, // 眼睛高
    radius: 0.32, // 碰撞半径
    stepHeight: 0.36, // 能直接迈上的高度
    headHeight: 1.78,
    walkSpeed: 2.6,
    runSpeed: 5.2,
    fov: 70,
    near: 0.08,
    far: 500,
  },
}

/** 热点锚点（米制；robot 那条是动态的，这里只给高度补偿） */
export const HOTSPOT_ANCHORS = {
  robotYOffset: 1.9,
  vr: [-15, 1.6, 8.6],
  atrium: [0, 3.1, 3.2],
  desk: [13, 1.6, 3.4],
  exhibit: [0, 2.2, -11.2],
  screen: [-13.2, 3.15, 6.35],
}

/** 机器人的巡航路径：围着中庭的圆角矩形，采样成折线（按弧长参数化，首尾相接） */
export function buildRobotPath({ offsetX = 2.6, offsetZ = 1.9, cornerRadius = 3.2, samples = 160 } = {}) {
  // ⚠️ x / z 两个方向的退让距离是**分开**的，别合回一个 offset：
  // 南直边原来在 z = AZ + 2.6 = 8.1，而阅览桌北侧那排椅子的碰撞盒在 z = 8.2~8.7 ——
  // 半径 0.42 的机器人一蹭上就被碰撞解算推回来，而路径又把它往回拉，**互相顶住、永远停在那**
  // （这是个从 P2 就有的隐藏 bug，直到这一轮加了"机器人坐标在不在动"的断言才抓到）。
  // z 方向收到 1.9 就绕开了椅子；x 方向仍留 2.6（东西两侧没有这么近的东西）。
  const hx = AX + offsetX // 圆角矩形半宽（到直边的距离）
  const hz = AZ + offsetZ
  const r = cornerRadius

  // 一圈顺序：南直边 → 东南弧 → 东直边 → 东北弧 → 北直边 → 西北弧 → 西直边 → 西南弧
  // 弧的角度是从圆心出发的极角；两端点必须和相邻直边严丝合缝
  const segs = [
    { type: 'line', p0: [-hx + r, hz], p1: [hx - r, hz] },
    { type: 'arc', c: [hx - r, hz - r], a0: Math.PI / 2, a1: 0 },
    { type: 'line', p0: [hx, hz - r], p1: [hx, -hz + r] },
    { type: 'arc', c: [hx - r, -hz + r], a0: 0, a1: -Math.PI / 2 },
    { type: 'line', p0: [hx - r, -hz], p1: [-hx + r, -hz] },
    { type: 'arc', c: [-hx + r, -hz + r], a0: -Math.PI / 2, a1: -Math.PI },
    { type: 'line', p0: [-hx, -hz + r], p1: [-hx, hz - r] },
    { type: 'arc', c: [-hx + r, hz - r], a0: Math.PI, a1: Math.PI / 2 },
  ]
  const lengths = segs.map((s) =>
    s.type === 'line' ? Math.hypot(s.p1[0] - s.p0[0], s.p1[1] - s.p0[1]) : Math.abs(s.a1 - s.a0) * r,
  )
  const total = lengths.reduce((a, b) => a + b, 0)

  const points = []
  for (let i = 0; i <= samples; i++) {
    let d = (i / samples) * total
    let idx = 0
    while (idx < segs.length - 1 && d > lengths[idx]) {
      d -= lengths[idx]
      idx++
    }
    const s = segs[idx]
    const k = lengths[idx] > 0 ? d / lengths[idx] : 0
    if (s.type === 'line') {
      points.push([s.p0[0] + (s.p1[0] - s.p0[0]) * k, s.p0[1] + (s.p1[1] - s.p0[1]) * k])
    } else {
      const a = s.a0 + (s.a1 - s.a0) * k
      points.push([s.c[0] + Math.cos(a) * r, s.c[1] + Math.sin(a) * r])
    }
  }
  return points
}

/** 机器人的巡航路径（模块级算好一次） */
export const ROBOT_PATH = buildRobotPath()

export const HALL_LAYOUT = {
  FLOORS,
  CEILING_RECTS_BY_LEVEL,
  COLUMNS,
  STAIRS,
  RAMPS,
  TERRACES,
  RAILINGS,
  SHELVES,
  TABLES,
  COUNTER,
  VR_AREA,
  LOBBY_SCREEN,
  WALLS,
  ROBOT_PATH,
}
