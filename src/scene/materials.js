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
    envMapIntensity: 0.25, // 一点点环境光提亮，不然砖面死板
  },
  hallWall: {
    color: C.hallWall,
    type: 'standard',
    map: 'plaster',
    bumpMap: 'plasterBump',
    bumpScale: 0.004,
    roughness: 0.96,
    // 白墙靠这点环境反射才不"发灰"（参考照片里整厅是亮白的）。
    // 注意别给高：0.5 以上白墙就直接过曝（曝光探针的教训）
    envMapIntensity: 0.35,
  },
  hallColumn: {
    color: C.hallWall, // 白色凹槽圆柱（环廊柱），bump 是竖槽
    type: 'standard',
    map: 'plaster',
    bumpMap: 'fluteBump',
    bumpScale: 0.02,
    roughness: 0.9,
    envMapIntensity: 0.3,
  },
  hallWood: {
    color: '#FFFFFF', // 胡桃木色画在贴图里
    nightColor: '#2E241F',
    type: 'standard',
    map: 'walnut',
    bumpMap: 'walnutBump',
    bumpScale: 0.004,
    roughnessMap: 'walnutRough', // 木纹沟槽比木面哑（0.79×0.7 = 0.55，和原来一样）
    roughness: 0.7,
    envMapIntensity: 0.35, // 打蜡木面的一点点反射
  },
  hallRailWood: {
    color: C.hallRailWood,
    type: 'standard',
    map: 'walnut',
    bumpMap: 'walnutBump',
    bumpScale: 0.003,
    roughnessMap: 'walnutRough',
    roughness: 0.63, // 0.76×0.63 ≈ 原来的 0.5
    envMapIntensity: 0.4,
  },
  hallFloor: {
    color: C.hallFloor, // 近白瓷砖贴图 × 这个 tint（别调太亮，顶光下会洗白）
    type: 'standard',
    map: 'floorTile',
    bumpMap: 'floorTileBump',
    bumpScale: 0.0015,
    roughnessMap: 'floorTileRough', // 砖面抛光、砖缝哑（0.68×0.5 = 0.34，等于原来的标量）
    roughness: 0.5, // 抛光砖：低粗糙度 + envMap 才有反光
    envMapIntensity: 0.3, // 别贪高：0.75/0.45 时阳光下的镜面高光都会顶到 255（曝光探针抓到的）
  },
  hallFloorDark: {
    color: '#FFFFFF', // 深色拼花砖画在贴图里（含白圈）
    nightColor: '#23262B',
    type: 'standard',
    map: 'atriumFloor',
    bumpMap: 'atriumFloorBump',
    bumpScale: 0.002,
    roughnessMap: 'atriumFloorRough', // 砖面抛光、白圈与砖缝哑（0.62×0.42 = 0.26）
    roughness: 0.42,
    envMapIntensity: 0.35,
  },
  hallGranite: {
    color: C.hallGranite,
    type: 'standard',
    map: 'granite',
    bumpMap: 'graniteBump',
    bumpScale: 0.002,
    roughnessMap: 'graniteRough', // 石英/云母颗粒比石面哑（0.84×0.5 = 0.42）
    roughness: 0.5,
    envMapIntensity: 0.25,
  },
  hallStairTread: {
    color: '#6B625A', // 楼梯深色踏步（照片 04：深色踏面 + 浅色包边）
    type: 'standard',
    map: 'granite',
    bumpMap: 'graniteBump',
    bumpScale: 0.002,
    roughness: 0.45,
    envMapIntensity: 0.25,
  },
  hallStairNosing: { color: '#D8D2C4' }, // 踏步前缘的浅色包边
  hallCeiling: {
    color: C.hallCeiling,
    type: 'standard',
    map: 'ceiling',
    bumpMap: 'ceilingBump',
    bumpScale: 0.003,
    // 吊顶面朝下：收不到太阳、只有半球光+环境光，不补亮就是一块灰板。
    // 给一点"常亮自发光"当**室内反光的替身**（照片里整厅亮白，靠的就是天花漫反射）。
    envMapIntensity: 0.45,
    dayEmissive: '#7E7A6E',
    dayEmissiveIntensity: 1,
    nightEmissive: '#5E5648', // 夜里馆灯还亮着，吊顶不该黑下去
    nightEmissiveIntensity: 0.9,
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
  hallExhibit: { color: '#EDE6D6' }, // 展板 / 书法条幅（已并入卷轴墙，留着给别的展板用）
  hallCarving: { color: C.hallCarving }, // 根雕：深木色，不贴图（要的就是团块的剪影感）

  // —— 中庭陈设（照片 04：台阶上的小玻璃罩、台缘一排盆栽、围住展台的红绳）——
  hallGranitePolish: {
    color: C.hallGranite, // 看台踏面的抛光石：比 hallGranite 更亮更反光
    type: 'standard',
    map: 'granite',
    bumpMap: 'graniteBump',
    bumpScale: 0.002,
    roughnessMap: 'graniteRough', // 和 hallGranite 共用一张图，靠标量分光哑（0.84×0.286 ≈ 0.24）
    // ⚠️ 数值别贪：hallFloor 那句注释记着"envMap 0.75 / roughness 0.45 时阳光下的
    // 镜面高光会顶到 255"（曝光探针抓的）。这里取更糙一点、反光更弱一点。
    roughness: 0.286,
    envMapIntensity: 0.32,
  },
  hallVitrine: {
    color: '#DCEAF2',
    nightColor: '#2A3742',
    type: 'standard',
    roughness: 0.07,
    metalness: 0,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    envMapIntensity: 0.45, // 玻璃要有反光才像玻璃；罩子很小，不担心整片过曝
  },
  hallRope: { color: '#8E2230' }, // 红丝绒隔离绳：绒面不该反光，lambert 正好
  hallRelic: { color: '#FFFFFF' }, // 玻璃罩里那件"展品"：颜色走 instanceColor，材质必须纯白
  hallSofa: { color: '#8E3A34' }, // 一层回廊的暗红沙发（照片 13 里那几件）
  hallScroll: {
    color: '#FFFFFF', // 画面全在图集里；不要 envMap（纸不该反光，也别让它在洗墙光下泛白）
    nightColor: '#4A443C',
    type: 'standard',
    map: 'scrollAtlas',
    roughness: 0.88, // 纸面哑光：队友点名要的"避免反光过强"
    side: THREE.DoubleSide, // 侧面也要能看到（他要求的）；紧贴墙的平板，代价可忽略
  },
  hallCarpet: { color: '#8E2A2A' }, // 阶梯中线的红毯：布料，哑光
  hallSofaCushion: { color: '#B04E42' }, // 坐垫比沙发体亮一档，不然整只是块红砖
  hallPot: { color: '#D8CBA6' }, // 展台上的浅黄陶盆（照片里一整排就是它）
  hallShrub: {
    // ⚠️ 必须接近纯白：颜色走 InstancedMesh 的 instanceColor（同书脊的规矩）
    color: '#FFFFFF',
    nightColor: '#39442C',
    map: 'bush', // 一丛叶子的镂空贴图（十字面片用）
    alphaTest: 0.5, // 透明背景直接裁掉 —— 这就是"面片代替多边形"的关键
    side: THREE.DoubleSide,
    // 注：原来还有 flatShading: true（那是给多面体球用的），换成平面后没意义了
    // 不给 envMap：叶子不该反光（也不该在洗墙光下泛白）
  },
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
      // 粗糙度图：three 只读它的 G 通道，而且是**乘以**上面的标量（不是替换）。
      // 所以配套的标量要一起调：让"图里最光滑处 × 标量"= 原来那个值，其余更哑。
      const rough = spec.roughnessMap ? textures?.[spec.roughnessMap] : null
      if (rough) material.roughnessMap = rough
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
    // ⚠️ 记下"这张表里声明过的"环境反射强度。不能事后读 material.envMapIntensity 来判断：
    // MeshStandardMaterial 的默认值就是 1，用它当判据会把环境挂到**所有** Standard 材质上，
    // 每个面都被环境亮度整体抬亮（白墙上直接过曝 —— 曝光探针 + 射线诊断抓到的就是这个）。
    material.userData.envMapIntensity = spec.envMapIntensity ?? 0

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
    const declared = material.userData.envMapIntensity ?? 0
    if (material.isMeshStandardMaterial && declared > 0) {
      material.envMap = envMap
      material.envMapIntensity = declared
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
