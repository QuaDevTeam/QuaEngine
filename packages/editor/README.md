# QuaEngine Editor

独立 Electron 创作工作区，直接接入 QuaEngine 的 Web / Native 开发入口，无 devframe 依赖。

通过「文件 → 新建项目」或空白编辑区入口创建常规 Vue / QuaScript 项目、Runtime / Devtools 插件项目。选择父目录和项目名后，IDE 创建新目录并打开，插件项目隐藏预览区域。模板附带源码、构建配置和 README；新项目携带当前 IDE SDK 的 `vendor/quajs` 压缩包，可随项目移动。

运行预览后，底部「存储」提供只读调试：Web 按 Local/Session Storage、IndexedDB 数据库／表和 Cache Storage 浏览；Native 按引擎存档、Host 命名空间记录、已挂载 QPK 与驻留资源浏览。支持紧凑图标操作、Key／路径筛选、分页、JSON 树、原文／十六进制详情和复制。绿色行标识实际驻留内存的资源，选中时单独高亮。Web 项目向 `createEditorPreviewRuntime` 注入 `getResources: () => getWebAssetMemoryEntries(rendererAssets)` 后，还可浏览 Web Renderer 的资源句柄、引用数及估算字节（不包含浏览器内部缓存和 GPU 分配）；Demo 已接入。二进制字段只显示元数据或有界字节预览，刷新、停止或切换会话会清除旧结果。当前 Web 预览使用临时隔离分区，停止后清除；Native Demo 的 MemoryBackend 存档和 InMemory Host 数据也仅存活于当前会话，后端信息见存储位置的悬停提示。Native 项目需启用 `editor-core/runtime` 才能查看引擎存档，Host/QPK 检查独立可用。

打开项目和启动预览时自动检测运行环境，安装缺失的 npm/pnpm 依赖，并在编辑区显示进度、日志、取消和重试。Node.js、npm/pnpm、Rust/Cargo 缺失时下载到 IDE 用户数据的 `runtimes` 目录，校验官方 SHA-256；预览和新终端使用这套环境，不修改全局工具链或 shell 配置。安装禁用依赖生命周期脚本，失败后保留文件并提供重试。原生编译仍需要系统 SDK／链接器：macOS 会请求 Command Line Tools 系统安装，Windows/Linux 缺失组件会显示具体提示。

## 开源许可与社区共建

IDE 采用 **[Mozilla Public License 2.0（MPL-2.0）](LICENSE)**，希望通过公开协作持续改进，并让对外分发的 IDE 代码改进继续可供社区使用。欢迎提交问题、修复、功能、文档和测试；参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

许可范围是 `packages/editor/` 下的第一方源文件，包括 `core`、`ui`、`electron`、`character`、`novel-writer`，以及对应的测试、构建脚本、配置、文档和内置 agent 指令。目录级声明见 [NOTICE](NOTICE)，五个包也各自附带 `LICENSE` 和 `NOTICE`。根目录的 Apache-2.0 不是这些 IDE 文件的可选许可证。

- **允许商用、修改和 Fork**。合规商业使用不是侵权；MPL 不包含禁止商用或禁止二次开发的限制。
- **对外分发时保留源码义务**。分发受 MPL 覆盖的源文件及其修改，必须遵守 MPL；分发应用、编译后的 JavaScript 或其他可执行形式时，也要按 MPL 第 3.1、3.2 节向接收者提供对应版本的受覆盖源码，并告知获取方式。
- **保护范围以文件为单位**。修改受覆盖文件，或将其中代码复制进新文件，仍受 MPL 约束。没有包含 MPL 代码的独立文件可以采用其他许可；MPL 不要求整个组合产品全部开源。
- **鼓励贡献回上游**。提交 PR 是社区倡议，不是许可义务；只在内部修改、未分发软件的服务端使用，本身也不触发 MPL 的源码披露义务。
- **保留声明并区分品牌**。不得移除 MPL 要求保留的许可和版权等声明。Fork 不得冒充官方，名称和 Logo 使用遵守 [商标政策](../../TRADEMARKS.md)。

IDE 使用的外部引擎、编译器、语言服务、项目检查器和 VS Code 扩展等共享包沿用各自许可。第三方依赖和引入的第三方代码沿用其自身许可与声明。使用 IDE 创作游戏、剧本或其他作品，不会仅因使用工具而使作品适用 MPL；若作品包含受覆盖代码，仍须遵守该代码的许可。Demo 创作素材和品牌资产另有条款，见 [LEGAL.md](../../LEGAL.md)。

发布 IDE 或其修改版时，应随包提供 MPL 文本与适用声明，并在发布说明或随附文档中提供与该发布版本一致的源码归档或固定 tag/commit 链接；修改版不能只链接未包含修改的上游源码。npm 包需保留各包根目录的 `LICENSE`、`NOTICE`，桌面发行包还需随附实际打包依赖的第三方许可。以上是说明与发布指引，具体权利义务以 MPL 正文为准。

## 从源码运行

```bash
pnpm install
pnpm dev:editor
```

窗口中选择包含 `qua.project.yaml` / `.yml` / `.json` 和 `package.json` 的项目目录。当前仓库可打开 `demo`。

已经构建时可直接启动，也可传绝对项目路径：

```bash
pnpm --filter @quajs/editor-electron start --project /absolute/path/to/QuaEngine/demo
```

## 当前实现

- `core`：不依赖 Electron 的项目/文档契约、预览会话和取消/停止控制器。
- `ui`：Monaco QuaScript 高亮、语义补全、悬浮说明、F12 定义跳转、格式化、诊断、故事节点回源、磁盘差异比较及预览面板。
- `electron`：隔离 preload、后台项目检查线程、冲突检测和原子保存、受管子进程、Web/Native 按需适配器。
- 工作区：可切换的资源管理器／搜索／故事节点，虚拟目录树、多文档标签栏，以及底部问题／Debug Console／Assets Browser；侧栏、编辑器与预览、底部面板均可调整大小。
- Web：运行项目的 `dev:web`（或 `dev`）脚本，传入 Vite 的本地 host/port 参数，在无 Node 权限的独立 WebContentsView 中预览。每次会话使用独立临时 Chromium 存储。
- Native：运行项目的 `dev:native` 脚本。macOS 上 QuaEngine Native 产品循环把 WGPU 的 CAMetalLayer 注册到 CAContext，Electron 通过原生 NSView/CALayerHost 直接嵌入该图层。Core Animation 负责合成，编辑器不接收图像、不读回像素、不用 canvas 或截图刷新；指针操作经既有输入路径回传。当前 demo 使用内存存储。

