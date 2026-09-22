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

BGM、语音、音效与环境声通过统一音频意图和总线组织。音量、EQ、渐入渐出、交叉淡化和播放结束要使用插件与 pipeline 契约。

WebAudio 可能因为浏览器策略暂停。用户点击后解锁再播放是正常流程；只有 AudioContext 真正 running 后才应报告已解锁。Cocos 的可选宿主能力采用告警或降级，不复制 Web 自动播放策略。

## 动画属于可读的演出数据

动画轨道先在逻辑舞台坐标中插值，再由渲染器投影到实际屏幕。不要把测量出来的 CSS 像素存成剧情坐标。复用动画和关键帧类型见 [动画插件](/docs/plugins/animation)。

## 检查一段演出

在开始、转场中间、对白显示后分别检查角色遮挡、背景与文本对比度。随后验证跳过、自动阅读、回看、存档恢复和章节跳转。动画结束时看起来正确，不代表中途恢复或取消时资源能正确释放。
