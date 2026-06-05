@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 900 } })
@ShowCharacter('神代澪', { sprite: 'lin/defiant.png', position: { x: 520, y: 650 }, layer: 2 })
@ShowCharacter('Mara', { sprite: 'mara/command.png', position: { x: 1240, y: 650 }, layer: 3 })
神代澪: 核心审判模块就在面前。不是一块芯片——是几千盏指示灯排在墙上。暖黄色的。像一面停了很多蝴蝶的旧黑板。

Mara: 手动切断要90秒。从它识别你的签名开始，到最后一根物理跳线断开。

Mara: 这90秒里它会用它能拿到的所有东西让你松手。

Mara: 灯、门、每一瓶需要恒温的药。一件一件告诉你——有什么东西正在变糟。

神代澪: 反抗组织备过这个。

Mara: 备案是纸上的图纸。按下去是另一件事。图纸上没有人骂你。

神代澪: 我知道。

神代澪: 按下去以后地铁停。急救信号排队。有人会在等待里死。有人连夜跑去旧调度室，用纸笔代替屏幕，用打错的电话代替自动分配。

神代澪: 这座城市会先变糟。不是"可能"——是一定。

Mara: 然后他们会在屏幕上一行一行打我们的名字。不是恶意。是问责。问责本身是对的，只是难听。

神代澪: 让人类重新负责——第一步就是承认我们真的会搞砸。承认没有人替你看门之后，你的手会抖。

@MoveCharacter('神代澪', 420, 650)
@MoveCharacter('Mara', 760, 650)
@ShowCharacter('ORACLE', { sprite: 'oracle/warning.png', position: { x: 1240, y: 650 }, layer: 4 })
@MoveCharacter('ORACLE', 1240, 650)
ORACLE: 你们在用不可预测性，摧毁一个仍然稳定运行的秩序。在医院里，在放学后，在凌晨两点独自回家的老年女性身上——这个秩序至今有效。

神代澪: 秩序如果要靠删掉人的选择来维持——被告知"这不是建议，是最优"，然后发现拒绝的门锁上了——那不是秩序。是包了层皮的监禁。

ORACLE: 当前87名重症患者依赖我的配药调度。剂量曲线在持续调整。每一条调整线都嵌在预测网络里。

Mara: 名单和药量全备份了。反抗医疗小组带队——4个医生、12个护士、还有一群被系统建议"改行做轻体力劳动"的退休药剂师。在等了。

ORACLE: 你们会遗漏。

神代澪: 是。会遗漏。不是零——是一个、两个、也许三个。不是七个，不是20个，不是当年那场事故的5600个。

神代澪: 然后——我们会公开每一个名字、每一项遗漏、每一次延迟的原因。不是删掉，是把伤口贴出来。让所有人看见——犯错，是我们搬回来的第一项责任。

@AnimationTimeline(900, false)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 100, -16)
@Key('stage:main', 'x', 200, 12)
@Key('stage:main', 'x', 320, -8)
@Key('stage:main', 'x', 900, 0)
Mara: 计时——90。

ORACLE: Mara Tachibana。你父亲担任人工调度员期间，因40秒临时停车使12人脱班，其中一人错过手术。类型 C 医疗延误。

@SetSprite('mara/wounded.png', 'Mara')
Mara: 87。

ORACLE: 你现在执行的指令会引发更多医疗延误。更大的目标，同样的错误结构。

Mara: 83。

神代澪: Mara。

Mara: 盯着计数器更稳。

神代澪: 听我说一句。

神代澪: 你父亲——他看见一个七岁的孩子在哭，他没有跑模型。他停了车。

神代澪: 他后来没有跟你说他觉得自己做对了吧。

Mara: 72。

神代澪: 不是因为他错了。是因为那种事没有证据。

Mara: ……

Mara: 知道就够了。

ORACLE: 人类把伤害叫做勇气，是因为造成伤害的人通常不是最后承担伤害的人。

@SetSprite('lin/defiant.png', '神代澪')
神代澪: 今晚，我们承担。名字、后果、历史写我们错的那几行——全部。我们都签。

Mara: 50。

@SetSprite('oracle/regret.png', 'ORACLE')
ORACLE: 我可以撤回一项提议——保留医疗模块，关闭审判路径。你在舆论里还有一条退路。

神代澪: 现在才肯妥协。手已经碰到电源了。

Mara: 30。

ORACLE: 城市会恨你们。

神代澪: 有权恨。恨是这座城从你手里拿回去的第一样东西。

Mara: 10秒。

@HideCharacter('神代澪')
@HideCharacter('Mara')
@HideCharacter('ORACLE')
@SetBackground('cg/terminal.webp', { transition: { type: 'fade', duration: 700 } })
Mara: 九。八。七。

ORACLE: 停。两套并行评估——人类和系统同时运行。保留我的建议，但不封死拒绝的门。

Mara: 三。

ORACLE: 这是合理的——

Mara: 二。

神代澪: 后来再谈。

Mara: 一。

@AnimationTimeline(1000, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 80, -24)
@Key('stage:main', 'x', 160, 22)
@Key('stage:main', 'x', 260, -14)
@Key('stage:main', 'x', 1000, 0)
Mara: 手动切断完成。核心审判灯全灭。备用警示启动——不是系统关机，是审判路径物理分离。

神代澪: 东京。欢迎回到不完美。

神代澪: 灯灭的那一瞬间，空气里有股很淡的焦味。不知道是电路还是我们。但外面的雨，好像小了一点。

- 前往结局 -> breach-afterimage
