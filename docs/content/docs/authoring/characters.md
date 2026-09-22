---
title: "角色与演出"
description: "区分角色身份、对话、立绘与出场状态，让人物按作者安排进入画面。"
order: 3
---

## 角色身份与画面表现

`@quajs/character` 提供角色定义、对白、立绘、表情、位置与显隐 API。角色资料可以声明稳定 ID、显示名、别名、头像、默认立绘和表情映射。

角色开口不等于自动登场。旁白、录音、电话与画外音都应由剧本明确决定是否显示人物。编辑器的 [角色面板](/docs/editor/character) 可以索引项目内角色和 sprite manifest。

## 显示一个角色

下面的资源路径需要存在于项目资源包中。角色装饰器必须已在编译器配置中激活。

```qs
@ShowCharacter('Alice', {
  sprite: 'alice/base.svg',
  position: { x: 960, y: 640 },
  layer: 1
})
Alice: 这次，我想站在离窗户近一点的地方。
```

`x`、`y` 属于逻辑舞台单位，不是浏览器像素。横屏默认舞台为 `1920 × 1080`。立绘原点、缩放与底部对齐应与素材导出约定一起检查，不要只根据一张桌面截图确定手机表现。

## 表情与分层立绘

Sprite manifest 可以组织基础立绘、表情差分、图层与 UI 皮肤。运行时使用清单解析资源，而不是把 PSD 图层信息写进渲染器私有状态。

资源准备和差分命名见 [立绘插件](/docs/plugins/sprite) 与 [PSD 工作流](/docs/guides/psd-sprite-ui-skin)。需要移动、透明度或连续表情切换时，使用 [动画插件](/docs/plugins/animation) 和 [动画编辑器](/docs/editor/animation)。

## 保存、回看与动态资源

角色位置与可见性来自引擎投影。动态包提供的表情、头像和立绘要保留包来源，这样恢复存档或回放语音时才知道先加载哪些 QPK。不要把仅存在于某个 DOM 元素上的样式当成角色的真实状态。

TypeScript 完整类型见 [`@quajs/character` 源码](https://github.com/QuaDevTeam/QuaEngine/blob/main/packages/game/character/src/index.ts)，渲染接线见 [Web](/docs/reference/renderer-web) 或 [Vue](/docs/reference/renderer-vue)。
