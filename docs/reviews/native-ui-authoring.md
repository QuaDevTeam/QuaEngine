# Native UI 编写能力审查

本轮检查的是 QUI/TSX → QSS 编译 → 逻辑坐标投影 → WGPU 绘制 → 输入命中的完整路径。不能用“属性能解析”代替“画面正确”。

## 已修正

| 范围 | 问题与修复 |
| --- | --- |
| 盒模型 | Row/Column/Grid 在 padding 和有效 border 内排布；`border-style: none` 不占边框空间，边框按侧覆盖。最终投影仍是 border box，content-box 扩张仍由编译器完成。 |
| 嵌套布局 | 父级流布局移动容器时，后代及其 hover 等状态坐标同步移动；flex 分配后的尺寸同步给状态变体，避免指针进入后恢复旧宽度。 |
| 圆角 | 圆角约束覆盖图片、边框和 overflow-hidden/Scroll 的后代。嵌套约束取交集，子按钮的文字绘制也继承裁剪。overflow-visible 的子内容保留溢出。圆角外区域不响应点击。 |
| 绘制顺序 | 外阴影 → 背景色 → 背景图片/渐变 → 内阴影 → 文字阴影 → 前景文字/边框 → 子节点。复杂按钮拆开填充和文字，防止不透明填充盖住图片、渐变或文字阴影。 |
| Hover | 仅在状态中出现的阴影等绘制层保持正确顺序；状态 opacity 替换基础样式 opacity，再乘节点/祖先 opacity，不会被基础透明度 0 永久压成不可见。 |
| 过渡 | delay 与 duration 都计入刷新存续时间；延迟结束后继续插值，不会在等待阶段提前停止。保留已有的中断过渡连续性。 |

圆角裁剪使用最终顶点的凸多边形裁剪，保留 UV、颜色和特效参数插值；完全处于约束内的绘制保持原拓扑。曲线每象限最多 64 段，正常 UI 半径以 0.25 物理像素弦误差选取细分，不新增离屏纹理或绘制 pass。圆角边缘的栅格化仍与浏览器抗锯齿存在差异。

## 编写约定

- Row/Column/Grid 负责流布局；Panel/Box 负责绘制；Layer 负责对子树统一加 z 偏移。结构节点不因为设置背景或 hover 就自动变成可点击面板。
- 引擎侧使用逻辑舞台单位。投影中的普通节点坐标是舞台绝对坐标，不能直接把 DOM 的父容器相对定位规则套入 Panel；结构流布局的子项由编译器转换为绝对坐标。
- `box-sizing: border-box` 保持最终尺寸；`content-box` 扩张 QSS 提供的尺寸。显式 QUI/TSX 尺寸优先于 QSS 尺寸。
- 交互按钮通过已有 pipeline intent 触发逻辑；hover、按下、焦点、过渡和临时控件状态不写入游戏存档状态。
- 使用同一字体资产、逻辑尺寸和显式主题。两端拥有相同功能，不等于任意 Web CSS 可以原样映射为 QSS。

## 明确边界

仍不能将这套能力称为完整浏览器 CSS：当前 box-shadow 是单个外阴影或内阴影的解析近似；不支持任意多阴影、backdrop blur 和完整 CSS 选择器。圆角是统一半径，尚无四角独立椭圆半径；分侧边框的内角拼接不等于完整 CSS border 算法。

伪状态目前面向节点自身的绘制样式与变换，不是浏览器整棵 DOM 的动态重排系统；祖先 hover 选择后代、复合伪状态、状态改变布局尺寸后重排兄弟、分组 opacity 离屏合成都不能据本次测试宣称完全等价。复杂文本输入、富文本与媒体能力继续见总体审查清单。

## 验证

- native-ui-compiler：225 项测试，类型检查及构建通过。
- WGPU renderer：`real-wgpu-noop` 811 项测试通过；包括圆角命中、祖先裁剪、纹理坐标插值、hover 外阴影顺序、透明度恢复、带延迟过渡。
- `pnpm native:ui:test`：真实 GPU 像素采样，检查圆角与嵌套裁剪、可见溢出对照、背景色上方的渐变，以及连续外/内阴影梯度。
- `pnpm native:ui:compare`：增加 Chrome 同图参考，输出 `packages/native/target/ui-paint-review.html` 和 `ui-paint-comparison.json`。按固定区域计算 RGB 通道平均绝对误差，形状区域阈值 1.5/255，软阴影区域 5/255；不以这个区域均值宣称逐像素相等。
- 产品 E2E：85 句对话、stealth 分支、设置、Gallery 和 1920×1080 真实 WGPU 回读通过。

