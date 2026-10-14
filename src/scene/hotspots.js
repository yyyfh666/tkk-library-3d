import * as THREE from 'three'
import { HOTSPOT_ANCHORS } from './hallLayout.js'

/**
 * 热点标注。
 *
 * 做法：**3D 只放一个小光点，文字用 HTML 标签**。
 * 理由：HTML 的字永远清晰、好排版、能直接响应 hover/click，而 3D 文字要么糊要么费劲。
 * 标签的屏幕位置由引擎每帧直接写 element.style.transform —— 不进 React 的渲染循环，
 * 所以转视角时标签跟着走，但 React 一次都不重渲染。
 *
 * ⚠️ 下面这些文案是**示意内容**，不是实测资料。交出去之前请团队按真实情况改写
 * （大厅内部的布局同样没有图纸，属于示意性重建）。
 */

export const ISLAND_HOTSPOTS = [
  {
    id: 'entrance',
    label: '主入口',
    title: '主入口 · 进大厅',
    body: '挑空中庭的入口，正对广场中轴。点开就走进去。',
    position: [0, 15, -12],
    enter: true, // 带这个标记的会被点成"走进大厅"
  },
  {
    id: 'atrium',
    label: '中央天窗',
    title: '中央玻璃天窗',
    body: '贯穿主楼正立面的竖向玻璃带，白天把光引到中庭底部。',
    position: [0, 44, -16],
  },
  {
    id: 'plaza',
    label: '中心广场',
    title: '楼前广场',
    body: '石板铺装 + 中央喷水池，集合、拍照、社团招新都在这里。',
    position: [0, 10, 32],
  },
  {
    id: 'annex',
    label: '阅览辅楼',
    title: '西侧阅览辅楼',
    body: '一层的柱廊建筑，红瓦坡顶带外廊，安静的自习区。',
    position: [-78, 14, 12],
  },
  {
    id: 'lake',
    label: '东侧湖',
    title: '东侧静水',
    body: '石缘浅池，环岛小径从旁边绕过去。',
    position: [74, 5, 26],
  },
  {
    id: 'gate',
    label: '白石牌坊',
    title: '嘉庚式白石牌坊',
    body: '四柱白色格架顶，广场南端的门户。',
    position: [0, 24, 74],
  },
]

/** 三楼大厅的热点：坐标全部来自 hallLayout（米制），改布局这里自动跟着走 */
export const HALL_HOTSPOTS = [
  {
    id: 'robot',
    label: '导览机器人',
    title: '导览机器人',
    body: '沿中庭绕圈的导览车（高度是动态锚点，跟着它走）。',
    position: [10.6, HOTSPOT_ANCHORS.robotYOffset, 8.1],
  },
  {
    id: 'vr',
    label: 'VR 阅读区',
    title: 'VR 阅读区',
    body: '西窗边的地毯上摆着三张躺椅配头显。走上地毯，幕布就会亮起来放映一部馆藏导读——可以翻页、换书。',
    position: HOTSPOT_ANCHORS.vr,
  },
  {
    id: 'atrium',
    label: '中庭挑空',
    title: '中庭挑空 · 层叠看台',
    body: '三层挑空，环廊一圈黑栏杆，廊边垂着绿植；看台一级级升上去，顶上安着那件根雕。',
    position: HOTSPOT_ANCHORS.atrium,
  },
  {
    id: 'desk',
    label: '借还服务台',
    title: '借还服务台',
    body: '入口东侧的木面台子，人工 + 自助借还机。',
    position: HOTSPOT_ANCHORS.desk,
  },
  {
    id: 'exhibit',
    label: '展览区',
    title: '展览区 · 展墙',
    body: '北墙这段是红砖展墙，挂着三幅条幅，轨道灯打在上面。',
    position: HOTSPOT_ANCHORS.exhibit,
  },
]

/**
 * 建热点的 3D 部分（光点 + 一小段引线），并管理 HTML 标签。
 * @returns {{ group, labelLayer, update, dispose, setVisible }}
 */
