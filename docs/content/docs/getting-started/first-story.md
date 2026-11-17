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

没有目标的选项会直接显示给玩家，等待点击选择，把结果记入当前步骤的上下文，然后顺着往下走。上面那两个选项就是故意汇聚到同一句台词，方便你先验证输入链路是否通畅。

如果写成 `- 去海边 -> seaside`，`seaside` 就会被当成故事节点目标，必须在故事图或项目的跳转处理器里提前注册；只写一个名字不会凭空生成目的地。完整分支写法见[选择与故事图](/docs/authoring/branching)。

## 添加背景与音乐

模板已经启用背景和音频插件。先把自己的素材放进 `assets/backgrounds/sunset.png` 与 `assets/audio/evening.ogg`，再添加：

```qs
@SetBackground('backgrounds/sunset.png', {
  transition: { type: 'fade', duration: 500 }
})
@PlayBGM('audio/evening.ogg', { loop: true, fadeInMs: 600 })
晚霞停在窗边。小葵把笔推到你面前。
```

资源 ID 使用相对于资源根目录的路径，不要填操作系统的绝对路径。装饰器紧贴着正文时，会在显示这句文本前先执行演出；如果中间隔了一行空行，则会拆成独立的动作步骤。

现代浏览器通常会等玩家点击页面之后才允许播放声音。如果遇到自动播放被拦截，先等待用户的交互操作即可，不需要把这当成剧情运行失败。

## 接下来检查什么

修改完成后重新跑一遍 `pnpm typecheck`，再到预览里把对白和选项完整点一遍。确认背景图片能顺利加载、音频在点击页面后正常响起、刷新页面后控制台没有资源报错。后续加上存档或章节跳转功能时，记得顺手测一下读档能不能回到一模一样的故事状态。

准备添加角色立绘时，可以继续阅读[角色与演出](/docs/authoring/characters)。
