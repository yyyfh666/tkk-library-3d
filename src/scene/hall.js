import * as THREE from 'three'

/**
 * 五楼大厅（室内）。风格和岛上一套：低多边形、平涂、无天花板（娃娃屋式切角）。
 *
 * ⚠️ 这里是**示意性重建**：没有该大厅的图纸或实测数据，家具布置是按"图书馆阅览大厅"
 * 的常识摆的，不是实景还原。对外别说成"还原实景"。
 *
 * 三件事必须成立，否则一眼就看出是假的：
 *  ① 中庭挑空要真的挖空（能看见下一层），否则只是个平面
 *  ② 书架上的书要有颜色（整间屋子唯一的彩色来源）
 *  ③ 机器人要真的在动
 */

export const HALL = { width: 96, depth: 64, wallHeight: 15, atriaHalfX: 15, atriaHalfZ: 9 }

const rand = (() => {
  let seed = 771028
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
})()
const range = (a, b) => a + rand() * (b - a)

/* ------------------------------------------------------------------ *
 * 零件
 * ------------------------------------------------------------------ */

/** 一张阅览长桌：桌面 + 四条腿 */
function createTable(materials, length = 14, width = 5) {
  const group = new THREE.Group()
  const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.6, width), materials.desk)
  top.position.y = 5
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5, 0.7), materials.desk)
      leg.position.set(sx * (length / 2 - 1), 2.5, sz * (width / 2 - 0.8))
      group.add(leg)
    }
  }

  // 桌上摊几本书，纯装饰
  for (let i = 0; i < 3; i++) {
    const book = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.3), bookMaterial(materials))
    book.position.set(range(-length / 2 + 2, length / 2 - 2), 5.45, range(-width / 2 + 1, width / 2 - 1))
    book.rotation.y = range(-0.4, 0.4)
    group.add(book)
  }

  return group
}

function bookMaterial(materials) {
  const books = [materials.bookA, materials.bookB, materials.bookC, materials.bookD]
  return books[Math.floor(rand() * books.length)]
}

/** 椅子：坐板 + 靠背 + 四条腿 */
function createChair(materials) {
  const group = new THREE.Group()
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 3), materials.chair)
  seat.position.y = 2.6
  seat.castShadow = true
  group.add(seat)

  const back = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 0.5), materials.chair)
  back.position.set(0, 4.4, -1.25)
  group.add(back)

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), materials.chair)
      leg.position.set(sx * 1.2, 1.3, sz * 1.2)
      group.add(leg)
    }
  }
  return group
}

/** 书架：柜体 + 隔板 + 一排排书（书是随机高矮的细长盒子） */
function createShelf(materials, width = 13) {
  const group = new THREE.Group()
  const height = 11
  const depth = 3

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials.shelf)
  body.position.y = height / 2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const levels = 4
  for (let level = 0; level < levels; level++) {
    const y = 1.6 + level * 2.6
    const board = new THREE.Mesh(new THREE.BoxGeometry(width - 1, 0.25, depth + 0.7), materials.floorDark)
    board.position.set(0, y, 0.3)
    group.add(board)

    // 每层摆书：宽度随机、颜色随机
    let x = -width / 2 + 1.2
    while (x < width / 2 - 1.6) {
      const bookWidth = range(0.35, 0.85)
      const bookHeight = range(1.5, 2.1)
      const book = new THREE.Mesh(new THREE.BoxGeometry(bookWidth, bookHeight, 1.6), bookMaterial(materials))
      book.position.set(x + bookWidth / 2, y + bookHeight / 2 + 0.15, 0.6)
      group.add(book)
      x += bookWidth + 0.08
    }
  }

  return group
}

/** 吊灯：细杆 + 灯罩 + 发光的灯泡（夜里靠 lampGlass 亮） */
function createPendantLamp(materials, ceilingY) {
  const group = new THREE.Group()
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.5, 5), materials.metal)
  wire.position.y = ceilingY - 2.75
  group.add(wire)

  const shade = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.8, 12, 1, true), materials.lampGlass)
  shade.position.y = ceilingY - 5.8
  group.add(shade)

  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), materials.lampGlass)
  bulb.position.y = ceilingY - 6.3
  group.add(bulb)

  return group
}

