# 嘉庚图书馆 · 3D 数字展馆

网页版 3D 场景：一座悬浮岛上的嘉庚学院图书馆 + 走进去的**三楼大厅**（挑空三层、第一视角可漫游）。
参考的是"成都 3D 微缩城市（CHENGDU IN MINIATURE）"那类展示页的做法。

**全部内容由代码程序化生成** —— 没有任何外部模型或贴图文件（砖、木、灰泥、水磨石、吊顶、
叶片都是 canvas 现画的），改一个数字就能改形体。大厅形体的对标依据是本仓库的
`参考资料/实拍照片/`（12 张实拍，2026-10-13 收到）。

```bash
npm install
npm run dev      # 浏览器打开终端里提示的地址
npm run build    # 打包到 dist/
```

## 场景里有什么

**悬浮岛（默认场景）**：图书馆主楼（白墙 / 闽南红瓦 / 中央蓝玻璃天窗 / 正南入口柱廊）、
西侧柱廊辅楼、楼前石板广场与喷水池、嘉庚式白石牌坊、东侧浅湖、成簇的棕榈与阔叶树、
路灯、长椅、散布的小人、几块飘着的小岩块。

**三楼大厅**（点"走进大厅"→ 再点"第一视角漫游"）—— 按实拍照片重建的真实米制室内：

- **红砖墩柱**（花岗岩柱基与压顶）与**白色凹槽圆柱**上下对位，贯穿三层
- **挑空回廊**：黑钢密杆栏杆 + 木扶手，廊边垂吊绿植成串（照片里最抓人的一笔）
- 两侧翼**对称双跑楼梯**（踏步 0.15m，黑钢扶手，0→1→2 层贯通），中庭南缘的**层叠看台**
  （花岗岩，一级级能走上去，顶上安着深色根雕）
- **深胡桃木书架**书巷（黑钢架 + 书脊白标条），北墙一段**红砖展墙**
- 白瓷砖**黑镶边地面**（每 2.4m 一格）、白色格栅**吊顶**（筒灯 + 灯带）、窗外树影
- 阅览桌椅、借还服务台、VR 阅读区、巡游的导览机器人

**第一视角**：鼠标锁视 + WASD（Shift 加速）。能上楼梯、看台上、回廊里走，撞得到墙/柱/栏杆/书架
（沿着墙滑），站上回廊栏杆边不会掉下去；准星指着热点会提示"按 E 查看"。

**昼夜**：右上角切换。夜里吊顶灯带 + 4 盏暖色点光（"馆灯初上"）、窗玻璃整片点亮、
页面底色从米白切到深蓝 —— 页面底色和 3D 场景背景是同一个颜色，这是参考图那种
"模型浮在一整块色上"的关键。

## ⚠️ 交出去之前必须知道的两件事

1. **大厅内部是按实拍照片对标的示意性重建，不是测绘。**
   外形依据那份《三视图线框示意》和外观照片；大厅对照 `参考资料/实拍照片/` 的 12 张手机实拍
   （红砖柱、白墙、挑空回廊、层叠阶梯、深木书架），但**家具布置、展品位置、热点文案都是示意内容**，
   没有图纸。对外别说成"实景还原 / 1:1 复刻"。文案改 `src/scene/hotspots.js`。

2. **仍是"程序化的写实"，不是手工资产的写实。** 照片那种质感来自手工建模与烘焙光照，
   程序化能到的是"形体对、光影对、细节有"，凑近看比不过手工模型。

## 改哪里

| 想改的东西 | 文件 |
| --- | --- |
| 配色（全场景唯一调色板） | `src/scene/palette.js` |
| 材质、某样东西夜里的颜色 | `src/scene/materials.js`（一个材质一行；夜里默认自动压暗，特殊的才手写） |
| 程序化贴图怎么画（砖/木/石/吊顶/叶片/书脊） | `src/scene/textures.js` |
| 光照强度 / 太阳方向 / 页面底色 / 大厅灯池 | `src/scene/palette.js` 的 `DAY_NIGHT`、`HALL_LIGHT` |
| 主楼形体（每块的宽高位置） | `src/scene/library.js` 顶部的 `BLOCKS` |
| 岛体、湖、飘着的岩块 | `src/scene/island.js` |
| 广场、牌坊、树、路灯、小人 | `src/scene/props.js` |
| **大厅布局（唯一真相）** | `src/scene/hallLayout.js`：尺寸/柱网/楼梯/看台/书架/栏杆/机位/机器人路径 |
| 大厅几何怎么"砌" | `src/scene/hall.js`（改布局不用动这里） |
| 第一视角手感（速度/眼高/半径/步高） | `hallLayout.js` 的 `HALL_VIEWS.walk` |
| 碰撞解算 / 行走推进 | `src/scene/collision.js`、`src/scene/walkControls.js` |
| 热点位置与文案 | `src/scene/hotspots.js`（大厅锚点来自 `hallLayout.js` 的 `HOTSPOT_ANCHORS`） |
| 相机机位、娃娃屋藏墙 | `hallLayout.js` 的 `HALL_VIEWS`、`hall.js` 的 `updateWalls` |
| 界面文案与布局 | `src/App.jsx`、`src/ui/*`、`src/index.css` |

