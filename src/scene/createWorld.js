import * as THREE from 'three'
import { createMaterials, applyMaterialPhase, attachEnvMap } from './materials.js'
import { createHallTextures, disposeHallTextures, createRoomEnvTexture } from './textures.js'
import { createIslandWorld, createHallWorld } from './worlds.js'
import { useHallStore } from '../state/store.js'

/**
 * 引擎：整个应用只建 **一个** WebGLRenderer，两个场景（岛 / 大厅）各自拥有
 * 自己的 scene、camera、controls，靠切 active 来换 —— 不重建 WebGL 上下文，
 * 也就没有反复进退把显卡资源耗光的问题。
 *
 * 昼夜由一个 0→1 的 phase 驱动：材质、光照、场景底色、页面底色全部由它插值。
 */
export function createAppWorld({ container, onHotspotSelect, onWalkChange, onWalkHover }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  // r186 已经删掉了 PCFSoftShadowMap（常量还在但会被强制降级 + 打 warn），用默认的 PCF
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // 刻意不开 tone mapping：参考图是平涂色块，ACES 会把颜色压灰，反而丢了那个味道
  renderer.toneMapping = THREE.NoToneMapping
  container.appendChild(renderer.domElement)

  // 程序化贴图（模块级单例，StrictMode 双挂载也只画一次）+ 程序化环境反射
  const textures = createHallTextures({ maxAnisotropy: renderer.capabilities.getMaxAnisotropy() })
  const materials = createMaterials({ textures })
  // ⚠️ 逐材质挂 envMap，绝不设 scene.environment（r186 会用 environmentIntensity 覆盖）
  attachEnvMap(materials, createRoomEnvTexture(renderer))

  const worlds = {
    island: createIslandWorld(renderer, materials, { onHotspotSelect }),
    hall: createHallWorld(renderer, materials, { onHotspotSelect, onWalkChange, onWalkHover }),
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

  const api = {
    worlds,
    resize,
    /** 切换昼夜：0 = 白天，1 = 夜晚 */
    setPhaseTarget(next) {
      phaseTarget = next
    },
    /**
     * 切换当前渲染的 world（岛 / 大厅），同时把另一个的控制器关掉，免得两套交互打架。
     * 优先走 world.setActive(bool) 钩子 —— 大厅切回岛再切回来时，
     * 不能无脑把 OrbitControls 打开（第一视角模式下会和它抢相机）。
     */
    setActive(name) {
      if (!worlds[name] || name === activeName) return
      const previous = worlds[activeName]
      if (previous.setActive) previous.setActive(false)
      else if (previous.controls) previous.controls.enabled = false
      activeName = name
      const next = worlds[name]
      if (next.setActive) {
        next.setActive(true)
      } else if (next.controls) {
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
      disposeHallTextures() // 贴图是模块级单例，统一在这里收口
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }

  /* ------------------------------------------------------------------ *
   * 测试钩子（仅 DEV）
   * 截图回路用 URL 参数 + window.__stage 直接摆机位 / 采样像素，
   * **不依赖任何按钮文案**，UI 改字不会把验证回路弄断。
   * （preview-shot.mjs 是靠点按钮的回归基线，那条不许动。）
   * ------------------------------------------------------------------ */
  if (import.meta.env.DEV) {
    window.__stage = {
      app: api,
      /** 调试用：暴露 THREE 和当前场景，截图回路可以拿来做"这个像素上是什么"的射线诊断 */
      debug: { THREE, get scene() { return worlds[activeName].scene }, get camera() { return worlds[activeName].camera } },
      info: () => ({
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
      }),
      /** 截图回路用：进第一视角并直接摆姿态（无头环境拿不到 PointerLock，所以不走锁） */
      setWalkPose: (x, z, yaw = 0, pitch = 0, yHint = 0) => {
        const hall = worlds.hall
        hall.enterWalkInstant()
        hall.walker.setPose(x, z, yaw, pitch, yHint)
      },
      /** 当前是否在第一视角（截图脚本判断用） */
      walkActive: () => worlds.hall.walkActive,
      /** 碰撞盒线框开关（排查"能穿过去"） */
      colliderDebug: (on) => worlds.hall.setColliderDebug?.(on),
      /**
       * 场景二/三：机器人状态与全息状态，以及"派机器人去某点"。
       * 走 store 那条路（和 UI 完全同一条），所以这里验证到的就是用户点按钮时的行为。
       */
      robotState: () => worlds.hall.robotState?.() ?? null,
      hologramState: () => worlds.hall.hologramState?.() ?? null,
      vrState: () => worlds.hall.vrState?.() ?? null,
      speechLog: () => worlds.hall.speechLog?.() ?? [],
      exitHolo: () => worlds.hall.exitHolo?.(),
      navPlan: (from, to) => worlds.hall.navPlan?.(from, to) ?? null,
      simulateRobot: (seconds) => worlds.hall.simulateRobot?.(seconds) ?? null,
      commandRobot: (point, label = '测试目标', payload = null) =>
        useHallStore.getState().commandRobot({ point, label, payload }),
      hallState: () => useHallStore.getState(),
      /**
       * 走路仿真：不渲染，直接按 60Hz 把 walk.update 推进 N 秒。
       * 无头软件渲染只有 1~2 fps、dt 还被钳在 0.1s，靠"等真实时间"测走路根本测不动；
       * 这个钩子把碰撞/楼梯/栏杆的验证变成纯逻辑推演，快且确定。
       */
      simulateWalk: (keyList, seconds, setup) => {
        const hall = worlds.hall
        hall.enterWalkInstant()
        if (setup) {
          const [x, z, yaw = 0, pitch = 0, yHint = 0] = setup
          hall.walker.setPose(x, z, yaw, pitch, yHint)
        }
        const walker = hall.walker
        walker.releaseAllKeys()
        for (const k of keyList) walker.pressKey(k)
        const steps = Math.round(seconds * 60)
        for (let i = 0; i < steps; i++) walker.update(1 / 60)
        walker.releaseAllKeys()
        return walker.getPose()
      },
      /** 给当前 world 直接摆机位（截图用；不经过补间） */
      setCamera: ({ pos, target, fov } = {}) => {
        const world = worlds[activeName]
        if (pos) world.camera.position.set(...pos)
        if (target) {
          world.controls?.target.set(...target)
          world.camera.lookAt(new THREE.Vector3(...target))
        }
        if (fov) {
          world.camera.fov = fov
          world.camera.updateProjectionMatrix()
        }
        world.controls?.update(0)
      },
      /**
       * 采样当前画面若干点的像素（0-255），用来**用数字守住曝光**：
       * 白天断言 max < 0.98*255（过曝）、min > 0.06*255（死黑）。
       */
      probe: (cols = 8, rows = 5) => {
        const world = worlds[activeName]
        renderer.render(world.scene, world.camera)
        const gl = renderer.getContext()
        const w = renderer.domElement.width
        const h = renderer.domElement.height
        const buf = new Uint8Array(4)
        const out = []
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            gl.readPixels(
              Math.floor(((i + 0.5) * w) / cols),
              Math.floor(((j + 0.5) * h) / rows),
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              buf,
            )
            out.push([buf[0], buf[1], buf[2]])
          }
        }
        return out
      },
    }
  }

  return api
}