本机 Chrome / Apple M4 WGPU 对比中，区域 RGB 通道平均绝对误差：硬阴影 0.258、外阴影 1.270、内阴影 1.330、圆角裁剪 0.198、嵌套裁剪 0.136、背景顺序 0.088（通道范围 0–255）。全部低于上述门槛。

这些测试建立了明确的回归底线，覆盖本次修复；尚不构成所有分辨率、所有主题、所有输入与组合状态均完备的证明。


## HUD 与系统面板同构

`demo/scripts/hud-parity.mjs` 通过真实点击对工具栏、Backlog、Game Menu、Save、Load、Settings、Title Confirm 逐屏捕获 Web/native，并额外捕获工具栏和菜单 hover。输出 `demo/dist/native/hud-parity/review.html`、`measurements.json`、`checks.json`。比较使用 1920×1080 逻辑舞台、960×540 窗口、DPR 2；断言七个外框最大误差不超过 3 个逻辑像素、菜单顺序相同、存读档均为九个槽位的 3×3 布局。外框断言不是全图像素等价断言。

- `@quajs/render-core` 的 `createMenuActionPresentation`、`createSaveSlotGrid`、`saveSlotDisplayName`、`saveSlotMeta` 等纯函数同时供 Vue Web UI 和 native demo 使用，删除了 Vue 中重复的槽位展示代码。空槽、槽位名称、进度摘要、UTC 时间格式、菜单顺序只有一份实现；原始存档对象及运行包元数据保持不变。
- `demo/src/game/ui-presentation.ts` 共享工具栏动作、按钮尺寸、标题确认文案、面板尺寸和游戏内下方对话区留白策略。动作通过各平台原有 pipeline 入口进入逻辑层；共享模块不导入任意目标的 renderer/host。
- `_ui-theme.scss` 是显式引入的 Web CSS/native QSS 共用主题片段，覆盖面板、工具栏、菜单动作、存档卡片、页签和 hover；没有让官方 renderer 自动加载视觉 CSS。
- Native 菜单顺序改为 Continue / Save / Load / Settings / TITLE，增加标题栏关闭按钮；存读档由竖向列表改为九宫格并提供模式页签。关闭目标面板回到游戏；重新刷新存档列表不会覆盖返回目标。弹窗后仍绘制工具栏，输入由上层遮罩拦截。
- Settings/Backlog native 工厂允许 `resolvePanelBounds(context, preferred)` 注入产品层的逻辑舞台布局；Backlog 另提供 `density: 'compact'`，元数据与对话分栏，长文本仍增长行高并滚动，保留 rewind/voice intents 与 provenance。
- Native JSX 类型补齐编译器已经支持的显式 `x/y/width/height`；只有可绘制的 Box/Panel 声明 `onClick`，不向结构容器宣传无效交互能力。

仍需跟进：Web backdrop-filter 模糊、原生文字栅格与浏览器抗锯齿、完整多阴影组合及伪状态布局等底层差异。当前 Backlog 紧凑模式仅统一排版密度，行内 rewind/voice 按钮及渐变主题仍与 Web 不完全相同；设置字段排版也仍有小幅差异。不能据本轮外框和语义检查宣称任意 Web UI 已可无损映射为 native。

复核：先启动 `pnpm --filter demo dev --host 127.0.0.1` 与 `pnpm dev:native`，让原生停留在标题页，再运行 `node demo/scripts/hud-parity.mjs`。测试期间避免触发开发窗口热重启。完整原生产品流程另运行 `pnpm native:e2e`。

## Hover and memory regression

Native pointer dispatch resolves against the submitted projection frame, while interaction feedback is a transient visual copy. This prevents a hover translation from changing hit geometry and causing a stationary pointer to oscillate between hover and base states. WGPU backend diagnostics retain only the latest two detailed frame plans; missing-resource and submitted-frame metrics are cumulative counters, avoiding unbounded diagnostic memory growth.

## HUD toolbar alignment

The demo toolbar previously used the full 1920px stage for its 5% right inset while the dialogue panel used the landscape aspect safe area. At the default 16:10 safe area this put the toolbar's right edge 86.4 logical pixels too far right. The native surface now receives the readonly engine layout and derives the toolbar rectangle from the same safe area and 5% inset as the dialogue. The Web stage-plane toolbar applies the equivalent safe-area conversion through layout CSS variables. Native QSS no longer repeats toolbar geometry in base or hover rules.

Native stage fitting now keeps the authored landscape or portrait aspect ratio while the window contributes only letterboxing and scale. This keeps logical toolbar and dialogue coordinates stable across window ratios and DPR. `hud-parity.mjs --toolbar-only` was run against the real Web and native demo: native right-edge error was below `0.01`, Web right-edge error was `0`, and the largest cross-target logical rectangle difference was `0.009375` pixels, with all hover controls contained by the toolbar.
