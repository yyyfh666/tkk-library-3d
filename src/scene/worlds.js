import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js' // r186 只有具名导出，默认导入会报错
import { createLighting, applyLightPhase, createSceneShell } from './lighting.js'
import { buildIsland, buildFloatingRocks, createContactShadow, animateFloatingRocks } from './island.js'
import { buildLibrary } from './library.js'
import { buildProps } from './props.js'
import { createHotspots, ISLAND_HOTSPOTS, HALL_HOTSPOTS } from './hotspots.js'
import { buildHall, updateWalls } from './hall.js'
import { HALL, HALL_VIEWS, HOTSPOT_ANCHORS, ROBOT_PATH, HOLOGRAM, ACCESS } from './hallLayout.js'
import { createWalkControls } from './walkControls.js'
import { buildNavGrid, planPath } from './nav.js'
import { resolveXZ } from './collision.js'
import { createRobotAgent } from './robotAgent.js'
import { createShelfScreens, pickBook, createHighlightMarker } from './shelfInteraction.js'
import { createHologram } from './hologram.js'
import { createBurst } from './particles.js'
import { useHallStore } from '../state/store.js'
import { getBookByInstanceMeta } from '../state/mockBooks.js'
import { DAY_NIGHT, HALL_LIGHT } from './palette.js'

/** 相机初始机位：略高的俯视，配长焦，才有"微缩模型"那种被压扁的玩具感 */
const ISLAND_CAMERA = {
  fov: 33,
  position: [196, 132, 252],
  target: [0, 4, 0],
  minDistance: 120,
  maxDistance: 620,
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function createIslandWorld(renderer, materials, { onHotspotSelect }) {
  const lighting = createLighting()
  const scene = createSceneShell(lighting, { fogNear: 380, fogFar: 900 })

  scene.add(buildIsland(materials))

  const contactShadow = createContactShadow()
  scene.add(contactShadow)

  const rocks = buildFloatingRocks(materials)
  scene.add(rocks)

  scene.add(buildLibrary(materials))
  scene.add(buildProps(materials))

  const camera = new THREE.PerspectiveCamera(ISLAND_CAMERA.fov, 1, 1, 2400)
  camera.position.set(...ISLAND_CAMERA.position)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(...ISLAND_CAMERA.target)
  controls.enableDamping = true
  controls.dampingFactor = 0.055
  controls.minDistance = ISLAND_CAMERA.minDistance
  controls.maxDistance = ISLAND_CAMERA.maxDistance
  controls.minPolarAngle = 0.5 // 不许俯视到正上方，那个角度看着像地图
  controls.maxPolarAngle = Math.PI / 2 - 0.07 // 也不许降到地平线以下，否则会看到岛底
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.32
  controls.maxTargetRadius = 60 // 平移范围，别把岛推出画面
  controls.update(0)

  const hotspots = createHotspots({ container: renderer.domElement.parentElement, hotspots: ISLAND_HOTSPOTS, onSelect: onHotspotSelect })
  scene.add(hotspots.group)

  let width = 1
  let height = 1
  let tween = null

  /** 平滑推镜到某个热点（点底部胶囊或信息卡里的"去看看"时用） */
  const focusOn = (position, { distance = 110, lift = 34 } = {}) => {
    const anchor = new THREE.Vector3(...position)
    const direction = camera.position.clone().sub(controls.target).normalize()
    tween = {
      fromPosition: camera.position.clone(),
      toPosition: anchor.clone().add(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, lift, 0)),
      fromTarget: controls.target.clone(),
      toTarget: anchor.clone(),
      t: 0,
    }
    controls.autoRotate = false
  }

  return {
    scene,
    camera,
    controls,
    hotspots,
    setSize(w, h) {
      width = w
      height = h
    },
    update(elapsed, dt) {
      animateFloatingRocks(rocks, elapsed)

      if (tween) {
        tween.t = Math.min(1, tween.t + dt / 0.9)
        const k = easeInOut(tween.t)
        camera.position.lerpVectors(tween.fromPosition, tween.toPosition, k)
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k)
        controls.update(0)
        if (tween.t >= 1) tween = null
      } else {
        controls.update(dt) // 开了阻尼和自动旋转，必须每帧 update
      }

      hotspots.update(camera, width, height)
    },
    focusOn,
    resetView() {
      tween = {
        fromPosition: camera.position.clone(),
        toPosition: new THREE.Vector3(...ISLAND_CAMERA.position),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(...ISLAND_CAMERA.target),
        t: 0,
      }
    },
    setAutoRotate(on) {
      controls.autoRotate = on
    },
    setHotspotsVisible(visible) {
      hotspots.setVisible(visible)
    },
    applyScenePhase(t) {
      scene.background.copy(new THREE.Color(DAY_NIGHT.page[0])).lerp(new THREE.Color(DAY_NIGHT.page[1]), t)
      if (scene.fog) scene.fog.color.copy(scene.background)
      contactShadow.material.opacity = THREE.MathUtils.lerp(
        DAY_NIGHT.contactShadowOpacity[0],
        DAY_NIGHT.contactShadowOpacity[1],
        t,
      )
      applyLightPhase(lighting, t)
    },
    dispose() {
      controls.dispose()
      hotspots.dispose()
    },
  }
}

