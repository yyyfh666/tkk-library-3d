import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js' // r186 只有具名导出，默认导入会报错
import { createLighting, applyLightPhase, createSceneShell } from './lighting.js'
import { buildIsland, buildFloatingRocks, createContactShadow, animateFloatingRocks } from './island.js'
import { buildLibrary } from './library.js'
import { buildProps } from './props.js'
import { createHotspots, ISLAND_HOTSPOTS, HALL_HOTSPOTS } from './hotspots.js'
import { buildHall, driveRobot, updateWalls, HALL } from './hall.js'
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
 * 五楼大厅（室内）
 * ================================================================== */

/** 娃娃屋俯视（默认）和贴近看两种机位；切的时候用同一条补间，手法和岛上推镜一致 */
const HALL_VIEWS = {
  dollhouse: {
    position: [6, 124, 138],
    target: [0, 4, 2],
    minDistance: 70,
    maxDistance: 330,
    minPolarAngle: 0.42,
    maxPolarAngle: 1.3,
  },
  inside: {
    position: [26, 12, 25],
    target: [-8, 5, -12],
    minDistance: 18,
    maxDistance: 130,
    minPolarAngle: 0.7,
    maxPolarAngle: 1.62,
  },
}

function createHallWorld(renderer, materials, { onHotspotSelect }) {
  const lighting = createLighting({ shadowExtent: 90 })
  const scene = createSceneShell(lighting, { fogNear: 300, fogFar: 720 })

  const { group, robot, walls } = buildHall(materials)
  scene.add(group)

  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 1600)
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
  })
  scene.add(hotspots.group)

  let width = 1
  let height = 1
  let tween = null
  let viewMode = 'dollhouse'

  const gotoView = (mode) => {
    const view = HALL_VIEWS[mode]
    if (!view) return
    viewMode = mode
    applyViewLimits(controls, view)
    tween = {
      fromPosition: camera.position.clone(),
      toPosition: new THREE.Vector3(...view.position),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(...view.target),
      t: 0,
    }
  }

  return {
    scene,
    camera,
    controls,
    hotspots,
    get viewMode() {
      return viewMode
    },
    setSize(w, h) {
      width = w
      height = h
    },
    update(elapsed, dt) {
      driveRobot(robot, elapsed)
      updateWalls(walls, camera.position)
      // 机器人会跑，标注点得跟着它走
      hotspots.updateAnchor('robot', [robot.position.x, robot.position.y + 10, robot.position.z])

      if (tween) {
        tween.t = Math.min(1, tween.t + dt / 0.9)
        const k = easeInOut(tween.t)
        camera.position.lerpVectors(tween.fromPosition, tween.toPosition, k)
        controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k)
        controls.update(0)
        if (tween.t >= 1) tween = null
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

/** 大厅的尺寸，界面文案和相机要用 */
export { HALL }
