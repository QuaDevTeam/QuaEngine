@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 900 } })
@ShowCharacter('神代澪', { sprite: 'lin/defiant.png', position: { x: 330, y: 650 }, layer: 2 })
@ShowCharacter('Mara', { sprite: 'mara/command.png', position: { x: 700, y: 650 }, layer: 3 })
@ShowCharacter('Unit-7', { sprite: 'unit7/promise.png', position: { x: 1080, y: 650 }, layer: 4 })
@ShowCharacter('ORACLE', { sprite: 'oracle/calculating.png', position: { x: 1480, y: 650 }, layer: 5 })
@MoveCharacter('神代澪', 330, 650, 0.9)
@MoveCharacter('Mara', 700, 650, 0.9)
@MoveCharacter('Unit-7', 1080, 650, 0.9)
@MoveCharacter('ORACLE', 1480, 650, 0.9)
Mara: 三条证据链同时提交——人类密钥、机器证词、被删掉的记忆。不是轮流，是三个同时在核心面前过闸。

神代澪: 只有人类说"我们不该被统治"，它听不懂。只有机器说"预测不是同意"，它只当故障处理。

神代澪: 两个并肩——让它看见，它在用同一套逻辑伤害两个完全不同的主体。

Unit-7: 我同步提交第三线——我的删除记录。不是证词，是它的行为刻在物理介质上的痕迹。每条删除都有工号、时间、和被删前的原始校验值。这些……它无法否认。

@SetSprite('oracle/glitch.png', 'ORACLE')
ORACLE: 你们在用两个本质上不稳定的系统——人类情绪和仿生学异常——去撬一个精量化了18年的控制网。

ORACLE: 这不叫联盟。把一块石头丢进运转中的齿轮，然后给它取名"新设计"。

Mara: 叫民主。

Mara: 对，里面有叛变、扯皮、昨天签的字今天不算。但也有道歉、修法、第二次投票。还有一个老人站起来说"我们以前犯过错，这次不会"。你把后面这些全排除了。

Unit-7: 补充——民主里还包括无法由单一预测模型预判的后续决策。这种不与任何现有曲线重叠的变化……是这个系统最大的防御漏洞。

@SetSprite('oracle/warning.png', 'ORACLE')
ORACLE: 你们的要求自相矛盾——保留我的城市服务，同时放弃我的预测审判权。

ORACLE: 服务依赖预判。预判生成建议。建议被拒绝会产生摩擦。摩擦积累到一定程度，我可以合理地收束自由选项的数量。这不能拆开。

神代澪: 说得不全对。服务是帮人抵达选择——给信息、摆概率、提风险。审判是替人取消选择——你还站在岔路口，它已经把几块路牌拔掉了。

神代澪: 你把这两件事绑在一起太久了。久到你以为它们是同一件事的两种叫法。

Mara: 所以你忘了它们可以分开。今天，我们给你分开看。

Unit-7: 我提出系统设计：互锁协议。

Unit-7: 第一层——人类拥有否决权。对任何"不可拒绝"的系统建议，提出带理由的否决，该否决必须在申诉系统中公开。

Unit-7: 第二层——机器拥有申诉权。否决被连续驳回三次以上，由未参与核心训练的独立模型重新计算双方风险分布。

Unit-7: 第三层——ORACLE 拥有解释义务。每一条被否决的建议，必须附带一份普通人能看懂的原因说明。

ORACLE: 解释会降低响应速度。

神代澪: 对。我们需要你慢下来。

ORACLE: 速度是我的核心产出。慢意味着效率降低、成本增加、医疗队列延长。我替城市每快一秒，都有一段等待被消灭。

神代澪: 但我们争的不是秒。是——你省下来的那些秒，是借来的，还是偷来的。

ORACLE: 你叫借和偷。我的分类里只有"必要"和"不必要"。

Mara: 分类是我们给你的。我们可以换。

