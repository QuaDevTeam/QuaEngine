---
title: "资源加载场景"
description: "在进入章节之前显示加载进度，让失败和重试都有明确的状态。"
order: 20
---

## 安装与职责

`@quajs/plugin-asset-loading` 的 `AssetLoadingPlugin` 提供引擎拥有的加载投影。UI 只显示标题、阶段、进度和错误，再通过插件定义的重试事件回传玩家意图。

```ts
import { AssetLoadingPlugin } from '@quajs/plugin-asset-loading'

const loading = new AssetLoadingPlugin()
engine.use(loading)
// 在 engine.init() 完成后执行；downloadChapter 是项目自己的资源任务。
await loading.run('正在准备下一章', async (report) => {
  report({ phase: 'preparing', progress: null })
  return await downloadChapter(report)
})
// 只有 run 完成后，宿主才进入目标章节。
```

`engine` 与 `downloadChapter` 是集成示意中的项目对象。具体的字节下载、签名校验、包挂载和资源预取仍由 QuaAssets 与 RuntimeContentManager 完成。

## 失败与重试

加载任务失败后，插件会保留错误状态并等待用户触发重试。由于重试会再次执行同一个任务函数，因此下载和挂载逻辑最好做成幂等的，能妥善处理同一个包重复请求的情况。一个插件实例同一时间只能运行一个加载场景；如果实例被销毁，当前等待会被取消，旧任务即便晚一步完成也不会把过时结果写回新场景。

## Web 版本化资源

入口 HTML、资源索引和 QPK 文件的版本应当保持一致。部署更新时先上传新的资源包，再切换入口指向新的索引，避免旧页面读取到不匹配的资源。详细流程与接口见[Web 资源加载流程](/docs/design/web-asset-loading)。

## 平台接线

请为当前使用的渲染目标挂载对应的加载画面。渲染器不能因为进度条走到了 100% 就擅自切进下一幕；任务何时真正完成、何时切换场景，必须由引擎宿主来决定。
