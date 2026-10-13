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

  // ==================================================================
  // 三楼大厅重建版（2026-10-13，配色对照 参考资料/实拍照片）
  // 全部是 hall* 新键 —— 上面那些共享键被 library.js / props.js 引用，一律不动。
  //
  // 两种贴图策略，逐条标注：
  //  · "实物质感"材质（砖/木/石）把颜色**画进贴图**，day 色 = #FFFFFF 不调色，
  //    夜里用显式 nightColor 整体压暗；
  //  · "近白"材质（墙/吊顶/瓷砖）画浅灰贴图，颜色由 spec.color 当 tint 乘上去。
  // ==================================================================
  hallBrick: {
    color: '#FFFFFF', // 颜色画在砖贴图里（含灰色砖缝），这里不再调色
    nightColor: '#4A3129', // 夜里是"暗暖砖"，不是深蓝砖
    type: 'standard',
    map: 'brick',
    bumpMap: 'brickBump',
    bumpScale: 0.014, // 米制：砖缝约 1.4cm 起伏
    roughness: 0.93,
  },
  hallWall: {
    color: C.hallWall,
    type: 'standard',
    map: 'plaster',
    bumpMap: 'plasterBump',
    bumpScale: 0.004,
    roughness: 0.96,
  },
  hallWood: {
    color: '#FFFFFF', // 胡桃木色画在贴图里
    nightColor: '#2E241F',
    type: 'standard',
    map: 'walnut',
    bumpMap: 'walnutBump',
    bumpScale: 0.004,
    roughness: 0.55,
    envMapIntensity: 0.35, // 打蜡木面的一点点反射
  },
  hallRailWood: {
    color: C.hallRailWood,
    type: 'standard',
    map: 'walnut',
    bumpMap: 'walnutBump',
    bumpScale: 0.003,
    roughness: 0.5,
    envMapIntensity: 0.4,
  },
  hallFloor: {
    color: C.hallFloor, // 近白瓷砖贴图 × 这个 tint（别调太亮，顶光下会洗白）
    type: 'standard',
    map: 'floorTile',
    bumpMap: 'floorTileBump',
    bumpScale: 0.0015,
    roughness: 0.3, // 抛光砖：低粗糙度 + envMap 才有反光
    envMapIntensity: 0.75,
  },
  hallFloorDark: {
    color: '#FFFFFF', // 深色拼花砖画在贴图里（含白圈）
    nightColor: '#23262B',
    type: 'standard',
    map: 'atriumFloor',
    bumpMap: 'atriumFloorBump',
    bumpScale: 0.002,
    roughness: 0.24,
    envMapIntensity: 0.9,
  },
  hallGranite: {
    color: C.hallGranite,
    type: 'standard',
    map: 'granite',
    bumpMap: 'graniteBump',
    bumpScale: 0.002,
    roughness: 0.42,
    envMapIntensity: 0.55,
  },
  hallStairTread: {
    color: '#6B625A', // 楼梯深色踏步（照片 04：深色踏面 + 浅色包边）
    type: 'standard',
    map: 'granite',
    bumpMap: 'graniteBump',
    bumpScale: 0.002,
    roughness: 0.45,
    envMapIntensity: 0.5,
  },
  hallStairNosing: { color: '#D8D2C4' }, // 踏步前缘的浅色包边
  hallCeiling: {
    color: C.hallCeiling,
    type: 'standard',
    map: 'ceiling',
    bumpMap: 'ceilingBump',
    bumpScale: 0.003,
    roughness: 0.95,
  },
  hallMetal: {
    color: '#26282C', // 黑钢：栏杆 / 书架钢架
    type: 'standard',
    roughness: 0.38,
    metalness: 0.55,
    envMapIntensity: 0.7,
  },
  hallBook: {
    color: '#FFFFFF', // ⚠️ 必须纯白：书的颜色全走 InstancedMesh 的 instanceColor，
    nightColor: '#59606E', // 夜间把整片书统一压暗（色相还在，只是暗下来）
    map: 'bookSpine',
  },
  hallLeaf: {
    color: '#FFFFFF', // 绿色画在贴图里；夜里整片压成暗绿
    nightColor: '#2C3A26',
    map: 'leaf',
    alphaTest: 0.5, // 镂空叶片：透明背景直接裁掉
    side: THREE.DoubleSide,
  },
  hallBackdrop: {
    color: '#FFFFFF', // 窗外背景板：不吃光（basic），昼夜全靠 color 插值
    nightColor: '#232B3A',
    type: 'basic',
    map: 'backdrop',
    side: THREE.DoubleSide,
  },
  hallGlass: {
    color: '#C4D4DE',
    nightColor: '#22303E',
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  },
  hallSkylight: {
    color: '#DCE8F0',
    nightColor: '#1A2430',
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    nightEmissive: '#44607C', // 夜里天窗透一点月光色
    nightEmissiveIntensity: 0.45,
  },
  hallLightPanel: {
    color: '#FFFFFF', // 吊顶灯带 / 筒灯盘：白天就是白板，夜里发光（馆灯初上）
    nightColor: '#FFF6DE',
    nightEmissive: '#FFD98A',
    nightEmissiveIntensity: 1.5,
  },
  hallCurtain: { color: '#EFECE4' }, // 窗边白纱帘
  hallExhibit: { color: '#EDE6D6' }, // 展板 / 书法条幅
}