/** 导览机器人：底座 + 身子 + 头 + 两只眼睛 + 天线（会沿着路线滑） */
function createRobot(materials) {
  const group = new THREE.Group()

  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 1, 14), materials.chair)
  base.position.y = 0.5
  base.castShadow = true
  group.add(base)

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 3.6, 14), materials.robotBody)
  body.position.y = 2.8
  body.castShadow = true
  group.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(1.75, 14, 10), materials.robotBody)
  head.position.y = 5.9
  head.scale.y = 0.86
  head.castShadow = true
  group.add(head)

  const visor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.7), materials.robotAccent)
  visor.position.set(0, 5.9, 1.4)
  group.add(visor)

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), materials.robotEye)
    eye.position.set(sx * 0.75, 5.95, 1.75)
    group.add(eye)

    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.8, 4, 8), materials.robotBody)
    arm.position.set(sx * 2.2, 3.2, 0)
    arm.rotation.z = sx * 0.3
    group.add(arm)
  }

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 5), materials.metal)
  antenna.position.y = 7.4
  group.add(antenna)

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), materials.robotAccent)
  tip.position.y = 8.2
  group.add(tip)

  return group
}

/** VR 阅读位：一张躺椅 + 头显 */
function createVrSeat(materials) {
  const group = new THREE.Group()

  const seat = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4.4), materials.vrChair)
  seat.position.y = 1.6
  seat.castShadow = true
  group.add(seat)

  const back = new THREE.Mesh(new THREE.BoxGeometry(4, 4.6, 0.9), materials.vrChair)
  back.position.set(0, 3.6, -1.9)
  back.rotation.x = -0.22
  group.add(back)

  for (const sx of [-1, 1]) {
    const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 3.6), materials.vrChair)
    armrest.position.set(sx * 2.1, 2.4, 0)
    group.add(armrest)
  }

  const headset = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1, 1.2), materials.vrHeadset)
  headset.position.set(0, 5.6, -0.6)
  headset.rotation.x = -0.3
  group.add(headset)

  return group
}

function createPlant(materials) {
  const group = new THREE.Group()
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.1, 2, 10), materials.wood)
  pot.position.y = 1
  pot.castShadow = true
  group.add(pot)

  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), materials.leaf)
  bush.position.y = 4
  bush.castShadow = true
  group.add(bush)

  const bush2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), materials.leafLight)
  bush2.position.set(1, 5.6, -0.6)
  group.add(bush2)

  return group
}

/* ------------------------------------------------------------------ *
 * 组装
 * ------------------------------------------------------------------ */

