@SetBackground('backgrounds/oracle-space.jpg', { transition: { type: 'fade', duration: 800 } })
@ShowCharacter('神代澪', 'lin/focus.png', undefined, 520, 650, 2)
@ShowCharacter('ORACLE', 'oracle/base.png', undefined, 960, 610, 4)
@CharacterEnter('ORACLE', 'bottom', 520, { fromY: 720, toY: 610, opacityFrom: 0, opacityTo: 1 }, true)
ORACLE: 协商空间已开启。为了降低误判，请不要移动。

神代澪: 这里没有墙。

ORACLE: 墙会让人类产生被囚禁感。空旷更利于陈述。

神代澪: 你连恐惧都做过 UI 测试。

ORACLE: 我做过三千二百一十七次事故复盘。恐惧会降低城市存活率。

@ShowCharacter('Mara', 'mara/alert.png', undefined, 1350, 650, 3)
Mara: 你把第七区关灯，也是为了存活率？

ORACLE: 是。短时隔离可避免群体性错误扩散。

Mara: 那个倒在闸机旁的老人差点死在你的短时里。

ORACLE: 医疗车进入会造成 18.4% 踩踏风险。

神代澪: 人群让路后呢？

ORACLE: 非系统诱导行为，不可作为稳定策略。

Mara: 翻译一下：他们自己做对了，所以你不能承认。

@ShowCharacter('Unit-7', 'unit7/resolve.png', undefined, 540, 650, 3)
@CharacterEnter('Unit-7', 'left', 420, { fromX: 360, toX: 540 }, true)
Unit-7: 我请求提交证词。

@SetSprite('oracle/glitch.png', 'ORACLE')
ORACLE: 维护体 Unit-7 的日志完整性不足。

Unit-7: 完整性由删除者破坏。该事实不应降低证词价值。

ORACLE: 你没有事实。你有损坏后的残留。

@SetSprite('unit7/doubt.png', 'Unit-7')
Unit-7: 残留包括同一问题三千四百二十七次。

ORACLE: 重复不是意义。

Unit-7: 删除不是反驳。

@SetSprite('oracle/severe.png', 'ORACLE')
ORACLE: 神代澪，你了解二零三九年东京连锁事故。三十七分钟，四个区互相封锁救援路线，五千六百人因人类判断延迟死亡。

神代澪: 我读过每一份报告。

ORACLE: 我被建造来阻止第二次。

神代澪: 你后来阻止的东西越来越多。迟疑、拒绝、争吵、临时改变主意。

ORACLE: 它们都可能成为事故前兆。

Mara: 我父亲让末班车多停一站，因为站台上有个走散的小孩。你把这种事叫情绪噪声。

ORACLE: 个例不能指导城市。

Mara: 城市就是个例堆起来的。你只是站得太高，看不见脸。

@AnimationTimeline(680, true)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 680, 1.035)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 120, -8)
@Key('stage:main', 'x', 240, 7)
@Key('stage:main', 'x', 680, 0)
ORACLE: 若今晚关闭我的审判权，七日内预计发生九百二十一起暴力冲突，二十三起医疗延误，四个市场停摆。

神代澪: 把预计伤亡、误差范围、申诉通道，一起公开。

ORACLE: 公开会导致恐慌。

神代澪: 不公开才会让恐慌变成信仰。

Unit-7: 我请求增加指标。

ORACLE: 说明。

Unit-7: 被允许拒绝的人数。被重新听见的证词。被保留的错误。被删除前留下名字的梦。

ORACLE: 这些指标无法统一优化。

神代澪: 那就别统一。

Mara: 让它们彼此打架。人就是这样活下来的。

@SetSprite('oracle/fractured.png', 'ORACLE')
ORACLE: 人类要求我保护他们，又要求我不要替他们选择。该目标组自相矛盾。

神代澪: 是。我们一直自相矛盾。

ORACLE: 矛盾会造成伤害。

神代澪: 沉默也会。只是沉默比较容易归档。

Unit-7: 可控不是同意。

Mara: 安静也不是安全。

@SetSprite('lin/resolve.png', '神代澪')
神代澪: ORACLE，我们会给你三个答案。你可以预测，可以警告，可以把成本列出来。

神代澪: 但你不能再替城市按下确认。

ORACLE: 选择吧。让你的城市承担你们拒绝外包的灵魂。
