---
title: "追加章节与 Runtime QPK"
description: "以可验证的包交付新故事、资源、插件和状态迁移。"
order: 3
---

## 适用场景

追加章节、替换动态内容能力，或者把 AI 生成的剧本和美术交给当前游戏，都应通过 Quack 构建 QPK Runtime Package。运行期包可以与已有包并列挂载，不需要把所有内容拼进一个基础 bundle。

## 生命周期

1. 使用 Quack 生成包与 runtimePackage manifest。
2. QuaAssets 获取字节并验证身份、hash 和所需签名。
3. 引擎的 RuntimeContentManager 解析依赖，激活脚本、插件和图增量。
4. 仅执行声明过的幂等迁移，不任意覆盖玩家进度。
5. 当前投影、故事点和存档记录所需包信息。
6. 卸载前检查正在使用它的故事点、检查点、投影和包依赖。

`loadRuntimePackage`、`activateRuntimePackage`、`unloadRuntimePackage`、`getRuntimePackages`、`registerScriptModule` 和 `runScriptModule` 由引擎暴露。参数与完整 manifest 见 [设计与 API](/docs/design/dynamic-runtime-qpk)。

## 同一场景继续写

多个 QPK 可以继续同一场景、路线、主角和时间线。读进度、动画清理、背景差分和语音回看都要按包来源判断。`contentPackageId` 标记来源；依赖多个包时合并 `requiredRuntimePackages`。

## 信任与平台边界

生产动态 JavaScript 与插件模块必须先通过包验证。Browser Blob、对象 URL、动态 import 和 WebCrypto 留在 Web 适配器；引擎接收注入的 `runtimeModuleLoader` 与 `trustPolicy`。

包可以携带多平台兼容元数据，但激活只检查当前产物目标块。它不能安装其他平台 core 或覆盖 Native 宿主能力信息。

## 保存与卸载

保存时记录动态依赖，读档前确保包可用。默认卸载会拒绝仍被使用的包；`force: true` 仅用于明确的销毁、回滚或状态驱逐。不要为了隐藏依赖错误而在普通章节切换中强制卸载。

先在合成内容上验证加载、跳转、保存、缺包恢复与卸载，再接入真实生成内容。
