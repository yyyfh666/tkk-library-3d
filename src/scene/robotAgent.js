import { planPath } from './nav.js'

/**
 * 导览机器人（场景二）：**路点跟随器**。
 *
 * 两种模式共用同一套跟随逻辑，行为差别只在"走到头了怎么办"：
 *   cruise —— 无限循环的巡航环线（恒定速度，不减速；就是照片里绕中庭转的那辆小车）
 *   goto   —— A* 规划出来的路径（起步加速、接近终点平滑减速、转向用角度插值 → 平滑转弯）
 *
 * 三条工程约定：
 *  · 寻路**只在收到命令时跑一次**（A* + 拉绳，十几毫秒），帧循环里只有跟随 —— 帧率不受影响；
 *  · 位置不直接贴着折线走，而是"朝当前路点转向 + 沿机头方向前进"：
 *    这样转弯会自然画弧（Tween 式的平滑转弯与加减速），不会像轨道车一样折线抖动；
 *  · 每步之后用 resolveXZ 兜底修正（数值误差、别人动过碰撞盒时都不会把机器人塞进墙里）。
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/** 角度插值（走最短一侧，处理 ±π 环绕） */
function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export function createRobotAgent({
  object3d,
  grid,
  colliders,
  resolveXZ,
  config,
  cruisePath,
  cruiseSpeed = 0.95,
  maxSpeed = 1.45,
  accel = 1.6,
  decel = 2.4,
  turnRate = 3.4,
  arriveRadius = 0.32,
  bob = 0.03,
  onArrive,
  onStateChange,
}) {
  const loop = cruisePath.map(([x, z]) => ({ x, z }))

  const st = {
    mode: 'cruise', // cruise | goto | idle
    x: loop[0].x,
    z: loop[0].z,
    heading: 0,
    speed: 0,
    label: '',
    payload: null,
    elapsed: 0,
  }

  let waypoints = []
  let wpIndex = 0
  let loopIndex = 1
  let idleLeft = 0

  const isBlocked = (x, z) => {
    // 兜底修正：把自己当半径 0.42 的圆柱推出去（复用玩家的解算器）
    const solved = resolveXZ(x, z, 0, colliders, { radius: 0.42, stepHeight: 0.3, headHeight: 1.2 })
    return solved
  }

  /** 找环线上离当前位置最近的点（用于从别处回到巡航） */
  const nearestLoopIndex = () => {
    let best = 0
    let bd = Infinity
    loop.forEach((p, i) => {
      const d = (p.x - st.x) ** 2 + (p.z - st.z) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    })
    return best
  }

  const enterCruise = (announce = true) => {
    const target = nearestLoopIndex()
    // 离环线远就先规划一段过去（可能隔着书巷/柱子），到了再顺着环线转
    if (Math.hypot(loop[target].x - st.x, loop[target].z - st.z) > 1.2) {
      const path = planPath(grid, [st.x, st.z], [loop[target].x, loop[target].z])
      if (path && path.length > 1) {
        waypoints = path
        wpIndex = 1
        loopIndex = (target + 1) % loop.length
        st.mode = 'cruise'
        if (announce) onStateChange?.({ status: 'cruise', label: '中庭巡航' })
        return
      }
    }
    waypoints = []
    loopIndex = (target + 1) % loop.length
    st.mode = 'cruise'
    if (announce) onStateChange?.({ status: 'cruise', label: '中庭巡航' })
  }

  /** 一帧的推进（早返回式，比带标签的 break 好读） */
  const step = (dt) => {
    // 到点后停一会儿再回巡航
    if (st.mode === 'idle') {
      idleLeft -= dt
      st.speed = Math.max(0, st.speed - decel * dt)
      if (idleLeft <= 0) enterCruise()
      return
    }

    // 取当前路点：goto 用规划路径；cruise 先用"接上环线"的那段，走完就顺着环线转
    let target = null
    if (st.mode === 'goto') {
      if (!waypoints.length) return
      target = waypoints[Math.min(wpIndex, waypoints.length - 1)]
    } else {
      target = waypoints.length ? waypoints[Math.min(wpIndex, waypoints.length - 1)] : loop[loopIndex]
    }

    const dx = target.x - st.x
    const dz = target.z - st.z
    const dist = Math.hypot(dx, dz)

    // —— 到点判定 ——
    if (dist < arriveRadius) {
      if (st.mode === 'goto') {
        wpIndex++
        if (wpIndex >= waypoints.length) {
          const info = { status: 'arrived', label: st.label, payload: st.payload }
          st.mode = 'idle'
          idleLeft = 6 // 停 6 秒再回巡航
          st.speed = 0
          onArrive?.(info)
          onStateChange?.(info)
        }
      } else if (waypoints.length) {
        wpIndex++
        if (wpIndex >= waypoints.length) waypoints = [] // 接上环线，接下来按 loop 转
      } else {
        loopIndex = (loopIndex + 1) % loop.length
      }
      return
    }

    // —— 速度：巡航恒速；goto 看"剩余路程"（起步加速、临近平滑减速） ——
    let targetSpeed = cruiseSpeed
    if (st.mode === 'goto') {
      let remaining = dist
      for (let i = wpIndex; i < waypoints.length - 1; i++) {
        remaining += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].z - waypoints[i].z)
      }
      targetSpeed = clamp(remaining * 1.15, 0.3, maxSpeed)
    }
    st.speed += clamp(targetSpeed - st.speed, -decel * dt, accel * dt)

    // —— 转向：朝向插值 → 平滑转弯 ——
    st.heading = angleLerp(st.heading, Math.atan2(dx, dz), 1 - Math.exp(-turnRate * dt))

    // —— 前进：沿"机头方向"走（不是沿折线），转弯自然画弧；撞上东西就推回来兜底 ——
    const nx = st.x + Math.sin(st.heading) * st.speed * dt
    const nz = st.z + Math.cos(st.heading) * st.speed * dt
    const solved = isBlocked(nx, nz)
    st.x = solved.x
    st.z = solved.z
  }

  return {
    /** 下命令：走向某个世界坐标点（null/不传 = 回到巡航） */
    command({ point = null, label = '', payload = null } = {}) {
      if (!point) {
        enterCruise()
        return true
      }
      const path = planPath(grid, [st.x, st.z], point)
      if (!path || path.length < 2) {
        onStateChange?.({ status: 'failed', label: `${label}（过不去）` })
        return false
      }
      waypoints = path
      wpIndex = 1
      st.mode = 'goto'
      st.label = label
      st.payload = payload
      onStateChange?.({ status: 'moving', label })
      return true
    },

    update(dt) {
      st.elapsed += dt
      step(dt)
      object3d.position.set(st.x, Math.abs(Math.sin(st.elapsed * 2.2)) * bob, st.z)
      object3d.rotation.y = st.heading
    },

    getState() {
      return { ...st }
    },
    setPosition(x, z, heading = st.heading) {
      st.x = x
      st.z = z
      st.heading = heading
    },
    enterCruise,
  }
}
