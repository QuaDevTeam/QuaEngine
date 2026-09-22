---
title: "QuaEngine Editor"
description: "在独立 Electron 工作区里管理项目、编写剧本、编排演出并预览游戏。"
collapsed: true
order: 4
---

## 启动工作区

```bash
pnpm install
pnpm dev:editor
```

选择包含 `qua.project.yaml`、`.yml` 或 `.json` 以及 `package.json` 的游戏目录。也可以通过“文件 → 新建项目”创建常规游戏或插件项目；插件项目使用构建流程，不显示游戏预览。

## 一次日常创作流程

1. 打开 `.qs` 文件，在代码、分栏或可视化模式中编辑。
2. 用角色面板维护身份和静态资源，用动画面板编排数值关键帧。
3. 查看底部问题列表，修复未打开文件中发现的项目诊断。
4. 运行 Web 或 Native 预览，点击“到光标”检查对应步骤。
5. 保存文件；发生磁盘冲突时先比较差异，再决定保留哪一份。

## 工作区功能

| 任务 | 说明 |
| --- | --- |
| 文件与标签 | 项目树、搜索、多文档草稿、撤销与冲突保护 |
| QuaScript | 高亮、语义补全、悬浮、定义跳转、格式化、语句表单 |
| 角色 | [角色编辑器](/docs/editor/character) |
| 动画 | [动画编辑器](/docs/editor/animation) |
| AI 写作 | [Novel Writer](/docs/editor/novel-writer) |
| 扩展 | [插件市场](/docs/editor/registry) |
| 预览与调试 | Web / Native、故事定位、资源与存储检查 |

## 预览中的数据

当前 Web 预览使用独立临时 Chromium 分区，停止会清除预览存储。Native Demo 当前使用内存存储；这与项目自行配置的生产持久化后端是不同场景。不要把预览会话里的临时数据当作正式存档备份。

Native 预览需要项目支持编辑器预览协议与本机工具链。缺少能力时工作区会报告错误，而不是重新拼装另一套 target core。

完整快捷键、环境安装、草稿保护和预览约定见 [工作区手册](/docs/editor/workbench)。
