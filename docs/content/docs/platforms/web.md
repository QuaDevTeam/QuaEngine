---
title: "Web 与框架渲染器"
description: "复用同一套 Web 生命周期、DOM 和音频运行时，在熟悉的框架中组织界面。"
order: 1
---

## 包结构

`@quajs/renderer-web` 提供控制器、快照订阅、资源 URL、舞台坐标转换和 DOM 插件。Vue、React 与 Svelte 负责组件和框架上下文，不重复实现 Web 生命周期和资源管理。

| 项目 | 文档 |
| --- | --- |
| 直接使用 Web 控制器与 DOM 插件 | [Web renderer](/docs/reference/renderer-web) |
| Vue 参考实现与组合式 API | [Vue adapter](/docs/reference/renderer-vue) |
| React 与外部 store 订阅 | [React adapter](/docs/reference/renderer-react) |
| Svelte 壳与插件 | [Svelte adapter](/docs/reference/renderer-svelte) |

## 样式由项目决定

官方渲染器不会自动导入视觉 CSS。Vue 项目可显式导入提供的 base 和 default SCSS，再用自己的样式覆盖。完整换肤时保留语义 DOM、稳定类名、可访问性和输入排除区域。

## 资源与缓存

资源字节、存储、网络与对象 URL 由平台适配器组织。浏览器 API 位于 `@quajs/assets-web`，不进入 `@quajs/assets` 通用核心。开发期 VFS 与生产 QPK 是不同加载路径，两者都要验证。

## 部署检查

检查页面路径、资源 MIME、缓存、SRI、CSP 与 Runtime QPK 签名策略。需要 Blob 模块回退时显式配置权限；不要为了修复一个开发错误关闭整个生产信任策略。

详见 [Web 安全](/docs/security/web-security)、[构建发布](/docs/guides/releasing) 和 [资源适配器](/docs/reference/assets-web)。
