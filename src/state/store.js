import { create } from 'zustand'
import { fetchBookLocation } from './mockBooks.js'
import { VR_BOOKS, getVrBook } from './vrBooks.js'
import { HOLO_CHAPTERS, HOLO_CHAPTER_IDS, holoChapterIndex } from './holoChapters.js'
import { DEFAULT_PROGRAM_ID } from './lobbyPrograms.js'
import { answerLibrarian, SUGGESTIONS } from './librarian.js'

/**
 * 全厅共享状态（Zustand）。
 *
 * 为什么需要它：这个项目里"3D 引擎"是命令式的（活在 useEffect 里、不进 React 渲染循环），
 * 而"UI"是声明式的。两边要共享机器人状态、搜索结果、打卡/全息事件 —— 用 store 当**唯一通道**：
 *   React → 引擎：commandRobot() 往 robotCommand 里塞一条带 nonce 的命令，引擎 subscribe 后消费；
 *   引擎 → React：setRobotState() / showCheckin() / setSelectedBook()，UI 自动重渲染。
 * 这样 3D 那边照样每帧零 React 开销，UI 那边也不用层层回调传参。
 */
export const useHallStore = create((set, get) => ({
  // ===================== 导览机器人 =====================
  robot: { status: 'cruise', label: '中庭巡航' },
  /** 给引擎消费的一次性命令（nonce 保证"同样的命令按两次"也会重发） */
  robotCommand: null,
  commandRobot: ({ point = null, label = '中庭巡航', payload = null } = {}) =>
    set({ robotCommand: { point, label, payload, nonce: (get().robotCommand?.nonce ?? 0) + 1 } }),
  setRobotState: (patch) => set((s) => ({ robot: { ...s.robot, ...patch } })),

  // ===================== 打卡 =====================
  checkin: { count: 0, visible: false },
  showCheckin: () => set((s) => ({ checkin: { count: s.checkin.count + 1, visible: true } })),
  hideCheckin: () => set((s) => ({ checkin: { ...s.checkin, visible: false } })),

  // ===================== 智能找书 =====================
  query: '',
  results: [],
  searching: false,
  selectedBook: null, // 机器人到达后弹的那张书卡
  setQuery: (query) => set({ query }),
  search: async (q) => {
    const query = String(q ?? get().query ?? '')
    set({ query, searching: true })
    const results = await fetchBookLocation(query)
    set({ results, searching: false })
  },
  clearSearch: () => set({ query: '', results: [], searching: false }),
  setSelectedBook: (book) => set({ selectedBook: book }),

  // ===================== 全息投影演出（场景三）=====================
  // 分工和别处一致：**引擎按相机距离推 active / cinematic，UI 推 chapterId / muted**。
  // active = 投影亮着；cinematic = 顺便把这场演出"当演出看"（藏漫游 UI、锁走路、上黑边字幕）。
  holo: { active: false, cinematic: false, chapterId: HOLO_CHAPTERS[0].id, muted: true },
  setHoloActive: (active) => set((s) => (s.holo.active === active ? {} : { holo: { ...s.holo, active } })),
  setHoloCinematic: (cinematic) =>
    set((s) => (s.holo.cinematic === cinematic ? {} : { holo: { ...s.holo, cinematic } })),
  setHoloChapter: (chapterId) =>
    set((s) => (s.holo.chapterId === chapterId ? {} : { holo: { ...s.holo, chapterId } })),
  /** 上一章 / 下一章（时间轴两端的箭头用），到头就停住不绕圈 */
  stepHoloChapter: (delta) =>
    set((s) => {
      const next = Math.min(HOLO_CHAPTER_IDS.length - 1, Math.max(0, holoChapterIndex(s.holo.chapterId) + delta))
      const id = HOLO_CHAPTER_IDS[next]
      return id === s.holo.chapterId ? {} : { holo: { ...s.holo, chapterId: id } }
    }),
  toggleHoloMuted: () => set((s) => ({ holo: { ...s.holo, muted: !s.holo.muted } })),

  // ===================== 书架信息屏 =====================
  hoveredBook: null, // 鼠标/准星正指着的那本书（来自 3D 射线）
  setHoveredBook: (book) => set((s) => (s.hoveredBook?.id === book?.id ? {} : { hoveredBook: book })),

  // ===================== 一楼数字展屏 =====================
  // 引擎按 programId/playing 重画屏幕；slideIndex 由引擎每 7 秒回写一次，给右栏显示页码。
  screen: { programId: DEFAULT_PROGRAM_ID, playing: true, slideIndex: 0 },
  setScreenProgram: (programId) =>
    set((s) => (s.screen.programId === programId ? {} : { screen: { ...s.screen, programId, slideIndex: 0 } })),
  toggleScreenPlaying: () => set((s) => ({ screen: { ...s.screen, playing: !s.screen.playing } })),
  setScreenSlide: (slideIndex) =>
    set((s) => (s.screen.slideIndex === slideIndex ? {} : { screen: { ...s.screen, slideIndex } })),

  // ===================== AI 馆员（本地演示）=====================
  // 只有这一处会同时改 librarian 与 screen：问答里带 screenId 时，顺手把节目放上大屏。
  librarian: {
    pending: false,
    messages: [
      {
        id: 'hello',
        role: 'assistant',
        text: '你好，我是一楼 AI 馆员。可以帮你找书、查开放时间，或把讲座、展览、新书和活动公告放上一楼数字展屏。',
        suggestions: SUGGESTIONS,
      },
    ],
  },
  askLibrarian: async (raw) => {
    const text = String(raw ?? '').trim()
    if (!text) return
    const stamp = Date.now()
    set((s) => ({
      librarian: {
        ...s.librarian,
        pending: true,
        messages: [...s.librarian.messages, { id: `u${stamp}`, role: 'user', text }],
      },
    }))
    const reply = await answerLibrarian(text)
    set((s) => ({
      librarian: {
        ...s.librarian,
        pending: false,
        messages: [...s.librarian.messages, { id: `a${stamp}`, role: 'assistant', ...reply }],
      },
      ...(reply.screenId
        ? { screen: { ...s.screen, programId: reply.screenId, playing: true, slideIndex: 0 } }
        : {}),
    }))
  },
  clearLibrarian: () =>
    set({
      librarian: {
        pending: false,
        messages: [
          {
            id: `hello${Date.now()}`,
            role: 'assistant',
            text: '对话已清空。可以继续问我馆藏、开放时间、活动或一楼大屏。',
            suggestions: SUGGESTIONS,
          },
        ],
      },
    }),

  // ===================== VR 沉浸阅读舱（场景四）=====================
  // 两边分工和全息一样：引擎按相机距离推 active（走进去就亮），
  // React 推 bookId/page，引擎 subscribe 到变化才重画幕布那一页。
  vr: { active: false, bookId: VR_BOOKS[0].id, page: 0 },
  totalVrPages: (bookId) => getVrBook(bookId).pages.length,
  setVrActive: (active) => set((s) => (s.vr.active === active ? {} : { vr: { ...s.vr, active } })),
  setVrBook: (bookId) =>
    set((s) => (s.vr.bookId === bookId ? {} : { vr: { ...s.vr, bookId, page: 0 } })),
  stepVrPage: (delta) =>
    set((s) => {
      const total = getVrBook(s.vr.bookId).pages.length
      const page = Math.min(total - 1, Math.max(0, s.vr.page + delta))
      return page === s.vr.page ? {} : { vr: { ...s.vr, page } }
    }),
}))