export function createHotspots({ container, hotspots, onSelect, dotRadius = 1.7, pickRadius = 0 }) {
  const group = new THREE.Group()

  const dotGeometry = new THREE.SphereGeometry(dotRadius, 10, 8)
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a1f })
  const haloGeometry = new THREE.SphereGeometry(dotRadius * 2, 10, 8)
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8a1f,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  })

  // 第一视角的拾取代理球：不可见，但 Raycaster 照样命中（r186 不检查 visible）。
  // 半径比光点大（0.7m 左右），走近了才好点。
  const pickGeometry = pickRadius > 0 ? new THREE.SphereGeometry(pickRadius, 8, 6) : null
  const pickMaterial = pickGeometry ? new THREE.MeshBasicMaterial() : null

  // 标签层：盖在 canvas 之上，但默认不吃鼠标事件，只有标签本身可点
  const labelLayer = document.createElement('div')
  labelLayer.className = 'hotspot-layer'
  container.appendChild(labelLayer)

  const entries = hotspots.map((config) => {
    const anchor = new THREE.Vector3(...config.position)

    const dot = new THREE.Mesh(dotGeometry, dotMaterial)
    dot.position.copy(anchor)
    group.add(dot)

    const halo = new THREE.Mesh(haloGeometry, haloMaterial)
    halo.position.copy(anchor)
    group.add(halo)

    let pick = null
    if (pickGeometry) {
      pick = new THREE.Mesh(pickGeometry, pickMaterial)
      pick.position.copy(anchor)
      pick.visible = false
      pick.userData.hotspotId = config.id
      group.add(pick)
    }

    const label = document.createElement('button')
    label.type = 'button'
    label.className = config.enter ? 'hotspot hotspot--enter' : 'hotspot'
    label.innerHTML = `<span class="hotspot__dot"></span>${config.label}`
    label.addEventListener('click', (event) => {
      event.stopPropagation()
      onSelect(config)
    })
    labelLayer.appendChild(label)

    return { config, anchor, dot, halo, pick, label, visible: true }
  })

  const projected = new THREE.Vector3()
  const TARGET_APPARENT = 0.0118 // 期望的"角大小"（世界尺寸 / 距离），约等于屏幕上恒定的一小点

  return {
    group,
    labelLayer,
    entries,
    /** 让某个热点的锚点跟着动的东西走（比如巡航中的机器人） */
    updateAnchor(id, position) {
      const entry = entries.find((item) => item.config.id === id)
      if (!entry) return
      entry.anchor.set(position[0], position[1], position[2])
      entry.dot.position.copy(entry.anchor)
      entry.halo.position.copy(entry.anchor)
      entry.pick?.position.copy(entry.anchor)
    },
    /** 每帧调一次：把 3D 锚点投影成屏幕坐标，写进标签的 transform */
    update(camera, width, height) {
      for (const entry of entries) {
        // 光点按距离缩放，屏幕上的大小才恒定 —— 不然镜头一靠近，
        // 光点就变成一个糊在脸上的大橙球（室内"贴近"视角上真踩过）
        const distance = camera.position.distanceTo(entry.anchor)
        const markerScale = THREE.MathUtils.clamp((distance * TARGET_APPARENT) / dotRadius, 0.28, 8)
        entry.dot.scale.setScalar(markerScale)
        entry.halo.scale.setScalar(markerScale)

        projected.copy(entry.anchor).project(camera)

        const behind = projected.z > 1
        const x = (projected.x * 0.5 + 0.5) * width
        const y = (-projected.y * 0.5 + 0.5) * height
        const offscreen = x < -60 || x > width + 60 || y < -60 || y > height + 60

        const visible = entry.visible && !behind && !offscreen
        entry.label.style.display = visible ? '' : 'none'
        if (visible) {
          // 先移到锚点的屏幕位置，再把标签自己抬到锚点上方（百分比是相对标签自身尺寸）
          entry.label.style.transform =
            `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, calc(-100% - 16px))`
        }
      }
    },
    setVisible(next) {
      for (const entry of entries) entry.visible = next
      labelLayer.style.display = next ? '' : 'none'
      group.visible = next
    },
    /** 只切 HTML 标签层，3D 光点不动 —— 第一视角模式用（浮空按钮会压住准星） */
    setLabelsVisible(next) {
      labelLayer.style.display = next ? '' : 'none'
    },
    /** 按 id 找热点配置（第一视角的射线拾取用） */
    configById(id) {
      return entries.find((e) => e.config.id === id)?.config ?? null
    },
    dispose() {
      dotGeometry.dispose()
      dotMaterial.dispose()
      haloGeometry.dispose()
      haloMaterial.dispose()
      pickGeometry?.dispose()
      pickMaterial?.dispose()
      labelLayer.remove()
    },
  }
}