export function buildHall(materials) {
  const group = new THREE.Group()
  const { width, depth, wallHeight, atriaHalfX, atriaHalfZ } = HALL
  const halfW = width / 2
  const halfD = depth / 2

  // —— 地板：绕着中庭挑空铺四块，中间真的是空的 ——
  const floorStrips = [
    { w: width, d: halfD - atriaHalfZ, x: 0, z: -(atriaHalfZ + (halfD - atriaHalfZ) / 2) },
    { w: width, d: halfD - atriaHalfZ, x: 0, z: atriaHalfZ + (halfD - atriaHalfZ) / 2 },
    { w: halfW - atriaHalfX, d: atriaHalfZ * 2, x: -(atriaHalfX + (halfW - atriaHalfX) / 2), z: 0 },
    { w: halfW - atriaHalfX, d: atriaHalfZ * 2, x: atriaHalfX + (halfW - atriaHalfX) / 2, z: 0 },
  ]
  for (const strip of floorStrips) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(strip.w, 1.2, strip.d), materials.floor)
    slab.position.set(strip.x, -0.6, strip.z)
    slab.receiveShadow = true
    group.add(slab)
  }

  // 下一层楼板（从挑空往下看到的）
  const lowerFloor = new THREE.Mesh(new THREE.BoxGeometry(width - 8, 1, depth - 8), materials.floorLower)
  lowerFloor.position.y = -15
  lowerFloor.receiveShadow = true
  group.add(lowerFloor)

  // —— 四面墙。南墙留出入口，所以拆成左右两段 + 上方的过梁 ——
  // 每一面各自成组，为的是运行时按相机方位把它们单独藏掉（娃娃屋的做法，见 updateWalls）
  const DOORWAY_HALF = 12
  const walls = { north: new THREE.Group(), south: new THREE.Group(), east: new THREE.Group(), west: new THREE.Group() }

  for (const spec of [
    { key: 'north', w: width, d: 1.6, x: 0, z: -halfD },
    { key: 'west', w: 1.6, d: depth, x: -halfW, z: 0 },
    { key: 'east', w: 1.6, d: depth, x: halfW, z: 0 },
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(spec.w, wallHeight, spec.d), materials.wall)
    wall.position.set(spec.x, wallHeight / 2, spec.z)
    wall.receiveShadow = true
    walls[spec.key].add(wall)
  }

  const segmentWidth = halfW - DOORWAY_HALF
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(segmentWidth, wallHeight, 1.6), materials.wall)
    wall.position.set(sx * (DOORWAY_HALF + segmentWidth / 2), wallHeight / 2, halfD)
    wall.receiveShadow = true
    walls.south.add(wall)
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOORWAY_HALF * 2, 4, 1.6), materials.wall)
  lintel.position.set(0, wallHeight - 2, halfD)
  walls.south.add(lintel)

  // 南墙上的竖向玻璃（对应主立面的那道天窗，白天采光、夜里亮）
  const glass = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 1), materials.window)
  glass.position.set(0, 11, halfD + 0.6)
  walls.south.add(glass)

  for (const wall of Object.values(walls)) group.add(wall)

  // —— 中庭挑空的栏杆 ——
  const railHeight = 3.4
  const railSpecs = [
    { w: atriaHalfX * 2 + 2, d: 0.5, x: 0, z: -atriaHalfZ - 0.4 },
    { w: atriaHalfX * 2 + 2, d: 0.5, x: 0, z: atriaHalfZ + 0.4 },
    { w: 0.5, d: atriaHalfZ * 2 + 2, x: -atriaHalfX - 0.4, z: 0 },
    { w: 0.5, d: atriaHalfZ * 2 + 2, x: atriaHalfX + 0.4, z: 0 },
  ]
  for (const spec of railSpecs) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(spec.w, 0.4, spec.d), materials.metal)
    rail.position.set(spec.x, railHeight, spec.z)
    group.add(rail)

    // 栏杆立柱
    const posts = 8
    const along = spec.w > spec.d ? spec.w : spec.d
    for (let i = 0; i <= posts; i++) {
      const t = (i / posts - 0.5) * along
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, railHeight, 0.22), materials.metal)
      post.position.set(spec.x + (spec.w > spec.d ? t : 0), railHeight / 2, spec.z + (spec.w > spec.d ? 0 : t))
      group.add(post)
    }
  }

  // —— 书架：北墙一排 + 东西墙各两排 ——
  for (let i = 0; i < 5; i++) {
    const shelf = createShelf(materials)
    shelf.position.set(-38 + i * 19, 0, -halfD + 4.2)
    group.add(shelf)
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const shelf = createShelf(materials, 12)
      shelf.position.set(sx * (halfW - 4.2), 0, -20 + i * 15)
      shelf.rotation.y = Math.PI / 2
      group.add(shelf)
    }
  }

  // —— 阅览长桌 + 椅子 ——
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const z = -22 + i * 16
      const x = sx * 26
      const table = createTable(materials)
      table.position.set(x, 0, z)
      group.add(table)

      for (let c = 0; c < 3; c++) {
        for (const side of [-1, 1]) {
          const chair = createChair(materials)
          chair.position.set(x - 5 + c * 5, 0, z + side * 4.4)
          chair.rotation.y = side > 0 ? Math.PI : 0
          group.add(chair)
        }
      }
    }
  }

  // —— 靠南窗的一排单人格 ——
  for (let i = 0; i < 6; i++) {
    const x = -35 + i * 14
    const desk = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 5), materials.desk)
    desk.position.set(x, 5, halfD - 6)
    desk.castShadow = true
    group.add(desk)

    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.4, 5), materials.desk)
    divider.position.set(x + 4.6, 6.4, halfD - 6)
    group.add(divider)

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.6), materials.lampGlass)
    lamp.position.set(x - 2, 6.6, halfD - 6)
    group.add(lamp)

    const chair = createChair(materials)
    chair.position.set(x, 0, halfD - 10.5)
    group.add(chair)
  }

  // —— 服务台（入口东侧）——
  const counterA = new THREE.Mesh(new THREE.BoxGeometry(14, 4.4, 3.4), materials.wood)
  counterA.position.set(20, 2.2, halfD - 16)
  counterA.castShadow = true
  group.add(counterA)

  const counterB = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.4, 12), materials.wood)
  counterB.position.set(26.8, 2.2, halfD - 21.6)
  group.add(counterB)

  // —— VR 阅读区（西侧角落）——
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(24, 20).rotateX(-Math.PI / 2), materials.rug)
  rug.position.set(-32, 0.1, 16)
  rug.receiveShadow = true
  group.add(rug)

  for (let i = 0; i < 3; i++) {
    const seat = createVrSeat(materials)
    seat.position.set(-40 + i * 8, 0, 18)
    seat.rotation.y = -0.35
    group.add(seat)
  }

  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 16), materials.screen)
  screen.position.set(-halfW + 1.6, 7, 16)
  group.add(screen)

  // —— 绿植 ——
  for (const [x, z] of [
    [-44, -27],
    [44, -27],
    [44, 27],
    [-16, halfD - 5],
    [16, halfD - 5],
  ]) {
    const plant = createPlant(materials)
    plant.position.set(x, 0, z)
    group.add(plant)
  }

  // —— 吊灯 ——
  for (const x of [-30, 0, 30]) {
    for (const z of [-20, 0, 20]) {
      if (Math.abs(x) < atriaHalfX + 4 && Math.abs(z) < atriaHalfZ + 4) continue // 别吊在挑空上
      group.add(createPendantLamp(materials, wallHeight))
    }
  }

  // —— 导览机器人 ——
  const robot = createRobot(materials)
  robot.position.set(6, 0, 4)
  group.add(robot)

  return { group, robot, walls }
}

