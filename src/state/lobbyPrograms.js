/**
 * 一楼数字展屏的节目单（演示内容）。
 *
 * 这里只放**数据**，画布怎么画在 scene/lobbyScreen.js。
 * 每个节目 3 页，屏幕每页停 7 秒，播完自动循环；
 * 右栏的"数字展屏"卡片可以换节目、暂停，AI 馆员也能直接把某一档放上屏。
 *
 * ⚠️ 讲座、活动、科研成果、学生作品都是**示意内容**，不是真实排期；
 * 对外展示时按学校实际信息替换，别把演示节目单当成正式公告。
 */

export const LOBBY_PROGRAMS = [
  {
    id: 'lecture',
    kind: '学术讲座',
    nav: '讲座',
    title: '从红砖到南洋',
    subtitle: '嘉庚建筑的跨海叙事',
    accent: '#D96645',
    tag: 'TKK LECTURE · 12',
    slides: [
      {
        eyebrow: '学术讲座 · 第 12 期',
        title: '从红砖到南洋',
        lines: ['嘉庚建筑的跨海叙事', '红砖、白石与骑楼之间的文化往返'],
        stat: '10.24',
        statLabel: '周四 19:00 · 三楼报告厅',
        footer: '主讲 · 建筑与土木工程学院　|　入场请提前 15 分钟',
      },
      {
        eyebrow: '讲座提要',
        title: '一座校园，如何成为一部建筑史',
        lines: ['从集美学村的红砖白石，', '看南洋经验如何落在闽南土地上。'],
        stat: '90',
        statLabel: '分钟 · 含 20 分钟问答',
        footer: '现场设有文献展台 · 可借阅相关馆藏',
      },
      {
        eyebrow: '延伸阅读',
        title: '讲座之后，再读三本书',
        lines: ['《闽南红砖建筑》', '《陈嘉庚年谱》 · 《福建民居》'],
        stat: '03',
        statLabel: '本馆藏 · 一楼服务台可咨询',
        footer: '书目为演示数据 · 以馆藏系统为准',
      },
    ],
  },
  {
    id: 'campus',
    kind: '校园宣传',
    nav: '校园',
    title: '在嘉庚，读一座会呼吸的图书馆',
    subtitle: 'Campus · Library · Life',
    accent: '#D9A441',
    tag: 'TKK CAMPUS · FILM',
    slides: [
      {
        eyebrow: '校园宣传 · 一分钟认识这里',
        title: '在嘉庚，读一座会呼吸的图书馆',
        lines: ['挑空中庭把天光引到每一层，', '红砖柱与白石廊在书页之间相遇。'],
        stat: '03',
        statLabel: '层挑空 · 从入口一直望到天窗',
        footer: 'TAN KAH KEE COLLEGE LIBRARY',
      },
      {
        eyebrow: '今天去哪里',
        title: '一楼看展，二楼找书，三楼听讲座',
        lines: ['一楼 · 数字展屏与嘉庚文化展区', '二楼 · 开架书巷与智能书架屏'],
        stat: '1F—3F',
        statLabel: '一条动线，读完一座馆',
        footer: '馆内导览机器人可带路 · 演示服务',
      },
      {
        eyebrow: '校园一角',
        title: '把海风、树影和读书声放进同一帧',
        lines: ['东侧静水，西侧阅览辅楼，', '傍晚的灯带会沿着回廊亮起来。'],
        stat: '18:30',
        statLabel: '馆灯初上 · 夜读时段',
        footer: '开放时间以馆方公告为准',
      },
    ],
  },
  {
    id: 'jimei',
    kind: '嘉庚文化',
    nav: '嘉庚',
    title: '倾资兴学 · 百年嘉庚',
    subtitle: '一座城与一个人的教育理想',
    accent: '#C4573A',
    tag: 'EXHIBITION · TAN KAH KEE',
    slides: [
      {
        eyebrow: '虚拟展览 · 第一展厅',
        title: '倾资兴学 · 百年嘉庚',
        lines: ['从集美小学到厦门大学，', '他把“教育为立国之本”写进一生。'],
        stat: '1874—1961',
        statLabel: '陈嘉庚 · 华侨领袖 · 教育家',
        footer: '展陈文案为示意内容 · 不作为史料引用',
      },
      {
        eyebrow: '展览线索 · 01',
        title: '先有学校，后有校舍',
        lines: ['1913 集美小学', '1918 集美学校 · 1921 厦门大学'],
        stat: '1913',
        statLabel: '从渔村办学的第一间教室',
        footer: '时间轴为常识性史实梳理 · 展陈再创作',
      },
      {
        eyebrow: '展览线索 · 02',
        title: '建筑是凝固的教育理想',
        lines: ['红砖白石、燕尾脊与连廊，', '把南洋的记忆带回闽南。'],
        stat: '05',
        statLabel: '个章节 · 可在全息展台继续观看',
        footer: '北墙展区 · 全息投影 · 第一视角走近观看',
      },
    ],
  },
  {
    id: 'research',
    kind: '科研成果',
    nav: '科研',
    title: '从实验室到海岸线',
    subtitle: '把论文写在大海与城市之间',
    accent: '#4AA8CF',
    tag: 'RESEARCH · FIELD NOTES',
    slides: [
      {
        eyebrow: '科研成果 · 海岸带专题',
        title: '从实验室到海岸线',
        lines: ['潮汐观测、红树林修复、海岸工程，', '让数据回到真实的滩涂与港口。'],
        stat: '06',
        statLabel: '个研究方向 · 跨学科联合展示',
        footer: '科研成果为示意条目 · 以学校发布为准',
      },
      {
        eyebrow: '一张观测网',
        title: '把每一次潮起潮落记下来',
        lines: ['浮标、遥感、样方与长期观测，', '拼出一条海岸线的健康曲线。'],
        stat: '24/7',
        statLabel: '连续观测 · 数据汇入数字孪生',
        footer: '展屏可视化仅为示意 · 非实时数据',
      },
      {
        eyebrow: '把成果带回课堂',
        title: '科研不是终点，是下一堂课的开始',
        lines: ['数据集、样带照片与工程模型，', '都可以成为学生手里的问题。'],
        stat: '01',
        statLabel: '个开放问题 · 等你来回答',
        footer: '相关馆藏 · 海洋科学 / 海岸工程',
      },
    ],
  },
  {
    id: 'student',
    kind: '学生作品',
    nav: '作品',
    title: '把课堂做成作品',
    subtitle: 'Student Works · 2026',
    accent: '#6E9E55',
    tag: 'STUDENT WORKS · OPEN CALL',
    slides: [
      {
        eyebrow: '学生作品 · 开放展映',
        title: '把课堂做成作品',
        lines: ['建筑模型、影像、交互装置与数字展陈，', '让学习被看见，也让问题被看见。'],
        stat: '12',
        statLabel: '件作品 · 本学期精选',
        footer: '作品信息为示意 · 征集与展映以馆方公告为准',
      },
      {
        eyebrow: '作品 01 · 数字展陈',
        title: '一座图书馆的三种走法',
        lines: ['俯视看结构，贴近看材质，', '第一视角看书与人的距离。'],
        stat: '3D',
        statLabel: '实时场景 · 程序化生成',
        footer: '学生作品示意 · 交互与建模均由课程完成',
      },
      {
        eyebrow: '作品 02 · 影像',
        title: '在海风里读一页书',
        lines: ['把校园的日常剪成一首短片，', '让安静的阅读也有自己的节奏。'],
        stat: '02:00',
        statLabel: '短片时长 · 循环展映',
        footer: '征集下一件作品 · 一楼服务台',
      },
    ],
  },
  {
    id: 'newbooks',
    kind: '新书推荐',
    nav: '新书',
    title: '本周新书 · 五本',
    subtitle: 'New Arrivals · This Week',
    accent: '#D9A441',
    tag: 'NEW ARRIVALS · WEEK 42',
    slides: [
      {
        eyebrow: '新书推荐 · 第 42 周',
        title: '本周新书 · 五本',
        lines: ['《深海浅说》 · 《闽南红砖建筑》', '《人工智能导论》 · 《海洋与文明》'],
        stat: '05',
        statLabel: '本新书 · 一楼新书推荐区',
        footer: '书目为演示数据 · 以馆藏系统为准',
      },
      {
        eyebrow: '新书 01',
        title: '《深海浅说》',
        lines: ['汪品先 著 · 海洋科学', '从海面到深渊，重新认识这颗蓝色星球。'],
        stat: 'P7',
        statLabel: '索书号示例 · 二楼开架书巷',
        footer: '在馆状态请咨询 AI 馆员或服务台',
      },
      {
        eyebrow: '新书 02',
        title: '《闽南红砖建筑》',
        lines: ['戴志坚 著 · 建筑艺术', '红砖、白石与燕尾脊的地方性智慧。'],
        stat: 'TU-882',
        statLabel: '索书号示例 · 建筑专题书架',
        footer: '与嘉庚文化展区联动 · 可预约导览',
      },
    ],
  },
  {
    id: 'notice',
    kind: '活动公告',
    nav: '公告',
    title: '本周活动日历',
    subtitle: 'What’s On · This Week',
    accent: '#D96645',
    tag: 'NOTICE BOARD · WEEKLY',
    slides: [
      {
        eyebrow: '活动公告 · 本周',
        title: '本周活动日历',
        lines: ['周四 · 嘉庚建筑讲座', '周六 · 新生馆藏导览 · 周日 · 学生作品展映'],
        stat: '03',
        statLabel: '场活动 · 一楼数字展屏同步',
        footer: '活动为示意排期 · 以馆方正式公告为准',
      },
      {
        eyebrow: '周四 19:00 · 三楼报告厅',
        title: '嘉庚建筑讲座',
        lines: ['从红砖到南洋：建筑的跨海叙事', '现场设文献展台与问答环节。'],
        stat: '90',
        statLabel: '分钟 · 建议提前入场',
        footer: '报名方式以馆方公告为准',
      },
      {
        eyebrow: '周六 10:00 · 一楼大厅',
        title: '新生馆藏导览',
        lines: ['跟着导览机器人走一遍借阅动线，', '再去看一场嘉庚文化全息故事。'],
        stat: '45',
        statLabel: '分钟 · 每场 20 人',
        footer: '集合点 · 一楼数字展屏前',
      },
    ],
  },
]

export const DEFAULT_PROGRAM_ID = LOBBY_PROGRAMS[0].id

export function getLobbyProgram(id) {
  return LOBBY_PROGRAMS.find((p) => p.id === id) ?? LOBBY_PROGRAMS[0]
}

export const SLIDE_SECONDS = 7
