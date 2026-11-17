---
title: "Cocos 音频、视频与动画一致性"
description: "区分共享媒体意图、Creator 3.8.8 具体实现、通用 Host 降级和真实三端验收范围。"
order: 4
---

## 共享意图与实际能力

音频意图、背景和动画状态统一由引擎与功能插件维护，渲染器只管自己手里临时创建的播放句柄、解码器和节点资源。在做三端对比时，Web、Creator Web 和 Cocos macOS 会使用同一套资源、参数、逻辑舞台与时间轴，不会拿封面图或者投影字段凑数。

下表总结了目前已经实现并通过 Demo 媒体夹具验证的能力范围（这里的三端是生产 Web、Creator Web 与 Cocos macOS；WGPU Native 和手机真机需要另外单独测试）：

| 能力 | Creator Web 3.8.8 | Cocos macOS 3.8.8 | 通用 Host 默认降级 |
| --- | --- | --- | --- |
| BGM、voice、SFX、ambient | 复用 SDK 现有播放器与上下文 | 静态集成的 AVAudioEngine PCM 扩展 | 基础 `AudioSource` 播放；可选能力由宿主声明 |
| seek、loop、暂停、淡入淡出、交叉淡化、自然结束 | 真实播放时钟与 pipeline 结束事件 | 设备驱动时钟与结束事件 | 不支持的能力会给出警告或按默认行为降级 |
| 超过 1 的增益与 track/bus/master EQ | 在 SDK 播放链上处理 | 在 PCM 处理链上处理 | 基础音量限制在 0–1；不支持 EQ 时不生效 |
| 0.25–4 倍播放速度 | 在 SDK 播放链上处理 | PCM 采样插值 | 不支持变速时警告；变速会连带改变音高 |
| 全屏静音 SDR H.264 视频 | SDK `VideoPlayer`，置于 Canvas UI 下方 | AVFoundation 解码 RGBA 帧并上传 Cocos 纹理 | 无解码器时回退显示作者提供的 poster 封面 |
| 图片数值时间轴 | 逻辑坐标下的节点变换 | 逻辑坐标下的节点变换 | 依赖对应可选节点变换能力 |

音频 EQ 支持八类 WebAudio biquad 滤波器：`lowpass`、`highpass`、`bandpass`、`lowshelf`、`highshelf`、`peaking`、`notch`、`allpass`。Cocos Web 预览会直接复用 SDK 自带的 `AudioPlayer` 和 `AudioContext`，不会另建上下文，也不会把浏览器的自动播放解锁策略硬塞进 Cocos 引擎里（不过在浏览器里预览时，依然可能需要点一下页面才能出声）。

## 通过插件设置参数

四类音频通道的播放选项都支持 `playbackRate`（有限数值，范围 0.25–4，默认为 1）。正在播放的音频可以通过 `AudioPlugin.setPlaybackRate(target, rate)` 或 `setAudioPlaybackRateWithEngine` 实时调整倍率，QuaScript 中对应的装饰器是 `@SetAudioPlaybackRate`。这些调用会更新引擎里的音频意图，再交给具体渲染器执行，详情见[音频插件](/docs/plugins/audio)。需要注意，改变倍率会同步改变音高，暂不提供保持原调的时间伸缩。

背景视频通过[背景插件](/docs/plugins/background)接入，并保留 QPK 与 Hybrid 资源身份。`seek`、循环与倍速依赖底层解码器支持；如果缺少解码器而回退到静态封面，测试结果不会算作视频通过。

[动画插件](/docs/plugins/animation)的图片时间轴覆盖逻辑位置、缓动、旋转、透明度、暂停状态下 seek、恢复播放以及最终值提交。插值计算统一在逻辑舞台单位内完成，最后再由宿主缩放到屏幕像素。目前这套媒体测试夹具不涉及骨骼动画、粒子特效或任意 Creator `AnimationClip`。

## 实现限制

macOS 音频处理器上限为 32 个并发句柄，单条解码后的立体声 PCM 片段不超过 64 MiB、总计不超过 256 MiB，每个 EQ 阶段最多挂 16 个滤波器。内部统一以 44.1 kHz 立体声 Float PCM 输出；音频回调使用预分配缓冲区并配合短互斥锁来同步投影与调试采样，因此不能提供硬实时承诺。QA 采样读取的是处理器输出，而不是系统级录音。

macOS 视频上限为 8 个句柄，单路视频长宽不超过 4096、总像素不超过 8M。当前测试样本使用显式标记的 SDR 色彩视频，重点核查真实移动帧、seek、循环、色彩还原和资源释放。未标记色彩、HDR、任意视频与图片穿插混合、视频滤镜以及带音轨的音画同步尚未纳入测试。

Creator Web 的视频通过 DOM 视频层播放，因此纯 GPU 截屏里不会包含视频画面。生成的发布壳会在图形初始化前把 Canvas 设为透明并隔离容器层级；本地静态服务器也必须支持 HTTP Range 请求才能准确测试 seek。判定视频是否正常时，会同时比对播放时钟和真实屏幕截图像素。

## 可复现的媒体检查

目前 Demo 剧情正文里还没有用到音频和视频，因此媒体 QA 使用一套独立的确定性生成夹具（需要提前安装 `ffmpeg`）。以下命令均从仓库根目录执行：

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

运行测试前请保持 `buildOptions.debug: true`，先退出旧的应用实例再启动本次构建的新应用（Debug 服务默认监听 6086 端口）。浏览器侧脚本会自动起生产资源服务并模拟真实点击，固定占用 46201 和 46202 端口；两条检查命令请按顺序跑，不要同时争抢同一个应用、端口或 profile。

可以通过 `QUA_COCOS_WORKSPACE` 指定外部构建的工作区，用 `QUA_COCOS_MEDIA_REVIEW` 指定报告目录，默认输出在 `demo/dist/cocos/review/media/index.html` 与 `report.json`。查看报告时先核对 `status`、`gaps`、`errors`、构建 SHA 和 target manifest，再看三端并排对比截图。加上 `--require-parity` 参数后，一旦出现能力缺口脚本就会报错退出，并保留失败报告供排查。

整套媒体测试覆盖实际增益、八类 track/bus/master EQ、变速播放时钟、暂停期间改倍率、自然播放结束、视频帧移动与颜色还原、数值动画及资源释放。其中 EQ 幅度允许 4% 误差，视频通道允许误差 5。这组测试用来验证数值时钟、PCM 处理与画面输出，上线前仍应在真实目标设备上实际听音并核查作品自己的素材。

另外，QA 事件监听只在 Cocos debug 构建下开启（最多保留最近 256 条记录）。正式发布时关闭 QA 接口后仍需重新测一遍启动与资源加载。

宿主扩展和平台细节见 [Creator Host 参考](/docs/reference/cocos-host)，历史基线与逐项审计结果见[Cocos 集成审查](/docs/design/cocos-integration-audit)。