## 结构

```
src/
├── App.jsx              React 外壳：UI 状态、昼夜、场景切换、第一视角开关、黑幕转场
├── scene/
│   ├── createWorld.js   引擎：一个 renderer + 两个 world + 渲染循环 + 昼夜插值 + __stage 测试钩子
│   ├── worlds.js        两个 world（岛 / 大厅），大厅是三态机（俯视 / 贴近 / 第一视角）+ 准星拾取
│   ├── hallLayout.js    三楼大厅布局的唯一真相（纯数据 + cutRects 挖洞分解）
│   ├── hall.js          把布局"砌"成几何：几何与碰撞同源、按材质合并、书 instancing
│   ├── textures.js      canvas 程序化贴图 + bakeBoxUV（把平铺烘进 UV）+ 程序化环境反射
│   ├── collision.js     纯函数碰撞：圆柱 vs AABB 滑动解算、地面/坡道取高
│   ├── walkControls.js  第一视角控制器（PointerLock 只管锁与转头，平移自己从四元数算）
│   ├── palette.js       调色板 + 场景级昼夜参数 + 大厅灯池参数
│   ├── materials.js     材质表（昼夜色的唯一出处；支持贴图/标准材质/basic）
│   ├── lighting.js      每个 world 一套灯 + 昼夜插值（阴影相机参数可按场景给）
│   ├── island.js        悬浮岛、湖、接触阴影、飘着的岩块
│   ├── library.js       图书馆主楼（体块 / 立面 / 四坡顶 / 燕尾脊 / 入口）
│   ├── props.js         广场、牌坊、树、路灯、长椅、小人
│   └── hotspots.js      热点锚点 + HTML 标注层 + 第一视角的不可见拾取代理球
└── ui/                  标题卡 / 胶囊条 / 信息卡 / 控制键（含第一视角按钮）
```

## 这套 three.js（r186）上踩过的坑，别再踩回去

**通用**
- **`PCFSoftShadowMap` 已被删除**：常量还在、赋值不报错，但渲染器会强制降级成
  `PCFShadowMap` 并打一条 warn。直接用 `PCFShadowMap`。
- **addons 只有具名导出**：`import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`，
  写默认导入会直接报错。
- **`THREE.Clock` 已弃用**，用 `THREE.Timer`（`update()` 之后 `getElapsed()`）。
- **平行光 intensity=1 就是"表面全亮"**（r155 起的物理光照，且没有开关了）：
  sun + hemi + ambient 加起来超过 2，白墙和浅绿会当场过曝成纯白。
  （要判断"会不会爆"的准确红线是 π≈3.14 —— Lambert 的 BRDF 是 albedo/π；2 是保守的工作预算。）
- **`new THREE.Color(undefined)` 不报错，静默给你白色**。少写一个调色板键，场景里就会出现
  一片莫名其妙的白（我们真踩过：树冠全白）。所以 `materials.js` 里加了硬校验，宁可当场炸。
- 开口圆台（湖盆）从上方看到的是**内壁（背面）**，材质得 `DoubleSide`。
- 热点光点要**按距离缩放**，否则镜头一近就变成一个糊在脸上的大橙球。

**阴影（米制小尺度要整套一起改）**
- 平行光的**阴影相机默认只有 ±5**，不设 `shadow.camera` 边界阴影只覆盖中心一小块，改完要手动 `updateProjectionMatrix()`。
- 大厅把 `shadowExtent` 收到 28 后，`shadow.camera.far` 必须同时给（默认 extent*3=84 太近 → 整厅没阴影），
  `normalBias` 要从 0.7 降到 0.03（不然影子整体飘走）。**四个参数是一套，改一个漏三个等于没改。**

