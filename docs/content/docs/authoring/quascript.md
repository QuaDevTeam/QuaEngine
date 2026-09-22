---
title: "QuaScript 写作基础"
description: "模块、旁白、插值、装饰器与类型化 Scope 的实用规则。"
order: 1
---

## 独立剧本模块

`.qs` 文件编译为默认工厂，接收 `Scope` 并返回故事步骤。模块脚本用于导入与类型声明；setup 脚本在创建步骤时执行。

```qs
<script lang="ts">
export interface Scope {
  playerName: string
  letters: number
}
</script>

<script setup lang="ts">
const name = scope.playerName
</script>

桌面上还有 ${scope.letters} 封没寄出的信。
小葵: ${name}，要一起把它们送出去吗？
```

每个文件最多一个普通 script 和一个 setup script，两者都需要 `lang="ts"`。不要把通用循环或完整业务流程当作新的剧本语法；复杂逻辑通过 TypeScript 宿主、作用域和辅助函数组织。

## 对白与旁白

`角色: 正文` 是具名对白，中文角色名可用。无冒号前缀的普通文本是无署名旁白。说话不等于登场；远程通话角色可以有台词而没有立绘。

`${expression}` 使用 TypeScript 表达式，必须非空且括号平衡。模板工厂的作用域变量通过 `scope` 访问；只有 setup 声明过的变量才能使用简写。

## 装饰器的顺序

```qs
@SetBackground('backgrounds/station.png')
@PlayBGM('audio/station.ogg', { loop: true })
窗边的收音机终于亮了。
```

连续装饰器在附着台词之前运行。空行会打断附着关系并形成动作步骤，编辑器的可视化表单也遵循这个规则。清除背景需要显式 `@ClearBackground()`；没有背景装饰器代表沿用此前背景。

背景、音频和动画等装饰器来自对应功能包的 `./script-compiler` 入口。启用运行时插件与启用编译时装饰器是不同的配置环节，不能只安装包就假定它们已经接线。

## 选择和目标

```qs
- 把信寄出去 -> post-office
- 暂时收好
```

第一个选项要求存在名为 `post-office` 的节点；第二个没有目标，会记录选择后继续。目标还可以指向标签、场景、脚本或运行期包。条件、禁用原因和缩略图可以使用 `@Choice(...)` 的结构化参数。

## 编辑与检查

推荐在 QuaEngine Editor 或 VS Code 扩展中编辑，获得诊断、补全、悬浮提示与定义跳转。出现编译错误时先修复最早的语法问题，再检查装饰器目录与项目配置。

完整语言、配置和 TypeScript 宿主示例见 [QuaScript 参考](/docs/reference/quascript)。