/**
 * 建出全部材质。
 *
 * 默认 MeshLambertMaterial（低多边形风格要的是哑光、没有高光，而且比 Standard 便宜）；
 * 需要贴图/反光的条目用 spec.type = 'standard'（凹凸贴图、roughness、envMap 都在这条路上）；
 * 窗外背景板这种"不吃光"的用 'basic'。
 *
 * @param {object} opts
 * @param {object|null} opts.textures createHallTextures() 的结果（贴图按名字取）
 * @param {THREE.Texture|null} opts.envMap 程序化环境反射；**逐材质挂**，
 *        绝不用 scene.environment（r186 会用 scene.environmentIntensity 覆盖 envMapIntensity）
 */
export function createMaterials({ textures = null, envMap = null } = {}) {
  const materials = {}

  for (const [key, spec] of Object.entries(SPECS)) {
    // 硬校验：new THREE.Color(undefined) 在 three 里**不报错**，静默给你白色。
    // 一旦 palette.js 里少写一个键，整个场景就会出现一片莫名其妙的白 ——
    // 这个 bug 我们真踩过（树冠全白），所以宁可在这里直接炸掉。
    if (typeof spec.color !== 'string') {
      throw new Error(`materials: "${key}" 的颜色不是字符串（值是 ${String(spec.color)}），检查 palette.js 里有没有这个键`)
    }

    const params = {
      color: new THREE.Color(spec.color),
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
      side: spec.side ?? THREE.FrontSide,
    }
    const map = spec.map ? textures?.[spec.map] : null
    if (map) params.map = map

    const type = spec.type ?? 'lambert'
    let material

    if (type === 'standard') {
      material = new THREE.MeshStandardMaterial({
        ...params,
        flatShading: spec.flatShading ?? false,
        roughness: spec.roughness ?? 0.9,
        metalness: spec.metalness ?? 0,
      })
      const bump = spec.bumpMap ? textures?.[spec.bumpMap] : null
      if (bump) {
        material.bumpMap = bump
        material.bumpScale = spec.bumpScale ?? 0.01
      }
      // envMap 在材质创建之后才可能就绪（PMREM 需要 renderer），由 attachEnvMap 补挂
      if (envMap && spec.envMapIntensity) {
        material.envMap = envMap
        material.envMapIntensity = spec.envMapIntensity
      }
    } else if (type === 'basic') {
      material = new THREE.MeshBasicMaterial(params) // 不吃光：窗外背景板专用
    } else {
      material = new THREE.MeshLambertMaterial({
        ...params,
        flatShading: spec.flatShading ?? false,
      })
      if (spec.alphaTest != null) material.alphaTest = spec.alphaTest // 垂吊绿植的镂空叶片
    }
    material.name = key // 调试用：debug 线框/控制台一眼认出材质

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
 * 给带 envMapIntensity 的 Standard 材质补挂环境反射。
 * （分开一步是为了：PMREM 要等 renderer 建好才能生成，而材质可以先建。）
 */
export function attachEnvMap(materials, envMap) {
  if (!envMap) return
  for (const material of Object.values(materials)) {
    if (material.isMeshStandardMaterial && material.envMapIntensity > 0) {
      material.envMap = envMap
      material.needsUpdate = true
    }
  }
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
    // MeshBasicMaterial 没有 emissive 属性（窗外背景板），跳过发光插值
    if (hasEmissive && material.emissive) {
      material.emissive.copy(ud.dayEmissive).lerp(ud.nightEmissive, t)
      material.emissiveIntensity = THREE.MathUtils.lerp(ud.dayEmissiveIntensity, ud.nightEmissiveIntensity, t)
    }
  }
}
