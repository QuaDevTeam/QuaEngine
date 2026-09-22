# 明天，请再一次呼唤我

QuaEngine 的日系近未来科幻悬疑视觉小说 demo，现处于故事重开发阶段。

2047 年初夏，神代凛来到青叶市，为即将搬迁的海岸台整理声音档案。她与录音员 Mara 在共事中逐渐亲近，直到一条监听线路传来尚未制作完成的次日节目。

## 当前状态

- 世界观、人物、时间通信规则、完整因果链、感情铺垫、序章分场和美术需求已经整理在 [.agents/README.md](.agents/README.md)。文档包含完整剧透。
- 旧故事、旧分支、背景、立绘、CG、配乐和故事专用生成器已删除。
- 14个QuaScript模块贯通序章、七章共同线、尾声和三种结局。人物入口、广播来历、跨夜揭露和新结局已实际写入QS。完整结局单次正文90,205—90,288汉字，提前交接71,034—71,110字，已到9万字的篇幅下限，114,500字分场预算与完整演出仍未完成。详见 [实际实施状态](.agents/manuscript-status.md)；运行 `python3 scripts/story-length.py` 可重算。
- 序章已扩为约1.49万字，研究租用、普通信号对照与两人工作日先行，晚八点再导入首次异常。见 [序章实施](.agents/prologue.md)。
- [89场主线与3场短结局](.agents/scene-plan.md) 的114,500字主线预算继续作为扩写目标。当前正文不能视为全量分场成稿。

- 主菜单区分继续阅读／从头开始，提供读档、章节选择和设置。已读章节可恢复章首状态重读；未读章节隐藏内容。手动存档带章节与时间、覆盖确认；Web 阅读设置独立持久化。图库入口随美术统一制作暂缓开放。
- 保留 Web/Vue 与原生共用的引擎、UI、存档、设置、回看、字体与 Quack 构建基础。内部demo未公开发布，不考虑旧代码、旧接口、旧步骤或旧存档兼容，不添加迁移或稿次分库；见 [开发规范](AGENTS.md)。
- 已修复生产版 SRI 与 QPK 输出／加载链路，实际生产预览已跑通主线。完整验证与未完成项见[开发交接](.agents/implementation-plan.md)。

## 开发

从仓库根目录执行：

```sh
pnpm --filter demo dev
pnpm --filter demo typecheck
pnpm --filter demo assets:build
pnpm --filter demo build
pnpm --filter demo exec vite build --config vite.native-jsc.config.ts
pnpm dev:native
```

当前 Web 界面采用统一的暖白纸面与海绿色，设计记录见 [.agents/ui-design.md](.agents/ui-design.md)。界面截图与交互检查可运行 `pnpm --filter demo test:ui`。

完整文字故事与 UI 回归：先运行 `pnpm --filter demo exec vite preview --port 4178`，再运行 `pnpm --filter demo test:story`。需要仓库的 Playwright 和本机 Chrome；可用 `QUA_STORY_URL` 指定预览地址。脚本在独立浏览器存储中检查三个结局、各选择回应、刷新读档、标题续读、覆盖确认、章节重读、回看、设置与不同窗口尺寸；结果位于 `.generated/qa/story/`。

旧 `assets:generate` / `assets:regenerate*` 命令已移除。首批角色参考及背景提示词已经整理为 [.agents/prologue-art.json](.agents/prologue-art.json)。用户已要求所有图片后续统一制作，当前不再等待生成方式确认。没有新生成图片，也未注册计划中的素材路径。

`pnpm native:e2e` 仍要求正式美术、声音、图库及原生端完整演出，当前文字回归不能替代该门禁。统一制作媒体并接入后，更新真实选项与断言并运行该命令，不能删掉交互检查。

## 工程边界