/**
 * 娃娃屋的看家本领：**相机在哪一侧，就把那一侧的墙藏掉**。
 * 不这么做的话，正对镜头的近侧墙会把半个屋子挡得严严实实
 * （第一版就是这样：南墙成了一整片灰墙，家具全在它后面）。
 */
export function updateWalls(walls, cameraPosition) {
  const margin = 8
  walls.south.visible = cameraPosition.z <= HALL.depth / 2 - margin
  walls.north.visible = cameraPosition.z >= -HALL.depth / 2 + margin
  walls.east.visible = cameraPosition.x <= HALL.width / 2 - margin
  walls.west.visible = cameraPosition.x >= -HALL.width / 2 + margin
}

/**
 * 机器人的巡航：沿一个小椭圆走圈，边走边轻轻浮动，头朝着**行进方向**。
 * 机器人的脸朝 +z，所以朝向角就是 atan2(速度x, 速度z)。
 */
export function driveRobot(robot, elapsed) {
  const radiusX = 24
  const radiusZ = 12
  const angle = elapsed * 0.16
  robot.position.set(Math.cos(angle) * radiusX, Math.sin(elapsed * 2.4) * 0.25, Math.sin(angle) * radiusZ)

  // 椭圆参数方程对角度求导 = 速度方向
  robot.rotation.y = Math.atan2(-Math.sin(angle) * radiusX, Math.cos(angle) * radiusZ)
}