Native 开发入口必须支持本仓库新增的 editor preview 协议；不支持时显示错误。编辑器的两条适配器不导入 target core，也不重新装配游戏 bootstrap；项目已有目标构建链负责 resolver/manifest 和 QPK 校验。

## 连续编辑与外部修改

QuaScript 语言能力调用现有 `@quajs/language-server` 和编译器，使用当前未保存文本及项目 `quascript.config.json` 等配置。`Ctrl+Space` 补全、`F12` 跳转，工具栏可格式化。定义跳转只打开当前项目内可编辑源文件；依赖、生成文件和项目外路径不开放。异步结果过期后会丢弃，语言服务留在后台线程。

不同角色的名字和对白正文使用不同颜色，同一角色标签在当前项目的不同文件间保持一致；旁白、注释、选项和 `${…}` 表达式保留原有语法颜色。着色范围直接来自共享编译器 AST，与诊断一起返回。后台复用 TypeScript LanguageService、单次解析结果和有界文档分析缓存；项目源文件变化会使缓存失效。角色别名暂不自动归并。

打开项目和磁盘变化后自动检查所有已索引的 `.qs`，再根据实际 `tsconfig.json` 检查 TypeScript 的配置、语法与类型错误，无须逐个打开文件。底部“问题”面板显示进度、错误数量、诊断代码及源文件行列，点击即可定位。静态检查状态仅保留底部栏右侧的图标，悬浮显示进度和错误/警告数量，点击打开问题面板。项目检查读取磁盘，当前 QuaScript、TypeScript/JavaScript 的未保存文本提供实时诊断并替换该文件的磁盘诊断。问题、调试控制台和资源浏览器采用统一页签，支持方向键切换。调试控制台会按 Web／Native 来源和错误、警告、成功、调试级别显示颜色，并高亮 URL、源文件位置和常见日志级别。

项目配置了 `eslint.config.*` 时，TS/TSX/MTS/CTS 和 JS 文件会自动运行项目安装的 ESLint，遵循其解析器、插件、规则及忽略配置。兼容旧配置的项目 ESLint 版本也可读取 `.eslintrc*` 或 `package.json` 中的 `eslintConfig`。配置查找限于打开的项目内；无配置时跳过，依赖缺失或配置错误会显示提示。检查结果以 `ESLint/规则名` 显示在源码标记和问题面板，与 TypeScript 类型错误并存。支持未保存草稿，保存配置后自动刷新；独立线程执行，不自动修复或写回文件。

预览及依赖安装的 stdout/stderr 在进入普通日志前分别进行流式清洗：完整移除跨数据块的 ANSI 清行、颜色、光标和终端超链接控制码，回车刷新转换为追加行。正常中文、JSON、字面 `[2K` 文本和错误诊断保留；交互式终端仍由 xterm 处理原始控制码。`node packages/editor/electron/scripts/console-output-smoke.mjs` 验证真实子进程到调试控制台的完整显示路径。

项目目录使用有上限的文件监听，合并事件后刷新文件、资源、故事节点、诊断和目标配置。忽略依赖、隐藏/生成目录与符号链接树；索引最多 20000 个文件、1024 个目录、10 层深度，达到上限或监听失败会提示。可使用“刷新项目”手动重读。当前是后台完整快照刷新，尚非增量索引。

- 无本地修改时，磁盘变化自动同步到编辑器。
- 有本地修改时保留草稿并提示冲突。可“比较差异”、返回编辑整理内容，再“保留本地并保存”；保存仍校验已比较磁盘版本，拒绝覆盖后来的外部修改。
- “载入磁盘版本”在丢弃草稿前确认。文件删除或不可读取时保留缓冲区并禁止保存，恢复磁盘文件后重新核对。
- 切换项目会清理旧监听，项目配置错误会禁用新的预览启动，修复后恢复。不会把索引刷新当作重新打开项目而清空草稿。

## 标签、设置与快捷键

打开 `.qs` 后，文档工具栏可打开底部的 **语句属性**。表单跟随光标，也可通过语句选择器和前后按钮导航；它与其他视图一样可以拖动、拆分、组合和关闭。

表单可编辑台词、说话角色、已有指令的字符串/数字/开关及嵌套对象参数，并添加背景、清除背景、语音、背景音乐、角色登场/退场、立绘、表情和位置指令。资源与角色字段提供项目内候选。没有背景指令表示沿用前文；清除背景需要显式添加。复杂表达式、数组和选择分支保留源码编辑入口。

表单每次输入都写入同一份 Monaco 草稿，代码改动也会更新表单。撤销/重做、切换标签和保存冲突保护沿用原有机制；保存前不会修改磁盘文件。语法错误时暂停表单，修复后恢复。表单只编辑当前语句，不推断前文执行后的场景状态。

左下角齿轮（Ctrl/Cmd+,）打开编辑器设置。字号、缩进宽度、空格／Tab、自动折行、行号、缩略图、保存时格式化立即生效，并保存在当前编辑器用户配置中。缩进设置影响新输入；QuaScript 格式化仍沿用共享编译器的项目规则。

设置中的「外观」可选择 Qua 或石墨主题，并独立选择跟随系统、浅色或深色。默认 Qua 跟随系统，沿用文档站的暖白与玫瑰色调，采用更适合编辑器的低饱和背景。主题立即应用到工作台、代码、终端、官方插件和独立预览窗口的外框，保存于当前用户配置；游戏画面与 Novel Writer 保持各自的外观。切换主题保留文档、插件草稿和终端会话。

`node packages/editor/electron/scripts/theme-smoke.mjs` 验证明暗切换、两套配色、文字对比度、独立窗口同步和偏好恢复，截图位于 `.codex-tmp/editor-theme-smoke/`。

代码 minimap 默认开启，可在设置中关闭，重启后保留选择。资源管理器、资源文件夹和 Git 目录树统一使用 22px 紧凑行高、12px 层级缩进、统一的箭头／图标列及淡色层级线；项目名称和文件数量不再单独占一行。预览操作使用带悬浮提示和快捷键说明的图标按钮，Web/Native 选择位于最右侧；缩窄预览面板仍保持单行。

多个 `.qs` 可同时打开，标签各自保留草稿、撤销历史和滚动位置。只创建一个 Monaco 编辑器，最多保留 24 个文档模型；打开文件时按 24 MiB 文本预算回收已保存的非当前标签，绝不回收未保存内容。关闭未保存标签会确认；切换标签不会丢弃内容。预览启动和源码定位前会保存所有标签，保存冲突会中止操作。

