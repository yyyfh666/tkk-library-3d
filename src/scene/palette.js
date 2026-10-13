/**
 * 全场景唯一的调色板。
 *
 * 配色依据：三视图的图例（红瓦屋顶 / 白墙或浅色外墙 / 中央蓝玻璃天窗）+ 外观照片
 * （闽南红瓦、暖白墙、深蓝灰玻璃、灰色石板广场、南方校园的棕榈）。
 *
 * 昼夜两套值都写在这里，materials.js 按这里的 day/night 生成材质，
 * 切换昼夜时只做插值，不在场景里到处写 if (isNight)。
 */

export const C = {
  // —— 自然 ——
  grass: '#8CBF6E',
  grassDark: '#6E9E55',
  grassLight: '#A3CE84',
  soil: '#E0D2B8', // 岛体下部的土石色，参考图里也是这种米白
  soilDark: '#C9B694',
  water: '#82BBD0',
  waterDeep: '#5E96AE',
  sand: '#E6D9BE',

  // —— 建筑 ——
  wall: '#F6F3EC', // 白墙（带一点暖调，纯白在场景里会发死）
  wallShade: '#DFD8CA',
  gold: '#C9A227', // 门口那枚圆形徽记
  roof: '#C4573A', // 闽南红瓦
  roofDark: '#9E4229',
  glass: '#4E6E8C', // 深蓝灰玻璃（不是亮蓝——照片里是这种压下去的蓝）
  stone: '#D9D3C6', // 石板广场 / 台基
  stoneDark: '#BDB5A5',
  metal: '#9CA5AD',

  // —— 植物与街道家具 ——
  leaf: '#4F7F45',
  leafLight: '#6FA05A',
  palmLeaf: '#5C8F4A',
  trunk: '#A9805A',
  wood: '#A97C4E',

  // —— 室内（旧版大厅用；重建后的大厅改用下面 hall* 一组）——
  floor: '#CBB894', // 五楼大厅水磨石/木地板（别太浅，室内顶光下会洗成白色）
  floorDark: '#C0AE90',
  shelf: '#A97C4E',
  book1: '#C4573A',
  book2: '#4E6E8C',
  book3: '#D9A441',
  book4: '#6E9E55',
  desk: '#E8E2D4',
  chair: '#7A93A8',
  robotBody: '#F0F2F4',
  robotAccent: '#FF8A1F',
  vrChair: '#5B6E8C',
  rug: '#C97F5A',

  // —— 三楼大厅重建版（配色依据：参考资料/实拍照片 01–12）——
  hallBrick: '#B2603F', // 红砖墩柱 / 砖墙（照片 07/08 的暖砖红）
  hallMortar: '#C9C2B4', // 砖缝：照片里砖缝比砖面**亮**
  hallWall: '#F4F1E9', // 白墙灰泥
  hallWood: '#6E4B33', // 深胡桃木书架端板（照片 01/05）
  hallRailWood: '#96633A', // 栏杆木扶手，比书架亮一档
  hallFloor: '#E4DED2', // 抛光白瓷砖（照片 06/11 的地面）
  hallFloorDark: '#3B3835', // 中庭深色拼花砖（照片 08）
  hallFloorRing: '#D9D4C8', // 深色砖上的白圈纹样
  hallGranite: '#A8A29A', // 花岗岩：柱基 / 栏杆压顶
  hallCeiling: '#F2EFE8', // 白色格栅吊顶（照片 02）
  hallCeilingBar: '#C9C5BC', // 吊顶格栅压条
  hallTrim: '#8E8A82', // 收边 / 踢脚
  hallLeaf: '#5E8A46', // 垂吊绿植（照片 03/04 的标志性垂蔓）
  hallSky: '#EDF2F6', // 窗外背景·昼
  hallTrees: '#6E9950', // 窗外背景·树带

  // —— 光照/天空（scene.background 与页面底色共用，切换时一起插值）——
  pageDay: '#F4EFE7', // 米白：参考图白天整页就是这个底色，没有"天空"
  pageNight: '#0C1420', // 深藏蓝：夜里整页切过去
  sunDay: '#FFF3DF',
  sunNight: '#9FB8E0',
  skyDay: '#FFFFFF',
  skyNight: '#2A3A55',
  groundDay: '#D8CDBB',
  groundNight: '#151C28',
}

/**
 * 场景级的昼夜量（光照 + 页面底色 + 接触阴影）。
 *
 * 注意分工：**单个材质的昼夜色在 materials.js 里**（那边是一个材质一行，好对照），
 * 这里只放"整个场景一起变"的东西。
 */
export const DAY_NIGHT = {
  page: [C.pageDay, C.pageNight], // 页面底色 = 场景背景色，两者必须一起插值，否则接缝会露馅
  sunColor: [C.sunDay, C.sunNight],
  hemiSky: [C.skyDay, C.skyNight],
  hemiGround: [C.groundDay, C.groundNight],
  /**
   * 光强。注意 three r155 之后是物理光照单位，**平行光 intensity=1 就等于"表面全亮"**，
   * 所以 sun + hemi + ambient 的总和要控制在 1.3 上下 —— 加起来超过 2 的话，
   * 白墙和浅绿会在阳光下直接过曝成纯白（第一版就是栽在这，树冠全白）。
   */
  sunIntensity: [1.32, 0.45],
  hemiIntensity: [0.36, 0.34],
  ambientIntensity: [0.11, 0.13],
  // 太阳/月亮的方向：夜里挪到另一侧，让影子翻个面，切换时"有戏"
  sunPosition: [
    [70, 110, 55],
    [-60, 95, -40],
  ],
  /** 岛下那张假接触阴影的不透明度 */
  contactShadowOpacity: [0.5, 0.62],
}
