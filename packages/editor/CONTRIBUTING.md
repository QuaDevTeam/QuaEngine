# 参与 QuaEngine IDE 共建

欢迎改进 QuaEngine IDE 的编辑体验、性能、可访问性、平台支持、内置插件、文档和测试。我们鼓励将可复用的改进提交到上游，让使用者共同维护。

## 贡献许可

提交到 `packages/editor/` 的贡献按 [MPL-2.0](LICENSE) 提供。贡献者保留自己贡献的版权，并应拥有提交该内容所需的权利。引入第三方代码时，请说明来源、许可和适用文件，并保留原有声明；不能仅通过修改包的 `license` 字段改变第三方代码的许可。

涉及引擎或其他目录的修改，遵循对应目录的许可。新 IDE 包应标记 `"license": "MPL-2.0"`，并随包携带完整的 `LICENSE` 和适用范围明确的 `NOTICE`。移动或复用受 MPL 覆盖的代码不会自动改变其许可。

## 提交问题与修改

1. 在 [Issues](https://github.com/QuaDevTeam/QuaEngine/issues) 中说明问题、复现步骤、平台和预期行为；较大的设计改动建议先讨论。
2. 按 [编辑器指南](README.md) 安装依赖并启动工作区，阅读仓库的 `AGENTS.md` 和所改包的局部规范。
3. 让 PR 聚焦一个问题，说明行为变化和验证结果；功能变化同时更新相关文档及 `.codex/skills/` 中的项目技能说明。
4. 运行受影响包的检查；涉及实际窗口、编辑器交互或预览时，补充对应平台的 smoke 验证。仅修改许可或文档时，检查声明、链接及分发文件即可。

请勿提交密钥、个人项目数据或无权再分发的素材。Demo 素材有独立的专有条款，不能因其出现在开源仓库中就作为插件或测试素材再次分发。

## 编辑器开发规范

修改工作台、属性表单或插件面板时，遵循
[Editor 开发 skill](../../.codex/skills/qua-editor-development-guardrails/SKILL.md)
和对应的功能 skill。统一使用 [editor-controls](controls/README.md) 的原生 DOM
控件、字段分组及 `--editor-*` token；功能样式负责布局，不再各自定义整套表单皮肤。

共享控件改动需构建调用方，运行实际窗口检查
`node packages/editor/electron/scripts/controls-smoke.mjs`，并检查截图与受影响功能的
编辑、撤销、保存、项目切换。独立 Novel Writer 保持其 Svelte / shadcn 组件规范。

## Fork 与商业使用

MPL 允许 Fork、二次开发和商业使用。对外分发受覆盖代码及其修改时，须履行 MPL 的源码提供和声明保留义务。贡献回上游是我们的倡议，不是强制条件。Fork 的命名、Logo 和官方身份表述须遵守 [商标政策](../../TRADEMARKS.md)，避免使用户误认为是官方发行版。

完整边界见 [IDE 许可说明](README.md#开源许可与社区共建) 与 [MPL 正文](LICENSE)。