| 快捷键                        | 操作                 |
| ----------------------------- | -------------------- |
| Ctrl/Cmd+S / Ctrl/Cmd+Shift+S | 保存当前／全部文档   |
| Ctrl/Cmd+W                    | 关闭当前标签         |
| Ctrl+Tab / Ctrl+Shift+Tab     | 下一个／上一个标签   |
| Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z | 撤销／重做           |
| Ctrl/Cmd+F / Ctrl+G           | 文件内查找／跳转行   |
| Shift+Alt+F                   | 格式化 QuaScript     |
| F5 / Shift+F5                 | 运行或重启／停止预览 |
| F10                           | 前进一个对话步骤     |
| Ctrl/Cmd+Alt+Enter            | 从源码光标定位预览   |

## 从源码定位 Web / Native 预览

在 `.qs` 中右键目标行，选择“运行到此行”，即可按当前 Web / Native 目标启动并定位预览；也可以把光标放到对白或选项，点击“到光标”。装饰器／空白处选择随后最近的可等待步骤，文件末尾使用最后一个。位置来自 language-server 的共享编译器 AST，当前剧本有静态编译错误时拒绝定位。操作先保存项目中的草稿，保存冲突会中止；异步启动期间不会改用后来移动到的光标行。

项目通过可选的 `@quajs/editor-core/runtime` 开发入口接入（Demo 已接入）：

```ts
// Web 项目的开发入口：动态导入使生产构建可移除整个开发模块。
const preview = import.meta.env.DEV && import.meta.env.VITE_QUA_EDITOR_PREVIEW === '1'
  ? await (await import('@quajs/editor-core/runtime')).createEditorPreviewRuntime(engine, {
      baselinePoint: { sceneId: 'main', stepId: 'editor:baseline' },
      resolveFile: path => registeredScriptFactories[path],
      // enter: () => projectStory.enterPreview(),
    })
  : undefined
```

`resolveFile` 必须验证已注册项目相对路径，返回延迟执行的脚本工厂。工厂在 checkpoint 恢复之后调用，输出与编译器顺序一致、带独立 uuid/storyPoint 的 GameStep。Web 暴露 `globalThis.__QUA_EDITOR_PREVIEW__ = preview.request`，由 CDP 调用固定入口；Native 将受限 `Qua.editorCommand` 转为 `editor/preview/request` intent，通过现有 pipeline 和 host bridge 收到 `editor/preview/response` 后才完成 CDP 请求。卸载时调用 `preview.dispose()`，清除项目适配器的监听及 Web 全局引用。具体项目接入见 `demo/src/game/story/editor-preview.ts` 和 `demo/src/targets/native/session.ts`。

定位通过引擎 checkpoint 恢复初值，依次执行所选文件的脚本步骤，背景、角色和对白由引擎状态重新投影；不会直接修改渲染器。途中遇到选择会暂停，需在预览中选择后继续单步。当前以**单个文件和安装控制器时的基线状态**为范围，不自动重放前面所有章节或猜测分支变量；依赖跨章节状态的项目应准备适合该场景的基线。两个目标均使用相同逻辑控制器，Native 不开放任意 JavaScript 求值。

设置面板打开、面板拖动、隐藏或最小化时隐藏原生预览图层；弹出/停靠重新挂载同一个 NSView，不重启游戏。游戏逻辑和音频仍由项目管理。

## 预览窗口、Inspector 与实时更新

预览栏的“独立窗口”和“全屏”会保留当前会话；独立窗口可刷新、全屏或嵌回编辑器，关闭窗口也会嵌回。Escape 退出全屏。macOS 使用不切换系统桌面的简单全屏；Windows 的窗口与全屏仍需目标系统实测。

预览栏的扬声器按钮控制 Web / Native 预览静音；独立窗口也有同一开关。静音在本次编辑器运行期间跨停止、重启、目标切换和热重载保留，不修改游戏内音量，也不暂停音频进度。

启动预览后，底部 Inspector 显示 Web DOM 或 Rust Native 的真实 QUI 元素层级及其余绘制命令。支持过滤、折叠、键盘导航，选择节点查看属性、位置、尺寸及样式。两端统一通过 CDP 读取，只读，不包含完整 Chrome DevTools 的调试和样式编辑功能。实时检查仅在面板可见时每 1.2 秒执行，节点列表虚拟化，上限 10000 个节点；可关闭实时检查后手动刷新。

保存 `.qs` 后自动更新预览。已定位的剧本会从引擎 checkpoint 重新执行到当前步骤；普通对白修改会保留位置，当前步骤被删除或无法可靠匹配时从该文件起点重放。删除整个文件或尚未定位过文件时返回项目启动状态，遇到选择仍会暂停。不会自动推断前面章节的分支变量。

Web 通过 CDP 刷新；Native 自动重建项目 JavaScriptCore/QPK 并替换进程，再恢复预览位置。因此 Native 更新时间包含构建和启动时间。编辑器模式由统一文件监听协调重载，项目需要关闭自身重复的 HMR/watch；Demo 已接入。引擎包和 Rust 实现代码变更仍需普通重启构建。

编译、加载或执行失败时，预览区域显示错误详情和“刷新预览”。修复并保存也会自动重试，独立窗口有相同覆盖层。运行错误仍沿用引擎 pipeline；Inspector 和编辑器不会接管游戏状态。

## 文件、搜索与资源

目录树按文件夹优先和自然名称排序，支持模糊路径过滤、自动展开匹配祖先、定位当前文件、折叠全部和键盘方向键／Home／End／Enter。列表按可见区域渲染，不会只显示前几百个文件。展开状态与面板尺寸保存在编辑器本地；双击分隔线可恢复默认尺寸。

| 快捷键           | 操作                                            |
| ---------------- | ----------------------------------------------- |
| Ctrl/Cmd+F       | 展开资源管理器文件筛选；编辑区内查找文档        |
| Ctrl/Cmd+P       | 悬浮快速打开，支持模糊路径、最近文件及 `:行:列` |
| Ctrl/Cmd+Shift+E | 打开资源管理器                                  |
| Ctrl/Cmd+Shift+F | 打开项目全文搜索                                |
| Ctrl/Cmd+J       | 显示／隐藏底部面板                              |

资源管理器工具栏可新建文件和文件夹；右键菜单提供重命名、剪切、复制、粘贴、删除到系统废纸篓、复制相对路径和系统定位。树内支持 F2、Ctrl/Cmd+C/X/V、Delete（macOS 也支持 Cmd+Backspace）。拖动文件／文件夹到目标文件夹或项目名称可移动，悬停会展开文件夹；同目录粘贴副本会自动生成不重名的名称。

