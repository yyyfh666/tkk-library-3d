/**
 * Mock 书目 API（场景二"智能找书"）。
 *
 * 真项目里这一步是图书馆 OPAC/馆藏接口：输入书名 → 返回"楼层、书架号、层数、在馆状态"。
 * 现在用一份本地假数据模拟同样的返回结构（带 260ms 延迟，模拟网络往返）。
 *
 * ⚠️ 书目、索书号、在馆状态都是**示意数据**，不是真实馆藏，对外别当资料引用。
 */

import { SHELF_UNITS_L0 } from '../scene/hallLayout.js'

const shelfIds = SHELF_UNITS_L0.map((s) => s.id)

/**
 * [书名, 作者, 分类号, 分类名, 书架序号(0起), 层数(1起), 状态]
 * 两组共 24 条，每组 12 条按书架序号排开；第二组的层号是**交错补位**的，
 * 于是每架书架覆盖 5 层里的 3 层 —— 准星指着书脊时更容易报得出东西。
 */
const RAW = [
  ['人工智能导论', '周志华', 'TP18', '自动化·计算机技术', 0, 3, '在馆'],
  ['嘉庚精神与华侨教育', '厦门大学校史研究室', 'G649.29', '教育·华侨史', 1, 2, '在馆'],
  ['深海浅说', '汪品先', 'P7', '海洋科学', 2, 4, '借出'],
  ['福建民居', '黄汉民', 'TU241', '建筑艺术', 3, 1, '在馆'],
  ['闽南方言大词典', '周长楫', 'H177', '语言学', 4, 2, '在馆'],
  ['陈嘉庚年谱', '陈碧笙', 'K825.4', '人物传记', 5, 5, '在馆'],
  ['海洋与文明', '林肯·佩恩', 'K103', '世界史', 6, 3, '在馆'],
  ['中国建筑史', '梁思成', 'TU-092', '建筑史', 7, 1, '借出'],
  ['数据结构与算法分析', '马克·艾伦·维斯', 'TP311.12', '计算机技术', 8, 4, '在馆'],
  ['闽台缘', '林国平', 'K295.7', '地方史', 9, 2, '在馆'],
  ['红楼梦', '曹雪芹', 'I242.4', '中国古典小说', 10, 1, '在馆'],
  ['时间简史', '史蒂芬·霍金', 'P159', '天文·物理', 11, 3, '在馆'],
  ['中华海洋文明史', '曲金良', 'P7-092', '海洋史', 0, 5, '在馆'],
  ['华侨华人与中国', '庄国土', 'D634.3', '华侨研究', 1, 1, '借出'],
  ['摄影构图学', '本·克莱门茨', 'J406', '摄影艺术', 2, 5, '在馆'],
  ['思明州志（点校本）', '厦门市方志办', 'K295.73', '地方志', 3, 4, '在馆'],
  ['数字化图书馆建设', '吴建中', 'G250.76', '图书馆学', 4, 3, '在馆'],
  ['潮汐与海岸工程', '陈吉余', 'P731.23', '海洋工程', 5, 3, '在馆'],
  ['Python 数据分析', '韦斯·麦金尼', 'TP311.56', '计算机技术', 6, 5, '在馆'],
  ['南侨回忆录', '陈嘉庚', 'K825.46', '人物传记', 7, 4, '在馆'],
  ['世界桥梁美学', '唐寰澄', 'U448', '土木工程', 8, 2, '在馆'],
  ['闽南红砖建筑', '戴志坚', 'TU-882', '建筑艺术', 9, 3, '借出'],
  ['声学基础', '杜功焕', 'O42', '物理', 10, 4, '在馆'],
  ['鲁迅文集', '鲁迅', 'I210.2', '中国文学', 11, 5, '在馆'],
]

export const BOOKS = RAW.map(([title, author, callClass, category, shelfIdx, board, status], i) => ({
  id: `B${String(i + 1).padStart(3, '0')}`,
  title,
  author,
  callNumber: `${callClass}/${String(1000 + i * 7).slice(0, 4)}`, // 示意索书号（分类号/种次号）
  category,
  shelfId: shelfIds[shelfIdx] ?? shelfIds[0],
  board, // 层板：1 是最下面一层
  status,
}))

/** 按书名/作者/分类号模糊查（模拟网络 260ms） */
export async function fetchBookLocation(query) {
  const q = String(query ?? '').trim().toLowerCase()
  await new Promise((resolve) => setTimeout(resolve, 260))
  if (!q) return []
  return BOOKS.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.category.includes(q) ||
      b.callNumber.toLowerCase().includes(q),
  )
}

export function getBookById(id) {
  return BOOKS.find((b) => b.id === id) ?? null
}

export function getBookByInstanceMeta(shelfId, board) {
  return BOOKS.find((b) => b.shelfId === shelfId && b.board === board) ?? null
}
