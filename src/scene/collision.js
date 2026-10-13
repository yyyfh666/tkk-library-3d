/**
 * 碰撞解算（纯函数，不 import three —— 可以脱离渲染单独测）。
 *
 * 玩家 = 一根竖直圆柱：半径 radius，脚在 feetY，头顶 feetY + headHeight。
 * 碰撞体 = 一堆 AABB（由 hall.js 的 addBox 建几何时同源登记）。
 *
 * ⚠️ 规模说明：大厅约 150 条 AABB，每帧线性扫 3 遍 ≈ 450 次比较，
 * 比更新一次矩阵还便宜。**不要加八叉树/BVH** —— 那是在给蚊子配大炮。
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

/**
 * 水平解算：把 (x, z) 从所有挡路的 AABB 里推出来（贴着滑动）。
 *
 * 竖直过滤是**一条规则**，同时解决三件事：
 *   `c.max[1] <= feetY + stepHeight` → 跳过：脚下的楼板不推人、≤步高的路缘可迈过
 *   `c.min[1] >= feetY + headHeight` → 跳过：门楣/头顶楼板不推人、能从楼梯下方穿过
 * 3 遍迭代：处理"墙角两只盒子互相往外推"的抖动情况。
 */
export function resolveXZ(x, z, feetY, colliders, { radius, stepHeight, headHeight }) {
  const loY = feetY + stepHeight
  const hiY = feetY + headHeight
  let px = x
  let pz = z

  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const c of colliders) {
      if (c.groundOnly) continue // 层叠看台这类"只当地面、不挡人"的
      if (c.max[1] <= loY || c.min[1] >= hiY) continue
      const cx = clamp(px, c.min[0], c.max[0])
      const cz = clamp(pz, c.min[2], c.max[2])
      const dx = px - cx
      const dz = pz - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= radius * radius) continue

      if (d2 > 1e-8) {
        // 圆心在盒外：沿"最近点 → 圆心"方向推出去
        const d = Math.sqrt(d2)
        const push = (radius - d) / d
        px += dx * push
        pz += dz * push
      } else {
        // 圆心已经陷进盒子里（少见）：沿最小平移轴推出去
        const outLeft = px - c.min[0] + radius
        const outRight = c.max[0] - px + radius
        const outNear = pz - c.min[2] + radius
        const outFar = c.max[2] - pz + radius
        const m = Math.min(outLeft, outRight, outNear, outFar)
        if (m === outLeft) px = c.min[0] - radius
        else if (m === outRight) px = c.max[0] + radius
        else if (m === outNear) pz = c.min[2] - radius
        else pz = c.max[2] + radius
      }
      moved = true
    }
    if (!moved) break
  }

  return { x: px, z: pz }
}

/**
 * 地面高度：找 (x, z) 处"脚边能站得住的最高一片地"。
 *
 * reach = feetY + stepHeight —— 只认不超过一级台阶高的地面，
 * 于是：楼梯坡道（ramps）和层叠看台（groundOnly 盒子）都能一级级迈上去，
 * 而"站在一层抬眼看二层楼板"时不会被吸上去。
 *
 * @returns {number|null} null = 此处下方是空的（悬空在中庭上），该继续下落
 */
export function groundAt(x, z, feetY, colliders, ramps, stepHeight) {
  const reach = feetY + stepHeight
  let g = -Infinity

  for (const c of colliders) {
    if (x < c.min[0] || x > c.max[0] || z < c.min[2] || z > c.max[2]) continue
    const top = c.max[1]
    if (top <= reach && top > g) g = top
  }

  for (const r of ramps) {
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue
    const t = r.axis === 'x' ? (x - r.minX) / (r.maxX - r.minX) : (z - r.minZ) / (r.maxZ - r.minZ)
    let y = r.y0 + (r.y1 - r.y0) * t
    if (r.snap) y = Math.round(y / r.snap) * r.snap // 吸附到踏步高度，脚不"悬在斜面上"
    if (y <= reach && y > g) g = y
  }

  return g === -Infinity ? null : g
}
