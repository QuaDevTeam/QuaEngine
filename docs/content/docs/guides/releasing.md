---
title: "构建与发布"
description: "交付资源、入口与目标清单一致的游戏产物。"
order: 4
---

## Web 模板

```bash
pnpm typecheck
pnpm run project:validate
pnpm run project:doctor
pnpm run assets:build
pnpm build
```

用生产预览访问实际输出，而不只验证 Vite 开发服务器。检查子路径、资源索引、QPK 下载、控制台与缓存。至少走完开始阅读、一次选择、保存、刷新恢复和设置修改。

## 安全响应头

Vue 模板默认生成 hash CSP 与 SRI 信息。将 `dist/qua-security/csp.txt` 的内容配置为实际站点的 `Content-Security-Policy` 响应头，保留构建生成的完整性属性。生产 Runtime QPK 注册公钥并签名，私钥留在安全构建环境。

不启用 Blob 模块回退时不要额外授予 `script-src blob:`。细节见 [Web 安全](/docs/security/web-security)。

## Cocos 与 Native

每个产物只包含当前目标核心。打包器、安装器、调试壳与启动程序消费 `target-bundle-manifest.json`。跨平台编译通过不等于实际平台成功启动，需要在对应系统验证窗口、字体、输入、音频、保存和退出清理。

## 版本与更新

固定依赖和内容版本，避免基础索引指向另一套 QPK。修改原生运行时版本需要重新生成 JS/QPK 与宿主清单。已有 release 目录的不同清单应当触发冲突，使用新的版本或 buildNumber。

## 发布前的内容检查

替换引擎开发占位图标，确认游戏中每一项素材的使用权。引擎 Apache-2.0、IDE MPL-2.0、Demo 内容和保留品牌是不同的权利范围，见 [许可](/docs/project/license)。

文档站自身的本地构建与静态托管见 [文档贡献指南](/docs/project/documentation)。
