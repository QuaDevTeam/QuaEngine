---
title: "Cocos 与 Creator Host"
description: "在 Creator 项目中投影引擎状态，并为不支持的宿主能力提供清晰降级。"
order: 2
---

## 组成

Cocos renderer 消费引擎投影，CocosHost 将逻辑坐标、资源和输入映射到原生节点。资产、存储和安全能力使用对应 Cocos 平台适配器。状态权威与 Web 一致，仍由引擎和插件持有。

## 集成顺序

先配置项目 manifest 的 `targets.cocos`，选择 Creator 项目目录、版本、平台与资源目标，再通过 Quack 的项目工具生成接线。生成器应消费当前目标的 bundle manifest，不额外手写另一份核心插件列表。

项目配置和命令见 [Quack](/docs/reference/quack)，设计验证记录见 [Cocos 集成审查](/docs/design/cocos-integration-audit)。

## 可选能力

宿主可能没有 seek、EQ、字体、遮罩、滤镜、混合、裁剪或捕获功能。新增能力通过可选 API 或投影字段表达，旧 Host 以告警、回退或 no-op 工作。不能把支持某个字段等同于所有 Creator 设备都已经正确呈现。

## 动态内容

消费动态包的角色、背景、语音与皮肤时保留包来源。引擎负责激活与依赖，不通过 loose resource push 更新资源。Cocos 目前不提供任意运行期 renderer 插件的动态 JS 导入通道。

## 验证建议

在目标 Creator 版本里检查角色坐标、背景混合、输入、音频结束事件和存档恢复。Fake Host 的测试可以验证投影参数，但不能取代实际设备图像与声音验收。
