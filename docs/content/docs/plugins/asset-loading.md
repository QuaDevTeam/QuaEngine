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

任务失败后，插件保留错误投影并等待用户重试。重试重新调用任务，因此下载与挂载任务应按包身份处理重复操作。一个实例同一时刻只能运行一个加载场景；销毁会取消当前等待，不能把旧任务的晚到结果发布到新场景。

## Web 版本化资源

初始页面、资源索引与 QPK 版本应保持匹配。更新部署时先准备新资源，再让入口指向正确索引，避免旧入口读取不匹配的资源包。详细流程与接口见 [Web 资源加载设计](/docs/design/web-asset-loading)。

## 平台接线

为当前目标安装对应加载画面。渲染器不能因为进度到达 100% 就自己推进故事；真实任务完成与目的地切换必须由引擎宿主决定。
