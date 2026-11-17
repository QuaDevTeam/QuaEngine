---
title: "信任与安全"
description: "生产资源与动态代码需要可验证的身份，平台权限应保持明确。"
order: 9
---

在生产环境中，动态加载的运行期内容必须先通过 QPK 哈希与签名校验，才能进入引擎激活流程。开发和测试阶段可以显式开启允许未签名包的开关，但上线配置绝不能沿用这项设置。

你可以从 [Web 安全指南](/docs/security/web-security)了解 CSP、SRI、运行期模块加载和发布响应头配置；从 [动态 Runtime QPK](/docs/design/dynamic-runtime-qpk)了解包依赖、数据迁移与受保护卸载；从 [JavaScriptCore 运行时](/docs/design/native-jsc-runtime)了解原生执行预算与隔离边界。

需要注意的是，原生 JavaScript 的执行预算不等于进程级硬内存隔离，渲染器也不掌握授权或信任校验的最终决定权。开发相关扩展时，务必把所有校验卡在引擎和平台服务的明确边界上。
