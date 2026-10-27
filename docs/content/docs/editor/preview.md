---
title: "预览、定位与调试"
description: "运行 Web 或 macOS Native 预览，定位脚本步骤，检查元素、存储、媒体意图与性能。"
order: 9
---

## 运行与切换目标

在预览栏选择 Web 或 Native，按 F5 运行/重启，Shift+F5 停止。工作区先保存文档并检查依赖，保存冲突会中止。Web 使用项目 `dev:web` 或 `dev`，Native 使用 `dev:native`；切换目标会停止旧后端，不迁移当前游戏状态。

Native 图层内嵌目前仅支持 macOS，需要 Rust、系统工具链和项目的 Editor preview 协议。当前能力主要为指针交互；键盘/IME、滚轮与独立 viewport resize 尚未完整接入。Windows/Linux 明确报不支持，不使用截图作为替代预览。

Cocos/Godot 使用各自的独立项目生成与运行流程，见[平台指南](/docs/platforms)。

## 到光标、单步与重载

将光标置于对白/选项，使用「到光标」或 Ctrl/Cmd+Alt+Enter；也可右键「运行到此行」。编辑器先保存，再按编译器步骤定位。F10 前进一个等待步骤，途中遇到选择需要实际选择。

项目需注册可恢复基线和脚本工厂。定位会恢复该基线并顺序执行目标文件，不自动重建前面章节的分支变量。依赖跨章节状态时应由项目准备正确基线；仅移动光标不会改变该契约。

保存 `.qs` 后自动重载并尝试恢复当前步骤；步骤被删除或无法匹配时从文件起点重放，文件删除则回到项目启动状态。Web 刷新会话，Native 重建 JavaScriptCore/QPK 并重启进程，因此耗时不同。引擎包或 Rust 源码变化仍需正常重建。

## 独立窗口与静音

「独立窗口」、全屏和重新嵌回保留当前会话；关闭独立窗口会嵌回，Escape 退出全屏。扬声器按钮控制预览静音，在本次编辑器运行中跨重启、目标切换和热重载保留，不改变游戏音量设置或音频进度。

## Inspector 与场景调试

Inspector 只读查看 Web DOM 或 Native QUI 元素树、属性、位置、尺寸与样式，可筛选、折叠、键盘导航和手动刷新。它不是完整 Chrome DevTools，也不直接提供样式编辑。

Web「场景调试」记录已执行对白及 voice/BGM/SFX/ambient 意图区间，可单步、自动/手动阅读或重播选中对白。区间不等于解码后的波形时长，停止自动阅读不会冻结已编排动作。支持来源的属性拾取见[QuaScript 创作](/docs/editor/authoring#在运行画面中修改)。

## 存储与资源

「存储」读取当前会话：Web 展示 Local/Session Storage、IndexedDB 与 Cache Storage；Native 展示引擎存档、Host 命名空间、QPK 与资源。可筛选、分页、查看 JSON/原文/有界二进制预览并复制，绿色行表示实际驻留资源。

Web 开发预览使用临时隔离分区，停止后清除。当前 Native Demo 的 MemoryBackend 与 InMemory Host 数据也只在会话中存在；项目正式发行的持久化后端可以不同。请悬停查看后端信息，切勿把预览数据当成正式存档备份。

Web 项目需注入资源查询才能显示 renderer 句柄、引用数和估算字节；该数值不包含浏览器内部缓存和 GPU 分配。Native 引擎存档检查需接入开发 runtime。切换或停止会话会清除旧结果。

## Performance 与日志

Performance 显示最近 60 秒的 FPS、帧间隔、CPU/RSS 及可用 GPU 指标。Web FPS 是 rAF 回调频率；Native FPS 来自实际提交，Draw Calls 包含合成、阴影与模糊。CPU 只统计预览渲染进程，一个核心满载为 100%；系统 GPU 利用率与进程内存不是同一范围，缺失项显示 `—`。

Debug Console 用于运行日志、依赖安装与错误详情；真实交互命令应在终端执行。运行错误出现后先保留错误与来源，再按[排障](/docs/editor/troubleshooting)处理。
