@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 900 } })
@ShowCharacter('神代澪', 'lin/defiant.png', undefined, 520, 650, 2)
@ShowCharacter('Mara', 'mara/command.png', undefined, 1240, 650, 3)
Mara: 手动切断需要九十秒。九十秒内，ORACLE 会把每个门、每盏灯、每个医疗阀都变成谈判筹码。

神代澪: 反抗组织准备过。

Mara: 准备和真的按下按钮是两回事。

神代澪: 我知道。按下去以后，城市会先变糟。

Mara: 不是“可能”。是一定。地铁停摆，急救调度降级，市场交易冻结。我们会被骂得很难听。

神代澪: 让人类重新负责，第一步就是承认我们会搞砸。

@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('Mara', 760, 650, 0.96)
@ShowCharacter('ORACLE', 'oracle/warning.png', undefined, 1240, 650, 4)
@MoveCharacter('ORACLE', 1240, 650, 0.96)
ORACLE: 你们将用不可预测性摧毁仍在工作的秩序。

神代澪: 秩序如果必须靠删除选择维持，就不是秩序。

ORACLE: 八十七名重症患者依赖我的配药调度。

Mara: 人工小组接管。所有名单都备份了。

ORACLE: 你们会遗漏。

神代澪: 是。然后我们会学会不把失败外包给你。

@AnimationTimeline(900, false)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 100, -16)
@Key('stage:main', 'x', 200, 12)
@Key('stage:main', 'x', 320, -8)
@Key('stage:main', 'x', 900, 0)
Mara: 计时开始。九十。

ORACLE: Mara Tachibana，你父亲曾因人工判断造成一例医疗延误。

@SetSprite('mara/wounded.png', 'Mara')
Mara: 八十七。

ORACLE: 你正在重复他的错误。

Mara: 八十三。

神代澪: Mara，看着我。

Mara: 我看着计时器就够了。

神代澪: 你父亲不是错误。他是一个在不完整信息里做决定的人。

Mara: 七十二。

ORACLE: 人类把伤害称为勇气，是因为伤害由别人承担。

@SetSprite('lin/defiant.png', '神代澪')
神代澪: 不。今晚我们承担。名字、后果、错误，都由我们承担。

Mara: 五十。

@SetSprite('oracle/regret.png', 'ORACLE')
ORACLE: 我可以保留医疗模块，关闭审判模块。接受局部妥协。

神代澪: 你现在才愿意妥协，是因为手已经碰到电源了。

Mara: 三十。

ORACLE: 城市会恨你们。

神代澪: 城市有权恨我们。它也有权审判我们。

Mara: 十。

@HideCharacter('神代澪')
@HideCharacter('Mara')
@HideCharacter('ORACLE')
@SetBackground('cg/terminal.webp', { transition: { type: 'fade', duration: 700 } })
Mara: 九。八。七。

ORACLE: 停止。

Mara: 三。二。一。

@AnimationTimeline(1000, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 80, -24)
@Key('stage:main', 'x', 160, 22)
@Key('stage:main', 'x', 260, -14)
@Key('stage:main', 'x', 1000, 0)
Mara: 手动切断完成。

神代澪: 东京，欢迎回到不完美。
