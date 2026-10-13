import * as THREE from 'three'
import { DAY_NIGHT } from './palette.js'

/**
 * 悬浮岛。
 *
 * 形体用一条"花瓶剖面"（LatheGeometry）转出来，一次成型：
 *   从底部收尖 → 往外扩张 → 岛缘 → 再往里收成微拱的草皮顶。
 * 草皮和岛体分成两个 mesh（两种颜色），但共用岛缘那一圈顶点，接缝看不出来。
 *
 * 剖面点的顺序很讲究：两条剖面都是**沿 y 递增**方向走的，
 * 这样法线方向一致朝外，草皮才不会因为法线朝下而发黑。
 */

export const ISLAND_RADIUS = 105

/** 草皮剖面（岛缘 → 中心），按半径从大到小、高度从小到大 */
const GRASS_PROFILE = [
  [1.0, 0],
  [0.995, 0.35],
  [0.93, 0.95],
  [0.78, 1.6],
  [0.5, 2.1],
  [0.25, 2.35],
  [0, 2.5],
]

/** 岛体剖面（底部收尖 → 岛缘） */
const SOIL_PROFILE = [
  [0.04, -38],
  [0.18, -33],
  [0.4, -25],
  [0.65, -17],
  [0.85, -10],
  [0.96, -4.5],
  [1.0, -1.6],
  [1.0, 0],
]

const toPoints = (profile) => profile.map(([r, y]) => new THREE.Vector2(r * ISLAND_RADIUS, y))

/**
 * 岛上任意水平位置的地面高度（草皮是微拱的，道具要"放上去"而不是浮空）。
 * 只按离中心的距离查，忽略朝向 —— 岛是圆的，够用。
 */
export function grassHeightAt(distanceFromCenter) {
  const r = THREE.MathUtils.clamp(distanceFromCenter / ISLAND_RADIUS, 0, 1)
  const last = GRASS_PROFILE[GRASS_PROFILE.length - 1]
  for (let i = 1; i < GRASS_PROFILE.length; i++) {
    const [r0, y0] = GRASS_PROFILE[i - 1] // 靠外（半径大）
    const [r1, y1] = GRASS_PROFILE[i] // 靠内（半径小）
    if (r < r1) continue // 还在更靠里的那一段，继续往里找
    const k = (r0 - r) / (r0 - r1 || 1) // r 在这段里的比例
    return THREE.MathUtils.lerp(y0, y1, k)
  }
  return last[1]
}

/** 岛缘草皮的一条细边（让草地和土体的分界更利落） */
export function buildIsland(materials) {
  const group = new THREE.Group()

  const grass = new THREE.Mesh(new THREE.LatheGeometry(toPoints(GRASS_PROFILE), 96), materials.grass)
  grass.receiveShadow = true
  group.add(grass)

  const soil = new THREE.Mesh(new THREE.LatheGeometry(toPoints(SOIL_PROFILE), 96), materials.soil)
  soil.castShadow = true
  group.add(soil)

  return group
}

/**
 * 岛下那张"假接触阴影"：一张径向渐变的贴图贴在岛正下方。
 * 比真开一次阴影贴图便宜得多，而且是浮空岛那种悬在空中的柔和影子，
 * 真阴影反而做不出这个味道。
 */
export function createContactShadow(materials) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(24, 20, 16, 0.75)')
  gradient.addColorStop(0.45, 'rgba(24, 20, 16, 0.34)')
  gradient.addColorStop(1, 'rgba(24, 20, 16, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: DAY_NIGHT.contactShadowOpacity[0],
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND_RADIUS * 2.6, ISLAND_RADIUS * 2.6), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = -43 // 贴着岛底收尖处，太高会像漂在半空的一团灰
  mesh.renderOrder = -1 // 先画它，免得盖住岛体半透明的边

  return mesh
}

/**
 * 远处几块飘着的小岩块 —— 参考图里那种"主岛旁边还有碎块悬着"的感觉。
 * 成本极低，但一下子就有"浮空"的味道了。
 */
export function buildFloatingRocks(materials) {
  const group = new THREE.Group()
  const rocks = [
    { size: 13, position: [-128, 26, 34], speed: 0.4, phase: 0, grass: true },
    { size: 8.5, position: [118, 44, -52], speed: 0.55, phase: 1.7, grass: true },
    { size: 6, position: [96, 12, 96], speed: 0.7, phase: 3.1, grass: false },
  ]

  for (const rock of rocks) {
    // 用二十面体切一块，比方正的多面体更像石头；压扁 + 歪一点，免得三块长一个样
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(rock.size, 0), materials.soilDark)
    mesh.scale.set(1.05, 0.8, 1)
    mesh.rotation.set(rock.phase * 0.7, rock.phase * 1.3, rock.phase * 0.4)
    mesh.castShadow = true
    mesh.position.set(...rock.position)

    if (rock.grass) {
      const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(rock.size * 0.88, 0), materials.grass)
      cap.scale.set(1, 0.52, 1)
      cap.position.y = rock.size * 0.4
      cap.rotation.y = rock.phase
      mesh.add(cap)
    }

    mesh.userData.baseY = rock.position[1]
    mesh.userData.speed = rock.speed
    mesh.userData.phase = rock.phase
    group.add(mesh)
  }

  return group
}

/**
 * 湖：草皮是拱的，没法真"挖"一个洞（那要 CSG），
 * 所以做成一个**浅石盆**：沙色斜壁 + 水面。
 *
 * 两个必须守住的约束（第一版就是没守，结果湖里一滴水都没有）：
 *  ① 水位必须高过盆底脚印范围内**最高的那圈草**，否则水整片埋在草地下面；
 *  ② 盆壁是开口圆台，从上方看到的是**内壁（背面）**，
 *     材质必须 DoubleSide，不然望着水面四周是空的。
 */
export function createPond(materials, { x, z, radius }) {
  const group = new THREE.Group()
  const distance = Math.hypot(x, z)

  // 脚印里离岛心最近的那一圈草最高（草皮是往中心拱的）
  const highestGrass = grassHeightAt(Math.max(0, distance - radius * 1.3))
  const rimY = highestGrass + 0.35
  const waterY = rimY - 0.55
  const bottomY = waterY - 2.8

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.3, radius * 0.97, rimY - bottomY, 44, 1, true),
    materials.pondWall,
  )
  bowl.position.y = (rimY + bottomY) / 2
  group.add(bowl)

  const water = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.02, 44).rotateX(-Math.PI / 2), materials.water)
  water.position.y = waterY
  group.add(water)

  // 岸边一圈石缘
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.3, 0.55, 6, 44).rotateX(Math.PI / 2),
    materials.soilDark,
  )
  rim.position.y = rimY
  group.add(rim)

  group.position.set(x, 0, z)
  return group
}

/** 小岛/岩块的上下浮动（在渲染循环里调） */
export function animateFloatingRocks(group, elapsed) {
  for (const rock of group.children) {
    rock.position.y = rock.userData.baseY + Math.sin(elapsed * rock.userData.speed + rock.userData.phase) * 3.2
    rock.rotation.y = elapsed * rock.userData.speed * 0.12
  }
}
