/**
 * 一楼 AI 馆员（本地演示版）。
 *
 * 这里**没有接外部大模型**：用一组可解释的意图规则 + 本地书目数据，
 * 演示"问答 → 找书 → 派机器人 → 换展屏节目"的完整闭环。
 * 好处是离线可跑、答辩时不会因为网络或密钥掉链子；坏处是只能回答预设范围。
 *
 * ⚠️ 开放时间、活动、新书、科研成果都是**示意内容**，不是正式公告。
 */

import { fetchBookLocation } from './mockBooks.js'
import { LOBBY_PROGRAMS, getLobbyProgram } from './lobbyPrograms.js'

const OPENING = '周一至周日 08:00—22:00（考试周延时，具体以馆方公告为准）'

const SUGGESTIONS = ['新书推荐', '本周活动', '找《深海浅说》', '嘉庚文化', '一楼大屏']

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalize(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ')
}

function extractBookQuery(text) {
  const quoted = text.match(/《([^》]+)》/)
  if (quoted) return quoted[1]
  const after = text.match(/(?:找|查|借|搜)(?:一下|一找)?(?:书)?[：: ]*(.+)$/)
  return after ? after[1].replace(/[。？?！!]$/, '').trim() : text
}

function screenReply(programId, lead, extra = '') {
  const program = getLobbyProgram(programId)
  return {
    text: `${lead}我把「${program.kind} · ${program.title}」放上一楼数字展屏了。${extra}`,
    screenId: program.id,
  }
}

/**
 * 回答一个问题。返回：
 *   { text, screenId?, books?, suggestions? }
 * UI 只认这几个字段，换真正的模型时也保留同样的返回结构。
 */
export async function answerLibrarian(raw) {
  const text = normalize(raw)
  const q = text.toLowerCase()
  await delay(420) // 模拟检索/推理的等待，让界面有"正在查"的反馈

  if (!text) {
    return { text: '你可以问我馆藏、开放时间、活动、新书，或者让我把某个展区放上大屏。', suggestions: SUGGESTIONS }
  }

  if (/新书|推荐|上架|到馆/.test(q)) {
    return screenReply(
      'newbooks',
      '本周新书推荐已经整理好了：',
      '屏幕会循环播放《深海浅说》《闽南红砖建筑》《人工智能导论》等五本。',
    )
  }

  if (/活动|讲座|公告|排期|日历|报名/.test(q)) {
    return screenReply(
      'notice',
      '本周活动有三场：嘉庚建筑讲座、新生馆藏导览、学生作品展映。',
      '具体时间与报名方式以馆方正式公告为准。',
    )
  }

  if (/嘉庚|校史|陈嘉庚|展览|文化|全息/.test(q)) {
    return screenReply(
      'jimei',
      '嘉庚文化展区在北墙展墙，全息展台就在展墙前。',
      '想让更多人看到，可以直接看一楼大屏的「倾资兴学 · 百年嘉庚」。',
    )
  }

  if (/科研|成果|实验室|海岸|论文/.test(q)) {
    return screenReply(
      'research',
      '科研成果展屏正在播放「从实验室到海岸线」。',
      '这一档把潮汐观测、红树林修复与海岸工程放在同一条叙事线上。',
    )
  }

  if (/学生|作品|展映|课程/.test(q)) {
    return screenReply(
      'student',
      '学生作品展屏已切到「把课堂做成作品」。',
      '如果你有作品想参展，可以到一楼服务台登记（演示流程）。',
    )
  }

  if (/大屏|屏幕|数字展屏|播放|宣传|节目/.test(q)) {
    const names = LOBBY_PROGRAMS.map((p) => p.nav).join(' / ')
    return {
      text: `一楼数字展屏有七档节目：${names}。你说一个方向，我就切过去；也可以点右栏的节目按钮手动换。`,
      suggestions: ['播放嘉庚文化', '播放新书推荐', '播放本周活动'],
    }
  }

  if (/开放|时间|几点|闭馆|开门|营业/.test(q)) {
    return {
      text: `图书馆开放时间：${OPENING}。一楼数字展屏与 AI 馆员在开馆时段内可用。`,
      suggestions: ['借阅规则', '本周活动', '新书推荐'],
    }
  }

  if (/借|还|续借|规则|逾期|证/.test(q)) {
    return {
      text: '借阅规则（演示）：普通图书可借 30 天，可续借 1 次；逾期会暂停借阅权限。具体册数与期限以馆方正式规定为准。',
      suggestions: ['开放时间', '找《深海浅说》', '一楼大屏'],
    }
  }

  if (/楼层|几楼|座位|自习|vr|机器人|导览|服务台|厕所|洗手间/.test(q)) {
    return {
      text: '一楼有数字展屏、嘉庚文化展区与借还服务台；二楼是开架书巷与智能书架屏；三楼是挑空阅读大厅与报告厅。VR 阅读舱在一楼西侧窗边。需要带路可以派导览机器人。',
      suggestions: ['找《深海浅说》', '嘉庚文化', 'VR 阅读'],
    }
  }

  // 找书：先看是不是明确的找书意图，再交给本地书目检索
  const looksLikeBook = /找|查|借|搜|《|书/.test(q)
  if (looksLikeBook) {
    const term = extractBookQuery(text)
    const books = await fetchBookLocation(term)
    if (books.length > 0) {
      return {
        text: `找到 ${books.length} 本与「${term}」相关的馆藏。点书卡可以让导览机器人带你去书架；书目与在馆状态是演示数据。`,
        books: books.slice(0, 3),
        suggestions: ['一楼大屏', '开放时间', '新书推荐'],
      }
    }
    return {
      text: `没有在演示书目里找到「${term}」。可以试试「建筑」「海」「陈嘉庚」，或者到一楼服务台查询完整馆藏。`,
      suggestions: ['找《闽南红砖建筑》', '找《深海浅说》', '新书推荐'],
    }
  }

  return {
    text: '我可以带你找书、介绍开放时间与借阅规则，也能把讲座、展览、新书和活动公告放上一楼数字展屏。你想先看哪一类？',
    suggestions: SUGGESTIONS,
  }
}

export { SUGGESTIONS }
