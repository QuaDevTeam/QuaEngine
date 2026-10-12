---
title: "Cocos 音频、视频与动画一致性"
description: "区分共享媒体意图、Creator 3.8.8 具体实现、通用 Host 降级和真实三端验收范围。"
order: 4
---

## 共享意图与实际能力

音频意图、背景与动画状态由引擎和功能插件持有；renderer 只维护临时播放、解码和节点资源。三端比较使用同一份资源、参数、逻辑舞台和时间轴，不能用投影字段存在或封面回退代替实际播放。

下表描述已实现且通过 demo 媒体夹具检查的范围。三端是 Web、Creator Web 和 Cocos macOS；WGPU Native 与手机设备需要各自验收。

| 能力 | Creator Web 3.8.8 | Cocos macOS 3.8.8 | 当前通用 Host 边界 |
| --- | --- | --- | --- |
| BGM、voice、SFX、ambient | SDK 现有播放器/上下文 | 静态 AVAudioEngine PCM 产品 | 基础 AudioSource 播放；可选能力独立声明 |
| seek、loop、暂停、淡入淡出、交叉淡入淡出、自然结束 | 真实播放时钟与 pipeline 结束事件 | 设备驱动时钟与结束事件 | 不支持的能力告警或降级 |
| 超过 1 的增益与 track/bus/master EQ | SDK 播放链上的处理 | PCM 处理链 | 基础音量夹到 0–1；不支持的 EQ 不会实际处理 |
| 0.25–4 倍播放速度 | SDK 播放链 | PCM 采样插值 | 无倍率能力时告警；音高随速度变化 |
| 全屏静音 SDR H.264 视频 | SDK VideoPlayer，位于 Canvas UI 下方 | AVFoundation 解码 RGBA 帧并上传 Cocos 纹理 | 无解码器时使用作者提供的 poster |
| 图片数值时间轴 | 逻辑坐标节点变换 | 逻辑坐标节点变换 | 依赖对应可选节点投影能力 |

音频 EQ 支持八类 WebAudio biquad：lowpass、highpass、bandpass、lowshelf、highshelf、peaking、notch、allpass。Cocos 预览复用 SDK 已有 AudioPlayer/AudioContext；不另建上下文，也不把浏览器 autoplay 解锁策略写入 Cocos 引擎。浏览器预览仍可能需要实际点击才能开始播放。

## 通过插件设置参数

四类音频的播放选项都支持 `playbackRate`，默认 1，要求有限数值且范围为 0.25–4。正在播放的目标通过 `AudioPlugin.setPlaybackRate(target, rate)` 或 `setAudioPlaybackRateWithEngine` 更新；QuaScript 使用 `@SetAudioPlaybackRate`。这些调用更新引擎意图，再由投影实现处理。详见[音频插件](/docs/plugins/audio)。倍率改变会改变音高，不提供保持音高的时间伸缩。

背景视频使用[背景插件](/docs/plugins/background)并通过 QPK/hybrid 资源身份加载。seek、循环与速度要求解码器真正支持；无解码器显示封面是降级结果，不能记为视频验收通过。

[动画插件](/docs/plugins/animation)的图片时间轴覆盖逻辑位置、缓动、旋转、透明度、暂停时 seek、恢复和最终值提交。插值在逻辑舞台单位内完成，宿主最后缩放。当前夹具不验证骨骼、粒子或任意 Creator AnimationClip。

## 实现限制

macOS 音频处理器最多 32 个句柄，每个解码后立体声 PCM 片段 64 MiB、总计 256 MiB，每个 EQ 阶段最多 16 个滤波器。输出为 44.1 kHz 立体声 Float PCM；回调使用预分配缓冲区并通过短互斥锁协调投影与检查，因此不能声称硬实时保证。检查采样的是处理器输出，不是操作系统录音。

macOS 视频最多 8 个句柄，每个尺寸不超过 4096、总像素不超过 8M。当前验收媒体显式标记 SDR 色彩，检查真实移动帧、seek、循环、颜色和释放。未标记色彩、HDR、任意视频/图片层级混合、视频滤镜与非静音音画同步尚未验收。

Creator Web 视频由 DOM 视频层显示，GPU-only 截图不包含它。生成的发布壳在图形初始化前启用透明 Canvas，并隔离容器层级；宿主服务器必须支持 HTTP Range 才能可靠检查 seek。视频判断同时看设备时钟和真实截图像素。

## 可复现媒体检查

剧情目前没有音频或视频。QA 使用独立确定性夹具，不能把走完剧情当作媒体验证。需要 ffmpeg 生成夹具；命令均从仓库根目录执行：

```bash
pnpm --filter demo media:fixtures
VITE_QUA_PARITY=1 pnpm --filter demo build
pnpm --filter demo build:cocos
node demo/scripts/cocos-build.mjs web-desktop --no-generate
node demo/scripts/cocos-build.mjs mac --no-generate
open demo/dist/cocos/workspace/build/mac/proj/Debug/CocosGame.app
pnpm --filter demo test:cocos:media
pnpm --filter demo test:cocos:media:parity
```

Cocos 配置需保留 `buildOptions.debug: true`。测试前关闭上一份应用，启动本次构建；Debug 接口默认在 6086。浏览器检查由脚本启动生产产物服务器并进行真实点击，使用固定端口 46201/46202。两条检查命令按顺序执行，不要同时占用同一应用、端口或 profile。

`QUA_COCOS_WORKSPACE` 指定已构建工作区，`QUA_COCOS_MEDIA_REVIEW` 指定报告目录；默认结果在 `demo/dist/cocos/review/media/index.html` 与 `report.json`。先检查 `status`、`gaps`、`errors`、构建 SHA 和 target manifest，再查看并排画面。`--require-parity` 会拒绝能力缺口；保留失败报告用于排查。

检查包含实际增益、八类 track/bus/master EQ、变速时钟、暂停期间修改倍率、自然结束、视频移动与颜色、数值动画及资源清理。EQ 幅度允许 4% 误差，视频夹具的通道误差允许 5。当前证据没有主观听音或系统音频录制；发行游戏还应在目标设备实际听音并检查自己的素材。

QA 监听仅在 Cocos debug 构建启用，保留最近 256 条事件。发布构建关闭 QA 接口后重新验收启动与资源；debug 媒体检查不代表应用签名、公证、商店发布或所有设备兼容。

宿主扩展和平台限制见 [Creator Host](/docs/reference/cocos-host)，当前逐项证据与历史基线见[Cocos 集成审查](/docs/design/cocos-integration-audit)。