export { createIslandWorld }

/* ==================================================================
 * 三楼大厅（室内，2026-10-13 米制重建版）
 * ================================================================== */

/**
 * 机位数据在 hallLayout.js 的 HALL_VIEWS（娃娃屋俯视 / 贴近 / 第一视角，各带 fov/near/far）。
 * 第一视角（walk）的接入在后续阶段挂进这个 world（见 walkControls.js）。
 */
function createHallWorld(renderer, materials, { onHotspotSelect, onWalkChange, onWalkHover }) {
  // 米制尺度：阴影参数跟随（shadowExtent 28 只有大厅这么大；normalBias 必须降到 0.03）
  const lighting = createLighting({ shadowExtent: 28, shadowFar: 220, normalBias: 0.03, sunScale: 0.9 })
  const scene = createSceneShell(lighting, { fogNear: 300, fogFar: 720 })

  const { group, robot, walls, ceiling, outer, colliders, ramps, books } = buildHall(materials)
  scene.add(group)
  scene.add(ceiling)
  scene.add(outer)
  ceiling.visible = false // 吊顶只在第一视角显示；俯视总览要能看进屋里
  outer.visible = false // 窗外背景板同理：俯视时它挡在相机和屋子中间

  // 全息展台也要挡人。几何是 hologram.js 现砌的，位置读布局层的 HOLOGRAM —— 这里补碰撞盒
  // （必须赶在导航栅格按 colliders 建之前）。盒高取 0.55 而不是基座真实的 0.26：
  // 步高是 0.36，矮于它的盒子会被当成"可以迈上去的路缘"，人就穿进全息面板里了。
  colliders.push({
    min: [HOLOGRAM.x - HOLOGRAM.radius, 0, HOLOGRAM.z - HOLOGRAM.radius],
    max: [HOLOGRAM.x + HOLOGRAM.radius, 0.55, HOLOGRAM.z + HOLOGRAM.radius],
    tag: 'hologram',
    groundOnly: false,
  })

  const camera = new THREE.PerspectiveCamera(
    HALL_VIEWS.dollhouse.fov,
    1,
    HALL_VIEWS.dollhouse.near,
    HALL_VIEWS.dollhouse.far,
  )
  camera.position.set(...HALL_VIEWS.dollhouse.position)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(...HALL_VIEWS.dollhouse.target)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.22
  controls.maxTargetRadius = 30
  applyViewLimits(controls, HALL_VIEWS.dollhouse)
  controls.update(0)

  const hotspots = createHotspots({
    container: renderer.domElement.parentElement,
    hotspots: HALL_HOTSPOTS,
    onSelect: onHotspotSelect,
    dotRadius: 0.11, // 米制：光点半径 11cm（旧版 1.7 在新尺度下是 3.4m 的大橙球）
    pickRadius: 0.7, // 第一视角准星拾取用的不可见代理球
  })
  scene.add(hotspots.group)

  // 夜里的灯池：4 盏点光，白天 intensity=0（等于全关），随昼夜插值淡入。
  // 只有 4 盏 —— 点光不投影但每盏都进 shader 循环，加多了帧率是真的掉。
  const lamps = [
    [-12.5, HALL_LIGHT.lampHeight, -8],
    [12.5, HALL_LIGHT.lampHeight, -8],
    [-12.5, HALL_LIGHT.lampHeight, 8],
    [12.5, HALL_LIGHT.lampHeight, 8],
  ].map(([x, y, z]) => {
    const light = new THREE.PointLight(0xffd9a0, 0, HALL_LIGHT.lampDistance, 2)
    light.position.set(x, y, z)
    scene.add(light)
    return light
  })

  // ?debug=colliders：把全部碰撞盒画成线框（红=挡人的实体，黄=只当地面的看台类）。
  // 排查"能穿过去"这类问题时，开着它走一圈就能看出哪个物件忘了登记碰撞。
  let colliderDebug = null
  if (new URLSearchParams(window.location.search).has('debug')) {
    colliderDebug = new THREE.Group()
    for (const c of colliders) {
      const box = new THREE.Box3(new THREE.Vector3(...c.min), new THREE.Vector3(...c.max))
      colliderDebug.add(new THREE.Box3Helper(box, c.groundOnly ? 0xffc84a : 0xff4a6a))
    }
    scene.add(colliderDebug)
  }

  let width = 1
  let height = 1
  let tween = null
  let viewMode = 'dollhouse'
  let wallsLocked = false // 第一视角模式四面临墙全回来（娃娃屋的藏墙要停用）
  let walkActive = false
  const lookAt = new THREE.Vector3()

  // —— 第一视角（走在大厅里）——
  const walk = createWalkControls({
    camera,
    domElement: renderer.domElement,
    colliders,
    ramps,
    config: HALL_VIEWS.walk,
    onLockChange: (locked) => onWalkChange?.({ active: walk.enabled, locked }),
    onExitRequest: () => gotoView('dollhouse'), // 解锁态再按 Esc = 退出漫游
  })

  // —— 第一视角准星拾取：屏幕中心射线 × 不可见代理球 ——
  const raycaster = new THREE.Raycaster()
  raycaster.far = 12 // 隔着半个中庭够不到，走近了才有反应
  const screenCenter = new THREE.Vector2(0, 0)
  const pickList = hotspots.entries.map((e) => e.pick).filter(Boolean)
  let hovered = null

  const pickHotspot = () => {
    if (!walkActive) return null
    raycaster.setFromCamera(screenCenter, camera)
    const hit = raycaster.intersectObjects(pickList, false)[0]
    return hit ? hotspots.configById(hit.object.userData.hotspotId) : null
  }

  /* ================================================================
   * 场景二 / 三：导览机器人（A* 寻路）、全息投影、书架信息屏
   *
   * 三块都经由 state/store.js 跟 React 通信：引擎只管推进与回调，
   * UI 只管订阅 —— 每帧零 React 开销，命令行命令用 nonce 一次性消费。
   * ================================================================ */

  // 导航栅格只建一次（~5100 格 × 150 个障碍，一次要几毫秒）；
  // A* 只在收到命令时跑一次，帧循环里只剩路点跟随，所以帧率完全不受影响。
  const navGrid = buildNavGrid({
    bounds: ACCESS.bounds,
    cell: 0.4,
    colliders,
    clearance: 0.45,
    blockedRects: ACCESS.voidRects,
  })

  const screens = createShelfScreens()
  scene.add(screens.group)

  const marker = createHighlightMarker()
  scene.add(marker.object3d)

  const hologram = createHologram({ materials, position: [HOLOGRAM.x, 0, HOLOGRAM.z] })
  scene.add(hologram.group)

  const burst = createBurst()
  scene.add(burst.object3d)

  let pinnedBook = null // 找书命中的那本（书架屏与高亮框的"钉子"）
  let pinnedItem = null // 它在 hall.js 里的实例元数据（带包围盒）
  let hoverShelfId = null // 鼠标/准星当前指着哪架书架
  let holoNear = false

  const agent = createRobotAgent({
    object3d: robot,
    grid: navGrid,
    colliders,
    resolveXZ,
    cruisePath: ROBOT_PATH,
    onStateChange: (patch) => useHallStore.getState().setRobotState(patch),
    onArrive: (info) => {
      const store = useHallStore.getState()
      const kind = info.payload?.kind
      if (kind === 'checkin') {
        burst.burst([robot.position.x, 0.2, robot.position.z])
        store.showCheckin()
        return
      }
      if (kind === 'book') {
        const book = info.payload.book
        pinnedBook = book
        pinnedItem = books.items.find((it) => it.shelfId === book.shelfId && it.board === book.board) ?? null
        store.setSelectedBook(book)
        screens.show(book.shelfId, book)
        if (pinnedItem) marker.show(pinnedItem)
      }
    },
  })

  // React → 引擎：store 里塞一条带 nonce 的命令，这里消费掉（同一命令按两次也会重发）
  let lastCommandNonce = 0
  const unsubscribeStore = useHallStore.subscribe((state) => {
    const cmd = state.robotCommand
    if (!cmd || cmd.nonce === lastCommandNonce) return
    lastCommandNonce = cmd.nonce
    agent.command(cmd)
  })

  /**
   * 拾取到一本书时，同时更新三处：书架屏（3D）、高亮框（3D）、React 里的准星提示。
   * 移开时退回 pinnedBook —— 找书找到的那本不该被鼠标一晃就顶掉。
   */
  const applyHover = (item) => {
    const store = useHallStore.getState()
    if (!item) {
      if (hoverShelfId) {
        screens.show(hoverShelfId, pinnedBook?.shelfId === hoverShelfId ? pinnedBook : null)
        hoverShelfId = null
      }
      store.setHoveredBook(null)
      if (pinnedItem) marker.show(pinnedItem)
      else marker.hide()
      return
    }
    const book = getBookByInstanceMeta(item.shelfId, item.board)
    store.setHoveredBook(book)
    // 指到的那层没有编目条目时（演示书目每架只覆盖两三层），也要报出层数 ——
    // 直接退回默认页的话，屏幕一动不动的看着像坏了
    screens.show(item.shelfId, book, book ? null : item.board)
    marker.show(item)
    hoverShelfId = item.shelfId
  }

  /** 射线 → 最近的一本书（自己做射线-AABB，不用 InstancedMesh.raycast：三千个实例逐面求交会卡） */
  const pickBookAt = (ray, maxDist) =>
    pickBook(books.items, [ray.origin.x, ray.origin.y, ray.origin.z], [ray.direction.x, ray.direction.y, ray.direction.z], maxDist)
      ?.item ?? null

  // 非第一视角：跟着鼠标走（俯视 46m 高，6m 的拾取距离自然什么也够不到，不会误亮）
  const ndc = new THREE.Vector2()
  const onPointerMove = (event) => {
    if (walkActive || viewMode === 'walk') return
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    applyHover(pickBookAt(raycaster.ray, 6))
  }
  const onPointerLeave = () => applyHover(null)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)

  // 第一视角下的鼠标按下：
  //  未锁定 → 重新接管鼠标（浏览器要求用户手势里才能 requestPointerLock）
  //  已锁定 → 点一下 = 查看准星指着的东西（先解锁，信息卡上的按钮才点得到）
  const onCanvasDown = () => {
    if (!walkActive) return
    if (!walk.isLocked) {
      walk.requestLock()
      return
    }
    const config = pickHotspot()
    if (config) {
      walk.unlock()
      onHotspotSelect?.(config)
    }
  }
  renderer.domElement.addEventListener('mousedown', onCanvasDown)

  /**
   * 进入第一视角：一次性把全部联动翻过去。
   * 联动清单（照抄，别漏）：controls → 吊顶 → 外景 → 藏墙锁定 → 热点标签
   *   → near/far → walk.setEnabled → 同步姿态 → 通知 React
   */
  const enterWalkState = () => {
    if (walkActive) return
    walkActive = true
    controls.enabled = false
    ceiling.visible = true
    outer.visible = true
    wallsLocked = true
    hotspots.setLabelsVisible(false) // 浮空按钮会压准星，第一视角下整层藏掉
    camera.near = HALL_VIEWS.walk.near
    camera.far = HALL_VIEWS.walk.far
    camera.updateProjectionMatrix()
    walk.setEnabled(true)
    walk.syncFromCamera() // 从当前相机姿态接管：进第一视角的瞬间视线零跳变
    onWalkChange?.({ active: true, locked: walk.isLocked })
  }

  const exitWalkState = () => {
    if (!walkActive) return
    walkActive = false
    walk.setEnabled(false)
    wallsLocked = false
    ceiling.visible = false
    outer.visible = viewMode !== 'dollhouse'
    hotspots.setLabelsVisible(true)
    hovered = null
    onWalkHover?.(null)
    onWalkChange?.({ active: false, locked: false })
  }

  const gotoView = (mode) => {
    const view = HALL_VIEWS[mode]
    if (!view) return
    if (mode === 'walk' && walkActive) return
    viewMode = mode

    if (mode !== 'walk') {
      outer.visible = mode !== 'dollhouse'
      applyViewLimits(controls, view)
      // near/far 直接切（看不出来），fov 走补间（看得出来，硬切会跳）
      camera.near = view.near ?? camera.near
      camera.far = view.far ?? camera.far
      camera.updateProjectionMatrix()
      tween = {
        fromPosition: camera.position.clone(),
        toPosition: new THREE.Vector3(...view.position),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(...view.target),
        fromFov: camera.fov,
        toFov: view.fov ?? camera.fov,
        t: 0,
      }
      return
    }

    // 走进第一视角：飞到出生点，视线朝着中庭（yaw=0 = 望向 -z）
    const w = HALL_VIEWS.walk
    const eye = new THREE.Vector3(w.spawn[0], w.spawn[1] + w.eye, w.spawn[2])
    const dir = new THREE.Vector3(
      -Math.sin(w.yaw) * Math.cos(w.pitch),
      Math.sin(w.pitch),
      -Math.cos(w.yaw) * Math.cos(w.pitch),
    )
    camera.near = w.near
    camera.far = w.far
    camera.updateProjectionMatrix()
    tween = {
      fromPosition: camera.position.clone(),
      toPosition: eye,
      fromTarget: controls.target.clone(),
      toTarget: eye.clone().add(dir.multiplyScalar(4)),
      fromFov: camera.fov,
      toFov: w.fov,
      t: 0,
    }
  }

  return {
    scene,
    camera,
    controls,
    hotspots,
    colliders,
    ramps,
    walker: walk,
    get viewMode() {
      return viewMode
    },
    get walkActive() {
      return walkActive
    },
    setSize(w, h) {
      width = w
      height = h
    },
    update(elapsed, dt) {
      agent.update(dt) // 巡航环线 / A* 路径的路点跟随（寻路本身只在收到命令时跑一次）
      screens.tick(dt)
      burst.update(dt)
      hologram.update(elapsed, dt)

      // 全息：相机走进触发圈就亮，并通知 React 弹出陈嘉庚的故事时间轴
      const near = camera.position.distanceTo(hologram.center) < HOLOGRAM.triggerRadius
      if (near !== holoNear) {
        holoNear = near
        hologram.setActive(near)
        useHallStore.getState().setHologramActive(near)
      }

      updateWalls(walls, camera.position, wallsLocked)
      // 机器人会跑，标注点得跟着它走
      hotspots.updateAnchor('robot', [
        robot.position.x,
        robot.position.y + HOTSPOT_ANCHORS.robotYOffset,
        robot.position.z,
      ])

      if (tween) {
        tween.t = Math.min(1, tween.t + dt / 0.9)
        const k = easeInOut(tween.t)
        camera.position.lerpVectors(tween.fromPosition, tween.toPosition, k)
        // ⚠️ 补间期间**不能调 controls.update()**：它不检查 enabled，
        // 会拿新机位的 min/maxDistance 去夹正在飞的相机（旧版带着这个瑕疵）。
        // 用 camera.lookAt 定姿态；补间结束时再把 target 交还给 controls。
        lookAt.lerpVectors(tween.fromTarget, tween.toTarget, k)
        camera.lookAt(lookAt)
        if (tween.fromFov !== tween.toFov) {
          camera.fov = THREE.MathUtils.lerp(tween.fromFov, tween.toFov, k)
          camera.updateProjectionMatrix()
        }
        if (tween.t >= 1) {
          controls.target.copy(tween.toTarget)
          tween = null
          if (viewMode === 'walk') enterWalkState() // 吊顶/锁定等切换放在落地之后，飞行途中不出现
          else exitWalkState()
        }
      } else if (walkActive) {
        walk.update(dt) // 第一视角：绝不进 OrbitControls
        const config = pickHotspot()
        if ((config?.id ?? null) !== (hovered?.id ?? null)) {
          hovered = config
          onWalkHover?.(config)
        }
        // 准星没瞄到热点时再试书目：盯着书脊看一眼，书架屏就翻到那本书
        if (config) applyHover(null)
        else {
          raycaster.setFromCamera(screenCenter, camera)
          applyHover(pickBookAt(raycaster.ray, 4))
        }
      } else {
        controls.update(dt)
      }

      hotspots.update(camera, width, height)
    },
    gotoView,
    /** 走进第一视角（App 的按钮调它）：指针锁在用户手势里立刻请求，飞行途中就能接管鼠标 */
    enterWalk() {
      if (walkActive || viewMode === 'walk') return
      walk.requestLock()
      gotoView('walk')
    },
    exitWalk() {
      if (walkActive || viewMode === 'walk') gotoView('dollhouse')
    },
    /** 截图/调试用：跳过补间立刻进入第一视角（无头环境没有手势也拿不到 PointerLock） */
    enterWalkInstant() {
      if (walkActive) return
      viewMode = 'walk'
      tween = null
      enterWalkState()
    },
    toggleView() {
      if (walkActive || viewMode === 'walk') {
        gotoView('dollhouse')
        return
      }
      gotoView(viewMode === 'dollhouse' ? 'inside' : 'dollhouse')
    },
    /** 准星现在指着哪个热点（App 的 E 键调它） */
    pickHotspot,
    /** 测试钩子：机器人状态 / 全息状态（UI 那边走 store，不读这里） */
    robotState: () => agent.getState(),
    hologramState: () => ({ near: holoNear, fade: hologram.fade, center: hologram.center.toArray() }),
    /** 测试钩子：规划一条路径（断言"绕开中庭那个洞"用） */
    navPlan: (from, to) => planPath(navGrid, from, to)?.map((p) => [p.x, p.z]) ?? null,
    /**
     * 测试钩子：不渲染，按 60Hz 把机器人的跟随推进 N 秒 —— 和 simulateWalk 同一个道理，
     * 无头软渲染 1~2fps 且 dt 被钳在 0.1s，靠等真实时间走完一条 40m 的路径要几分钟。
     */
    simulateRobot: (seconds) => {
      for (let i = 0, n = Math.round(seconds * 60); i < n; i++) agent.update(1 / 60)
      return agent.getState()
    },
    setAutoRotate(on) {
      controls.autoRotate = on
    },
    setHotspotsVisible(visible) {
      hotspots.setVisible(visible)
    },
    /** 吊顶显隐（第一视角显示；俯瞰/贴近不显示，不然看进不去） */
    setCeilingVisible(visible) {
      ceiling.visible = visible
    },
    /** 外景组（天窗玻璃 + 窗外背景板）显隐：俯视总览时藏 */
    setOuterVisible(visible) {
      outer.visible = visible
    },
    /** 娃娃屋藏墙的开关：第一视角下必须锁定四面临墙 */
    setWallsLocked(locked) {
      wallsLocked = locked
    },
    /** 碰撞盒线框的显隐（?debug=colliders 或测试钩子） */
    setColliderDebug(visible) {
      if (colliderDebug) colliderDebug.visible = visible
    },
    /**
     * 切走/切回大厅时的收口：离开时把第一视角状态整个收回，
     * 回来就是干净的俯视总览（不然切回来会两套输入抢相机）。
     */
    setActive(active) {
      if (active) {
        controls.enabled = true
        controls.update(0)
        return
      }
      // 离开大厅：把"跟着相机走"的状态收回来（否则回来时会挂着一个早已失效的全息时间轴）
      applyHover(null)
      if (holoNear) {
        holoNear = false
        hologram.setActive(false)
        useHallStore.getState().setHologramActive(false)
      }
      if (walkActive || viewMode === 'walk') {
        viewMode = 'dollhouse'
        exitWalkState()
        tween = null
        camera.position.set(...HALL_VIEWS.dollhouse.position)
        camera.fov = HALL_VIEWS.dollhouse.fov
        camera.near = HALL_VIEWS.dollhouse.near
        camera.far = HALL_VIEWS.dollhouse.far
        camera.updateProjectionMatrix()
        controls.target.set(...HALL_VIEWS.dollhouse.target)
        applyViewLimits(controls, HALL_VIEWS.dollhouse)
      }
      controls.enabled = false
    },
    applyScenePhase(t) {
      scene.background.copy(new THREE.Color(DAY_NIGHT.page[0])).lerp(new THREE.Color(DAY_NIGHT.page[1]), t)
      if (scene.fog) scene.fog.color.copy(scene.background)
      applyLightPhase(lighting, t)
      // 大厅灯池：夜里亮起来（馆灯初上）
      const lampIntensity = THREE.MathUtils.lerp(HALL_LIGHT.lampIntensity[0], HALL_LIGHT.lampIntensity[1], t)
      for (const lamp of lamps) lamp.intensity = lampIntensity
    },
    dispose() {
      renderer.domElement.removeEventListener('mousedown', onCanvasDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      unsubscribeStore()
      screens.dispose()
      marker.dispose()
      hologram.dispose()
      burst.dispose()
      walk.dispose()
      controls.dispose()
      hotspots.dispose()
    },
  }
}

function applyViewLimits(controls, view) {
  // walk 档没有距离限制字段，用 ?? 保住旧值（不然会把 controls 设成 undefined）
  controls.minDistance = view.minDistance ?? controls.minDistance
  controls.maxDistance = view.maxDistance ?? controls.maxDistance
  controls.minPolarAngle = view.minPolarAngle ?? controls.minPolarAngle
  controls.maxPolarAngle = view.maxPolarAngle ?? controls.maxPolarAngle
}

export { createHallWorld }

/** 大厅尺寸（米制）：界面文案和相机要用 */
export { HALL }
