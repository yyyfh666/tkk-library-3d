/**
 * 机器人导航：栅格化 + A* + 拉绳平滑（纯函数，不 import three —— 可脱离渲染单独测）。
 *
 * 为什么要栅格而不是直接用碰撞盒：
 *  · 大厅的障碍物是 ~150 个 AABB（柱子/书架/服务台/看台…），栅格把它们"膨胀"成
 *    机器人半径的禁区，A* 就只需要在布尔数组上跑，跟障碍物数量无关；
 *  · 寻路**只在收到新目标时跑一次**（不是每帧），全厅 88×58 格、A* 毫秒级 ——
 *    帧率完全不受影响（这是"避免寻路卡帧"的正解：把计算从每帧挪到每命令）。
 */

const SQRT2 = Math.SQRT2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * 建导航栅格。
 * @param {object} opts
 * @param {{x0,x1,z0,z1}} opts.bounds 可走区域的矩形范围（大厅内墙以内）
 * @param {number} opts.cell 格子边长（米）；0.4 足够精细，全厅约 5100 格
 * @param {Array} opts.colliders hall.js 同源登记的 AABB
 * @param {number} opts.clearance 机器人半径（障碍按它膨胀）
 * @param {number} opts.yMin/yMax 只考虑这个竖直带里的障碍（机器人高度的身体）
 * @param {Array<{x0,x1,z0,z1}>} opts.blockedRects 显式禁行区 —— 给"没有 AABB 能表达的洞"用
 *   （中庭一层就是楼板上的一个洞，栏杆围了边却给层叠看台留了缺口）
 */
export function buildNavGrid({
  bounds,
  cell = 0.4,
  colliders,
  clearance = 0.45,
  yMin = 0.15,
  yMax = 1.5,
  blockedRects = [],
}) {
  const cols = Math.ceil((bounds.x1 - bounds.x0) / cell)
  const rows = Math.ceil((bounds.z1 - bounds.z0) / cell)
  const blocked = new Uint8Array(cols * rows)

  // 只留"和机器人身体相交"的障碍：脚下的楼板、头顶的楼板、纯地面体（看台）都不算
  const obstacles = colliders.filter(
    (c) => !c.groundOnly && c.max[1] > yMin && c.min[1] < yMax,
  )

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = bounds.x0 + (i + 0.5) * cell
      const z = bounds.z0 + (j + 0.5) * cell
      // 显式禁行区（中庭的洞）先判：它没有对应的 AABB，只能这样封
      let inVoid = false
      for (const r of blockedRects) {
        if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) {
          inVoid = true
          break
        }
      }
      if (inVoid) {
        blocked[j * cols + i] = 1
        continue
      }
      for (const c of obstacles) {
        const cx = clamp(x, c.min[0], c.max[0])
        const cz = clamp(z, c.min[2], c.max[2])
        const dx = x - cx
        const dz = z - cz
        if (dx * dx + dz * dz < clearance * clearance) {
          blocked[j * cols + i] = 1
          break
        }
      }
    }
  }
  return { bounds, cell, cols, rows, blocked, clearance }
}

const toCell = (grid, x, z) => ({
  i: clamp(Math.floor((x - grid.bounds.x0) / grid.cell), 0, grid.cols - 1),
  j: clamp(Math.floor((z - grid.bounds.z0) / grid.cell), 0, grid.rows - 1),
})

const cellCenter = (grid, i, j) => ({
  x: grid.bounds.x0 + (i + 0.5) * grid.cell,
  z: grid.bounds.z0 + (j + 0.5) * grid.cell,
})

const walkable = (grid, i, j) =>
  i >= 0 && j >= 0 && i < grid.cols && j < grid.rows && !grid.blocked[j * grid.cols + i]

/** 目标点落在障碍里（或格子里）时，向四周找一个最近的可走格 —— 让"点书架"这类目标也能到达 */
function nearestWalkable(grid, i, j, maxRadius = 6) {
  if (walkable(grid, i, j)) return { i, j }
  for (let r = 1; r <= maxRadius; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
        if (walkable(grid, i + di, j + dj)) return { i: i + di, j: j + dj }
      }
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * 最小二叉堆（A* 的开放集；用数组线性找最小是 5000² 的量级，别省这点代码）
 * ------------------------------------------------------------------ */

class MinHeap {
  constructor() {
    this.items = []
  }
  push(node) {
    const a = this.items
    a.push(node)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].f <= a[i].f) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].f < a[m].f) m = l
        if (r < a.length && a[r].f < a[m].f) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
  get size() {
    return this.items.length
  }
}

