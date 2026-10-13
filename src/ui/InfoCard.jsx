/**
 * 右侧信息卡：点热点后从右边滑出来，对标参考图那张"天府熊猫"卡片。
 */
export default function InfoCard({ hotspot, onClose, onEnterHall }) {
  if (!hotspot) return null

  return (
    <aside className="info-card">
      <button className="info-card__close" type="button" onClick={onClose} aria-label="关闭">
        ✕
      </button>
      <p className="info-card__kind">场景标注</p>
      <h2 className="info-card__title">{hotspot.title}</h2>
      <p className="info-card__body">{hotspot.body}</p>
      {hotspot.enter && (
        <button className="info-card__cta" type="button" onClick={onEnterHall}>
          进入三楼大厅
        </button>
      )}
    </aside>
  )
}
