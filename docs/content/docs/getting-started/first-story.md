---
title: "写下第一幕"
description: "用真实的 QuaScript 文件编写对白，理解旁白、插值和选项，再接入演出资源。"
order: 2
---

## 先替换开场文本

打开模板的 `src/game/scenes/opening.qs`，用下面的完整文件替换示例。它不依赖外部图片或音乐，适合先验证对白流程。

```qs
<script lang="ts">
export interface Scope {
  playerName: string
}
</script>

<script setup lang="ts">
const playerName = scope.playerName
</script>

午后的风，翻过还没写完的一页。
小葵: 终于等到你啦，${playerName}。
小葵: 今天，我们来写一个怎样的故事？

- 从一场相遇开始
- 从一个秘密开始

小葵: 那就把第一句话写下来吧。
```

没有角色前缀的正文是旁白。`小葵:` 是角色对白；`Narrator:` 则只是一个名叫 Narrator 的说话者，并不会自动成为无署名旁白。`${...}` 内可以使用合法的 TypeScript 表达式。

模板的场景已经通过 `engine.dialogue(opening, { playerName: 'Player' })` 传入了参数。修改 `playerName` 可以观察插值变化。文件中声明的 `Scope` 是场景对宿主的输入约定。

## 理解上面的选择

没有目标的选项会展示给玩家，等待选择，把选中信息留给步骤上下文，然后继续后面的步骤。上面的两个选项故意继续到同一句台词，用来验证输入链路。

如果写成 `- 去海边 -> seaside`，`seaside` 会被解释为故事节点目标，必须由故事图或项目的跳转处理器注册。仅仅写一个名字不会创建目的地。完整分支接线见 [选择与故事图](/docs/authoring/branching)。

## 添加背景与音乐

模板已经启用背景和音频插件。先把自己的素材放进 `assets/backgrounds/sunset.png` 与 `assets/audio/evening.ogg`，再添加：

```qs
@SetBackground('backgrounds/sunset.png', {
  transition: { type: 'fade', duration: 500 }
})
@PlayBGM('audio/evening.ogg', { loop: true, fadeInMs: 600 })
晚霞停在窗边。小葵把笔推到你面前。
```

资源 ID 相对于资源根目录，不是操作系统绝对路径。装饰器紧邻正文时，会先执行演出再显示正文；中间插入空行会形成独立的动作步骤。

浏览器可能需要玩家先点击页面才能播放音频。自动播放被阻止时应等待用户激活，不应把它当作剧情失败。

## 接下来检查什么

重新运行 `pnpm typecheck`，在预览中完整点击一次对白和选项。确认背景资源能载入、音乐在允许播放后开始、刷新后没有控制台资源错误。加入存档或章节跳转后，还要验证恢复是否保持同一故事状态。

需要角色立绘时，继续看 [角色与演出](/docs/authoring/characters)。