移动／重命名会更新打开的 Tab 路径，并保留草稿、撤销记录和保存版本检查。删除需确认，未保存缓冲区仍保留。复制按磁盘内容执行；移动不会自动重写脚本导入或资源引用，随后仍需根据问题面板修正引用。操作不支持符号链接／特殊文件树和隐藏、依赖、生成目录；目录遍历最多 20000 项／10 层，单次复制最多 1 GiB。文件系统撤销、多选和系统外部拖入尚未提供。

全文搜索使用随编辑器安装的 ripgrep，支持大小写、全字、正则、包含／排除 glob，以及匹配高亮与行列定位。包含／排除条件用逗号分隔，例如 `**/*.qs, **/*.ts`。搜索读取磁盘上的已索引文本，不包含未保存草稿；单文件上限 2 MB，结果最多 1000 处，达到输出或时间上限会提示缩小范围。正则采用 Rust regex 语法。

Assets Browser 支持按文件夹浏览、递归筛选、模糊名称／路径搜索、类型筛选、名称／大小／修改时间排序和网格／列表切换。选择资源后可以查看图片、播放音视频、复制项目相对路径或在项目树／文件管理器中定位。图片在后台生成缩略图和有限尺寸的预览；切走面板会停止音视频播放。字体和 QPK/ZIP 等资源包目前展示类型与文件信息，尚不解析包内资源或提供字体排版预览。

选中图片时，右下角状态栏显示原图格式、像素尺寸、文件大小及透明通道；悬停可查看路径、精确字节数和修改时间。尺寸来自后台读取的原图头信息，包含 EXIF 旋转修正，不使用缩小后的预览尺寸。文件修改后自动更新，切换面板或项目时清理；其他资源显示格式与文件大小。

“导入”将所选媒体、字体或资源包复制到当前资源文件夹；“全部资源”对应项目根目录。遇到同名文件会跳过，不覆盖源文件。新增内容进入共享项目索引，并沿用项目既有资源构建流程。当前尚无拖入导入、引用感知的重命名／移动／删除和导入撤销。

## 窗口与菜单

窗口使用自定义标题栏：macOS 左侧是关闭／最小化／全屏按钮，Windows 右侧是最小化／最大化或还原／关闭按钮。空白标题区域可拖动，双击可缩放窗口；关闭仍会检查未保存文档。macOS 保留系统顶部的应用菜单，Windows 通过标题栏菜单按钮或 Alt+M 打开同一套菜单，窗口内不再显示系统标题栏。

## Git 更改与分支

左下角显示当前本地分支；源代码管理默认按目录树展示合并冲突、已暂存的更改和工作区更改。同一文件在暂存后又被编辑，会同时出现在对应的两个分组。M/A/D/R/U 分别表示修改、添加、删除、重命名和未跟踪，颜色与状态字母一起提示。

支持目录／分组折叠、方向键与 Home/End/Enter、模糊路径筛选、树形／列表视图切换；列表只渲染可见行，状态不变时复用已构建的树。点击文件查看对应 diff，行内 +/− 暂存／取消暂存。更改列表和 diff 读取磁盘／Git 暂存区，编辑器未保存的草稿由 Tab 标记。

切换分支时若有未保存文档，可选择“保存全部并切换”“保留草稿并切换”或“取消”。保留草稿会保留全部模型与原磁盘版本；目标分支改动了同一文件时，后续保存仍需处理版本冲突。磁盘上的本地修改不再一律阻止切换，由普通 `git switch` 判断能否安全保留；会覆盖文件或存在未解决冲突时，显示可读警告并保留当前分支。当前不提供自动贮藏、强制切换、推送或拉取。

