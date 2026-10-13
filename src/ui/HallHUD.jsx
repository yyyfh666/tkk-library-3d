import { useEffect, useState } from 'react'
import { ROBOT_POIS, SHELF_UNITS_L0, shelfStandPoint } from '../scene/hallLayout.js'
import { useHallStore } from '../state/store.js'

/**
 * 三楼大厅的交互面板（场景二/三）。
 *
 * 这些 UI **不写在 three 里**：3D 只负责"机器人在哪、屏幕显示什么"，
 * 文案与操作全在这层 HTML 上 —— 改样式不用碰渲染循环。
 * 数据都走 state/store.js，引擎那头只 push 状态、订阅命令。
 */

/** 机器人状态 → 面板上的小圆点与文案 */
const ROBOT_STATUS = {
  cruise: { text: '中庭巡航中', tone: 'idle' },
  moving: { text: '正在前往', tone: 'busy' },
  arrived: { text: '已到达', tone: 'ok' },
  failed: { text: '路线受阻', tone: 'bad' },
}

/**
 * 陈嘉庚与集美/厦大的几个节点。
 * ⚠️ 展陈文案为**示意内容**：年份是常识性史实，但不做史料引用，别当资料转述。
 */
const STORY = [
  ['1874', '生于福建同安集美社'],
  ['1913', '创办集美学校，倾资兴学'],
  ['1921', '创办厦门大学'],
  ['1939', '组织南侨机工回国服务'],
  ['1950', '回国定居，续建集美学村'],
]

