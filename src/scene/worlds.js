import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js' // r186 只有具名导出，默认导入会报错
import { createLighting, applyLightPhase, createSceneShell } from './lighting.js'
import { buildIsland, buildFloatingRocks, createContactShadow, animateFloatingRocks } from './island.js'
import { buildLibrary } from './library.js'
import { buildProps } from './props.js'
import { createHotspots, ISLAND_HOTSPOTS, HALL_HOTSPOTS } from './hotspots.js'
import { buildHall, driveRobot, updateWalls } from './hall.js'
import { HALL, HALL_VIEWS, HOTSPOT_ANCHORS } from './hallLayout.js'
import { DAY_NIGHT } from './palette.js'

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
function createHallWorld(renderer, materials, { onHotspotSelect }) {
  // 米制尺度：阴影参数跟随（shadowExtent 28 只有大厅这么大；normalBias 必须降到 0.03）
  const lighting = createLighting({ shadowExtent: 28, shadowFar: 220, normalBias: 0.03, sunScale: 0.75 })
  const scene = createSceneShell(lighting, { fogNear: 300, fogFar: 720 })

  const { group, robot, walls, ceiling, outer, colliders, ramps } = buildHall(materials)
  scene.add(group)
  scene.add(ceiling)
  scene.add(outer)
  ceiling.visible = false // 吊顶只在第一视角显示；俯视总览要能看进屋里
  outer.visible = false // 窗外背景板同理：俯视时它挡在相机和屋子中间

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

  let width = 1
  let height = 1
  let tween = null
  let viewMode = 'dollhouse'
  let wallsLocked = false // 第一视角模式四面临墙全回来（娃娃屋的藏墙要停用）
  const lookAt = new THREE.Vector3()

  const gotoView = (mode) => {
    const view = HALL_VIEWS[mode]
    if (!view || !view.position) return
    viewMode = mode
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
  }

  return {
    scene,
    camera,
    controls,
    hotspots,
    colliders,
    ramps,
    get viewMode() {
      return viewMode
    },
    setSize(w, h) {
      width = w
      height = h
    },
    update(elapsed, dt) {
      driveRobot(robot, elapsed)
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
        }
      } else {
        controls.update(dt)
      }

      hotspots.update(camera, width, height)
    },
    gotoView,
    toggleView() {
      gotoView(viewMode === 'dollhouse' ? 'inside' : 'dollhouse')
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
    applyScenePhase(t) {
      scene.background.copy(new THREE.Color(DAY_NIGHT.page[0])).lerp(new THREE.Color(DAY_NIGHT.page[1]), t)
      if (scene.fog) scene.fog.color.copy(scene.background)
      applyLightPhase(lighting, t)
    },
    dispose() {
      controls.dispose()
      hotspots.dispose()
    },
  }
}

function applyViewLimits(controls, view) {
  controls.minDistance = view.minDistance
  controls.maxDistance = view.maxDistance
  controls.minPolarAngle = view.minPolarAngle
  controls.maxPolarAngle = view.maxPolarAngle
}

export { createHallWorld }

/** 大厅尺寸（米制）：界面文案和相机要用 */
export { HALL }
