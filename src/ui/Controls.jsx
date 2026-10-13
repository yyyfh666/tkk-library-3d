/**
 * 右下角控制键 + 左下角操作提示，对标参考图那排"全屏 / 暂停 / 走进城市"。
 * 岛上和大厅里的按钮不一样：岛上多一个"走进大厅"，大厅里换成"俯视/贴近"和"回到校园"。
 */
export function SceneControls({
  scene,
  playing,
  walking,
  onTogglePlay,
  onEnterHall,
  canEnterHall,
  onExitHall,
  onToggleView,
  onEnterWalk,
  onExitWalk,
  onReset,
}) {
  const isIsland = scene === 'island'

  return (
    <div className="scene-controls">
      <button className="ctl" type="button" onClick={onReset}>
        <span aria-hidden="true">⟲</span>
        复位
      </button>
      <button className="ctl" type="button" onClick={onTogglePlay}>
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        {playing ? '暂停漫游' : '继续漫游'}
      </button>

      {isIsland ? (
        <button className="ctl ctl--primary" type="button" onClick={onEnterHall} disabled={!canEnterHall}>
          <span aria-hidden="true">⌂</span>
          走进大厅
        </button>
      ) : walking ? (
        <>
          <button className="ctl ctl--primary" type="button" onClick={onExitWalk}>
            <span aria-hidden="true">⤡</span>
            退出漫游
          </button>
          <button className="ctl" type="button" onClick={onExitHall}>
            <span aria-hidden="true">←</span>
            回到校园
          </button>
        </>
      ) : (
        <>
          <button className="ctl ctl--primary" type="button" onClick={onEnterWalk}>
            <span aria-hidden="true">⌖</span>
            第一视角漫游
          </button>
          <button className="ctl" type="button" onClick={onToggleView}>
            <span aria-hidden="true">⤢</span>
            俯视 / 贴近
          </button>
          <button className="ctl" type="button" onClick={onExitHall}>
            <span aria-hidden="true">←</span>
            回到校园
          </button>
        </>
      )}

      <button className="ctl ctl--square" type="button" onClick={toggleFullscreen} title="全屏">
        <span aria-hidden="true">⛶</span>
      </button>
    </div>
  )
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen?.()
}

export function Hint({ walk = false }) {
  return (
    <p className="hint-bar">
      {walk ? 'WASD 移动 · Shift 加速 · 鼠标转头 · E 查看标注 · Esc 退出' : '左键旋转 · 滚轮缩放 · 右键平移'}
    </p>
  )
}