/** 左下（大厅右栏）常驻：搜索馆藏 → 派机器人去书架；一键打卡 */
export function HallGuide() {
  const robot = useHallStore((s) => s.robot)
  const query = useHallStore((s) => s.query)
  const results = useHallStore((s) => s.results)
  const searching = useHallStore((s) => s.searching)
  const hoveredBook = useHallStore((s) => s.hoveredBook)
  const setQuery = useHallStore((s) => s.setQuery)
  const search = useHallStore((s) => s.search)
  const clearSearch = useHallStore((s) => s.clearSearch)
  const commandRobot = useHallStore((s) => s.commandRobot)

  const status = ROBOT_STATUS[robot.status] ?? ROBOT_STATUS.cruise

  const submit = (event) => {
    event.preventDefault()
    search()
  }

  /** 派机器人去某本书所在的书架，到了再弹书卡（到达由引擎回调，不在这里定时） */
  const goToBook = (book) => {
    const unit = SHELF_UNITS_L0.find((s) => s.id === book.shelfId)
    // 拿不到书架就退到展区通道：至少让机器人有个合法目标，别原地报"过不去"
    const point = unit ? shelfStandPoint(unit) : ROBOT_POIS.exhibit.point
    commandRobot({
      point,
      label: `前往 ${book.shelfId} · ${book.title}`,
      payload: { kind: 'book', book },
    })
  }

  const checkin = () =>
    commandRobot({ point: ROBOT_POIS.checkin.point, label: '前往中庭打卡点', payload: { kind: 'checkin' } })

  return (
    <section className="hud-card">
      <p className="hud-card__kind">导览机器人</p>
      <p className={`robot-line robot-line--${status.tone}`}>
        <span className="robot-line__dot" aria-hidden="true" />
        <span className="robot-line__text">
          {status.text}
          {robot.status === 'cruise' ? '' : ` · ${robot.label}`}
        </span>
      </p>

      <form className="hud-search" onSubmit={submit}>
        <input
          className="hud-search__input"
          type="search"
          value={query}
          placeholder="输入书名 / 作者 / 分类号"
          aria-label="搜索馆藏"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="hud-search__btn" type="submit" disabled={searching}>
          {searching ? '查询中' : '找书'}
        </button>
      </form>

      {results.length > 0 && (
        <ul className="hud-results">
          {results.slice(0, 3).map((book) => (
            <li key={book.id}>
              <button className="hud-result" type="button" onClick={() => goToBook(book)}>
                <span className="hud-result__title">{book.title}</span>
                <span className="hud-result__meta">
                  {book.callNumber} · {book.shelfId} · 第 {book.board} 层
                  <em className={book.status === '在馆' ? 'is-ok' : 'is-out'}>{book.status}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!searching && query.trim() && results.length === 0 && (
        <p className="hud-card__note">没查到这个书名（书目是演示数据，试试「建筑」「海」「陈嘉庚」）。</p>
      )}
      {results.length > 0 && (
        <button className="hud-card__link" type="button" onClick={clearSearch}>
          清空结果
        </button>
      )}

      <div className="hud-actions">
        <button className="hud-btn hud-btn--primary" type="button" onClick={checkin}>
          签到打卡
        </button>
        <button className="hud-btn" type="button" onClick={() => commandRobot()}>
          回到巡航
        </button>
      </div>

      <p className="hud-card__note">
        {hoveredBook
          ? `准星：${hoveredBook.title} · ${hoveredBook.callNumber} · 第 ${hoveredBook.board} 层 · ${hoveredBook.status}`
          : '走进中庭，第一视角盯着书脊可看馆藏'}
      </p>
    </section>
  )
}

/** 机器人到达书架后弹出的书卡 */
export function BookCard() {
  const book = useHallStore((s) => s.selectedBook)
  const close = useHallStore((s) => s.setSelectedBook)
  if (!book) return null

  return (
    <section className="hud-card">
      <button className="hud-card__close" type="button" onClick={() => close(null)} aria-label="关闭">
        ✕
      </button>
      <p className="hud-card__kind">机器人已送达 · {book.shelfId}</p>
      <h3 className="hud-card__title">{book.title}</h3>
      <p className="hud-card__sub">
        {book.author} · {book.category}
      </p>
      <dl className="hud-meta">
        <div>
          <dt>索书号</dt>
          <dd>{book.callNumber}</dd>
        </div>
        <div>
          <dt>层板</dt>
          <dd>第 {book.board} 层</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd className={book.status === '在馆' ? 'is-ok' : 'is-out'}>{book.status}</dd>
        </div>
      </dl>
      <p className="hud-card__note">书目与馆藏状态为演示数据，不是真实馆藏。</p>
    </section>
  )
}

/** 走近全息展台时浮现的陈嘉庚故事时间轴 */
export function HoloStory() {
  const active = useHallStore((s) => s.hologram.active)
  const [dismissed, setDismissed] = useState(false)
  // 每次重新走近都重新展开（走开再回来 = 新的一次触发）
  useEffect(() => {
    if (active) setDismissed(false)
  }, [active])
  if (!active || dismissed) return null

  return (
    <section className="hud-card hud-card--holo">
      <button className="hud-card__close" type="button" onClick={() => setDismissed(true)} aria-label="关闭">
        ✕
      </button>
      <p className="hud-card__kind">全息投影 · 已激活</p>
      <h3 className="hud-card__title">
        陈嘉庚 <em>1874 — 1961</em>
      </h3>
      <ol className="holo-timeline">
        {STORY.map(([year, what]) => (
          <li key={year}>
            <span className="holo-timeline__year">{year}</span>
            <span className="holo-timeline__what">{what}</span>
          </li>
        ))}
      </ol>
      <p className="hud-card__note">展陈文案为示意内容，非史料引用。</p>
    </section>
  )
}

/** 打卡成功的小横幅（3 秒后自己收） */
export function CheckinToast() {
  const count = useHallStore((s) => s.checkin.count)
  const visible = useHallStore((s) => s.checkin.visible)
  const hide = useHallStore((s) => s.hideCheckin)

  useEffect(() => {
    if (!visible) return
    const id = window.setTimeout(hide, 3200)
    return () => window.clearTimeout(id)
  }, [visible, count, hide])

  if (!visible) return null
  return (
    <p className="checkin-toast" role="status">
      打卡成功 · 第 {count} 次到馆
    </p>
  )
}
