import { useCallback, useEffect, useRef, useState } from 'react'
import { createAppWorld } from './scene/createWorld.js'
import { ISLAND_HOTSPOTS, HALL_HOTSPOTS } from './scene/hotspots.js'
import IntroPanel from './ui/IntroPanel.jsx'
import HotspotChips from './ui/HotspotChips.jsx'
import InfoCard from './ui/InfoCard.jsx'
import {
  HallGuide,
  BookCard,
  HoloStory,
  HoloTheatre,
  VrReading,
  CheckinToast,
  AiLibrarian,
  LobbyScreenCard,
} from './ui/HallHUD.jsx'
import { useHallStore } from './state/store.js'
import { SceneControls, Hint } from './ui/Controls.jsx'
import Diag from './ui/Diag.jsx'

export default function App() {
  const containerRef = useRef(null)
  const worldRef = useRef(null)
  // 刚进大厅的一小段时间里，"第一视角漫游"要装死：
  // 岛上底栏和厅里底栏在同一个位置，连点两下"走进大厅"很容易把第二下砸在它上面，
  // 人就莫名其妙进了第一视角（以前还会被锁指针，看着像"页面卡住点了没反应"）。
  const hallEnteredAt = useRef(0)

  const [isNight, setIsNight] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [selected, setSelected] = useState(null)
  const [scene, setScene] = useState('island') // island | hall
  const [fading, setFading] = useState(false)
  const [ready, setReady] = useState(false) // world 建好之前"走进大厅"要禁用
  const [crash, setCrash] = useState(null) // WebGL / 初始化失败时给访客看的兜底文案
  const [walk, setWalk] = useState({ active: false, locked: false }) // 第一视角状态
  const [walkHover, setWalkHover] = useState(null) // 准星指着哪个热点
  // ?diag=1：给远程排查用的实时探针（帧率 / 指针锁 / 事件计数）
  const [diag] = useState(() => new URLSearchParams(window.location.search).get('diag') === '1')
  // 全息"演出态"：藏掉常规漫游 UI，换成黑边 + 字幕 + 时间轴
  const cinematic = useHallStore((s) => s.holo.cinematic)

  useEffect(() => {
    let world = null
    let cancelled = false
    let onResize = null
    let raf2 = 0

    // 先把遮罩画出来，再干重活。createAppWorld 会同步建出两套场景
    //（程序化贴图 + 上千个 mesh + 环境贴图），弱机上要几秒；
    // 直接在 effect 里跑的话浏览器还没机会上屏，访客看到的是一片白 —— 像网站死了。
    // 连等两帧能保证 .boot 已经绘制出来，之后主线程再卡，转圈也不会停（transform 走合成线程）。
    const build = () => {
      if (cancelled) return
      try {
        world = createAppWorld({
          container: containerRef.current,
          // 场景里的圆点被点时，引擎直接回调过来
          onHotspotSelect: (hotspot) => {
            setSelected(hotspot)
            worldRef.current?.worlds.island.focusOn(hotspot.position)
          },
          onWalkChange: (state) => {
            setWalk(state)
            // 演出中丢了指针锁 = 观众按了 Esc（浏览器锁定时 Esc 不派发给页面，只会解锁）。
            // 必须当成"退出观看"，否则下一帧又会被判定成该进演出，来回抽搐。
            if (!state.locked && useHallStore.getState().holo.cinematic) {
              worldRef.current?.worlds.hall.exitHolo()
            }
          },
          onWalkHover: (config) => setWalkHover(config),
        })
      } catch (error) {
        // 多半是浏览器关了 WebGL / 硬件加速。给一句人话 + 重试按钮，别留个空白画布
        console.error('[3D] 场景初始化失败', error)
        setCrash(error?.message ? String(error.message) : String(error))
        return
      }
      if (cancelled) {
        world.dispose()
        return
      }
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

      onResize = () => world.resize()
      window.addEventListener('resize', onResize)
    }

    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(build)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      if (onResize) window.removeEventListener('resize', onResize)
      world?.dispose()
      worldRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    worldRef.current?.setPhaseTarget(isNight ? 1 : 0)
  }, [isNight])

  // 第一视角：E 查看准星指着的东西、←/→ 翻幕布那一页
  // （指针锁定时鼠标点不到右栏的按钮，所以这几组键是必需的）
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!walk.active) return
      const store = useHallStore.getState()
      // 演出态优先：Esc 退场、←/→ 翻章节，其余键一概不响应（沉浸）
      if (store.holo.cinematic) {
        if (event.code === 'Escape') {
          worldRef.current?.worlds.hall.exitHolo()
        } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
          event.preventDefault()
          store.stepHoloChapter(event.code === 'ArrowRight' ? 1 : -1)
        }
        return
      }
      if (event.code === 'KeyE') {
        const config = worldRef.current?.worlds.hall.pickHotspot()
        if (!config) return
        worldRef.current.worlds.hall.walker.unlock() // 解锁指针，信息卡上的按钮才点得到
        setSelected(config)
        return
      }
      if (!store.vr.active) return
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault() // 别让方向键滚页面
        store.stepVrPage(event.code === 'ArrowRight' ? 1 : -1)
      }
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
      hallEnteredAt.current = performance.now() // 冷却计时，见 enterWalk
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
  const enterWalk = useCallback(() => {
    // 700ms 冷却：挡住"走进大厅"连点第二下误入第一视角
    if (performance.now() - hallEnteredAt.current < 700) return
    worldRef.current?.worlds.hall.enterWalk()
  }, [])
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

      {/* 启动遮罩：建世界要同步跑几秒，这段时间页面必须"看得出还在加载"，
          否则访客看到的就是一个点了没反应的空界面 */}
      {!ready && !crash && (
        <div className="boot" aria-live="polite">
          <span className="boot__ring" aria-hidden="true" />
          <p className="boot__text">正在构建 3D 展馆…</p>
          <p className="boot__sub">首次打开要生成几何体与贴图，几秒钟就好</p>
        </div>
      )}

      {crash && (
        <div className="crash" role="alert">
          <h2>3D 场景没能启动</h2>
          <p>
            浏览器可能禁用了 WebGL 或硬件加速。请用 Chrome / Edge 打开，或在浏览器设置里开启「硬件加速」后刷新。
          </p>
          <p className="crash__detail">{crash}</p>
          <button className="ctl ctl--primary" type="button" onClick={() => window.location.reload()}>
            重新载入
          </button>
        </div>
      )}

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

      {!cinematic && isIsland && <IntroPanel onEnterHall={enterHall} canEnterHall={canEnterHall} />}
      {!cinematic && !isIsland && (
        <div className="hall-title">
          <p className="hall-title__eyebrow">THIRD FLOOR · READING HALL</p>
          <h1 className="hall-title__title">三楼大厅</h1>
          <p className="hall-title__motto">挑空中庭，书香绕梁。</p>
        </div>
      )}

      {/* 演出态：常规漫游的三件套（胶囊条 / 提示条 / 控制键）连同准星一起收掉 */}
      {!cinematic && (
        <HotspotChips
          hotspots={isIsland ? ISLAND_HOTSPOTS : HALL_HOTSPOTS}
          activeId={selected?.id}
          onSelect={selectHotspot}
        />
      )}
      {!cinematic && <Hint walk={walk.active} />}

      {/* 第一视角：准星 + 准星旁的提示 + 未锁定时"点击画面继续" */}
      {walk.active && !cinematic && (
        <div className={walkHover ? 'crosshair crosshair--hot' : 'crosshair'} aria-hidden="true" />
      )}
      {walk.active && !cinematic && walkHover && !selected && (
        <p className="walk-prompt">{walkHover.label} · 按 E 查看</p>
      )}
      {walk.active && !cinematic && !walk.locked && (
        <div className="walk-overlay">
          <p className="walk-overlay__text">点击画面开始用鼠标转头 · WASD 移动 · Esc 退出</p>
          <button className="ctl ctl--primary walk-overlay__exit" type="button" onClick={exitWalk}>
            退出第一视角
          </button>
        </div>
      )}
      {/* 锁定指针时整个页面收不到鼠标事件，必须一直挂一个"按 Esc 退出"的提示 */}
      {walk.active && !cinematic && walk.locked && (
        <p className="walk-badge">第一视角漫游中 · 按 Esc 退出</p>
      )}

      {cinematic && <HoloTheatre onExit={() => worldRef.current?.worlds.hall.exitHolo()} />}

      {!cinematic && (
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
      )}

      {!cinematic && <CheckinToast />}

      {/* 大厅的右栏：导览台常驻，书卡 / 全息故事 / 热点信息卡按需插进同一列（各占一行，不打架） */}
      {cinematic ? null : isIsland ? (
        <InfoCard hotspot={selected} onClose={() => setSelected(null)} onEnterHall={enterHall} />
      ) : (
        <div className="hall-rail">
          <AiLibrarian />
          <LobbyScreenCard />
          <HallGuide />
          <BookCard />
          <HoloStory />
          <VrReading />
          <InfoCard hotspot={selected} onClose={() => setSelected(null)} />
        </div>
      )}

      <div className={fading ? 'fade fade--on' : 'fade'} aria-hidden="true" />

      {diag && <Diag worldRef={worldRef} />}
    </div>
  )
}
