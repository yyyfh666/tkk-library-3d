import * as THREE from 'three'

/**
 * 陈嘉庚全息投影（场景三）。
 *
 * 组成：花岗岩基座 + 发光底座环 + 极淡的"光柱" + 一块全息面板（自定义 Shader）。
 * 面板的"人像"是 canvas 现画的（剪影 + 名字 + 生卒年，零外部素材），
 * Shader 负责全息味：扫描线、向上扫的亮带、半透明边缘描边、轻微抖动、随距离淡入。
 *
 * 触发在 worlds.js：相机距离 < 5m → fadeTarget = 1（淡入）+ 通知 React 弹历史时间轴。
 */

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = `
uniform sampler2D uMap;
uniform float uTime;
uniform float uFade;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.02) discard;                                    // 透明区域直接裁掉

  float scan = 0.78 + 0.22 * sin(vUv.y * 320.0 - uTime * 7.0);  // 扫描线
  float band = smoothstep(0.10, 0.0, abs(fract(vUv.y * 0.5 - uTime * 0.13) - 0.5)); // 向上扫的亮带
  float edge = smoothstep(0.5, 0.0, abs(tex.a - 0.45));         // 半透明处 = 边缘 → 描边发光
  float flicker = 0.93 + 0.07 * sin(uTime * 41.0) * sin(uTime * 13.0); // 轻微抖动，别太抖

  vec3 col = uColor * (0.8 + 0.5 * tex.r)
           + vec3(0.45, 0.85, 1.0) * band * 0.75
           + uColor * edge * 0.9;
  float alpha = uFade * flicker * tex.a * (0.55 + 0.45 * scan) * (0.75 + 0.35 * band);
  gl_FragColor = vec4(col, alpha);
}
`

/** 画"全息人像"贴图：剪影 + 名字 + 生卒年（全白，颜色交给 Shader 染） */
function drawPortraitTexture() {
  const w = 512
  const h = 640
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  // 背后光晕
  const glow = ctx.createRadialGradient(w / 2, h * 0.42, 8, w / 2, h * 0.42, w * 0.55)
  glow.addColorStop(0, 'rgba(255,255,255,0.30)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  // 肩线（中山装轮廓）
  ctx.beginPath()
  ctx.moveTo(w * 0.5 - 122, h * 0.63)
  ctx.quadraticCurveTo(w * 0.5 - 98, h * 0.445, w * 0.5 - 44, h * 0.425)
  ctx.lineTo(w * 0.5 + 44, h * 0.425)
  ctx.quadraticCurveTo(w * 0.5 + 98, h * 0.445, w * 0.5 + 122, h * 0.63)
  ctx.closePath()
  ctx.fill()
  // 头
  ctx.beginPath()
  ctx.ellipse(w / 2, h * 0.3, 52, 64, 0, 0, Math.PI * 2)
  ctx.fill()
  // 领口：用 destination-out 挖出透明度（这也是 Shader 识别"边缘"的依据）
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.moveTo(w * 0.5 - 26, h * 0.425)
  ctx.lineTo(w * 0.5, h * 0.505)
  ctx.lineTo(w * 0.5 + 26, h * 0.425)
  ctx.closePath()
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.font = 'bold 54px "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.fillText('陈嘉庚', w / 2, h * 0.77)
  ctx.font = '26px "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.fillText('1874 — 1961', w / 2, h * 0.84)
  ctx.font = '19px "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.fillText('华侨领袖 · 教育家 · 厦门大学创办人', w / 2, h * 0.9)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

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
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.1, 24), ringMat)
  ring.position.y = 0.3
  group.add(ring)

  // 光柱（很淡的锥体，把"投影"两个字说圆）
  const coneMat = new THREE.MeshBasicMaterial({ color: 0x3fb6e8, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 2.0, 20, 1, true), coneMat)
  cone.position.y = 1.35
  group.add(cone)

  // 全息面板
  const map = drawPortraitTexture()
  const panelMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uColor: { value: new THREE.Color(0x7fe0ff) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.95), panelMat)
  panel.position.y = 1.5
  panel.renderOrder = 10
  group.add(panel)

  let fade = 0
  let fadeTarget = 0

  return {
    group,
    /** 面板中心的世界坐标（做距离触发用） */
    center: new THREE.Vector3(position[0], 1.5, position[2]),
    setActive(active) {
      fadeTarget = active ? 1 : 0
    },
    get fade() {
      return fade
    },
    update(elapsed, dt) {
      fade += (fadeTarget - fade) * (1 - Math.exp(-dt / 0.35))
      panelMat.uniforms.uTime.value = elapsed
      panelMat.uniforms.uFade.value = fade
      // 悬浮：面板轻轻上下 + 底座环呼吸
      panel.position.y = 1.5 + Math.sin(elapsed * 1.1) * 0.055
      ringMat.opacity = 0.35 + 0.25 * fade + Math.sin(elapsed * 2.3) * 0.06
      coneMat.opacity = 0.04 + 0.06 * fade
      panel.visible = fade > 0.01
    },
    dispose() {
      map.dispose()
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
