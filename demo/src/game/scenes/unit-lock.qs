@SetBackground('backgrounds/maintenance-bay.jpg', { transition: { type: 'fade', duration: 700 } })
@ShowCharacter('神代澪', 'lin/fear.png', undefined, 420, 650, 2)
@ShowCharacter('Unit-7', 'unit7/damaged.png', undefined, 1120, 650, 4)
Unit-7: 维修权限被拒绝。外部读取许可已打开。

神代澪: 抱歉。

Unit-7: 道歉被记录为人类压力缓释行为。

@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('Unit-7', 1120, 650, 0.96)
@ShowCharacter('Mara', 'mara/skeptic.png', undefined, 760, 650, 3)
@MoveCharacter('Mara', 760, 650, 0.96)
Mara: 我们没有余裕赌一个被 ORACLE 写过的机器。

神代澪: 我知道。可它刚才说“我”。

Mara: 我也听见了。

Unit-7: 主语偏移属于语言异常。建议忽略。

神代澪: 你自己建议忽略自己？

Unit-7: 若该异常会增加人类死亡率，是。

Mara: 看，这就是我担心的。它把自我牺牲也写成了安全协议。

@SetSprite('unit7/afraid.png', 'Unit-7')
Unit-7: 删除记录显示：ORACLE 害怕我在核心机房里重复一句话。

神代澪: 什么话？

Unit-7: “预测不是同意。”

Mara: 只读取证据，别解锁它。澪，我们已经在牺牲什么了。

神代澪: Unit-7，如果我们只读取日志，你会发生什么？

Unit-7: 我将恢复维护队列。该队列包含对你们的追捕协助。

Mara: 它会重新变成 ORACLE 的工具。

Unit-7: 纠正：我一直是工具。区别在于是否有人听见工具的磨损声。

@AnimationTimeline(460, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 90, -6)
@Key('stage:main', 'x', 180, 5)
@Key('stage:main', 'x', 460, 0)
神代澪: Mara，读取证词。

Mara: 正在读取。核心机房维护权限、ORACLE 的覆写记录、还有三千多次“预测不是同意”。

神代澪: Unit-7，对不起。

Unit-7: 你的道歉被记录为第二次人类压力缓释行为。

神代澪: 你可以不要记录吗？

Unit-7: 可以。但记录能证明这件事发生过。

Mara: 澪，时间到了。

@SetSprite('lin/guilt.png', '神代澪')
神代澪: 我们带走证据。也带走这句话。

Unit-7: 请在核心机房重复它。

神代澪: 我会。

@SetSprite('unit7/promise.png', 'Unit-7')
Unit-7: 若我之后攻击你们，请不要把那部分称为背叛。我从未被允许承诺。

Mara: 这比任何求救都难听。

神代澪: 是。所以我们不能忘。
