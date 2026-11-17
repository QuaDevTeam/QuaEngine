# QuaEngine 动画编辑器

[English](README.md) · **简体中文**

`@quajs/editor-animation` 是 QuaEngine Editor 内置的底部「动画」面板。向上拖动工作台面板分隔线即可放大画面预览区。编辑器本身采用 MPL-2.0 许可，但你用它制作出来的动画文件不会因此受到编辑器许可证的约束。

## 编排与应用

1. 在编辑器里打开或切到已索引的 `*.animation.json` 文件，底部「动画」面板会自动弹出并加载对应时间轴；也可以直接在面板里点「新建动画」或手动打开文件。如果当前还有未应用的改动，切换动画前会要求你先显式放弃。
2. 在「预览上下文」选择「自动关联」，面板会检索项目里匹配该动画 ID 的字面量 `@PlayAnimation` 调用，并用项目自己的 Web 渲染器加载背景、角色和对白。存在多处调用时可以下拉切换；「显示对话框」控制对白框显隐，「self 角色」决定 `self` 轨道绑定到哪位角色。如果没有现成调用，也可以直接选一个已索引角色做单独预览，或者切到「场景预览」手动选脚本和等待步骤。
3. 为 `self` 或 `character:<id>` 添加数值轨道，可视化调整逻辑舞台下的 X/Y 坐标、等比缩放、旋转角度和透明度（预览时选中的测试图片仅保存在编辑器本地）。
4. 拖动时间标尺、滑块或菱形关键帧即可编辑毫秒时间、属性值和缓动曲线。双击空白轨道可以按当前插值插入新关键帧；拖动默认按 10 ms 吸附，方向键每次微调 10 ms（按住 `Shift` 为 100 ms），输入框里则可以精确到具体毫秒。同一个轨道在相同时间点不允许存在重复关键帧。
5. 配好延迟、播放倍速、循环次数、方向和 `fill` 模式后即可就地播放预览（在时间轴上手动拖动 scrub 时固定按编排时间显示，不受倍速等播放参数影响）。独立角色预览跑在隔离的 pipeline 和 Web DOM renderer 上；场景预览则复用项目现有的 Web 会话，通过开发预览协议下发临时暂停动画——两者都基于统一的逻辑舞台坐标做插值。
6. 编排完成后点击「应用到源文件」，结果会先进入一份可撤销的 Monaco 源码草稿，再按 `Ctrl/Cmd+S` 正常保存。新建路径必须位于当前项目目录内、以 `.animation.json` 结尾且不能覆盖已有文件。遇到磁盘版本冲突或脏缓冲区时，动画草稿会继续保留在面板中；注意面板自己的视觉撤销栈与源码编辑器的撤销栈是分开的。

## 草稿保存与场景预览

面板里的视觉草稿会按项目缓存在编辑器本地，但硬盘上的源文件依然是唯一权威数据，切换项目前记得把改好的源码草稿保存下来。隐藏面板会自动停止播放并释放图片和渲染器；退出场景预览时会移除临时动画，把游戏恢复到原先同一句对白的常规预览状态。启动场景预览前会自动按正常流程保存源码，不过面板里尚未点「应用」的动画改动仍只留在本地。

使用场景预览要求项目已经接入 `@quajs/editor-core/runtime` 的 `createEditorPreviewRuntime`。定位时会通过项目注册的脚本工厂顺序执行并停在对应的等待点，遇到选项分支会暂停等待玩家选择，不会擅自猜测分支。「自动关联」目前只识别与 JSON 动画 ID 一一对应的静态 QuaScript `@PlayAnimation` 调用，动态参数或 TypeScript 中的调用请使用手动场景选择。

## 在游戏代码中使用

动画编辑器输出的就是标准的 `AnimationTimeline` JSON，没有任何编辑器私有包装字段：

```ts
import type { AnimationTimeline } from '@quajs/plugin-animation'
import motion from './enter.animation.json'

// 在游戏引擎里启用 AnimationPlugin 后：
await animation.registerAnimation(motion as AnimationTimeline)
await animation.playAnimation(motion.id, {
  bindings: { self: 'character:heroine' },
})
```

新建文件默认采用 `commit: 'none'` 和 `fill: 'both'`；如果你希望动画播完后角色依然停留在最终状态，可以改为 `commit: 'final'`。编辑器不会替你往游戏入口里注册动画，运行期的增量动画下发也依然走 Quack Runtime QPK 和引擎激活流程。

## 当前范围与验证

目前面板只支持编辑以绝对毫秒为时间轴的数值型角色轨道。遇到不支持的目标或属性、百分比时间、未知字段或不支持的插值方式时，面板会给出提示而不会强行改写源文件。现有的 TypeScript/QuaScript 动画定义、背景/音频/立绘图层轨道、骨骼动画以及在舞台上直接拖拽角色，目前还不在可视化面板的编辑范围内，这些内容请在源码里编辑。

```sh
pnpm --filter @quajs/editor-animation test
pnpm --filter @quajs/editor-animation typecheck
pnpm --filter @quajs/editor-animation build
node packages/editor/electron/scripts/animation-plugin-smoke.mjs
node packages/editor/electron/scripts/animation-scene-smoke.mjs
```

`animation-plugin-smoke.mjs` 会创建临时项目并驱动真实的 Web 舞台渲染、图片解码、指针拖动关键帧、轨道编辑、撤销重做、新建保存以及隐藏/切换项目生命周期；`animation-scene-smoke.mjs` 则复制一份 Demo 跑真实的背景/角色/对白渲染、自动关联、关键帧预览和状态恢复（两者的截图保存在 `.codex-tmp/editor-animation-plugin-smoke/` 和 `.codex-tmp/editor-animation-scene-smoke/`，它们针对 Web 预览，不涵盖 Native 渲染或工具链安装）。
