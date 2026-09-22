---
title: "信任与安全"
description: "生产资源与动态代码需要可验证的身份，平台权限应保持明确。"
order: 9
---

生产动态内容先验证 QPK hash 与签名，再进入引擎激活流程。开发与测试可以显式允许未签名包，但这个设置不能意外进入生产。

从 [Web 安全指南](/docs/security/web-security) 了解 CSP、SRI、运行期模块和发布响应头；从 [Runtime QPK](/docs/design/dynamic-runtime-qpk) 了解包依赖、迁移与卸载；从 [JSC 运行时](/docs/design/native-jsc-runtime) 了解原生执行预算与实际隔离边界。

原生 JavaScript 执行预算不等于硬内存隔离。渲染器也不是授权或信任的决策方。涉及这些能力的扩展，应把校验放在引擎与平台服务的明确边界上。