| 位置 | 用途 |
| --- | --- |
| `.agents/` | 版本化创作档案和实施交接 |
| `src/game/story/prologue-state.ts` | Web／原生共用剧情插件，接收 pipeline 导航意图、执行全文、恢复存档与章节 |
| `src/game/scenes/` | 14 个 QuaScript 文件，覆盖完整主线与三种结局 |
| `src/game/settings-storage.ts` | Web 阅读偏好存储适配器，与剧情存档分离 |
| `src/game/content/` | 已实现内容的图库、章节定义 |
| `src/game/runtime*.ts` | 共用插件与 Web 平台适配 |
| `src/game/ui/` | Web / Native 共用的 TSX、QSS、插件皮肤与导航会话 |
| `src/game/bootstrap.ts` | Vue 舞台与共享 QUI Web 适配器接线 |
| `src/targets/native/` | Native 帧投影、宿主接线与 JavaScriptCore 入口 |
| `assets/` | 发布资源，目前仅通用字体；原生脚本由构建生成 |
| `scripts/` | 运行与验证工具 |

游戏与叙事状态由 engine/store 持有，界面只投影并通过 pipeline 发出意图。静态素材走 Quack 主包，后续运行期增量内容走 Runtime QPK。保留 1920×1080 逻辑舞台和现有目标隔离约束。

## Copyright

The demo game is proprietary demo content. Its story, scenario scripts,
characters, artwork, generated images, CGs, UI presentation assets, icons,
audio, prompts, masks, and other creative materials are fully copyrighted and
are not distributed under the repository's open-source package license unless a
separate written license says otherwise.

You may download and run the demo only to evaluate or demonstrate QuaEngine. Do
not copy, redistribute, modify, extract, reuse, train on, sell, publish, or
include the demo content in another game, engine, dataset, product, template,
asset pack, or public distribution.

Engine source packages outside `demo/` keep their own package licenses.

QuaEngine names, logos, icons, badges, and related brand assets are not licensed
for reuse. See `../TRADEMARKS.md`.

## 场景叠图与截图模式

阅读工具条的“截图”或 H 键隐藏全部 UI，保留背景、角色与场景图片。按 H、Esc 或点击画面恢复；恢复点击不会推进剧情。进入时停止自动阅读/快进，退出后手动继续。截图模式用于系统截图，不会自动导出文件。

任意位置叠图使用 `BackgroundPlugin.addLayer({ id, assetName, x, y, width, height, fit: 'contain', zIndex })`，或 QuaScript 的 `@BackgroundLayer(id, asset, options)`。坐标使用逻辑舞台单位，横屏为 1920×1080，原点在左上。多个图片可同时显示，位于角色后方；`zIndex` 决定图片之间的顺序。清除图层保留原背景。详见 [背景插件文档](../packages/plugins/background/README.md)。

叠图可以通过 `backgroundLayer:<素材ID>` 接入现有动画时间轴，支持位置、尺寸、缩放、旋转和透明度；播放完成后默认保留最终状态。截图模式下场景动画继续播放。TypeScript 与 QuaScript 示例见 [背景插件文档](../packages/plugins/background/README.md#animate-placed-images)。

运行 Demo 开发服务器后，`QUA_STORY_URL=http://127.0.0.1:4186/ node demo/scripts/scene-screenshot-smoke.mjs`（从仓库根目录）检查实际图片解码、指定坐标、动画中间帧与最终状态、暂停/恢复、截图模式下播放和 UI 恢复。证据写入 `.codex-tmp/scene-screenshot/`。

## 共享 UI

Demo 的标题菜单、阅读工具条、章节选择、存读档、确认框、设置与记录面板统一由 `src/game/ui` 定义。两端使用同一份 TSX/QSS、逻辑坐标和导航意图；Web 用可选的 `@quajs/renderer-web/qui` DOM 适配器，Native 继续用 WGPU。基础对白、角色和场景由各自的引擎渲染器投影。

同构是项目可选能力：Web-only 项目仍可使用自定义 Vue/React/Svelte 页面。Demo 必须保持一份产品 UI，不再另外维护 Vue 页面。详见 [共享 UI 开发说明](src/game/ui/README.md)。