/**
 * A* 寻路（8 邻域，八方向启发式，禁止贴角穿越）。
 * @returns {Array<{x,z}>|null} 世界坐标折线（含起点与终点），失败返回 null
 */
export function findPath(grid, start, goal) {
  const s = nearestWalkable(grid, toCell(grid, start[0], start[1]).i, toCell(grid, start[0], start[1]).j)
  const g0 = toCell(grid, goal[0], goal[1])
  const g = nearestWalkable(grid, g0.i, g0.j)
  if (!s || !g) return null

  const cols = grid.cols
  const n = grid.cols * grid.rows
  const open = new MinHeap()
  const gScore = new Float32Array(n).fill(Infinity)
  const cameFrom = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)

  const idx = (c) => c.j * cols + c.i
  const h = (ci, cj) => {
    const di = Math.abs(ci - g.i)
    const dj = Math.abs(cj - g.j)
    return (di + dj) + (SQRT2 - 2) * Math.min(di, dj) // octile
  }

  const startIdx = idx(s)
  gScore[startIdx] = 0
  open.push({ i: s.i, j: s.j, f: h(s.i, s.j), g: 0 })

  const NEI = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, SQRT2],
    [1, -1, SQRT2],
    [-1, 1, SQRT2],
    [-1, -1, SQRT2],
  ]

  const goalIdx = idx(g)
  while (open.size) {
    const cur = open.pop()
    const ci = idx(cur)
    if (closed[ci]) continue
    closed[ci] = 1
    if (ci === goalIdx) break

    for (const [di, dj, cost] of NEI) {
      const ni = cur.i + di
      const nj = cur.j + dj
      if (!walkable(grid, ni, nj)) continue
      // 斜着走时，两边的直邻格必须也可走（不然会"贴角"穿过柱子对角）
      if (di !== 0 && dj !== 0 && (!walkable(grid, cur.i + di, cur.j) || !walkable(grid, cur.i, cur.j + dj))) continue
      const ni2 = nj * cols + ni
      if (closed[ni2]) continue
      const tentative = gScore[ci] + cost
      if (tentative < gScore[ni2]) {
        gScore[ni2] = tentative
        cameFrom[ni2] = ci
        open.push({ i: ni, j: nj, f: tentative + h(ni, nj), g: tentative })
      }
    }
  }

  if (cameFrom[goalIdx] === -1 && startIdx !== goalIdx) return null

  // 回溯
  const cells = []
  let p = goalIdx
  while (p !== -1) {
    cells.push({ i: p % cols, j: Math.floor(p / cols) })
    if (p === startIdx) break
    p = cameFrom[p]
  }
  cells.reverse()

  const path = cells.map((c) => cellCenter(grid, c.i, c.j))
  // 起点/终点用真实坐标（不然会吸附到格心，细节上差半格）。
  // 但**终点被吸附过**（目标本身落在障碍里）时要留在吸附后的格心 ——
  // 否则机器人会一头扎进障碍物里（比如把"书架本体"当目标点传进来时）。
  const goalSnapped = g.i !== g0.i || g.j !== g0.j
  path[0] = { x: start[0], z: start[1] }
  if (!goalSnapped) path[path.length - 1] = { x: goal[0], z: goal[1] }
  return path
}

/** 两点之间的直线是否全程可走（采样验证） */
function lineOfSight(grid, ax, az, bx, bz) {
  const dist = Math.hypot(bx - ax, bz - az)
  const steps = Math.max(2, Math.ceil(dist / (grid.cell * 0.5)))
  for (let k = 1; k <= steps; k++) {
    const t = k / steps
    const c = toCell(grid, ax + (bx - ax) * t, az + (bz - az) * t)
    if (!walkable(grid, c.i, c.j)) return false
  }
  return true
}

/**
 * 拉绳平滑（string pulling）：能一眼看到的远处路点就跳过去。
 * 栅格路径是锯齿状的，直接照着走机器人会"抖"；平滑后只剩几个拐点，
 * 配合转向插值就是平滑转弯。
 */
export function smoothPath(grid, path) {
  if (!path || path.length < 3) return path
  const out = [path[0]]
  let i = 0
  while (i < path.length - 1) {
    let j = path.length - 1
    while (j > i + 1 && !lineOfSight(grid, path[i].x, path[i].z, path[j].x, path[j].z)) j--
    out.push(path[j])
    i = j
  }
  return out
}

/** 一步到位：找路 + 平滑 */
export function planPath(grid, start, goal) {
  return smoothPath(grid, findPath(grid, start, goal))
}
