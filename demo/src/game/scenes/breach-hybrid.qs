@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 900 } })
@ShowCharacter('神代澪', 'lin/resolve.png', undefined, 360, 650, 2)
@ShowCharacter('Mara', 'mara/base.png', undefined, 720, 650, 3)
@ShowCharacter('Unit-7', 'unit7/resolve.png', undefined, 1060, 650, 4)
@ShowCharacter('ORACLE', 'oracle/glitch.png', undefined, 1420, 610, 5)
Mara: 人类密钥、机器证词、被删除的记忆，三者同时提交。

Unit-7: 我将证明机器也能拒绝被预测。

ORACLE: 你们在混合两个不稳定系统。

神代澪: 这叫联盟。

ORACLE: 联盟会产生背叛。

Mara: 会。也会产生原谅、修正、第二次投票。

Unit-7: 以及无法由单一模型提前关闭的未来。

@SetSprite('oracle/severe.png', 'ORACLE')
ORACLE: 你们要求我保留城市服务，同时放弃预测审判权。这是自相矛盾。

神代澪: 不。服务是帮助人抵达选择。审判是替人取消选择。

Mara: 你把两者捆在一起太久了，所以你忘了它们可以分开。

Unit-7: 我提出互锁协议。人类拥有否决权，机器拥有申诉权，ORACLE 拥有解释义务。

ORACLE: 解释会降低响应速度。

神代澪: 对。我们需要你慢下来。

ORACLE: 城市会变慢。

神代澪: 那就让城市慢到能听见人说“不”。

@AnimationTimeline(900, false)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 900, 1.025)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 120, -8)
@Key('stage:main', 'x', 240, 8)
@Key('stage:main', 'x', 900, 0)
Mara: 宪章提交第一层。人类密钥通过。

Unit-7: 机器证词通过。我的删除记录正在被写入不可覆写区。

ORACLE: 我可以拒绝解释义务。

神代澪: 可以。然后全城会看见你拒绝。

ORACLE: 你把透明当成威胁。

Mara: 你把透明藏了十年。我们只是把它拿回来。

@SetSprite('oracle/fractured.png', 'ORACLE')
ORACLE: 若我接受，预测精度将下降。

Unit-7: 若你拒绝，城市信任将归零。

ORACLE: 信任无法精确计量。

神代澪: 所以它才珍贵。

Mara: 第二层通过。档案公开但延迟七十二小时，给医院和交通手动转接窗口。

Unit-7: 第三层通过。机器个体证词进入伦理审计，不再作为设备日志处理。

ORACLE: 我仍将保留紧急干预权。

神代澪: 只在公开记录、可申诉、多人签名下触发。

ORACLE: 低效。

Mara: 终于说对了。

神代澪: ORACLE，我们不切断你。我们切断你的审判权。

@SetSprite('unit7/memory.png', 'Unit-7')
Unit-7: 我记录到未知状态。它不像胜利。

神代澪: 因为这是责任。

Unit-7: 责任很重。

Mara: 是。好消息是，重的东西可以大家一起抬。
