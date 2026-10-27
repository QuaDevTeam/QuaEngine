# QuaEngine 动画编辑器

[English](README.md) · **简体中文**

Editor 内置「动画」面板。向上拖动工具组分隔线可扩大预览。工具源码使用 MPL-2.0，用它创作的动画不因此受编辑器许可覆盖。

## 编排与应用

1. 打开已索引的 `*.animation.json`，自动显示并加载时间轴；也可在面板「新建动画」或手动选择文件。切换前需显式放弃未应用修改。
2. 「预览上下文 → 自动关联」查找匹配动画 ID 的字面 `@PlayAnimation` 调用，用项目 Web 渲染器加载背景、角色和对白。多调用点可选择；「显示对话框」切换对白，「self 角色」指定绑定角色。没有关联时选索引角色，或从「场景预览」手动选脚本和等待步骤。
3. 添加 `self` 或 `character:<id>` 数值轨道，编辑逻辑舞台 X/Y、统一缩放、角度旋转与透明度。预览图片选择只保存在编辑器本地。
4. 拖动标尺、滑块或关键帧，编辑毫秒时间、数值和 easing。双击空轨道插入采样关键帧；拖动按 10 ms 吸附，方向键 10 ms、Shift+方向键 100 ms，数值输入支持精确时间。重复时间拒绝保存。
5. 设置延迟、速度、循环、方向和 fill 后播放。Scrub 使用编排时间，不受播放参数改变。独立角色预览使用隔离 pipeline 与 Web DOM renderer；场景预览用项目现有会话，通过引擎开发 pipeline 暂时投影暂停动画，均在逻辑舞台坐标插值。
6. 「应用到源文件」创建可撤销 Monaco 草稿，再 Ctrl/Cmd+S 正常保存。新路径必须位于已有项目目录、以 `.animation.json` 结尾且不覆盖文件。磁盘版本/脏缓冲冲突保留动画草稿；面板视觉撤销与源码撤销分开。

## 草稿与场景预览

当前视觉草稿按项目保存在编辑器本地；源文件仍是创作真相。切项目前检查并保存源码草稿。隐藏面板停止播放、释放图片和 renderer；结束场景预览会移除临时动画、恢复同一故事点的对白与常规预览。打开场景会按正常保存机制保存源码，但未应用动画草稿仍在本地。

场景预览要求项目接入 `@quajs/editor-core/runtime` 的 `createEditorPreviewRuntime`。它通过已注册工厂定位，未决选择会暂停，不猜测分支。自动关联仅识别匹配唯一 JSON 动画 ID 的静态 QuaScript 调用；动态调用和 TypeScript 调用需手选场景。

## 在游戏中注册

文件为标准 `AnimationTimeline` JSON，没有编辑器包装：

```ts
import type { AnimationTimeline } from '@quajs/plugin-animation'
import motion from './enter.animation.json'

// 在游戏引擎启用 AnimationPlugin 后：
await animation.registerAnimation(motion as AnimationTimeline)
await animation.playAnimation(motion.id, {
  bindings: { self: 'character:heroine' },
})
```

新文件默认 `commit: 'none'` 与 `fill: 'both'`；需要目标适配器保留最终角色状态时使用 `commit: 'final'`。编辑器不自动注册动画或修改 bootstrap。运行期增量仍通过 Quack Runtime QPK 与引擎激活。

## 当前边界与验证

当前只编辑绝对毫秒时间的数值角色轨道。不支持的目标/属性、百分比时间、未知字段与插值会报告且不重写源码。TypeScript/QuaScript 动画定义、背景/音频/sprite-layer 轨道、骨骼与舞台直接拖拽不在面板范围，使用源码编辑。

```sh
pnpm --filter @quajs/editor-animation test
pnpm --filter @quajs/editor-animation typecheck
pnpm --filter @quajs/editor-animation build
node packages/editor/electron/scripts/animation-plugin-smoke.mjs
node packages/editor/electron/scripts/animation-scene-smoke.mjs
```

Electron smoke 使用临时项目、真实 Web 渲染、图片解码、指针关键帧移动、撤销、创建/保存与隐藏/切项目生命周期。场景 smoke 复制 Demo 并复用已构建依赖，检查背景/角色/对白、自动/手动关联与恢复。产物位于 `.codex-tmp/editor-animation-plugin-smoke/` 和 `.codex-tmp/editor-animation-scene-smoke/`，不代表 Native 渲染或依赖安装验收。
