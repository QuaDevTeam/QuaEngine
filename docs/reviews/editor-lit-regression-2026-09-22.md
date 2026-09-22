# Editor Lit regression — 2026-09-22

状态：工作台回归已完成主要覆盖，尚不能标记整个 Editor 全绿。测试环境为 macOS 27.0、Electron 44.4.2，使用已安装的工作区依赖。工作区在本轮期间还有 Native 原生表面相关的并行修改，因此下述结果只代表各次实际运行的版本，不是冻结提交的发布验收。

## 已修复

- 标题栏「视图」换为 26 × 26 的布局图标按钮，图标居中，使用共享图标按钮样式和主题颜色；保留「打开视图」辅助名称、悬浮提示、Enter 打开和 Escape 关闭。
- 插件市场移除迁移前会重写整页网格、隐藏侧栏的样式。市场留在自己的停靠面板内，按容器宽度调整列表与详情，窄面板上下排列。
- 插件安装或启停后的列表与详情使用同一份已接受的查询结果。修复文件监听刷新与操作刷新交错时，列表已停用而详情仍显示「停用 Devtools」的问题。
- 旧回归脚本改用稳定的文件路径、实际停靠面板和当前设置按钮；不再依赖整行文本空白、旧底部标签、旧颜色常量或已隐藏的欢迎按钮。
- 旧 smoke 使用独立 Electron 配置；Web/Native 预览夹具复制 Demo，复用现有构建，不写入实际 Demo。构建失败及时报错，保留原始启动错误。
- 整理受影响包的 lint、Lit catalog 声明及锁文件元数据。Native 相关的额外调整仅为 lint 格式，不改变其功能。

Novel Writer 的 Svelte 源码未修改。写作测试使用独立配置与本地模拟模型服务，不调用真实付费模型。

## 静态检查

六个 Editor 包（controls、core、character、animation、ui、electron）的 TypeScript 检查和构建通过。六包 lint 通过。最终单元测试为 137 通过、1 跳过：controls 4、core 25、character 9、animation 14、electron 85。跳过项是显式 opt-in 的工具链下载检查。首次检查为 139 通过；本轮期间 Native 帧传输相关测试被其他修改替换，最终以上述实际计数为准。

新依赖安装未通过：pnpm 的 trust policy 拒绝 chokidar@4.0.3 / semver@5.7.2 的信任降级，离线锁文件生成也缺少缓存元数据。本轮没有降低此策略；使用已安装的二进制运行检查。构建有现存的大 chunk 提示。

## Electron 功能覆盖

34 套 Electron 场景通过（包含 Web / Native 参数组合），范围如下：

| 范围                                                     | 脚本                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 共享控件、亮暗主题、设置、停靠、空状态                   | controls、theme、settings-dock、empty-states                                                                                        |
| 文件与源码编辑                                           | tabs、explorer、workspace、workbench、authoring、visual-authoring、context-menu、decorator-shortcuts、languages-console、outline    |
| Git、PTY 终端、文件自动关联面板                          | git、terminal、source-panels                                                                                                        |
| 角色与动画                                               | character-plugin、animation-plugin、animation-scene                                                                                 |
| 创建项目与插件                                           | project-setup、marketplace、publishing                                                                                              |
| 实际预览工具与调试                                       | smoke（Web）、preview-tools（Web）、inspector（Web / Native）、storage（Web / Native）、performance（Web / Native）、scene-debugger |
| Svelte 写作服务的隔离、草稿、生命周期与 QS 回写/冲突保护 | novel-writer、writing-project                                                                                                       |

检查过实际截图：标题栏的浅色/深色及紧凑布局、设置、插件市场窄面板。标题按钮几何和键盘操作由 settings-dock 实测；市场测试还检查固定侧栏宽度、工作区右边界、横向溢出、真实本地 npm tarball 安装、脚本禁用、动态 ESM/CSS/indexer 加载及反复启停。

## 尚未通过的项目

- `window-smoke`：缩放和最小化恢复通过，macOS 全屏没有完成。日志确认 `fullscreen` 请求已经到达主进程、窗口允许全屏，但没有 `enter-full-screen` 事件。不能据此认定只是测试定位问题，也未用另一种全屏模式掩盖它。
- `smoke.mjs` 的 Web 完整流程最终通过。之前一次复测遇到预览启动停滞，采样显示该 Electron 主进程物理占用约 12.8 GiB，已终止自有测试进程；后续当前构建未复现，根因仍未定位，保留诊断记录。
- Native Inspector / Storage / Performance 在当前构建上最终通过。新的原生表面 embedding 脚本仍在并行修改；后续运行已验证 IDE 标题、缩放输入、模态遮挡、shader 步骤和弹出会话，随后按 Escape 退出独立窗口全屏时超时，暂未计入完整嵌入验收（见 `native-embedding.log`）。
- 多次 Electron DevTools / 本地写作服务连接出现 `EADDRNOTAVAIL`、`ERR_ADDRESS_INVALID`，包括在应用测试开始前失败的启动；这些失败不计入通过。

Windows/Linux、全新依赖安装、完整 Native 产品门禁、线上插件发布和真实模型服务均未验收。

## 证据

日志与逐次结果：`.codex-tmp/editor-lit-regression/`。预览停滞系统采样：`preview-hang.sample.txt`。截图：`.codex-tmp/editor-settings-dock/`、`.codex-tmp/editor-theme-smoke/`、`.codex-tmp/editor-marketplace-smoke/`。共享截图目录可能被同工作区的其他任务重写；本轮结论以实际检查与本轮日志为界。