**材质与环境反射**
- **`MeshStandardMaterial.envMapIntensity` 默认就是 1**：想"只给表里声明过的材质挂环境反射"时，
  千万不能用 `material.envMapIntensity > 0` 当判据（恒真）——环境会挂到**所有** Standard 材质上，
  每个白面都被环境亮度抬亮，白墙/看台/绿植直接过曝成 255。要在 `userData` 里记下表里声明的值。
- **别用 `scene.environment`**：r186 会拿 `scene.environmentIntensity` 覆盖每个材质的
  `envMapIntensity`（`WebGLRenderer` 里写死的），还会波及场景里所有 Lambert。
  要环境反射就**逐材质挂 `material.envMap`**。
- 颜色图 `colorSpace = SRGBColorSpace`，**凹凸图必须留 NoColorSpace**，否则 gamma 二次污染。
- 吊顶这类"面朝下、收不到太阳"的大面，不补自发光就是一块灰板 —— 室内反光的效果要靠它替。
- **点光近距离亮度 = intensity / d²**（物理单位）：灯装 3m 高时地面最亮 ≈ intensity/9，
  超过 ~1.5 等效全亮就是死白。大厅只放 4 盏，多了帧率真的掉。

**控件与拾取**
- **`OrbitControls.update()` 不检查 `enabled`**：补间飞行期间调它会被**新机位**的
  min/maxDistance 夹住（旧版就带着这个瑕疵）。补间期间用 `camera.lookAt()` 定姿态，
  落地后再把 target 交还。
- 每帧无条件 `controls.update(dt)` 的 world 里，任何"自己写相机"的模式（第一视角）
  **必须跳过这一行**，否则两套输入抢相机。
- `PointerLockControls` 的 `moveForward/moveRight` 读 `camera.matrix`，而 matrix 要等
  `renderer.render()` 才刷新 → 平移方向滞后一帧。第一视角的平移从 `camera.quaternion` 自己算。
- **`Raycaster` 不检查 `visible`**：`visible = false` 的球照样能被命中 —— 第一视角的准星拾取
  就是靠这个做"不可见代理球"。
- `InstancedMesh.setColorAt` 之后要手动 `instanceColor.needsUpdate = true`；
  `instanceColor` 与 `material.color` 是**相乘**的关系（所以书的材质白天必须纯白，
  昼夜压暗才能自动生效）。
- 娃娃屋视角要**按相机方位把近侧的墙藏掉**（`hall.js` 的 `updateWalls`），
  但第一视角下要**锁定**（四面临墙全回来），不然站在屋里的近侧墙会消失。

## 看效果不用装浏览器自动化

两条 CDP 截图回路（Node 内置 WebSocket 驱动无头 Edge，零依赖）。先起 dev server：

- `node tools/preview-shot.mjs` —— **回归基线**：按按钮跑完整条流程
  （白天 → 夜晚 → 点热点 → 进大厅 → 切视角 → 回校园）并逐步截图，同时打印 console 与未捕获异常。
  它靠 CSS 类名与中文按钮文案找按钮，**改 UI 文案会把它弄断**（改文案时同步给它）。
- `node tools/preview-interior.mjs` —— **室内专项**：全程走 `?scene=hall` URL 参数与
  `window.__stage` 测试钩子（仅 DEV 暴露），不点任何按钮；出 20 张图（含第一视角系列），
  另跑**走路仿真**（爬/下楼梯、撞砖柱、看书巷、回廊栏杆）、**准星拾取实测**、**曝光探针**
  （过曝点数量 + 平均亮度），最后打印 draw call 数。

截图落在 `%TEMP%\pano-preview\shots3d\`。

**比对要用容差，别用 md5**：场景里有自动旋转、机器人巡航、昼夜指数过渡，推进量依赖帧时序；
无头软件渲染只有 1~2 fps（`dt` 还被钳在 0.1s），**同一份代码两次截图也不可能逐字节相同**
（岛屿那张"回校园"的差异就来自补间没走完就被切走的相机）。

```bash
node tools/img-diff.mjs 基线.png 现在.png --max-bad=100   # 平均差 / 最大差 / 超阈值像素占比
```

`参考资料/基线截图/` 存着重建前的 6 张老基线（岛屿那几张仍可对照；大厅两张已按计划过时）。

**改完先自己跑一遍看截图再交付** —— 这个项目里几乎所有的大 bug（湖里没水、树冠全白、
南墙挡屋子、屋顶盖死俯视总览、楼梯顶穿吊顶、白墙过曝成 255）都是看截图或探针抓出来的，
纯读代码看不出来。
