import { useEffect, useRef, useState } from 'react'

/**
 * ?diag=1 —— 远程排查面板。
 *
 * 这个项目最难受的一类反馈是"我点不动 / 拖不动"，而现场在别人电脑上。
 * 面板把最关键的四件事摆在屏幕上：帧率、绘制分辨率、GPU 名字（是不是软件渲染）、
 * 指针锁有没有被占住，以及鼠标事件到底有没有进到页面。
 * 全部 pointer-events:none，不影响被测页面本身的交互。
 */

/** 取 WebGL 的显卡名：出现 "SwiftShader / llvmpipe / Basic Render" 就说明没吃到硬件加速 */
function gpuName() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return '无 WebGL'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return String(name)
  } catch {
    return '未知'
  }
}

export default function Diag({ worldRef }) {
  const [info, setInfo] = useState(null)
  const counts = useRef({ pointerdown: 0, pointermove: 0, click: 0, wheel: 0 })

  useEffect(() => {
    const bump = (key) => () => {
      counts.current[key] += 1
    }
    const opts = { capture: true, passive: true }
    const handlers = {
      pointerdown: bump('pointerdown'),
      pointermove: bump('pointermove'),
      click: bump('click'),
      wheel: bump('wheel'),
    }
    for (const [type, fn] of Object.entries(handlers)) window.addEventListener(type, fn, opts)

    let frames = 0
    let since = performance.now()
    let raf = 0
    const tick = () => {
      frames += 1
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const timer = window.setInterval(() => {
      const now = performance.now()
      const fps = (frames * 1000) / Math.max(now - since, 1)
      frames = 0
      since = now
      const canvas = document.querySelector('.stage canvas')
      const quality = worldRef?.current?.quality?.() ?? null
      setInfo({
        fps,
        engineFps: quality?.fps ?? 0,
        pixelRatio: quality ? quality.pixelRatio : window.devicePixelRatio,
        dpr: window.devicePixelRatio,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        canvas: canvas ? `${canvas.width}×${canvas.height}` : '—',
        gpu: gpuName(),
        locked: document.pointerLockElement ? '锁定中' : '无',
        scene: worldRef?.current?.activeName ?? '—',
        counts: { ...counts.current },
      })
    }, 600)

    return () => {
      for (const [type, fn] of Object.entries(handlers)) window.removeEventListener(type, fn, opts)
      cancelAnimationFrame(raf)
      window.clearInterval(timer)
    }
  }, [worldRef])

  if (!info) return null
  const rows = [
    ['FPS', `${Math.round(info.fps)}  (引擎 ${info.engineFps})`],
    ['像素比', `${Number(info.pixelRatio).toFixed(2)}  (dpr ${info.dpr})`],
    ['视口', info.viewport],
    ['画布', info.canvas],
    ['场景', info.scene],
    ['指针锁', info.locked],
    ['GPU', info.gpu],
    ['事件', `down ${info.counts.pointerdown} · click ${info.counts.click} · wheel ${info.counts.wheel} · move ${info.counts.pointermove}`],
  ]
  return (
    <div className="diag">
      {rows.map(([key, value]) => (
        <div className="diag__row" key={key}>
          <span className="diag__key">{key}</span>
          <span className="diag__value">{value}</span>
        </div>
      ))}
    </div>
  )
}
