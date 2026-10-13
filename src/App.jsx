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

  useEffect(() => {
    const world = createAppWorld({
      container: containerRef.current,
      // 场景里的圆点被点时，引擎直接回调过来
      onHotspotSelect: (hotspot) => {
        setSelected(hotspot)
        worldRef.current?.worlds.island.focusOn(hotspot.position)
      },
    })
    worldRef.current = world
    setReady(true)

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
          <p className="hall-title__eyebrow">FIFTH FLOOR · READING HALL</p>
          <h1 className="hall-title__title">五楼大厅</h1>
          <p className="hall-title__motto">挑空中庭，书香绕梁。</p>
        </div>
      )}

      <HotspotChips
        hotspots={isIsland ? ISLAND_HOTSPOTS : HALL_HOTSPOTS}
        activeId={selected?.id}
        onSelect={selectHotspot}
      />
      <Hint />

      <SceneControls
        scene={scene}
        playing={playing}
        onTogglePlay={() => setPlaying((v) => !v)}
        onEnterHall={enterHall}
        canEnterHall={canEnterHall}
        onExitHall={exitHall}
        onToggleView={toggleHallView}
        onReset={isIsland ? resetView : resetHallView}
      />

      <InfoCard hotspot={selected} onClose={() => setSelected(null)} onEnterHall={enterHall} />

      <div className={fading ? 'fade fade--on' : 'fade'} aria-hidden="true" />
    </div>
  )
}
