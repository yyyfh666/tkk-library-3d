import * as THREE from 'three'
import { HOLO_FRAG, HOLO_VERT } from './hologramShader.js'
import { drawChapter, HOLO_FIGURE_W, HOLO_FIGURE_H } from './hologramFigures.js'
import { getHoloChapter } from '../state/holoChapters.js'

/**
 * 陈嘉庚全息投影（场景三，升级版）。
 *
 * 组成：花岗岩基座 + 发光底座环 + 极淡的"光柱" + 一块全息面板（自定义 Shader）。
 * 面板上放的是**当前章节**的 alpha 剪影图（台阶 + 演讲者 + 台下学子的背影 + 章节背景），
 * 由 `hologramShader.js` 负责色差、扫描线、上扫光带、边缘描边、能量闪烁与"进场虚化"。
 *
 * 三件事值得记一笔：
 *  · **章节贴图按需生成 + 缓存**：一个章节一张 1024×768 的 canvas，切回来不重画；
 *  · **面板比原来大一圈**（2.4×1.8）：要装下"台阶 + 人 + 听众"这一整景，不是一张头像；
 *  · 几何体一个都没加 —— 加章节只加数据 + 一张 canvas 图（约束里的"避免高面数模型"）。
 *
 * ⚠️ 画面是**示意剪影**，不是陈嘉庚先生的肖像或任何影像素材。
 */

const PANEL_W = 2.4
const PANEL_H = PANEL_W * (HOLO_FIGURE_H / HOLO_FIGURE_W) // 4:3，和贴图同比例，图片不变形
const PANEL_Y = 1.35

export function createHologram({ materials, position = [0, 0, -10.1] } = {}) {
  const group = new THREE.Group()
  group.position.set(...position)

  // 基座（花岗岩，和旁边的柱基同材质）
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.76, 0.26, 24), materials.hallGranite)
  pedestal.position.y = 0.13
  pedestal.castShadow = true
  pedestal.receiveShadow = true
  group.add(pedestal)

  // 发光底座环
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x66d9ff,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.1, 24), ringMat)
  ring.position.y = 0.3
  group.add(ring)

  // 光柱（很淡的锥体，把"投影"两个字说圆）
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0x3fb6e8,
    transparent: true,
    opacity: 0.07,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 2.0, 20, 1, true), coneMat)
  cone.position.y = 1.35
  group.add(cone)

  // —— 章节贴图：按需画、画过就缓存 ——
  const textures = new Map()
  const textureFor = (id) => {
    let tex = textures.get(id)
    if (tex) return tex
    const canvas = document.createElement('canvas')
    canvas.width = HOLO_FIGURE_W
    canvas.height = HOLO_FIGURE_H
    drawChapter(canvas.getContext('2d'), getHoloChapter(id))
    tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    textures.set(id, tex)
    return tex
  }

  let chapterId = getHoloChapter(null).id

  const panelMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: textureFor(chapterId) },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uBlur: { value: 0 },
      uAberration: { value: 0.0026 }, // 稳态色差：约 2.6px（1024 宽的图上）
      uColor: { value: new THREE.Color(0x7fe0ff) },
    },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), panelMat)
  panel.position.y = PANEL_Y
  panel.renderOrder = 10
  group.add(panel)

  let fade = 0
  let fadeTarget = 0
  let redraws = 1 // 第一张图在建材质时就画过了

  return {
    group,
    /** 面板中心的世界坐标（做距离触发用） */
    center: new THREE.Vector3(position[0], PANEL_Y, position[2]),
    setActive(active) {
      fadeTarget = active ? 1 : 0
    },
    get fade() {
      return fade
    },
    /** 换章节：只换贴图，几何体不动 */
    setChapter(id) {
      const next = getHoloChapter(id).id
      if (next === chapterId) return false
      chapterId = next
      panelMat.uniforms.uMap.value = textureFor(chapterId)
      redraws++
      return true
    },
    update(elapsed, dt) {
      fade += (fadeTarget - fade) * (1 - Math.exp(-dt / 0.35))
      panelMat.uniforms.uTime.value = elapsed
      panelMat.uniforms.uFade.value = fade
      // 进场虚化：淡入过程中把采样点拉开，画面从一团晃动的光晕收拢成实体；
      // 全亮后归零，平时一点额外开销都没有
      panelMat.uniforms.uBlur.value = (1 - fade) * 0.02
      // 悬浮：面板轻轻上下 + 底座环呼吸
      panel.position.y = PANEL_Y + Math.sin(elapsed * 1.1) * 0.055
      ringMat.opacity = 0.35 + 0.25 * fade + Math.sin(elapsed * 2.3) * 0.06
      coneMat.opacity = 0.03 + 0.04 * fade
      panel.visible = fade > 0.01
    },
    /** 给 UI / 测试钩子：当前章节、淡入进度、换了几次图 */
    state() {
      return { active: fadeTarget === 1, fade, chapterId, redraws }
    },
    dispose() {
      for (const tex of textures.values()) tex.dispose()
      textures.clear()
      panelMat.dispose()
      ringMat.dispose()
      coneMat.dispose()
      panel.geometry.dispose()
      ring.geometry.dispose()
      cone.geometry.dispose()
      pedestal.geometry.dispose()
    },
  }
}
