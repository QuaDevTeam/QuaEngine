---
title: "背景、音乐与时间轴"
description: "把对白、空间、声音和动作组合成可恢复的演出。"
order: 4
---

## 从一个简单转场开始

```qs
@SetBackground('backgrounds/station-night.png', {
  transition: { type: 'fade', duration: 400 }
})
@PlayBGM('audio/night.ogg', { loop: true, fadeInMs: 600 })
站台的灯，一盏接一盏亮了起来。
```

这些路径只是示例，需要先放入有权使用的素材。背景和音频分别由功能插件写入引擎投影，实际图片、视频和音频句柄由平台渲染器管理。

## 背景层与 CG

背景插件支持图片、视频、分层背景、CG 覆盖和过渡。层的位置、混合与时间轴坐标使用逻辑舞台单位；全屏背景可以延伸到舞台边缘，关键互动区域应在安全区域内。

阅读 [背景 API](/docs/plugins/background)、[转场设计](/docs/design/background-transitions) 和 [合成动画](/docs/design/background-composition-animation) 了解具体字段与当前平台行为。视频能力取决于平台，不能从 Web 支持推断 Native 已经具备完整视频解码。

## 音频总线与自动播放

BGM、语音、音效与环境声通过统一的音频意图和总线来组织。音量调节、EQ、渐入渐出、交叉淡化与播放结束回调，都要走插件与 pipeline 契约。

在浏览器里，WebAudio 可能会因为自动播放策略而暂停，等玩家点击页面解锁后再开始播放属于正常现象；只有当 `AudioContext` 真正进入 `running` 状态后，渲染器才会上报已解锁。Cocos 和 Godot 则按宿主实际声明的能力播放或降级，不会套用 Web 浏览器的解锁策略。例如 Godot 目前不支持参数化 EQ，具体的编码与效果差异见[Godot 独立项目](/docs/platforms/godot)。

## 动画属于可读的演出数据

动画轨道在逻辑舞台坐标中完成插值，再由渲染器换算并投影到实际屏幕上。不要把从 DOM 测出来的 CSS 像素直接存成剧情坐标。可复用的动画和关键帧类型见[动画插件](/docs/plugins/animation)。

## 检查一段演出

安排好演出后，分别在转场开始、过渡中途以及对白出现后检查一次人物遮挡关系，以及背景和文字的对比度。接着还要测一遍跳过、自动阅读、回看、存档恢复和章节跳转——动画在播放结束时看起来正常，并不保证中途被取消或切章恢复时资源也能干干净净地释放掉。
