# 角色编辑器插件

[English](README.md) · **简体中文**

`@quajs/editor-character` 是 `@quajs/character` 与 `@quajs/plugin-sprite` 的创作工具，在 Editor 底部提供「角色浏览器」，不导入或初始化游戏运行时。

打开已索引的角色定义或 sprite manifest 时，面板自动选择对应角色；一个文件有多个角色时按源码行列定位。未应用表单保留，跟随其他角色前需显式放弃；无关文件不会改变当前角色。识别基于已保存的项目索引。

## 浏览与编辑

搜索已注册角色、跳转源码、在差分网格预览资源，编辑字面姓名/ID/路径，添加或删除字面数组角色及 manifest 表情。修改成为可撤销 Monaco 草稿，正常保存后更新索引和预览。改变 ID 或删除角色不会重写剧情引用；已有草稿或外部磁盘修改不会被索引编辑覆盖。

单击差分卡片，在属性区编辑路径；双击打开定义。分层表情只显示各层图片，不等于最终游戏合成；atlas 裁切、遮罩、变换与仅 QPK 内资源需在源码和游戏预览检查。面板不会向运行游戏推送散资源。

## 静态索引范围

Node-only `@quajs/editor-character/indexer` 静态读取从 `@quajs/character` 直接导入的 `registerCharacter`、`registerCharacters` 与 `createCharacter`。支持命名别名、namespace 导入、项目相对常量导入、对象/数组字面量、简写、spread、`as`/`satisfies`、模板字符串及有限的表达式体数组 `.map()`（含解构参数）。

不执行任意函数、运行时修改、计算属性、工厂、包 barrel、tsconfig alias 或动态定义。部分/动态注册给出带源码位置的警告。这里是源码目录，不是运行时已登场角色列表。

version-1 JSON sprite manifest 从索引的 `assets/characters` 或显式项目相对路径解析。预览使用宿主有界图片 URL。

## 上限与生命周期

索引上限为 512 个 TS/JS 文件 / 16 MiB、2000 个 profile、128 个 manifest / 16 MiB、每 manifest 1000 个表情；静态求值另有深度与操作上限。

界面最多显示 100 个筛选角色，每页 60 个表情、每表情 8 层，同时最多 4 个缩略图请求。搜索回到第一页；隐藏/索引刷新保留当前角色的查询与页码，浏览不清空属性草稿。隐藏面板取消显示任务并释放图片。

## 插件边界与验证

包声明 devtools-only `quajs.extension`，浏览器、indexer 和样式入口分离。当前随 Editor 内置，ID 保留；发布/替换内置副本是独立发行流程。`@quajs/character` 提供独立 runtime 能力。

[用户流程](../../../docs/content/docs/editor/authoring.md) · [插件契约](../../../docs/design/editor-plugins.md)

```sh
pnpm --filter @quajs/editor-character test
pnpm --filter @quajs/editor-character typecheck
pnpm --filter @quajs/editor-character build
node packages/editor/electron/scripts/character-plugin-smoke.mjs
```
