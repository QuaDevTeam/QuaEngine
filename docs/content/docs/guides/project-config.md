---
title: "统一项目配置"
description: "在 qua.project.yaml 中维护游戏身份、图标与平台目标。"
order: 2
---

## 一个项目，一份入口

根目录使用 `qua.project.yaml`、`qua.project.yml` 或 `qua.project.json` 中的一份。自动发现时多个文件同时存在会产生歧义，必须移除重复配置或显式选择路径。

下面是与 Vue 模板一致的基本形状；图标文件需要实际存在。

```yaml
schemaVersion: 1
name: My Story
bundleId: com.example.my-story
version: 0.1.0
home:
  title: 我的第一篇故事
  shortName: My Story
  lang: zh-CN
  themeColor: '#fffaf6'
  backgroundColor: '#fffaf6'
icons:
  source: assets/app/icon.png
  favicon: assets/app/favicon.png
targets:
  web:
    enabled: true
    layout: landscape
    devices:
      desktop: true
      pad: true
      phone: true
    pwa:
      enabled: false
```

## 由构建工具解析

配置由 `@quajs/quack/project` 统一读取、规范化与验证。Vite 通过 `virtual:qua-project` 提供 `quaProject` 和 `quaWebRuntime`。Engine 只接收规范化的项目元数据与逻辑舞台配置，不自行解析 YAML 或依赖浏览器。

```bash
pnpm run project:validate
pnpm run project:doctor
```

上面的命令由生成的游戏模板提供。Doctor 会报告图标、设备支持、PWA、Cocos 与 Native 的配置问题。

## 图标与身份

`bundleId` 应稳定并属于你控制的命名空间。用自己的正式图标替换开发占位素材，同时检查 HTML favicon、manifest 和原生打包路径。不要只替换 README 图片而遗漏应用图标。

## 原生与 Cocos 目标

在配置中显式开启需要的目标。Native 的平台、debug/release、版本与 buildNumber 共同决定隔离输出目录；已有 release manifest 不应被不同产物原地覆盖。

完整字段与构建 API 见 [Quack 参考](/docs/reference/quack)，目标原则见 [平台概览](/docs/platforms)。
