import * as THREE from 'three'
import { DAY_NIGHT } from './palette.js'

/**
 * 每个 world 一套自己的灯（光照对象不能同时属于两个 scene，
 * 因为一个 Object3D 只能有一个 parent）。材质是共享的，灯不是。
 */

/** 岛 + 建筑那套尺度的阴影范围，够罩住整座岛和飘着的碎块 */
const SHADOW_EXTENT = 190

export function createLighting({ shadowExtent = SHADOW_EXTENT } = {}) {
  // 太阳（白天）/ 月亮（夜里）共用一盏平行光，靠 applyLightPhase 换颜色和方向
  const sun = new THREE.DirectionalLight(0xffffff, DAY_NIGHT.sunIntensity[0])
  sun.position.set(...DAY_NIGHT.sunPosition[0])
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.7 // 低多边形模型的面很大，没有这个会满屏阴影痤疮
  sun.shadow.radius = 2.5

  // 平行光的阴影相机是正交相机，默认只有 ±5 —— 不设边界的话阴影只覆盖场景中心一小块
  const shadowCamera = sun.shadow.camera
  shadowCamera.left = -shadowExtent
  shadowCamera.right = shadowExtent
  shadowCamera.top = shadowExtent
  shadowCamera.bottom = -shadowExtent
  shadowCamera.near = 1
  shadowCamera.far = shadowExtent * 3
  shadowCamera.updateProjectionMatrix() // 改完必须手动调，渲染器不会替你调

  // 半球光：天光/地面反射，负责把阴影里的死黑提亮（这是低多边形风格的关键）
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, DAY_NIGHT.hemiIntensity[0])

  const ambient = new THREE.AmbientLight(0xffffff, DAY_NIGHT.ambientIntensity[0])

  return { sun, hemi, ambient }
}

/**
 * @param {number} t 0 = 白天，1 = 夜晚
 */
export function applyLightPhase(lighting, t) {
  const { sun, hemi, ambient } = lighting
  const mix = (pair) => THREE.MathUtils.lerp(pair[0], pair[1], t)

  sun.color.copy(new THREE.Color(DAY_NIGHT.sunColor[0])).lerp(new THREE.Color(DAY_NIGHT.sunColor[1]), t)
  sun.intensity = mix(DAY_NIGHT.sunIntensity)
  sun.position.set(
    THREE.MathUtils.lerp(DAY_NIGHT.sunPosition[0][0], DAY_NIGHT.sunPosition[1][0], t),
    THREE.MathUtils.lerp(DAY_NIGHT.sunPosition[0][1], DAY_NIGHT.sunPosition[1][1], t),
    THREE.MathUtils.lerp(DAY_NIGHT.sunPosition[0][2], DAY_NIGHT.sunPosition[1][2], t),
  )

  hemi.color.copy(new THREE.Color(DAY_NIGHT.hemiSky[0])).lerp(new THREE.Color(DAY_NIGHT.hemiSky[1]), t)
  hemi.groundColor.copy(new THREE.Color(DAY_NIGHT.hemiGround[0])).lerp(new THREE.Color(DAY_NIGHT.hemiGround[1]), t)
  hemi.intensity = mix(DAY_NIGHT.hemiIntensity)

  ambient.intensity = mix(DAY_NIGHT.ambientIntensity)
}

/** 场景背景 + 雾一起跟着页面底色走，页面和画布才不会有色差 */
export function createSceneShell(lighting, { fogNear, fogFar }) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(DAY_NIGHT.page[0])
  scene.add(lighting.sun, lighting.hemi, lighting.ambient)
  if (fogNear != null) scene.fog = new THREE.Fog(DAY_NIGHT.page[0], fogNear, fogFar)
  return scene
}
