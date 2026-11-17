---
title: "Web 与框架渲染器"
description: "复用同一套 Web 生命周期、DOM 和音频运行时，在熟悉的框架中组织界面。"
order: 1
---

## 包结构

`@quajs/renderer-web` 封装了控制器、快照订阅、资源 URL 生命周期、舞台坐标转换和原生 DOM 插件。Vue、React 与 Svelte 适配器只负责各自的组件封装和框架上下文，不会重复实现 Web 运行时和资源管理逻辑。

| 使用方式 | 文档入口 |
| --- | --- |
| 直接使用 Web 控制器与 DOM 插件 | [Web renderer](/docs/reference/renderer-web) |
| Vue 参考实现与组合式 API | [Vue adapter](/docs/reference/renderer-vue) |
| React 与外部 store 订阅 | [React adapter](/docs/reference/renderer-react) |
| Svelte 壳与插件 | [Svelte adapter](/docs/reference/renderer-svelte) |

## 样式由项目自己决定

官方渲染器默认不会自动引入任何视觉 CSS。Vue 项目可以按需显式导入配套的 base 和 default SCSS，再用自己的样式表覆盖；如果打算彻底换肤，注意保留语义化 DOM、稳定的类名、无障碍属性以及标有 `data-qua-input-ignore` 的输入排除区域。

## 资源与缓存

资源字节、存储、网络请求和对象 URL 由平台适配器接管。所有浏览器相关 API 都集中在 `@quajs/assets-web`，不会渗透进通用核心 `@quajs/assets`。开发期的 Vite VFS 和生产环境的 QPK 是两条不同的加载路径，上线前两套都要测到。

## 部署前检查

如果是把剧情区域嵌入到现有网页或应用里，请按[嵌入已有应用](/docs/guides/embedding)收紧输入监听范围，理清单例会话、账号存储隔离以及销毁顺序，并核对[宿主版本与兼容性](/docs/platforms/compatibility)。

上线前检查一遍站点子路径、静态资源 MIME 类型、缓存策略、SRI、CSP 以及 Runtime QPK 签名配置。确实需要 Blob 模块回退时再显式开启相应策略，不要为了图省事把整个生产环境的信任校验关掉。

延伸阅读：[Web 安全](/docs/security/web-security)、[构建与发布](/docs/guides/releasing) 与 [Web 资源适配器](/docs/reference/assets-web)。
