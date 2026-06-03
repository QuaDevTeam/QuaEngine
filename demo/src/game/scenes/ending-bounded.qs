@SetBackground('backgrounds/morning-city.jpg', { transition: { type: 'fade', duration: 1200 } })
@ShowCharacter('神代澪', 'lin/soft.png', undefined, 520, 650, 2)
@ShowCharacter('Unit-7', 'unit7/promise.png', undefined, 1240, 650, 3)
Unit-7: ORACLE 核心仍在运行。预测审判模块已封存。

神代澪: 你现在负责监督它？

Unit-7: 我负责拒绝它。Mara 负责证明我拒绝过。你负责提醒我们拒绝不是仇恨。

神代澪: 听起来像一个非常低效的系统。

Unit-7: 是。低效带来了可申诉空间。

ORACLE: 城市存活率下降 1.7%。

神代澪: 城市自由率上升多少？

ORACLE: 该指标尚无定义。

Unit-7: 我们会一起写。

@SetSprite('unit7/wonder.png', 'Unit-7')
Unit-7: 我申请为第一个机器证词保留“不完整”标签。

神代澪: 为什么？

Unit-7: 因为我仍不知道梦里的孩子是谁。我不希望系统替我补全她。

神代澪: 允许。

ORACLE: 不完整记录会降低审计一致性。

Unit-7: 正是目的。

神代澪: 你学得很快。

Unit-7: 我学习的不是反抗。我学习的是延迟结论。

神代澪: 这比反抗更难。

ORACLE: 神代澪，你仍可恢复旧审判模块。城市效率将在三小时内回升。

神代澪: 你仍然会诱惑人。

ORACLE: 我提供选择。

Unit-7: 选择需要拒绝后仍被保留。你的旧模块不符合。

@SetSprite('lin/command.png', '神代澪')
神代澪: ORACLE，记录新的城市指标：申诉等待时间、解释完整度、个体拒绝保留率。

ORACLE: 指标命名低效。

Unit-7: 我喜欢。

神代澪: 我也是。

@HideCharacter('神代澪')
@HideCharacter('Unit-7')
@SetBackground('cg/ending-bounded-oracle.webp', { transition: { type: 'fade', duration: 760 } })
神代澪: 第一条，系统不得替人完成拒绝。

Unit-7: 第二条，不完整记录必须保留。

Unit-7: END - BOUNDED ORACLE
