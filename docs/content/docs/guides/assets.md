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

通用资源数据采用字节形式。Web 的 fetch、IndexedDB、Blob 和对象 URL 放在 `assets-web`；Node 文件与压缩工具放在 Node 适配器；测试可以使用 memory 适配器。

## 常见资源检查

确认大小写、扩展名、包内 ID 与脚本一致；检查字体是否包含实际语言字形；避免单张超大纹理导致移动设备内存超限。音频编码与视频支持需要在目标平台实测。

预加载能减少等待，但不要无限保留所有对象 URL、解码图片或音频句柄。Renderer 应在投影不再需要资源时释放实现资源。

## 更新资源与新增内容

更新已有 bundle 使用 patch 流；新增章节、脚本、插件和资产能力使用并列挂载的 Runtime QPK。不要为 AI 生成内容另开一个单资源注入路径。

接口与构建配置见 [QuaAssets](/docs/reference/assets)、[Quack](/docs/reference/quack) 和 [资源加载场景](/docs/plugins/asset-loading)。
