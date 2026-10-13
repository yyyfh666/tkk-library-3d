/**
 * 左栏标题卡 —— 参考图左侧那一竖列：小字英文 → 大字中文 → 一句题词 → 说明 → 主按钮。
 */
export default function IntroPanel({ onEnterHall, canEnterHall }) {
  return (
    <div className="intro">
      <p className="intro__eyebrow">XIAMEN UNIVERSITY TAN KAH KEE COLLEGE</p>
      <h1 className="intro__title">嘉庚图书馆</h1>
      <p className="intro__motto">一馆一楼，半园书香。</p>
      <p className="intro__body">
        闽南红瓦压着白石墙，一道竖直的玻璃天窗从广场一直顶到檐口。
        围岛一圈是棕榈、静水和白色牌坊 —— 转一圈，看这座楼是怎么落在校园里的。
      </p>
      <button className="intro__cta" type="button" onClick={onEnterHall} disabled={!canEnterHall}>
        走进大厅
        <span aria-hidden="true">→</span>
      </button>
    </div>
  )
}
