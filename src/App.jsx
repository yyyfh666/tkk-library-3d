import { useCallback, useEffect, useRef, useState } from 'react'
import { createAppWorld } from './scene/createWorld.js'
import { ISLAND_HOTSPOTS, HALL_HOTSPOTS } from './scene/hotspots.js'
import IntroPanel from './ui/IntroPanel.jsx'
import HotspotChips from './ui/HotspotChips.jsx'
import InfoCard from './ui/InfoCard.jsx'
import { SceneControls, Hint } from './ui/Controls.jsx'

export default function App() {
  const containerRef = useRef(null)
  const worldRef = useRef(null)

  const [isNight, setIsNight] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [selected, setSelected] = useState(null)
  const [scene, setScene] = useState('island') // island | hall
  const [fading, setFading] = useState(false)
  const [ready, setReady] = useState(false) // world 建好之前"走进大厅"要禁用
  const [walk, setWalk] = useState({ active: false, locked: false }) // 第一视角状态
  const [walkHover, setWalkHover] = useState(null) // 准星指着哪个热点

  useEffect(() => {
    const world = createAppWorld({
      container: containerRef.current,
      // 场景里的圆点被点时，引擎直接回调过来
      onHotspotSelect: (hotspot) => {
        setSelected(hotspot)
        worldRef.current?.worlds.island.focusOn(hotspot.position)
      },
      onWalkChange: (state) => setWalk(state),
      onWalkHover: (config) => setWalkHover(config),
    })
    worldRef.current = world
    setReady(true)

    // URL 参数（截图回路 / 直达厅内用）：?scene=hall&night=1&view=inside|dollhouse|walk
    const params = new URLSearchParams(window.location.search)
    const startInHall = params.get('scene') === 'hall'
    if (startInHall) {
      world.setActive('hall')
      setScene('hall')
    }
    if (params.get('night') === '1') setIsNight(true)
    const view = params.get('view')
    if (view && startInHall) window.setTimeout(() => world.worlds.hall.gotoView(view), 400)

    const onResize = () => world.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      world.dispose()
      worldRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    worldRef.current?.setPhaseTarget(isNight ? 1 : 0)
  }, [isNight])

  // 第一视角：E 键查看准星指着的东西（指针锁定时鼠标点不到底部的胶囊条）
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'KeyE' || !walk.active) return
      const config = worldRef.current?.worlds.hall.pickHotspot()
      if (!config) return
      worldRef.current.worlds.hall.walker.unlock() // 解锁指针，信息卡上的按钮才点得到
      setSelected(config)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [walk.active])

  useEffect(() => {
    const world = worldRef.current
    if (!world) return
    world.worlds.island.setAutoRotate(playing && scene === 'island')
    world.worlds.hall.setAutoRotate(playing && scene === 'hall')
  }, [playing, scene])

  const selectHotspot = useCallback(
    (hotspot) => {
      setSelected(hotspot)
      // 只有岛上才推镜；大厅里家具离得近，镜头一动反而晕
      if (scene === 'island') worldRef.current?.worlds.island.focusOn(hotspot.position)
    },
    [scene],
  )

  /** 走进大厅：黑幕淡入 → 切 world → 淡出。两边各 0.45s，和 CSS 的过渡时长对齐 */
  const enterHall = useCallback(() => {
    const world = worldRef.current
    if (!world?.worlds.hall) return
    setFading(true)
    window.setTimeout(() => {
      world.setActive('hall')
      setScene('hall')
      setSelected(null)
      setFading(false)
    }, 460)
  }, [])

  const exitHall = useCallback(() => {
    const world = worldRef.current
    if (!world) return
    setFading(true)
    window.setTimeout(() => {
      world.setActive('island')
      setScene('island')
      setFading(false)
    }, 460)
  }, [])

  const resetView = useCallback(() => {
    setSelected(null)
    worldRef.current?.worlds.island.resetView()
  }, [])

  const toggleHallView = useCallback(() => worldRef.current?.worlds.hall.toggleView(), [])
  const enterWalk = useCallback(() => worldRef.current?.worlds.hall.enterWalk(), [])
  const exitWalk = useCallback(() => worldRef.current?.worlds.hall.exitWalk(), [])
  const resetHallView = useCallback(() => {
    setSelected(null)
    worldRef.current?.worlds.hall.gotoView('dollhouse')
  }, [])

  const canEnterHall = ready && !!worldRef.current?.worlds.hall
  const isIsland = scene === 'island'

  return (
    <div className="app" data-phase={isNight ? 'night' : 'day'} data-scene={scene}>
      <div className="stage" ref={containerRef} />

      <header className="brand">
        <span className="brand__mark">嘉</span>
        <span className="brand__text">
          嘉庚图书馆
          <em>TAN KAH KEE COLLEGE LIBRARY</em>
        </span>
      </header>

      <button className="phase-toggle" type="button" onClick={() => setIsNight((v) => !v)}>
        <span className="phase-toggle__icon">{isNight ? '☀' : '☾'}</span>
        {isNight ? '昼 · 日光漫游' : '夜 · 馆灯初上'}
      </button>

      {isIsland ? (
        <IntroPanel onEnterHall={enterHall} canEnterHall={canEnterHall} />
      ) : (
        <div className="hall-title">
          <p className="hall-title__eyebrow">THIRD FLOOR · READING HALL</p>
          <h1 className="hall-title__title">三楼大厅</h1>
          <p className="hall-title__motto">挑空中庭，书香绕梁。</p>
        </div>
      )}

      <HotspotChips
        hotspots={isIsland ? ISLAND_HOTSPOTS : HALL_HOTSPOTS}
        activeId={selected?.id}
        onSelect={selectHotspot}
      />
      <Hint walk={walk.active} />

      {/* 第一视角：准星 + 准星旁的提示 + 未锁定时"点击画面继续" */}
      {walk.active && <div className={walkHover ? 'crosshair crosshair--hot' : 'crosshair'} aria-hidden="true" />}
      {walk.active && walkHover && !selected && <p className="walk-prompt">{walkHover.label} · 按 E 查看</p>}
      {walk.active && !walk.locked && (
        <p className="walk-overlay">点击画面继续漫游 · WASD 移动 · Esc 退出</p>
      )}

      <SceneControls
        scene={scene}
        playing={playing}
        walking={walk.active}
        onTogglePlay={() => setPlaying((v) => !v)}
        onEnterHall={enterHall}
        canEnterHall={canEnterHall}
        onExitHall={exitHall}
        onToggleView={toggleHallView}
        onEnterWalk={enterWalk}
        onExitWalk={exitWalk}
        onReset={isIsland ? resetView : resetHallView}
      />

      <InfoCard hotspot={selected} onClose={() => setSelected(null)} onEnterHall={enterHall} />

      <div className={fading ? 'fade fade--on' : 'fade'} aria-hidden="true" />
    </div>
  )
}
