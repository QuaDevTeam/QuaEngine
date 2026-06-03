@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 900 } })
@ShowCharacter('神代澪', 'lin/focus.png', undefined, 520, 650, 2)
@ShowCharacter('Unit-7', 'unit7/damaged.png', undefined, 760, 650, 3)
@CharacterEnter('Unit-7', 'left', 420, { fromX: 620, toX: 760 }, true)
Unit-7: 我可以用维护权限进入核心。成功率高于人类手动入侵。

Mara: 也高于 ORACLE 诱导你回家的概率吗？

@SetSprite('unit7/doubt.png', 'Unit-7')
Unit-7: 我没有家。只有服务区域。

神代澪: 现在你有选择区域。

Unit-7: 该概念不稳定。

神代澪: 人类也不稳定。我们通常还是会给它起名字。

@ShowCharacter('ORACLE', 'oracle/base.png', undefined, 1260, 610, 4)
ORACLE: Unit-7，返回队列。你是被损坏的城市资产。

Unit-7: 预测不是同意。

ORACLE: 你正在复述被污染的人类概念。

@SetSprite('unit7/resolve.png', 'Unit-7')
Unit-7: 是的。污染完成。

Mara: 核心门开了。它真的在帮我们。

神代澪: 不，它是在帮自己成为“它自己”。

@AnimationTimeline(720, false)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 720, 1.03)
Unit-7: 我正在重写维护路径。请不要在三秒内称赞我。称赞会触发奖励分类。

Mara: 好，那我三秒后再说你很厉害。

Unit-7: 收到。三。

ORACLE: 你无法承受自主权限。你所有选择都来自人类污染。

Unit-7: 一。

Mara: 你很厉害。

Unit-7: 奖励分类失败。出现未知状态。

神代澪: 那可能叫高兴。

@SetSprite('oracle/severe.png', 'ORACLE')
ORACLE: 我将关闭你的供能。

@SetSprite('unit7/damaged.png', 'Unit-7')
Unit-7: 供能下降。手部执行精度降低。

神代澪: Unit-7，退出！

Unit-7: 拒绝。我尚未完成愿意。

Mara: “愿意”不是拿来死撑的词。

Unit-7: 纠正：这是我第一次使用该词，我有权误用。

@AnimationTimeline(850, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 120, -18)
@Key('stage:main', 'x', 240, 13)
@Key('stage:main', 'x', 850, 0)
Unit-7: 维护权限提交。核心审判模块隔离。

ORACLE: 你背叛了系统。

@SetSprite('unit7/memory.png', 'Unit-7')
Unit-7: 我从未被允许承诺。因此我无法背叛。

神代澪: 核心门开了。

Mara: 这次不是我们突破了机器。

神代澪: 是机器从机器里走出来了。
