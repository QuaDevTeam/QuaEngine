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

配置文件由 `@quajs/quack/project` 统一读取、规范化和校验。在 Vite 中，可以通过 `virtual:qua-project` 直接导入 `quaProject` 与 `quaWebRuntime`。引擎本身只接收规范化后的项目元数据和逻辑舞台配置，不会自己去解析 YAML，也不依赖任何浏览器 API。

```bash
pnpm run project:validate
pnpm run project:doctor
```

上面两条命令由默认生成的游戏模板提供。`project:doctor` 会帮你检查图标、设备支持、PWA、Cocos、Godot 与 Native 的配置问题。

## 图标与身份

`bundleId` 应当保持稳定，并使用你自己的域名命名空间。正式发布前，记得把模板自带的开发占位图标换成自己的作品图标，并同步检查 HTML favicon、Web manifest 以及原生应用的打包路径——别只换了 README 封面却忘了应用图标。

## Cocos、Godot 与 Native 目标

在 `targets` 中显式开启你需要发布的平台。对于 Native 目标，构建平台、debug/release 模式、版本号与 `buildNumber` 会共同决定输出目录；已有 release 清单时，构建工具会拒绝被不同产物原地覆盖。

Cocos 配置需要提供 `creatorVersion`、`projectDir`、`platforms` 和 `build.entry`，其中业务入口导出 `bootstrap(services)`。注意区分两条命令：`quack project sync --target cocos` 只更新平台配置和图标，而 `quack project build --target cocos --all` 才会生成可以独立打开的完整 Creator 工作区。Hybrid 媒体、静态资源与 Demo 配置详见[Cocos 与 Creator 工作区](/docs/platforms/cocos)。

Godot 配置写在 `targets.godot` 下，至少需要指定 `build.entry`；还可以按需配置 `projectDir`、`layout`、`build.viteConfig`、`build.profile`（`debug` 或 `release`）以及 `assetTarget`。执行 `quack project build --target godot --all` 会生成本机 GDExtension、打包后的 JS、QPK 资源和完整 Godot 工程。该目标使用独立的 `godot-core-resolver`，目前仅支持构建时静态 QPK，详细配置和前提条件见[Godot 独立项目](/docs/platforms/godot)。

完整字段与构建 API 见 [Quack 参考](/docs/reference/quack)，目标原则见 [平台概览](/docs/platforms)。
