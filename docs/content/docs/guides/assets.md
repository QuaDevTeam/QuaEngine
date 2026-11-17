---
title: "资源工作流"
description: "在开发期快速预览，在生产环境使用可验证、可追踪的资源包。"
order: 1
---

## 三种资源阶段

开发期，Vite VFS 让原始文件变化可被及时预览。构建期，Quack 识别资源、提取元数据并输出 QPK / ZIP。运行期，QuaAssets 读取资源包，平台适配器处理存储、获取、解码与显示句柄。

## 资源目录

```text
assets/
  backgrounds/
  characters/
  audio/
  fonts/
  app/
```

目录名称是项目约定，不是固定魔法路径。剧本使用资源 ID，Quack 配置决定打包范围。不要把 `.generated` 中未审核的候选或本地凭据一起打包。

## 平台分工

通用资源数据在核心层以字节形式流转。浏览器相关的 `fetch`、IndexedDB、`Blob` 和对象 URL 集中在 `assets-web`；Node 文件读写与压缩工具在 `assets-node`；单元测试则可以使用 `assets-memory`。

## 常见资源检查

打包前请核对文件名大小写、扩展名以及包内 ID 是否与剧本一致；确认字体文件里包含目标语言的全部字形；避免使用单张尺寸过大的纹理，以免移动设备内存溢出。至于音频编码和视频封装格式，务必在目标平台上实际播放测试。

预加载确实能减少等待，但不要把所有对象 URL、解码后的图片或音频句柄一直捏在手里不放。一旦投影不再需要某项资源，渲染器就应当及时释放对应的实现资源。

## 更新资源与新增内容

如果只是更新已有的资源包，走 patch 补丁流程即可；如果要追加新章节、脚本、插件或新资产能力，则使用并列挂载的 Runtime QPK。请不要为 AI 生成的内容另建一套散装单资源注入通道。

另外，动态挂载依赖当前宿主平台的支持。例如 Godot 目前只接受构建时打入的静态 QPK，内容更新后需要重新生成项目，详情见[Godot 平台限制](/docs/platforms/godot)。

接口与构建配置见 [QuaAssets](/docs/reference/assets)、[Quack](/docs/reference/quack) 和 [资源加载场景](/docs/plugins/asset-loading)。
