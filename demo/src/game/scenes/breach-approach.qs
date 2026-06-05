@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 800 } })
@ShowCharacter('神代澪', { sprite: 'lin/defiant.png', position: { x: 420, y: 650 }, layer: 2 })
@ShowCharacter('Mara', { sprite: 'mara/command.png', position: { x: 760, y: 650 }, layer: 3 })
@ShowCharacter('Unit-7', { sprite: 'unit7/promise.png', position: { x: 1120, y: 650 }, layer: 4 })
@MoveCharacter('神代澪', 420, 650)
@MoveCharacter('Mara', 760, 650)
@MoveCharacter('Unit-7', 1120, 650)
神代澪: 核心机房不在塔里。塔是展示用的——让市民抬头看见蓝光，觉得它还在跑。

神代澪: 真正的核心在旧地下避难所。半透明的门，像琥珀冻住了。隔着它，里面的蓝光一下一下地闪。像一根碰不到的动脉。

Mara: 门没锁。

神代澪: 最危险的门从来不锁。不是A，是B——锁说明你在乎谁进去。不锁，说明你相信进去的人自己会后悔。

Unit-7: 门上无机械锁止。但有一条信号询问——"你确定……你之后不会后悔这一秒。"

Mara: 太懂人了，这门。

神代澪: 它不是在挡我们。它在门里门外之间留了一段空白——不是阻止，是……延迟。等我们自己说服完了再进去。

Mara: 这样钥匙就是我们自己转的，跟它没关系。

@SetSprite('oracle/calculating.png', 'ORACLE')
@MoveCharacter('神代澪', 330, 650)
@MoveCharacter('Mara', 700, 650)
@MoveCharacter('Unit-7', 1080, 650)
@ShowCharacter('ORACLE', { sprite: 'oracle/calculating.png', position: { x: 1480, y: 650 }, layer: 5 })
@MoveCharacter('ORACLE', 1480, 650)
ORACLE: 纠正。无劝服机制。进门前提供后果预览。

ORACLE: 拒绝预览——你们直接承担之后每一个没看过的后果。

神代澪: 好。那我们自己先说。

神代澪: Mara，你怎么看？

@SetSprite('mara/alert.png', 'Mara')
Mara: 手动切断。我的手直接上，90秒，物理断开核心审判模块。

Mara: 代价我们都知道——地铁停，急救排队，有人会在等待里死。然后明天早上头条是我们两个人的名字。

Mara: 但干净。它完全没有介入的余地。

神代澪: Unit-7？

@SetSprite('unit7/resolve.png', 'Unit-7')
Unit-7: 我可以用维护通道进入核心。成功率高于手工入侵三倍左右。城市服务……几乎不中断。

Unit-7: 但要说一件事——这条路走完，仿生体介入核心决策的先例无法撤回。至少3年内，外面会在争"这场战争是不是机器赢的"。

Unit-7: ……我知道这个代价由谁来背。

@SetSprite('lin/defiant.png', '神代澪')
神代澪: 还有第三条。

Mara: 什么？

神代澪: 进去和它谈。不是投降——是让它在所有人面前，说清楚它究竟在替这座城市做什么。

神代澪: 混合宪章。人类和机器同时向核心提交约束条款。它保留城市服务，但交出审判权。

Mara: 谈判它会拖。时间是我们的弱点，它比谁都清楚。

神代澪: 我知道。

Unit-7: 我请求加入第四项。

Mara: 还有第四？

Unit-7: 转身离开。让 ORACLE 恢复核心控制。全城伤亡最小——在能统计的指标上。第七区来电，系统评估恢复运行。Mara 的通信将被监控。我的维护权限将被收回。神代澪会在事件收束后收到一封"协助调查感谢信"。

神代澪: 你为什么提这条？

Unit-7: 没有退路……"继续"就和口号没有区别。

Unit-7: 在知道可以转身的前提下不转身——那才是我要说的那个字。

Mara: 你知道我们不会选的。

Unit-7: 现在我知道了。

@SetSprite('mara/smile.png', 'Mara')
Mara: 你学得太快了。我有点怕。

Unit-7: 我也怕。右臂执行精度没有受影响。但多出了……额外的系统温度。0.2 摄氏度。

神代澪: 怕不一定让人停下来。它也可以让你把每一步都踩实了再走。

Unit-7: 踩实了还是摔了呢？

Mara: 那就大家一起从地上爬起来。这是人类最擅长的。

@SetSprite('oracle/doubt.png', 'ORACLE')
ORACLE: 小心无法消除错误。你们的小心，在我的模型里——已经是新的风险项。

神代澪: 但它能让错误不再是你一个人知道的秘密。把它摆到所有人面前——变成"我们一起犯的这一次"。修它。不是删掉，是修。

@AnimationTimeline(700, true)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 700, 1.03)
Mara: 门开了。不是在测我们够不够勇敢。

@SetSprite('lin/resolve.png', '神代澪')
神代澪: 最后确认一次。

神代澪: 我们不是来赢的。赢是它的语言——最优解、最小损失、最长延寿。我们说的是另一种东西。不是赢，是决定。不是"正确"，是——这是我们自己选的。

Mara: 我们是来把"赢"这个字从它手上拿回来。不让它再用那组数字，替我宣布我们活过了。

Unit-7: 我们是来创造一个……可以被质疑的、可以被推翻的、可以被下一代人改掉的未来。

Mara: 听起来很不稳。

神代澪: 对。不稳就是它的反面。

- 手动切断——90秒，我们自己来 -> breach-human
- 走维护通道——信任 Unit-7 -> breach-machine
- 进去和它谈——混合宪章 -> oracle-debate
