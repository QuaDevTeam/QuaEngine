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

## Cocos、Godot 与 Native

每个发布产物里都只包含当前所选平台的目标核心，打包器、安装器和启动壳统一读取生成的 `target-bundle-manifest.json`。跨平台代码能顺利编译，并不代表在目标系统上已经一切正常——发布前依然要在对应设备上测一遍窗口展示、字体、输入、音频、存档和退出清理。

对于 Cocos，先生成独立工作区，再用 `qua-build/<platform>.build.json` 传给 Creator 的 `configPath` 参数（Creator CLI 成功时会返回退出码 36）；macOS 还需要继续执行 `stage=make`，并实际打开生成的 `.app` 检查启动场景。仓库里的 demo 脚本会自动复制一份独立的导入副本，等验证通过后再更新输出目录，构建失败时则保留上一次的可用产物，完整命令见[Cocos 与 Creator 工作区](/docs/platforms/cocos)。正式发布前记得把 `buildOptions.debug` 关掉并重新检查启动和资源，另外调试阶段的媒体测试通过，并不代表已经完成签名、公证或商店审核。

对于 Godot，运行 `quack project build --target godot --all` 生成独立工程，正式发布时把 `targets.godot.build.profile` 设为 `release`。构建出的 GDExtension 动态库只匹配当前构建机器的操作系统和 CPU 架构；导出最终应用还需要安装对应版本的 Godot export templates 和导出预设。请务必在目标系统上重新构建并实测导出应用的 QPK 加载、存档持久化与资源清理，再着手签名和分发。Godot 目前只支持构建时静态 QPK，接入方式、验证命令与能力差异见[Godot 独立项目](/docs/platforms/godot)。

## 版本与更新

发布时请固定引擎依赖和内容版本，避免入口索引指向了不匹配的 QPK 包。只要修改过原生运行时版本，就需要同步重新生成 JS、QPK 与宿主清单。如果目标 `release` 目录里已经有不同版本的构建清单，打包工具会直接报错阻止覆盖，这时请递增版本号或 `buildNumber`。

## 发布前的内容检查

别忘了把引擎自带的占位图标换成自己的美术资源，并确认作品里用到的每一份图像、音频和字体都有合法的使用授权。引擎代码（Apache-2.0）、编辑器源码（MPL-2.0）、Demo 创作素材以及保留品牌各自适用不同的许可范围，详见[开源许可与品牌](/docs/project/license)。

如果你想了解文档站本身的本地预览和静态部署方式，可以查看[维护与部署文档站](/docs/project/documentation)。
