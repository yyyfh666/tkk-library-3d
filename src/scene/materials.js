import * as THREE from 'three'
import { C } from './palette.js'

/**
 * 全场景材质表：一个材质一行。
 *
 * 每行只需要写白天的颜色；**夜里的颜色默认自动推**（往深蓝方向压暗），
 * 只有需要特殊处理的才手写 night / nightEmissive（窗玻璃、路灯、水面这些）。
 * 这样"夜里整体变暗"是统一规则，不会这儿亮那儿暗。
 */

const NIGHT_TINT = '#1B2E4A' // 夜色：不是纯黑，是深蓝，压暗后仍然看得清轮廓
const NIGHT_DARKEN = 0.47

/** 按统一规则推夜里的颜色：往深蓝方向插值 */
function nightOf(hex, amount = NIGHT_DARKEN) {
  return new THREE.Color(hex).lerp(new THREE.Color(NIGHT_TINT), amount)
}

const SPECS = {
  // —— 岛屿与自然 ——
  grass: { color: C.grass },
  grassLight: { color: C.grassLight },
  soil: { color: C.soil },
  soilDark: { color: C.soilDark },
  sand: { color: C.sand },
  // 湖盆内壁：开口圆台从上方看到的是背面，必须双面，否则水面四周是空的
  pondWall: { color: C.sand, side: THREE.DoubleSide },
  water: {
    color: C.water,
    nightColor: '#2B4A66', // 夜里水面偏深蓝，像在反月光
    transparent: true,
    opacity: 0.92,
  },

  // —— 地面铺装 ——
  plaza: { color: C.stone },
  path: { color: C.stoneDark },
  kerb: { color: C.stoneDark },

  // —— 建筑 ——
  wall: { color: C.wall },
  wallShade: { color: C.wallShade }, // 凹进去的檐下、窗洞，用暗一档的白
  roof: { color: C.roof },
  roofDark: { color: C.roofDark }, // 屋檐内侧
  stone: { color: C.stone },
  metal: { color: C.metal },
  gold: { color: C.gold },
  window: {
    color: '#4A6785',
    nightColor: '#26364C',
    nightEmissive: '#FFC46B', // 夜里窗户整片点亮，是夜间效果的主角
    nightEmissiveIntensity: 1,
  },

  // —— 植物与街道家具 ——
  trunk: { color: C.trunk },
  leaf: { color: C.leaf },
  leafLight: { color: C.leafLight },
  palmLeaf: { color: C.palmLeaf },
  wood: { color: C.wood },
  lampGlass: {
    color: '#FFF6DE',
    nightColor: '#FFF6DE',
    nightEmissive: '#FFD98A',
    nightEmissiveIntensity: 2.2,
  },
  personA: { color: '#D9694A' },
  personB: { color: '#4E7FA8' },
  personC: { color: '#E0C56B' },

  // —— 五楼大厅室内 ——
  floor: { color: C.floor },
  floorDark: { color: C.floorDark },
  // 挑空底下那层楼板。不能用浅色：大厅没有天花板，阳光会直射到它上面，
  // 浅色会亮成一张铺在屋中间的白桌子（看着像家具，不像"底下还有一层"）
  floorLower: { color: '#7C6E58' },
  shelf: { color: C.shelf },
  bookA: { color: C.book1 },
  bookB: { color: C.book2 },
  bookC: { color: C.book3 },
  bookD: { color: C.book4 },
  desk: { color: C.desk },
  chair: { color: C.chair },
  rug: { color: C.rug },
  robotBody: { color: C.robotBody },
  robotAccent: { color: C.robotAccent },
  robotEye: {
    color: '#2A3742',
    nightColor: '#2A3742',
    nightEmissive: '#7FE3FF',
    nightEmissiveIntensity: 1.4,
  },
  vrChair: { color: C.vrChair },
  vrHeadset: { color: '#EAEFF4' },
  screen: {
    color: '#33506B',
    nightColor: '#33506B',
    nightEmissive: '#8FD6FF',
    nightEmissiveIntensity: 0.9,
  },
}

/**
 * 建出全部材质。默认 MeshLambertMaterial（低多边形风格要的是哑光、没有高光，
 * 而且比 Standard 便宜一大截）。
 */
export function createMaterials() {
  const materials = {}

  for (const [key, spec] of Object.entries(SPECS)) {
    // 硬校验：new THREE.Color(undefined) 在 three 里**不报错**，静默给你白色。
    // 一旦 palette.js 里少写一个键，整个场景就会出现一片莫名其妙的白 ——
    // 这个 bug 我们真踩过（树冠全白），所以宁可在这里直接炸掉。
    if (typeof spec.color !== 'string') {
      throw new Error(`materials: "${key}" 的颜色不是字符串（值是 ${String(spec.color)}），检查 palette.js 里有没有这个键`)
    }

    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(spec.color),
      flatShading: spec.flatShading ?? false,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
      side: spec.side ?? THREE.FrontSide,
    })

    // 把昼夜两端压在 userData 上，避免每帧 new Color 造成 GC 抖动
    material.userData.day = new THREE.Color(spec.color)
    material.userData.night = spec.nightColor ? new THREE.Color(spec.nightColor) : nightOf(spec.color)
    material.userData.dayEmissive = new THREE.Color(spec.dayEmissive ?? '#000000')
    material.userData.nightEmissive = new THREE.Color(spec.nightEmissive ?? '#000000')
    material.userData.dayEmissiveIntensity = spec.dayEmissiveIntensity ?? 0
    material.userData.nightEmissiveIntensity = spec.nightEmissiveIntensity ?? 0

    materials[key] = material
  }

  return materials
}

/**
 * 把全部材质插值到昼夜之间的某个位置。
 * @param {number} t 0 = 白天，1 = 夜晚
 */
export function applyMaterialPhase(materials, t) {
  for (const material of Object.values(materials)) {
    const ud = material.userData
    material.color.copy(ud.day).lerp(ud.night, t)

    const hasEmissive = ud.nightEmissiveIntensity > 0 || ud.dayEmissiveIntensity > 0
    if (hasEmissive) {
      material.emissive.copy(ud.dayEmissive).lerp(ud.nightEmissive, t)
      material.emissiveIntensity = THREE.MathUtils.lerp(ud.dayEmissiveIntensity, ud.nightEmissiveIntensity, t)
    }
  }
}
