import * as THREE from 'three'
import { createMaterials, applyMaterialPhase } from './materials.js'
import { createIslandWorld, createHallWorld } from './worlds.js'

/**
 * 引擎：整个应用只建 **一个** WebGLRenderer，两个场景（岛 / 大厅）各自拥有
 * 自己的 scene、camera、controls，靠切 active 来换 —— 不重建 WebGL 上下文，
 * 也就没有反复进退把显卡资源耗光的问题。
 *
 * 昼夜由一个 0→1 的 phase 驱动：材质、光照、场景底色、页面底色全部由它插值。
 */
export function createAppWorld({ container, onHotspotSelect }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  // r186 已经删掉了 PCFSoftShadowMap（常量还在但会被强制降级 + 打 warn），用默认的 PCF
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // 刻意不开 tone mapping：参考图是平涂色块，ACES 会把颜色压灰，反而丢了那个味道
  renderer.toneMapping = THREE.NoToneMapping
  container.appendChild(renderer.domElement)

  const materials = createMaterials()
  const worlds = {
    island: createIslandWorld(renderer, materials, { onHotspotSelect }),
    hall: createHallWorld(renderer, materials, { onHotspotSelect }),
  }
  // 两个 world 的标注层同时挂在 DOM 上，只显示当前这个
  for (const [name, world] of Object.entries(worlds)) {
    world.setHotspotsVisible?.(name === 'island')
  }

  let activeName = 'island'
  let phase = 0
  let phaseTarget = 0
  let frameId = 0
  let disposed = false

  const timer = new THREE.Timer()

  const applyPhase = (t) => {
    applyMaterialPhase(materials, t)
    for (const world of Object.values(worlds)) world.applyScenePhase(t)
  }
  applyPhase(0)

  const resize = () => {
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight
    renderer.setSize(width, height)
    for (const world of Object.values(worlds)) {
      world.camera.aspect = width / height
      world.camera.updateProjectionMatrix()
      world.setSize?.(width, height)
    }
  }
  resize()

  const frame = () => {
    if (disposed) return
    frameId = requestAnimationFrame(frame)

    timer.update()
    const dt = Math.min(timer.getDelta(), 0.1) // 切标签页回来时 dt 会很大，钳一下
    const elapsed = timer.getElapsed()

    // 昼夜过渡：指数逼近，时间常数 0.42s ≈ 1.2 秒走完 95%，和 CSS 那边的过渡时长对齐
    if (Math.abs(phase - phaseTarget) > 0.002) {
      phase += (phaseTarget - phase) * (1 - Math.exp(-dt / 0.42))
      if (Math.abs(phase - phaseTarget) <= 0.002) phase = phaseTarget
      applyPhase(phase)
    }

    const world = worlds[activeName]
    world.update(elapsed, dt)
    renderer.render(world.scene, world.camera)
  }
  frame()

  return {
    worlds,
    resize,
    /** 切换昼夜：0 = 白天，1 = 夜晚 */
    setPhaseTarget(next) {
      phaseTarget = next
    },
    /** 切换当前渲染的 world（岛 / 大厅），同时把另一个的控制器关掉，免得两套交互打架 */
    setActive(name) {
      if (!worlds[name] || name === activeName) return
      const previous = worlds[activeName]
      if (previous.controls) previous.controls.enabled = false
      activeName = name
      const next = worlds[name]
      if (next.controls) {
        next.controls.enabled = true
        next.controls.update(0)
      }
      for (const [key, world] of Object.entries(worlds)) {
        world.setHotspotsVisible?.(key === name)
      }
    },
    get activeName() {
      return activeName
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frameId)
      for (const world of Object.values(worlds)) world.dispose?.()
      for (const material of Object.values(materials)) material.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