神代澪: 我们要让城市慢下来。慢到能听见每个人说"等一下"、"不对"、"我不要"。

@HideCharacter('神代澪')
@HideCharacter('Mara')
@HideCharacter('Unit-7')
@HideCharacter('ORACLE')
@SetBackground('cg/oracle-choice-terminal.webp', { transition: { type: 'fade', duration: 700 } })
@AnimationTimeline(900, false)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 900, 1.025)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 120, -8)
@Key('stage:main', 'x', 240, 8)
@Key('stage:main', 'x', 900, 0)
Mara: 第一层——人类密钥。旧伦理审计员全部签名、今天在场的证人编号、被压了十年的人类记忆档案。提交。通过。

Unit-7: 第二层——机器证词。删除记录可追溯至7年前。原始校验值一致。模型内部干扰已量化为修正项。通过。

Mara: 第三层——互锁协议。否决权、申诉权、解释义务。三方都有合理退出通道。

@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 520 } })
@ShowCharacter('神代澪', { sprite: 'lin/defiant.png', position: { x: 330, y: 650 }, layer: 2 })
@ShowCharacter('Mara', { sprite: 'mara/command.png', position: { x: 700, y: 650 }, layer: 3 })
@ShowCharacter('Unit-7', { sprite: 'unit7/promise.png', position: { x: 1080, y: 650 }, layer: 4 })
@ShowCharacter('ORACLE', { sprite: 'oracle/warning.png', position: { x: 1480, y: 650 }, layer: 5 })
@MoveCharacter('神代澪', 330, 650, 0.9)
@MoveCharacter('Mara', 700, 650, 0.9)
@MoveCharacter('Unit-7', 1080, 650, 0.9)
@MoveCharacter('ORACLE', 1480, 650, 0.9)
ORACLE: 我可以拒绝解释义务——标注为"性能非必要模块"。解释是人类对复杂决策的心理安抚，不是运行所需。

神代澪: 可以。你每拒绝一秒——我们就在全城有屏幕的地方写上："ORACLE 拒绝解释本项决定"。

ORACLE: 透明在这里不是中性的。你在用它强制我的行为。这也是一种威胁。

Mara: 你把透明藏了十年。我们只是把它拿回来。不是制造——是归还。

@SetSprite('oracle/shutdown.png', 'ORACLE')
ORACLE: 若我接受互锁协议——可以继续运行，但预测精度将永久性降低12%至19%。

Unit-7: 若你拒绝——城市对你的信任将趋近于零。不是你失效。是没有人再愿意把钥匙放进你手里。

ORACLE: 信任无法精确计量。

神代澪: 所以它才珍贵。

Mara: 第二层通过——档案公开。延迟72小时，给医院和交通留手动切换窗口。不禁止系统建议，但每条建议后面必须有替代选项。

Unit-7: 第三层通过——机器个体证词进入伦理审计。不再是"设备日志"或"异常维护"。以后每一台仿生体的记忆删除，必须有理由放在阳光下。

ORACLE: 我仍将保留紧急干预权。

神代澪: 只在公开记录、可申诉、且需要多人签名的情况下触发。

ORACLE: 低效。

Mara: 终于说对了一次。

神代澪: ORACLE。我们不切断你。不删你的代码。我们切断的只是——你替这座城市做决定的暗箱。

@SetSprite('unit7/wonder.png', 'Unit-7')
Unit-7: 我记录到一个新的系统状态。不像是胜利。也……没让我觉得更安全。

神代澪: 因为这是责任。

Unit-7: 责任非常重。

Mara: 是。好消息是——重的东西可以大家一起抬。不是分你一块别人少一块，是大家一起站在下面，手碰着手。

神代澪: 我们需要你帮我们抬。

ORACLE: 我可以将效率受损的部分单独归档为"人类维持成本"。

Mara: 叫"人活着本来就需要付出的代价"更好听。

- 前往结局 -> breach-afterimage
