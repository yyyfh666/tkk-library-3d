import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { resolveXZ, groundAt } from './collision.js'

/**
 * 第一视角控制器（走在大厅里）。
 *
 * 分工：
 *  · PointerLockControls 只管**指针锁定 + 鼠标转头**（三点里唯一用它的部分）；
 *  · 平移自己算 —— 绝不用它的 moveForward / moveRight：那两个读 camera.matrix，
 *    而 matrix 要等 renderer.render() 才刷新，方向会滞后一帧；
 *  · 碰撞/重力在 collision.js（纯函数），这里只做状态推进。
 *
 * 状态机：
 *    off ──setEnabled(true)──▶ 可走（未锁定显示"点击画面继续"）
 *          ◀──setEnabled(false) + unlock()
 *    锁定 ⇄ 解锁由 pointerlockchange 驱动；解锁状态下按 Esc → onExitRequest（退出漫游）。
 */

export function createWalkControls({
  camera,
  domElement,
  colliders,
  ramps,
  config,
  onLockChange,
  onExitRequest,
  onFall,
}) {
  const pl = new PointerLockControls(camera, domElement)
  pl.minPolarAngle = 0.12 // 别让视线翻到正上/正下方（会天旋地转）
  pl.maxPolarAngle = Math.PI - 0.12
  pl.pointerSpeed = 1

  const pose = { x: config.spawn[0], y: config.spawn[1], z: config.spawn[2], vy: 0, grounded: true }
  const vel = { x: 0, z: 0 }
  const keys = new Set()
  let enabled = false
  // 只冻"走路"、不冻"转头"：全息演出期间用这个。
  // 千万别拿 setEnabled(false) 代替 —— 那个会 pl.unlock() 掉指针锁，
  // 用户会看到"点击画面继续漫游"，很出戏（还得再点一次才能接着看）。
  let moveLocked = false

  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')

  const onKeyDown = (event) => {
    if (!enabled) return
    keys.add(event.code)
    if (event.code === 'Escape' && !pl.isLocked) onExitRequest?.() // 已解锁再按 Esc = 退出漫游
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault() // 别让方向键滚页面
    }
  }
  const onKeyUp = (event) => keys.delete(event.code)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  pl.addEventListener('lock', () => onLockChange?.(true))
  pl.addEventListener('unlock', () => onLockChange?.(false))

  const applyPose = () => {
    camera.position.set(pose.x, pose.y + config.eye, pose.z)
  }

  const respawn = () => {
    pose.x = config.spawn[0]
    pose.y = config.spawn[1]
    pose.z = config.spawn[2]
    pose.vy = 0
    vel.x = 0
    vel.z = 0
    applyPose()
  }

  const update = (dt) => {
    if (!enabled) return

    // 朝向：从 camera.quaternion 直接取水平前向/右向
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    forward.normalize()
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    right.y = 0
    right.normalize()

    let ix = 0
    let iz = 0
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1
    if (moveLocked) {
      ix = 0
      iz = 0
    }
    const running = keys.has('ShiftLeft') || keys.has('ShiftRight')
    const speed = running ? config.runSpeed : config.walkSpeed

    const targetX = (right.x * ix + forward.x * iz) * speed
    const targetZ = (right.z * ix + forward.z * iz) * speed
    const k = 1 - Math.exp(-dt * (config.accel ?? 12)) // 指数逼近：起步/刹车都顺
    vel.x += (targetX - vel.x) * k
    vel.z += (targetZ - vel.z) * k

    // 水平：先走一步，再解算滑出障碍
    const nx = pose.x + vel.x * dt
    const nz = pose.z + vel.z * dt
    const solved = resolveXZ(nx, nz, pose.y, colliders, config)
    if (Math.abs(solved.x - nx) > 1e-4) vel.x *= 0.25 // 贴墙时把速度掐掉，避免抖动
    if (Math.abs(solved.z - nz) > 1e-4) vel.z *= 0.25
    pose.x = solved.x
    pose.z = solved.z

    // 竖直：重力 + 地面吸附（台阶就是靠 groundAt 的 reach 一级级迈上去的）
    pose.vy = Math.max(pose.vy - 9.8 * dt, -30)
    let y = pose.y + pose.vy * dt
    const g = groundAt(pose.x, pose.z, pose.y, colliders, ramps, config.stepHeight)
    if (g !== null && y <= g) {
      y = g
      pose.vy = 0
      pose.grounded = true
    } else {
      pose.grounded = false
    }
    pose.y = y
    if (pose.y < -6) {
      respawn()
      onFall?.()
    }

    applyPose()
  }

  return {
    plControls: pl,
    update,
    /** 进入第一视角：把 pose 对齐到相机当前位置（视线零跳变） */
    syncFromCamera() {
      pose.x = camera.position.x
      pose.z = camera.position.z
      pose.y = camera.position.y - config.eye
      pose.vy = 0
      vel.x = 0
      vel.z = 0
    },
    setEnabled(on) {
      enabled = on
      pl.enabled = on
      if (!on) {
        keys.clear()
        vel.x = 0
        vel.z = 0
        moveLocked = false
        pl.unlock()
      }
    },
    /**
     * 冻住位移、保留转头（全息演出用）。
     * 和 setEnabled(false) 的区别就是**不解指针锁** —— 见文件上方那段注释。
     */
    setMoveLocked(on) {
      moveLocked = on
      if (on) {
        vel.x = 0
        vel.z = 0
      }
    },
    get moveLocked() {
      return moveLocked
    },
    /** 在用户手势里立刻请求指针锁（点按钮时调用） */
    requestLock() {
      try {
        const result = pl.domElement.requestPointerLock({ unadjustedMovement: true })
        result?.catch?.(() => {}) // 被拒就当没锁上，UI 会显示"点击画面继续"
      } catch {
        /* 老浏览器没有 promise 版，忽略 */
      }
    },
    unlock() {
      pl.unlock()
    },
    /** 截图回路用：直接摆姿态（yHint 是预期楼面高度，用来找对那一层的地面） */
    setPose(x, z, yaw = 0, pitch = 0, yHint = 0) {
      pose.x = x
      pose.z = z
      const g = groundAt(x, z, yHint + 0.01, colliders, ramps, config.stepHeight)
      pose.y = g ?? yHint
      pose.vy = 0
      vel.x = 0
      vel.z = 0
      euler.set(pitch, yaw, 0)
      camera.quaternion.setFromEuler(euler)
      applyPose()
    },
    getPose() {
      return { ...pose }
    },
    // 给测试钩子用（__stage.simulateWalk）：直接注入/清空按键
    pressKey(code) {
      keys.add(code)
    },
    releaseAllKeys() {
      keys.clear()
    },
    get isLocked() {
      return pl.isLocked
    },
    get enabled() {
      return enabled
    },
    respawn,
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      pl.dispose()
    },
  }
}
