/**
 * 底部热点条：把场景里所有热点列成一排小胶囊。
 * 从景观里点小圆点是"逛"，从这里点是有目标的"找"——两条路都留着。
 */
export default function HotspotChips({ hotspots, activeId, onSelect }) {
  return (
    <nav className="chips" aria-label="场景标注">
      {hotspots.map((hotspot) => (
        <button
          key={hotspot.id}
          type="button"
          className={hotspot.id === activeId ? 'chip chip--active' : 'chip'}
          onClick={() => onSelect(hotspot)}
        >
          {hotspot.label}
        </button>
      ))}
    </nav>
  )
}
