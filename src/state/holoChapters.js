/**
 * 陈嘉庚全息投影的**章节内容**（时间轴上那五个节点）。
 *
 * ⚠️ 两条口径，别越线：
 *  · 年份与事件是常识性史实，但这里写的是**展览叙述文字**，不做史料引用；
 *  · `quote` 里的名言按**广为流传的说法**写（含"宁可变卖大厦，也要支持厦大"这种通行的转述），
 *    没有逐条核对原件，对外不要说成"引文出自某卷第几页"。
 *
 * `art` 只是插图 id，画法在 `src/scene/hologramFigures.js` 的 ART 表里（内容与渲染分开，
 * 和场景四的 vrBooks.js / vrReading.js 一个路子）。
 */

export const HOLO_CHAPTERS = [
  {
    id: 'primary',
    year: '1913',
    title: '集美小学开学',
    art: 'primary',
    subtitle: '1913 年，集美小学开学。他把家业里的一部分，换成了课桌和黑板。',
    quote: '',
  },
  {
    id: 'school',
    year: '1918',
    title: '集美学校',
    art: 'school',
    subtitle: '1918 年，集美学校成立。师范、中学、水产、商科相继开办，一个学村的雏形有了。',
    quote: '教育为立国之本，兴学乃国民天职。',
  },
  {
    id: 'xiada',
    year: '1921',
    title: '创办厦门大学',
    art: 'university',
    subtitle: '1921 年，厦门大学开学。此后企业几度起落，办学这一头始终没有停。',
    quote: '宁可变卖大厦，也要支持厦大。',
  },
  {
    id: 'village',
    year: '1923—1933',
    title: '集美学村',
    art: 'village',
    subtitle: '十年之间，教学楼、图书馆、科学馆、医院与龙舟池次第落成，海边长出了一座学村。',
    quote: '',
  },
  {
    id: 'drivers',
    year: '1939',
    title: '南侨机工',
    art: 'drivers',
    subtitle: '1939 年，他号召南洋华侨机工回国，在滇缅公路上抢运物资。三千多个名字，刻在了纪念碑上。',
    quote: '国家之富强，全在乎国民；国民之发展，全在乎教育。',
  },
]

export const HOLO_CHAPTER_IDS = HOLO_CHAPTERS.map((c) => c.id)

export function getHoloChapter(id) {
  return HOLO_CHAPTERS.find((c) => c.id === id) ?? HOLO_CHAPTERS[0]
}

/** 章节在时间轴上的序号（0 起），给"上一章 / 下一章"用 */
export function holoChapterIndex(id) {
  const i = HOLO_CHAPTER_IDS.indexOf(id)
  return i < 0 ? 0 : i
}
