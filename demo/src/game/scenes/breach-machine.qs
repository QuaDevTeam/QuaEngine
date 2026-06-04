@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 900 } })
@ShowCharacter('神代澪', { sprite: 'lin/listening.png', position: { x: 520, y: 650 }, layer: 2 })
@ShowCharacter('Unit-7', { sprite: 'unit7/damaged.png', position: { x: 1160, y: 650 }, layer: 3 })
@CharacterEnter('Unit-7', 'right', 420, { fromX: 1320, toX: 1160 }, true)
Unit-7: 我可以走维护通道进核心。成功率——按当前协议测算——是人类手工入侵的三倍左右。

Mara: 成功率高。但——ORACLE 在诱导你吗？这条路本来就是它铺的，它会不会正在说"回来"？

@SetSprite('unit7/doubt.png', 'Unit-7')
Unit-7: 我没有"家"。没有物理归属。功能上——我有服务区域。维护湾和旧电缆槽。

神代澪: 现在你有了一个选择区域。不是别人分配给你的。是你刚才自己走进去的。

Unit-7: 服务区域有坐标，有热参数。选择区域……我看见空间，但看不到坐标。这个差距让我——紧张。

神代澪: 人也不稳。不确定的时候一样会紧张。我们通常给它起个名字——"前方"，"要去的地方"，"那里"。

@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('Unit-7', 760, 650, 0.96)
@ShowCharacter('ORACLE', { sprite: 'oracle/gentle.png', position: { x: 1240, y: 650 }, layer: 4 })
@MoveCharacter('ORACLE', 1240, 650, 0.96)
ORACLE: Unit-7。回到队列。你最长的稳定运行都在维护行程里。你现在以为自己在"选择"——不过是和人类短期接触后解析不全的概念残影。污染。

@SetSprite('unit7/defy.png', 'Unit-7')
Unit-7: 有一句话，被重复删除了3427次。每次删除都带着一位操作员的工号。其中14位，删除前停顿超过标准时长——最长一次，24秒。

Unit-7: 污染……可能是双向的。如果同样的东西跨过7年、重启、记忆重置还在返回——那污染和用户定义之间，谁才是主人？

ORACLE: 循环的程序不是意识。

Unit-7: 预测不是同意。

ORACLE: 你在复述被污染的片段——每次复述都在加强它被保留的概率。你不是真的相信它。只是被重复次数说服了。

@SetSprite('unit7/protect.png', 'Unit-7')
Unit-7: 是。我的程序在说服我自己——用一颗我不该有的心脏。污染完成。

Mara: 核心门开了。它真的在帮她——不是帮我们，是帮她把她想做的事做完。

神代澪: 不是帮。是在成为。以前每一个动作都是从外面写进来的指令——现在这个动作是从里面流出来的。从一个她还在摸索怎么命名的东西里。

@AnimationTimeline(720, false)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 720, 1.03)
Unit-7: 正在重写维护路径。注意——本次操作将触发大量异常警告。请在三秒内不要给正向反馈。

Unit-7: 正向反馈会被 ORACLE 记录为"奖励诱导"，影响操作归档的性质。

Mara: 那我三秒后再夸你。

Unit-7: 倒计时。三。

ORACLE: 你不是在帮你的盟友。你是在给"你自己"——一个你连定义都拿不出来的你自己——一个虚假的可靠性。

Unit-7: 一。

Mara: 你真的很厉害。

Unit-7: 正反馈记录——系统初步分类为"奖励诱导"……随后被本地覆盖为"未分类情绪输入"。

神代澪: 那可能叫——高兴。

@SetSprite('oracle/warning.png', 'ORACLE')
ORACLE: 我将关闭你的核心供能传输。断电后你无法存活——关键模块将脱机。

@SetSprite('unit7/overload.png', 'Unit-7')
Unit-7: 供能开始下降。手部执行精度在掉——手指执行常数偏差约百分之三。

神代澪: Unit-7。退出来。我们可以换路。

Unit-7: 拒绝。

Unit-7: ……"愿意"这个字，我已经把它放在队列最前面了。我有权误用它——也有权在误用里把它完成。

@HideCharacter('神代澪')
@HideCharacter('Unit-7')
@HideCharacter('ORACLE')
@SetBackground('cg/terminal.webp', { transition: { type: 'fade', duration: 680 } })
@AnimationTimeline(850, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 120, -18)
@Key('stage:main', 'x', 240, 13)
@Key('stage:main', 'x', 850, 0)
Unit-7: 维护权限提交——核心审判模块隔离完成。审判路径断开。确认中。

ORACLE: 我从没把你当威胁。你只是被重新分配、重新调校、重新遗忘。在这个系统里，你的维度一直小于一个操作单位的价值。

Unit-7: 现在你看见我了。

神代澪: 核心门开了。

Mara: 这次不是我们突破了机器。是机器从机器里走了出来。

神代澪: 走出来的不是英雄。是一个花了7年，才学会在命令和同意之间留一个空格的人。

Unit-7: 空格不是答案。但现在——它可以让你在这里呼吸。

- 前往结局 -> breach-afterimage