行为参考 [VS Code Git checkout 实现](https://github.com/microsoft/vscode/blob/main/extensions/git/src/commands.ts)：先尝试正常切换，针对覆盖本地修改给出明确的交互提示。编辑器不把取消／待保存状态当作 IPC 异常展示。

## 原型边界

这是首批实现，还不是计划中的完整编辑器：

- Native 原生嵌入目前仅实现 macOS，依赖运行时检查的 Core Animation remote-layer SPI。Windows/Linux 明确报不支持，不回退到图像传输。原生窗口按产品帧率渲染，旧的传输帧率设置已移除。源码构建需 Xcode Command Line Tools 和 Node-API 头文件；发行包需解包并签名 `dist/native-layer.node`。
- Native 当前提供指针交互与面板等比缩放；独立 viewport resize、键盘/IME、滚轮与面板焦点转发仍待接入。启动时 capability 只宣告 pointer。
- 尚未提供项目创建向导、语言服务快速修复/重命名、工作区会话恢复、可视化写回、跨章节分支状态重建、断点恢复、自动更新或安装包。
- 磁盘冲突目前提供只读比较与显式选择，没有自动三方合并、保存已删除文件的“另存为”或崩溃草稿恢复。
- 切换模式会先保存所有打开的文档、停止旧后端，再从新目标入口启动。当前不迁移运行中的游戏状态。
- 首次 Native 运行会先检测并补齐项目依赖和 Rust 工具链，再执行现有编译与 QPK 构建；系统 SDK／链接器按上文的平台提示安装。

Source Control 采用 VS Code 风格的紧凑布局：分支入口与刷新、树／列表和折叠操作位于同一工具栏，提交说明使用自动增高输入框和紧邻的提交图标，`⌘/Ctrl+Enter` 可提交已暂存内容。分支选择和创建在工具栏下方的小型弹出区域中完成。

工作树差异和暂存区差异使用独立的只读 Diff Tab，与 `.qs` 等文件编辑 Tab 分开。多个差异可以同时保留，差异 Tab 记录各自滚动位置；关闭差异不会关闭文件或丢失编辑草稿。Diff Tab 数量限制为 12，并复用一个 Monaco 只读 Diff Editor。

## 验证

```bash
pnpm --filter @quajs/editor-core test
pnpm --filter @quajs/editor-electron test
pnpm --filter @quajs/editor-core typecheck
pnpm --filter @quajs/editor-ui typecheck
pnpm --filter @quajs/editor-electron typecheck
pnpm exec eslint packages/editor
cargo test --manifest-path packages/native/Cargo.toml -p quajs_native_app --features native-window,native-audio-rodio,javascriptcore editor_preview
pnpm exec turbo build --filter=@quajs/editor-electron...
node packages/editor/electron/scripts/smoke.mjs --native
node packages/editor/electron/scripts/native-embedding-smoke.mjs
node packages/editor/electron/scripts/preview-tools-smoke.mjs
node packages/editor/electron/scripts/preview-tools-smoke.mjs --native
node packages/editor/electron/scripts/tabs-smoke.mjs
node packages/editor/electron/scripts/git-smoke.mjs
node packages/editor/electron/scripts/window-smoke.mjs
node packages/editor/electron/scripts/explorer-smoke.mjs
node packages/editor/electron/scripts/workspace-smoke.mjs
node packages/editor/electron/scripts/workbench-smoke.mjs
node packages/editor/electron/scripts/authoring-smoke.mjs
node packages/editor/electron/scripts/check-project.mjs demo
```

Electron smoke 打开真实 Demo，验证 Web 设置交互、Native 原生画面/设置/剧情推进、面板缩放后的指针映射、源码定位和 F10 单步、设置面板遮挡、未认证 Native 控制拒绝、切换与停止；截图和 macOS/Linux 进程树 RSS 采样写入 `.codex-tmp/editor-smoke/`。这是开发运行基线，RSS 包含预览及构建服务，可能重复计算共享页。完整 Native 产品门禁另跑 `pnpm native:e2e`。

Native embedding smoke 使用临时 Demo 副本和已构建的工作区依赖，在真实 Electron 画布上验证 JSC/wgpu 画面、缩放后的点击、自定义背景 shader 连续帧、弹出后重新嵌回同一会话，以及停止后清空画面。它不修改 Demo 源文件、不安装依赖或更改供应链策略；运行前需要构建 Editor 和 Native 的 TypeScript 包。截图与结果位于 `.codex-tmp/editor-native-embedding/`。本机通过只代表当前操作系统的验证，不代表零拷贝或其他平台的视觉验收。

Tabs smoke 使用临时项目验证多文档草稿／撤销隔离、全部保存、关闭保护、单编辑器实例、偏好持久化、缩进和查找；截图在 `.codex-tmp/editor-tabs-smoke/`。

Git smoke 使用临时仓库验证 diff、暂存／取消暂存、仅提交暂存区、保存／保留草稿／取消切换、覆盖修改的警告和目录树操作。包含目标分支改动同一磁盘文件后草稿仍保留、保存版本冲突保护继续生效的检查；截图在 `.codex-tmp/editor-git-smoke/`。自动 Git 刷新仅在窗口获得焦点时运行。

Workspace smoke 使用临时项目验证补全接受/保存、悬浮说明、同文件与跨文件 F12、格式化、外部刷新、冲突比较与版本校验、文件删除、故事节点增删/重命名和项目切换监听释放。差异截图在 `.codex-tmp/editor-workspace-smoke/`；不会编辑 Demo 源文件。

Workbench smoke 使用 1200 多个临时文件，验证目录树／网格虚拟化、键盘导航、搜索与 Unicode 定位、缩略图实际解码、媒体 Range 请求与播放清理、无覆盖导入、面板尺寸和项目切换后的媒体访问失效。截图和打开耗时样本在 `.codex-tmp/editor-workbench-smoke/`。

Authoring smoke 使用临时项目验证角色着色与跨文件一致性、未打开的 QS/TS 静态错误、精准回源、打开 TS 文件后保留错误、修复后的自动恢复及底部页签键盘操作。截图在 `.codex-tmp/editor-authoring-smoke/`。`check-project.mjs` 复用实际后台检查器，存在静态错误时返回失败；它不替代 Web/Native 运行验证。

会话单测不替代实际内嵌画面、输入、音频和进程清理验证。完整后续范围见 [实施计划](../../.agents/electron-editor-plan.md)。

资源管理器的文件筛选框默认隐藏，聚焦目录树后按 Ctrl/Cmd+F 展开。按 Escape 或点关闭按钮会清除筛选并返回目录树。全文搜索支持区分大小写、全词匹配（词边界）及正则表达式；全词匹配可与正则组合使用，例如 `cat` 不匹配 `catalog`、`bobcat` 或 `cat_2`。

### 故事大纲

故事视图使用与资源管理器相同的紧凑虚拟树，按章节、文件、节点组织已保存的 QuaScript 声明，并显示场景、入口、标签和选项。单场景文件合并重复层级，多场景分别展开；同章编号的不同分支标题保留各自分组。输入框按标题、标识或路径筛选，点击文本跳到准确行列，箭头展开/折叠；支持方向键、Home/End、Enter、折叠全部及定位当前文件。

数据复用编译器 AST 和后台 project-inspector，使用同一份文件索引，排除生成副本。保存或外部修改后刷新；解析错误显示提示并保留其他有效文件。大纲展示源码结构，跨文件按自然路径排序，不推断 TypeScript 宿主中的剧情执行顺序。目前未保存草稿尚不参与项目大纲。

`node packages/editor/electron/scripts/outline-smoke.mjs` 使用真实 Demo 验证节点/选项跳转，然后用临时项目验证多行位置、保存刷新和错误恢复；截图位于 `.codex-tmp/editor-outline-smoke/`。

### Inspector 元素树

底部 Inspector 以类似 Chrome DevTools Elements 的方式显示真实 Web DOM / Native QUI 层级：20px 紧凑行、语法分色的标签与属性、闭合标签、短文本行内显示，以及注释、文档类型、Shadow Root。右侧可切换计算样式与属性，底部路径可点击返回父元素。

方向键展开、折叠和定位父子节点，Home/End 跳到首尾，Alt+箭头或 Alt+点击展开箭头递归操作；筛选保留父级上下文。选择和折叠绑定 CDP 节点 ID，刷新或插入兄弟节点后保持身份。树行虚拟化，仅可见时定时刷新，属性读取串行并合并快速选择请求。当前为只读检查，不提供样式编辑或预览元素拾取。

`node packages/editor/electron/scripts/inspector-smoke.mjs`（加 `--native` 验证 Native）覆盖真实 Demo 与独立大树测试数据，截图保存在 `.codex-tmp/editor-inspector-smoke/`。

### 集成终端

底部「终端」使用 xterm.js + node-pty，提供真实交互式 shell，切入面板时自动创建默认终端，初始目录为当前项目，尚未打开项目时为用户目录。支持中文、ANSI 颜色、交互命令、窗口尺寸同步、多会话切换、清空显示和终止进程；自然退出保留输出及退出码。macOS/Linux 使用用户的登录 shell，Windows 使用 COMSPEC（默认 cmd）。

- Ctrl+反引号显示/隐藏终端；Ctrl+Shift+反引号新建终端，也可使用原生「终端」菜单。
- 终端聚焦时 Ctrl+C/R/S/W/Z 等按键交给 shell。复制/粘贴使用 macOS Command+C/V，其他平台 Ctrl+Shift+C/V。
- xterm 和独立 PTY 服务均按需加载，关闭最后一个会话释放服务。最多 6 个会话，每个保留 2000 行回滚记录。输出批量传输并等待解析确认，通过背压控制内存；隐藏时继续更新屏幕缓冲、停止绘制，尺寸变化合并处理。
- 切换项目、重载窗口和退出时结束对应终端及其子进程；主动脱离终端的 daemon 不属于这项保证。终端以当前用户权限执行命令，不是项目目录沙箱。会话与输出不持久化；终端面板仍可见时会为新项目自动创建默认会话；重载窗口后再次切入终端才启动。

`node packages/editor/electron/scripts/terminal-smoke.mjs` 验证本机 POSIX 终端、交互、后台大量输出及清理，截图和性能样本位于 `.codex-tmp/editor-terminal-smoke/`。Windows ConPTY 与签名分发尚需各自系统验证；打包需保留 node-pty 平台二进制及可执行 spawn-helper，不能将它们仅封装进 ASAR。

### Performance

底部 Performance 显示实时曲线，每秒采样 5 次、保留最近 60 秒，支持暂停和清空。切到其他面板或窗口不可见时停止采样与绘图；预览停止和热重载时释放旧采样，迟到数据不会混入新会话。面板不采集截图，也不常驻运行绘图循环。

- Web：动画帧回调 FPS、帧间隔、预览渲染进程 CPU/RSS 和 JS 堆。FPS 来自实际 rAF 回调频率，不是合成器重绘次数；静止画面仍可能维持回调。
- Native：实际提交渲染帧 FPS、CPU 帧耗时、预览进程 CPU/RSS、实际 Draw Calls 与渲染通道数。Draw Calls 包含合成、阴影和模糊绘制；空闲时保留最后一帧的计数。
- macOS：GPU 利用率直接读取 IOAccelerator（整个系统，多 GPU 取最高值），GPU 内存读取 Metal 设备实际分配量（Apple Silicon 为统一内存）。其他系统的 GPU 分配量取决于 WGPU 分配器支持，Windows/Linux 利用率暂不可用；缺失或预热中的数据用 `—` 显示。

CPU 仅统计预览渲染进程，一个逻辑核心满载为 100%，多核可能超过 100%；不包含编辑器和编译服务。各项数据的范围及来源可悬浮查看。`node packages/editor/electron/scripts/performance-smoke.mjs`（加 `--native`）执行真实 Demo 验证。

### Novel Writer

左侧活动栏选择 Novel Writer，会将整个编辑区域（含侧栏、预览和底部面板）切换到完整写作工作区。现有项目、专家生成、审核/重生成、实时内容、对话、日志、引用、设置、ZIP 导出及回收站均保留。选择资源管理器等图标或按 Ctrl/Cmd+Shift+E 返回剧本工作区；两边的草稿和文档保持原位。写作中 Ctrl/Cmd+S 保存稿件修改，Ctrl/Cmd+, 打开写作设置。

源码整体迁入 `packages/editor/novel-writer`。`pnpm dev:editor` 会构建写作界面和后台，首次打开后才启动独立服务；隐藏时停止绘制，正在生成的任务继续执行。用户数据继续使用 `~/.quaengine/novel-writer`，无需搬迁。关闭时保护未保存修改和运行中的任务，已保存成果/检查点可在下次打开后继续。

`@quajs/editor-novel-writer` 是内置编辑器插件，原独立启动入口已移除。`node packages/editor/electron/scripts/novel-writer-smoke.mjs` 使用独立临时目录验证集成流程，不调用真实模型服务、不改动已有写作项目。

### Terminal presentation

底部终端按 VS Code 的工作台结构组织：会话列表位于终端内容区右侧，顶部保留新建、清空和终止操作，内容区保留等宽字体与竖线光标，选区和 ANSI 颜色随编辑器主题切换。会话支持键盘上下/Home/End 切换，保留原有多会话、调整面板高度、PTY 尺寸同步、隐藏面板背压和进程树清理。终端启动时会剔除已经失效的 `BASH_ENV`、`ENV`、`ZDOTDIR` 路径，避免 shell 每次启动显示无关错误。

### 插件与工作区面板

底部「动画」提供基于 Web renderer 的可视化关键帧编辑：创建或打开 `*.animation.json`，添加角色属性轨道，拖动关键帧，编辑时间／数值／缓动，选择项目图片预览并播放。当前支持 `self` 与 `character:<id>` 的位置、缩放、旋转和透明度。点击「应用到源文件」后按 Ctrl/Cmd+S 保存；新文件不会覆盖已有文件，修改支持源码撤销和版本冲突检查。时间轴使用引擎原生 `AnimationTimeline` 格式；具体用法和边界见 [动画编辑器](animation/README.md)。

底部标签栏和左侧视图切换栏支持右键菜单 / Shift+F10，勾选要显示的项目。
显隐偏好会保留；隐藏当前项会切到可见项，快捷键打开功能时会重新显示对应入口。
故事大纲、Novel Writer 与插件市场使用不同图标。

左侧「插件」中，「项目内」展示已安装插件与内置工具；「插件市场」支持官方目录
搜索和完整 npm 包名查找。选择插件可以查看版本、Runtime / Devtools 能力并安装。
仅 Devtools 的包写入开发依赖，Runtime 或组合包写入正式依赖；安装固定版本，
保留 npm/pnpm 的完整性和信任校验，禁用安装脚本。Devtools 可按项目启用/停用，
安装后直接贡献面板和源码索引。Runtime 仍需在游戏入口配置使用。

目录采用 Git 管理的 JSON，可在「目录源」加载自托管 HTTPS JSON。
目录条目不代表已发布到 npm；未发布、离线或不兼容的包会显示原因。包声明、
分发流程、执行权限和验证范围见 [插件设计](../../docs/design/editor-plugins.md)。

角色浏览器使用角色列表、差分缩略图网格和选中项属性栏。选中差分编辑资源路径，
双击定位定义；所有修改仍是可撤销的源码草稿，保存后重新索引。

```sh
node packages/editor/electron/scripts/character-plugin-smoke.mjs
node packages/editor/electron/scripts/marketplace-smoke.mjs
```

### 写作与项目联动

在 editor 打开项目后进入 Novel Writer，项目联动区可读取 Story Tree 大纲、背景文档、静态角色信息，以及缺少设定时的 QS 正文证据。创建写作项目会将缺失的设定作为输入；已有写作项目使用“关联并补齐设定”，保留原有设定。

顶部“从 QS 改写”读取 Monaco 当前缓冲区及选区，保留尚未保存的文字。联动稿件可以预览并新建 QS、追加至原文件，或智能回写到原位置。AI 根据源码和项目上下文安排增删后的段落，并把固定文字适配回原运行时变量。宿主校验完整稿件映射、保留 TypeScript、演出、选项和故事元数据，再通过项目 QS 静态检查；不兼容的分支或变量改动会明确报告冲突。所有正文写入都是可撤销草稿，正常保存后进入磁盘和项目索引。新场景需按项目原有入口接入。

项目切换、取稿后的缓冲区修改、外部文件修改、路径越界与已有新文件名称均受检查。插件服务与页面由 `EditorHostPlugins` 管理；写作 preload 只提供有限的项目和源码能力。旧的用户项目、凭据和 JSONL 仍位于原数据目录。

`node packages/editor/electron/scripts/writing-project-smoke.mjs` 使用临时项目和本地模拟模型，覆盖增删段落、变量适配、分支保留、源稿关联恢复、保存后继续回写、撤销及冲突拦截。智能回写使用写作设置中的 DeepSeek，支持先预览后应用；这些测试不代表真实模型的语义判断已验收。源文件路径、选区和版本随任务保存，重开任务可继续编辑。

“建立 AI 改写任务”把取稿与项目设定填入原写作流程的新建任务表单，确认要求后再启动生成。取稿包含未保存内容；追加与回写均支持正常撤销。写作区打开时，editor 的打开项目、刷新项目等菜单仍由工作台处理。

### 装饰器提示与编辑快捷键

QuaScript 的 `@` 名称补全、说明、参数提示和定义解析统一由 language-server 提供。补全保留 `@` 并正确替换已有名称；多行参数和未完成调用也能显示当前参数。F12 支持跳转到项目内的装饰器实现，并读取未保存的 TypeScript 草稿。插件参数提示使用 `quajs.language.decorators` 声明，缺少声明时不会猜测底层函数参数。

| 操作                          | 快捷键                                            |
| ----------------------------- | ------------------------------------------------- |
| 命令面板                      | Ctrl/Cmd+Shift+P、F1                              |
| 触发补全 / 参数提示           | Ctrl+Space / Ctrl/Cmd+Shift+Space                 |
| 跳转定义 / 查看定义           | F12 / Alt+F12                                     |
| 下一个相同选区 / 所有相同选区 | Ctrl/Cmd+D / Ctrl/Cmd+Shift+L                     |
| 移动行 / 复制行               | Alt+↑↓ / Shift+Alt+↑↓                             |
| 切换行注释                    | Ctrl/Cmd+/                                        |
| 扩展 / 缩小选区               | Windows/Linux：Shift+Alt+→←；macOS：Ctrl+Shift+→← |
| 查找 / 转到行                 | Ctrl/Cmd+F / Ctrl+G                               |
| 格式化                        | Shift+Alt+F                                       |

保存、全部保存、撤销/重做、文件快速打开、切换/关闭标签、搜索、终端和预览快捷键继续沿用现有工作台行为。命令面板可查看 Monaco 当前可用命令；文本编辑操作沿用 Monaco 的撤销与只读保护。

写作区不再常驻“项目联动”表单。项目名称打开大纲、背景和角色资料；稿件工具栏的“写入项目”打开独立面板。面板中选择更新原稿、追加或新建，先查看带行号的增删差异，再应用到编辑器草稿。普通回写展示项目内相对路径，只有新建才填写文件路径。关闭面板不会丢失当前稿件，可从顶部“继续稿件”重新打开。

### 场景可视化编辑与调试

QS 文档工具栏可打开底部「语句属性」，表单直接编辑同一份源码草稿，支持撤销与正常保存。

运行已接入开发预览的 Web 项目后，打开底部「场景调试」并启用「拾取属性」。点击背景或角色定位设置它的 QS 语句；点击对白可直接改写单行文本。修改进入源码草稿，保存后通过现有预览重载更新场景。遇到源码变化或插值/富文本时会提示转到源码编辑。

时间轴按角色拆开对白，同时显示配音、BGM、音效和环境音。可以单步、自动阅读、从对白重新运行，或暂停、恢复、停止、重播与拖动单条音频。它记录实际执行轨迹；停止自动阅读不会冻结脚本动作与动画，时间轴也不把分支剧情当作固定时长视频。

项目通过 `createEditorPreviewRuntime` 的 `getAudio` / `controlAudio` 接入音频插件，并在 `import.meta.env.DEV && import.meta.env.VITE_QUA_EDITOR_PREVIEW === '1'` 分支内动态加载 `@quajs/renderer-web/devtools`。使用 `getWebAudioPlaybackEntries` 提供真实播放位置与时长。Demo 已接入；生产构建不包含开发工具和源码标记。完整接入示例见 `demo/src/game/story/editor-preview.ts` 与 `demo/src/targets/web/main.ts`。

## 统一表单与开发规范

工作台、动画、角色、可视化剧本和设置表单共用
[`@quajs/editor-controls`](controls/README.md) 的原生控件与设计 token。
动画属性栏按动画、轨道、关键帧分组，完整占据预览和时间轴右侧高度；数值单位独立显示，
播放选项保留折叠状态。模板表单也使用同一套控件基线，Monaco、终端和游戏预览保持独立。

[Editor 开发 skill](../../.codex/skills/qua-editor-development-guardrails/SKILL.md)
记录组件边界、布局、可访问性、源码草稿保护、资源释放和实际窗口验证要求。
控件 smoke：`node packages/editor/electron/scripts/controls-smoke.mjs`；截图位于
`.codex-tmp/editor-controls-smoke/`。

### 面板提示与状态栏

静态的“打开项目后查看…”引导不占用面板行。角色、动画、Git、大纲、检查器、存储和场景调试等一般警告与操作反馈显示在底部状态栏，随当前面板或工作区切换；悬停可查看完整文本。字段校验、阻断确认和详细构建日志留在对应操作处。编辑器插件可用 `context.mountStatus(element)` 注册已有的状态元素，宿主负责可见性、项目切换和卸载清理。

编辑区、资源管理器、预览、日志、问题、资源浏览器和调试数据面板使用统一空状态，区分未打开项目、没有结果与等待数据，提供简短说明和可用操作。一般警告仍保留在底部状态栏。`empty-states-smoke.mjs` 验证真实 Electron 中的空状态与无项目终端流程。

### 界面架构与工作区布局

工作台采用 Lit Web Components 和 SCSS。`ui/src/app` 负责启动及文档、项目、源码回写的协调，`features` 按功能收纳控制器和样式，`workbench` 管理停靠布局与插件，`shared` 提供组件、图标和通用列表。`controls` 的字段、属性分组和空状态由 Lit 渲染，输入仍使用原生控件。动画与角色插件将索引、数据模型、表单、预览拆分；Electron IPC 按能力分组。独立的 Novel Writer 保留 Svelte 界面。

左侧资源管理器、搜索、源代码管理和故事大纲是固定导航区，通过活动栏切换，不显示视图标签，也不能拖拽、拆分或合并。侧栏宽度可拖动调整，方向键微调，双击恢复默认宽度；旧布局恢复时只移除导航视图，保留其他分组。

代码、预览和工具面板仍可自由布局。拖动视图标签到分组中央可合并，到边缘可拆分；右键标签或 Shift+F10 提供相同布局操作。标签关闭按钮收起视图，标题栏右侧的布局图标可重新打开视图或重置布局，按钮保持正方形，支持悬浮提示和键盘操作。分隔线支持鼠标、方向键和双击。移动视图保留文档草稿、插件表单和终端实例；布局保存在本机。

视图菜单按“编辑与创作、预览与调试、资源与扩展、开发工具”分组，显示当前可见、已打开、未打开和不可用状态；需要预览运行的工具会注明原因。可按名称、英文 ID 或分类搜索，使用方向键选择、Enter 打开、Escape 关闭。内置角色和动画面板归入创作，其余插件面板归入“资源与扩展”，重置布局位于菜单底部。

设置支持搜索、功能分类、仅看已修改项、逐项恢复和整体恢复。25 个选项涵盖颜色主题与明暗模式、字体与排版、代码辅助显示、保存时格式化、终端字号和滚动记录、Native 预览帧率、界面密度、动态效果和启动布局。终端设置会更新现有会话；布局恢复不会恢复旧 Shell 进程。

验证：`node packages/editor/electron/scripts/settings-dock-smoke.mjs` 检查设置搜索/持久化、真实拖拽、拆分、关闭/恢复和紧凑窗口；`visual-authoring-smoke.mjs` 检查底部属性编辑的草稿、撤销和保存。

## Lit + SCSS 视图约定

工作区、文件与资源列表、调试面板、属性表单、插件市场、角色和动画插件均通过 Lit 模板呈现，样式按功能存放在 SCSS 中。Novel Writer 保持原有 Svelte 应用和独立文档边界。

`controls/src/view.ts` 提供共享 `EditorElement`、模板、列表及引用工具。`ui/src/features` 按功能组织视图与样式；`app` 协调项目和文档；`workbench` 管理布局与插件生命周期。控制器保留源码版本校验、草稿、撤销和异步取消职责。Monaco、xterm、虚拟列表及预览宿主继续复用实例，移动面板只调整其宿主位置。

新建插件项目使用 Lit + SCSS，Vite 将浏览器依赖打入 `dist/editor.js`，并在 devtools 元数据中声明 `dist/editor.css`。请拆分功能组件，复用宿主设计变量与原生表单语义；项目文本只能通过普通模板绑定呈现。Lit 管理的根节点应通过 `render(nothing, host)` 清空，不能混用 `innerHTML` 或 `replaceChildren`。

预览、预览工具、性能、存储和 Inspector smoke 使用独立 Demo 副本与现有已构建依赖，不修改 Demo、不安装依赖；Native 副本仍会构建自身的 JSC/QPK 并运行实际渲染器。验证范围包括实际预览的 CDP 元素与存储、分页、无执行的文本呈现、异步请求串行化和隐藏面板停止轮询。macOS 上的 Electron 结果不代表 Windows/Linux 或 Native 视觉验收。

插件市场作为停靠视图显示，打开时保留侧栏和工作区布局；列表与详情按面板宽度调整，在窄面板中上下排列。启停插件和外部依赖变化后，列表与详情按钮同步更新。

## 生产打包

打包面板列出 Web 或 native 的完整步骤，展示当前阶段、完成/跳过/失败状态、资源包计数和实际耗时。关闭面板可在后台继续，再次打开保留当前进度。日志默认折叠，失败时展开；未配置的 Apple 公证明示为跳过。圆角弹窗独立滚动内容，保持标题和操作按钮可见。

点击标题栏的应用菜单按钮，选择“文件 → 生产打包…”（⌘/Ctrl Shift B）；macOS 系统菜单栏也保留同一入口。统一下拉菜单集中提供文件、编辑、终端和视图操作，标题栏保持 `Qua / Editor` 品牌标题。支持 Web 生产目录和 macOS native `.app`，提供日志、取消和产物定位。构建前保存当前文档，应用图标、Developer ID 签名和公证在 `qua.project.*` 配置。参见[生产构建配置](../build/quack/docs/production-build.md)。

编辑器自身使用[专属应用图标](../../assets/brand/quaeditor-icon.png)：现有角色配薄荷绿铅笔和圆角底板。`python3 scripts/brand/editor.py` 可重新导出设计；Electron 构建会自动生成 `electron/dist/icons/quaeditor.{png,icns,ico}`，其中 PNG 用于窗口和 macOS Dock。未来编辑器安装包需将 ICNS/ICO 接入应用包或可执行文件元数据；图标资源导出不等于完成安装包签名。游戏产物继续使用项目配置中的图标。

构建日志按错误、警告、完成信息和构建阶段轻量高亮，并标出文件位置、链接及耗时/大小。输出仍是可复制的纯文本，最多显示最近 1200 行。日志和搜索高级选项复用 `@quajs/editor-controls` 的 `disclosure`：支持展开/收起过渡、原生键盘操作、保留子控件状态，并遵循“减少动态效果”偏好。

打包、设置、新建项目和独立预览窗口的操作使用公共 `buttonView` / `iconButtonView`，与原生 `button()` 工厂共享实现。按钮、输入框、下拉框使用统一 6px 圆角和焦点/禁用样式；紧凑控件为 26px，打包弹窗采用 32px 操作按钮及目标选择框。主操作、次操作、取消与加载态均由公共组件提供，工作台状态栏样式不会覆盖弹窗按钮。
