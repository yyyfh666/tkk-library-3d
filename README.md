# 嘉庚图书馆 · 3D 数字展馆

网页版微缩 3D 场景：一座悬浮岛上的嘉庚学院图书馆 + 走进楼里的五楼大厅。
参考的是"成都 3D 微缩城市（CHENGDU IN MINIATURE）"那类展示页的做法。

**全部内容由代码程序化生成** —— 没有任何外部模型或贴图文件，改一个数字就能改形体。

```bash
npm install
npm run dev      # 浏览器打开终端里提示的地址
npm run build    # 打包到 dist/
```

## 场景里有什么

**悬浮岛（默认场景）**：图书馆主楼（白墙 / 闽南红瓦 / 中央蓝玻璃天窗 / 正南入口柱廊）、
西侧柱廊辅楼、楼前石板广场与喷水池、嘉庚式白石牌坊、东侧浅湖、成簇的棕榈与阔叶树、
路灯、长椅、散布的小人、几块飘着的小岩块。

**五楼大厅（点"走进大厅"进入）**：挑空中庭 + 栏杆、四壁书架、阅览长桌与椅子、
靠窗单人格、借还服务台、VR 阅读区（躺椅 + 头显 + 幕布）、会绕圈巡航的导览机器人。

**昼夜**：右上角切换。夜里窗玻璃整片点亮、路灯发光、页面底色从米白切到深蓝 ——
页面底色和 3D 场景背景是同一个颜色，这是参考图那种"模型浮在一整块色上"的关键。

## ⚠️ 交出去之前必须知道的两件事

1. **热点文案和五楼大厅内部布置是示意内容，不是实测资料。**
   建筑外形依据的是那份《三视图线框示意》和几张外观照片；但**大厅内部没有图纸**，
   家具是按"图书馆阅览大厅"的常识摆的。对外别说成"还原实景"。
   文案改 `src/scene/hotspots.js` 里的 `title` / `body` 就行。

2. **这是风格化微缩，不是写实复刻。** 参考图那种质感主要来自手工建模的资产和烘焙光照，
   程序化能到的是"味道对"，细看比不过手工模型。

## 改哪里

| 想改的东西 | 文件 |
| --- | --- |
| 配色（全场景唯一调色板） | `src/scene/palette.js` |
| 材质、某样东西夜里的颜色 | `src/scene/materials.js`（一个材质一行；夜里默认自动压暗，特殊的才手写） |
| 光照强度 / 太阳方向 / 页面底色 | `src/scene/palette.js` 的 `DAY_NIGHT` |
| 主楼形体（每块的宽高位置） | `src/scene/library.js` 顶部的 `BLOCKS` |
| 岛体、湖、飘着的岩块 | `src/scene/island.js` |
| 广场、牌坊、树、路灯、小人 | `src/scene/props.js` |
| 大厅室内 | `src/scene/hall.js` |
| 热点位置与文案 | `src/scene/hotspots.js` |
| 相机机位、娃娃屋藏墙 | `src/scene/worlds.js`（`ISLAND_CAMERA` / `HALL_VIEWS`）、`hall.js` 的 `updateWalls` |
| 界面文案与布局 | `src/App.jsx`、`src/ui/*`、`src/index.css` |

## 结构

```
src/
├── App.jsx              React 外壳：UI 状态、昼夜、场景切换、黑幕转场
├── scene/
│   ├── createWorld.js   引擎：一个 renderer + 两个 world + 渲染循环 + 昼夜插值
│   ├── worlds.js        岛的 world、大厅的 world、相机机位
│   ├── palette.js       调色板 + 场景级昼夜参数
│   ├── materials.js     材质表（昼夜色的唯一出处）
│   ├── lighting.js      每个 world 一套灯 + 昼夜插值
│   ├── island.js        悬浮岛、湖、接触阴影、飘着的岩块
│   ├── library.js       图书馆主楼（体块 / 立面 / 四坡顶 / 燕尾脊 / 入口）
│   ├── props.js         广场、牌坊、树、路灯、长椅、小人
│   ├── hall.js          五楼大厅室内 + 机器人巡航 + 娃娃屋藏墙
│   └── hotspots.js      热点锚点 + HTML 标注层
└── ui/                  左栏标题卡 / 热点胶囊条 / 信息卡 / 控制键
```

## 这套 three.js（r186）上踩过的坑，别再踩回去

- **`PCFSoftShadowMap` 已被删除**：常量还在、赋值不报错，但渲染器会强制降级成
  `PCFShadowMap` 并打一条 warn。直接用 `PCFShadowMap`。
- **addons 只有具名导出**：`import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`，
  写默认导入会直接报错。
- **`THREE.Clock` 已弃用**，用 `THREE.Timer`（`update()` 之后 `getElapsed()`）。
- **平行光 intensity=1 就是"表面全亮"**（r155 起的物理光照，且没有开关了）：
  sun + hemi + ambient 加起来超过 2，白墙和浅绿会当场过曝成纯白。
- **`new THREE.Color(undefined)` 不报错，静默给你白色**。少写一个调色板键，场景里就会出现
  一片莫名其妙的白（我们真踩过：树冠全白）。所以 `materials.js` 里加了硬校验，宁可当场炸。
- 平行光的**阴影相机默认只有 ±5**，不设 `shadow.camera` 边界的话阴影只覆盖场景中心一小块，
  而且改完必须自己调 `updateProjectionMatrix()`。
- 开口圆台（湖盆）从上方看到的是**内壁（背面）**，材质得 `DoubleSide`，否则水面四周是空的。
- 娃娃屋视角要**按相机方位把近侧的墙藏掉**（`hall.js` 的 `updateWalls`），不然近墙挡掉半个屋子。
- 热点光点要**按距离缩放**，否则镜头一近就变成一个糊在脸上的大橙球。

## 看效果不用装浏览器自动化

`tools/preview-shot.mjs`：用 Node 内置 WebSocket 走 CDP 驱动无头 Edge，
自动跑完整条流程（白天 → 夜晚 → 点热点 → 进大厅 → 切视角 → 回校园）并逐步截图，
同时打印页面 console 和未捕获异常。先起 dev server，再 `node tools/preview-shot.mjs`，
截图落在 `%TEMP%\pano-preview\shots3d\`。
**改完先自己跑一遍看截图再交付** —— 这个项目里所有的大 bug（湖里没水、树冠全白、
南墙挡屋子）都是靠看截图抓出来的，纯读代码看不出来。
