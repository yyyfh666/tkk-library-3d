import * as THREE from 'three'

/**
 * 一次性粒子爆花（机器人"打卡成功"用）。
 * 一个 Points + 一个 PointsMaterial，update 里推位置和透明度 —— 没有额外依赖，也不进 React。
 */
export function createBurst({ count = 180, color = 0xffc75a, life = 1.7, speed = 2.3, gravity = 3.0 } = {}) {
  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color,
    size: 0.085,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // 发光感：叠加上色，不遮挡后面的东西
    sizeAttenuation: true,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.visible = false

  let t = -1

  return {
    object3d: points,
    get active() {
      return t >= 0
    },
    /** 在某点炸开一朵（origin = [x, y, z]） */
    burst(origin) {
      t = 0
      points.visible = true
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2
        const el = Math.random() * Math.PI * 0.5 // 半球向上喷
        const s = speed * (0.35 + Math.random() * 0.85)
        velocities[i * 3] = Math.cos(a) * Math.cos(el) * s
        velocities[i * 3 + 1] = Math.sin(el) * s * 1.35
        velocities[i * 3 + 2] = Math.sin(a) * Math.cos(el) * s
        positions[i * 3] = origin[0] + (Math.random() - 0.5) * 0.35
        positions[i * 3 + 1] = origin[1] + 0.25 + Math.random() * 0.35
        positions[i * 3 + 2] = origin[2] + (Math.random() - 0.5) * 0.35
      }
      geometry.attributes.position.needsUpdate = true
    },
    update(dt) {
      if (t < 0) return
      t += dt
      if (t > life) {
        t = -1
        points.visible = false
        material.opacity = 0
        return
      }
      const k = t / life
      for (let i = 0; i < count; i++) {
        velocities[i * 3 + 1] -= gravity * dt
        positions[i * 3] += velocities[i * 3] * dt
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt
      }
      geometry.attributes.position.needsUpdate = true
      material.opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI) // 先亮后灭
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
