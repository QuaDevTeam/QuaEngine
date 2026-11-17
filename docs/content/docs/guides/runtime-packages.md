---
title: "追加章节与 Runtime QPK"
description: "以可验证的包交付新故事、资源、插件和状态迁移。"
order: 3
---

## 适用场景

无论是追加后续章节、热替换某段动态剧情能力，还是把 AI 生成的剧本与美术资源接入正在运行的游戏中，都应当通过 Quack 打包成 QPK Runtime Package。运行期包可以与基础包并列挂载，不必每次把全部资源重新打进一个基础大包里。

## 生命周期

1. 用 Quack 构建资源包，生成对应的 `runtimePackage` 清单。
2. QuaAssets 读取包字节并校验包身份、哈希与签名。
3. 引擎的 `RuntimeContentManager` 解析依赖，激活脚本、插件以及故事图增量。
4. 只执行清单中声明过的幂等数据迁移，不会擅自覆盖玩家当前进度。
5. 当前视图投影、故事点与存档会同步记录所依赖的运行期包。
6. 卸载前检查当前故事点、检查点、活跃投影以及其他包是否仍在引用它。

`loadRuntimePackage`、`activateRuntimePackage`、`unloadRuntimePackage`、`getRuntimePackages`、`registerScriptModule` 与 `runScriptModule` 均由引擎直接暴露。参数与完整 manifest 结构见[动态 Runtime QPK](/docs/design/dynamic-runtime-qpk)。

## 在同一场景中续写

多个 QPK 可以接续同一个场景、路线、主角或时间线。已读进度、动画清理、背景差分与语音回看都会按包来源分开记录：`contentPackageId` 标明内容归属；当某个画面同时依赖多个包时，系统会合并记录 `requiredRuntimePackages`。

## 信任校验与平台边界

在生产环境中，动态加载的 JavaScript 和插件模块必须通过完整性与签名校验后才能运行。浏览器里的 `Blob`、对象 URL、动态 `import()` 和 WebCrypto 细节都放在 Web 适配器里；引擎核心只接收注入进来的 `runtimeModuleLoader` 和 `trustPolicy`。

一个包可以在元数据里声明多个平台的兼容性，但激活时只会校验当前构建目标对应的配置块；运行期包不能跨平台安装其他目标的 core，也不能篡改 Native 宿主的运行时能力声明。

需要留意的是，[Godot 目标](/docs/platforms/godot)目前只支持构建时静态 QPK，会明确拒绝动态 Runtime Package 和可执行模块，更新剧情或素材后需要重新生成项目。这里的引擎生命周期接口，并不代表所有宿主平台都已经开放动态代码执行。

## 保存与卸载

存档时会自动记下当前用到的动态包依赖，读档前引擎也会先确认这些包都处于可用状态。默认的 `unloadRuntimePackage` 会拒绝卸载仍被当前剧情或投影引用的包；`{ force: true }` 只用于销毁、回滚或明确的状态清理场景，不要为了绕过依赖报错而在普通切章时强行卸载。

正式接入生成内容前，建议先用测试包把加载、跳转、存档、缺包提示与卸载流程完整跑通一遍。
