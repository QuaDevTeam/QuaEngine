# 角色编辑器插件

[English](README.md) · **简体中文**

`@quajs/editor-character` 是配合 `@quajs/character` 和 `@quajs/plugin-sprite` 使用的编辑器工具，在 Editor 底部提供「角色浏览器」面板，运行期间不会导入或初始化游戏运行时。

在编辑器里打开已索引的角色定义文件或 `sprite.manifest.json` 时，面板会自动定位并选中对应角色；如果同一个文件里定义了多个角色，会根据光标所在的行列自动匹配。若当前表单里还有未应用的修改，切换前会提醒确认，不会悄无声息地丢掉编辑内容；打开无关文件时则保持面板现状。角色识别依赖于已保存的项目索引。

## 浏览与编辑

面板支持搜索已注册角色、跳转回源码位置、在差分网格里预览图片资源，以及直接编辑字面量形式的角色名、ID 和资源路径，还可以在字面量数组里增删角色或调整 manifest 表情差分。所有修改都会生成一份可撤销的 Monaco 源码草稿，按正常流程保存后即更新项目索引与预览。需要留意的是，改角色 ID 或删除角色时不会自动重写剧本里的引用；如果当前文件已有未保存草稿或外部磁盘修改，索引编辑会拒绝覆盖。

单击某个差分卡片即可在右侧属性栏修改路径，双击则直接跳到源码定义处。对于分层表情，面板目前只单独显示每一层的图片，并不等于游戏里最终的叠加合成效果；图集裁切、遮罩、坐标变换以及只存在于 QPK 里的资源，请回到源码和游戏预览里检查。面板本身不会向运行中的游戏推送散装资源。

## 静态索引范围

仅限 Node 环境使用的 `@quajs/editor-character/indexer` 会静态扫描直接从 `@quajs/character` 导入的 `registerCharacter`、`registerCharacters` 和 `createCharacter` 调用，支持命名别名、namespace 导入、项目内相对路径常量导入、对象或数组字面量、属性简写、展开运算符、`as`/`satisfies` 类型断言、模板字符串，以及有限的表达式体数组 `.map()`（含解构参数）。

索引器不会真的去执行任意函数，也不解析运行时修改、计算属性键、动态工厂、包 barrel 转发、tsconfig 路径别名或运行期生成的定义；遇到部分定义或动态注册时会在对应源码行给出警告。可以把角色浏览器理解成静态源码目录，而不是运行时场上正在出场的角色列表。

Version-1 JSON sprite manifest 会从项目索引到的 `assets/characters` 目录（或显式指定的项目相对路径）解析，预览图采用宿主提供的有界图片 URL。

## 索引上限与生命周期

为保证响应速度，索引器限制在最多 512 个 TS/JS 文件（总计 16 MiB）、2000 个角色资料、128 个 manifest（总计 16 MiB）以及每个 manifest 最多 1000 个表情，静态求值也有嵌套深度和操作数上限。

面板内最多展示 100 个筛选后的角色，表情列表每页 60 条、每条最多展示 8 个图层，同时最多并发 4 个缩略图加载请求。重新搜索会回到第一页；隐藏面板或索引刷新会保留当前角色的搜索词与页码，浏览列表时也不会清空属性草稿。面板隐藏后会取消正在排队的显示任务并释放图片句柄。

## 插件边界与验证

该包在 `package.json` 中声明了 devtools-only 的 `quajs.extension` 元数据，浏览器视图、索引器与样式入口各自独立。目前内置在 Editor 中并保留其官方 ID（后续单独发布或替换内置版本走独立的组件更新流程），而游戏运行期能力仍由 `@quajs/character` 独立提供。

延伸阅读：[QuaScript 创作与源码草稿](../../../docs/content/docs/editor/authoring.md) · [编辑器插件契约](../../../docs/design/editor-plugins.md)

```sh
pnpm --filter @quajs/editor-character test
pnpm --filter @quajs/editor-character typecheck
pnpm --filter @quajs/editor-character build
node packages/editor/electron/scripts/character-plugin-smoke.mjs
```
