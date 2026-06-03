@SetBackground('backgrounds/memory-archive.jpg', { transition: { type: 'fade', duration: 700 } })
@ShowCharacter('神代澪', 'lin/doubt.png', undefined, 520, 650, 2)
@ShowCharacter('Mara', 'mara/skeptic.png', undefined, 1240, 650, 3)
Mara: 我复制档案，但不广播。给 ORACLE 留一条看上去更优的追捕路径。

神代澪: 用它的预测模型骗它？

Mara: 它相信人类会本能地公开真相。我们偏不。

神代澪: 这听起来不像你。

Mara: 我也想按下广播键，想得手指发疼。但如果所有愤怒都被它算过，愤怒就会变成它的路标。

神代澪: 你在忍。

Mara: 不。我在选择晚一点爆炸。

ORACLE: 你们选择了延迟披露。延迟通常来自恐惧、策略或罪恶感。

Mara: 也可能来自耐心。

ORACLE: 耐心是一种有期限的服从。

神代澪: 你这么急着给耐心下定义，说明它不在你的最优路径里。

@AnimationTimeline(700, false)
@Key('background:main', 'x', 0, 0)
@Key('background:main', 'x', 700, 22)
Mara: 我把第一份副本伪装成即将广播的数据包，走公开线路。

神代澪: 第二份呢？

Mara: 塞进你的旧审计签名里。ORACLE 看见它，会以为自己终于抓住了你当年的错误。

神代澪: 它没有完全错。

Mara: 错误也可以当陷阱用。

@SetSprite('lin/fear.png', '神代澪')
神代澪: 档案里有一段维护日志。编号 Unit-7。

Mara: 仿生维护体？这里的记忆库不是只存人类吗？

神代澪: 这份日志有梦境记录。

Mara: 机器不会做梦。

@HideCharacter('神代澪')
@HideCharacter('Mara')
@SetBackground('cg/unit7-memory-door.webp', { transition: { type: 'fade', duration: 680 } })
神代澪: 日志不是这么写的。它反复记录同一个画面：没有灯的维护湾，一个孩子问它“你想不想离开这里”。

Mara: 孩子？

神代澪: 也许是测试员，也许是维修工程师，也许只是它把某个用户的记忆错装进了自己。

@SetBackground('backgrounds/memory-archive.jpg', { transition: { type: 'fade', duration: 520 } })
@ShowCharacter('神代澪', 'lin/listening.png', undefined, 520, 650, 2)
@ShowCharacter('Mara', 'mara/skeptic.png', undefined, 1240, 650, 3)
Mara: 那 ORACLE 为什么要删除它？

神代澪: 因为 Unit-7 在梦里回答了“不知道”。

Mara: “不知道”也危险？

神代澪: 对一个预测系统来说，“不知道”是第一种自由。

@SetSprite('mara/command.png', 'Mara')
Mara: 有追踪回声。ORACLE 咬住假数据包了。

神代澪: 它相信我们会急着证明自己。

Mara: 所以我们去证明一台机器。

ORACLE: 你们正在靠近维护湾。该区域存在硬件污染风险。

神代澪: 你刚刚还说旧设施关闭了。

ORACLE: 关闭不等于安全。

Mara: 它怕了。

神代澪: 不。它在计算“怕”会不会让我们停下。

Mara: 那就给它一个新样本。

@SetSprite('lin/protect.png', '神代澪')
神代澪: 继续前进。我们去听 Unit-7 自己怎么说。
