/**
 * 语音总线（全息演出的旁白）。
 *
 * ⚠️ 先把话说清楚：**这不是陈嘉庚先生的原声，也不是为他克隆的语音**。
 *    仓库里一个音频文件都没有（项目红线是"全程序化、零外部素材"），所以"AI 合成演讲"这件事
 *    只能靠运行时合成。默认 provider 就是浏览器内置的 `speechSynthesis`（普通话），
 *    念的是我们自己写的那几句字幕文本。
 *
 * 结构上按"可插拔"做：`createSpeechBus({ provider })` 收一个 provider，接口只有三样 ——
 * `available` / `speak(text, opts)` / `cancel()`。将来要接真实录音、接云端语音合成、
 * 或者做闽南语版本（浏览器 TTS 基本没有闽南语），**只换 provider，调用方一行都不用动**。
 *
 * 两条硬约束都在这里落地：
 *  · **防重叠**：每次 `say()` 都先 `cancel()` 再 `speak()` —— 快速连点时间轴节点时，
 *    上一段一定被掐断，不会两条声音叠在一起；
 *  · **不重复念**：同一条文本连着调两次只会念一次（点同一个节点两次不该重头再念）。
 *
 * 默认**静音**：浏览器 autoplay 策略要求用户手势，而且展馆 demo 不该一进门就说话。
 */

/** 浏览器内置 TTS。没有这个 API 的环境（部分无头浏览器）就静默降级成"只有字幕"。 */
function browserSpeechProvider() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
  return {
    name: 'browser-tts',
    available: !!synth && typeof window.SpeechSynthesisUtterance === 'function',
    speak(text, { lang = 'zh-CN', rate = 0.92, pitch = 0.82 } = {}) {
      if (!synth) return false
      try {
        const u = new window.SpeechSynthesisUtterance(text)
        u.lang = lang
        u.rate = rate
        u.pitch = pitch // 压低一点，听着沉稳些（仍然是普通机器的声音，别当成本人）
        synth.speak(u)
        return true
      } catch {
        return false // 被 autoplay 策略或实现差异挡下：当没说过，不影响画面
      }
    },
    cancel() {
      try {
        synth?.cancel()
      } catch {
        /* 无所谓 */
      }
    },
  }
}

export function createSpeechBus({ provider = browserSpeechProvider(), logSize = 40 } = {}) {
  let muted = true
  let lastSpoken = '' // 同一条文本不重念
  let cancelCount = 0 // "先掐后念"真的执行了几次（测试断言完整性用的）

  /** 给测试钩子的流水：记的是"调用意图"，与是否静音无关，所以静音时也查得到 */
  const log = []
  const push = (entry) => {
    log.push(entry)
    if (log.length > logSize) log.shift()
  }

  return {
    get available() {
      return provider.available
    },
    get providerName() {
      return provider.name
    },
    get muted() {
      return muted
    },
    /** 关掉时顺手掐断正在念的那句 */
    setMuted(next) {
      muted = !!next
      if (muted) {
        cancelCount++
        provider.cancel()
      }
      return muted
    },
    /** 测试钩子：掐断了多少次（每次换章都该 +1） */
    get cancelCount() {
      return cancelCount
    },
    /** 念一章的旁白（subtitle + quote）。返回"真的发生了朗读"还是"只更新了字幕" */
    say(chapter) {
      const text = [chapter.subtitle, chapter.quote].filter(Boolean).join(' ')
      if (!text) return false
      const isRepeat = text === lastSpoken
      lastSpoken = text
      push({ id: chapter.id, text, muted, spoke: !muted && provider.available && !isRepeat })
      if (muted || !provider.available) return false
      // **先掐后念**：这是"不重叠"的关键那一行
      cancelCount++
      provider.cancel()
      return isRepeat ? true : provider.speak(text)
    },
    /** 重新念当前这一句（用户手动点"重听"时用；重复判定因此要绕开） */
    replay(chapter) {
      lastSpoken = ''
      return this.say(chapter)
    },
    /** 离开演出 / 切场景时一定要调：不然声音会跟着画面走掉 */
    cancel() {
      lastSpoken = ''
      cancelCount++
      provider.cancel()
    },
    getLog: () => log.map((e) => ({ ...e })),
  }
}
