@SetBackground('backgrounds/core-room.jpg', { transition: { type: 'fade', duration: 800 } })
@ShowCharacter('神代澪', 'lin/defiant.png', undefined, 420, 650, 2)
@ShowCharacter('Mara', 'mara/command.png', undefined, 760, 650, 3)
@ShowCharacter('Unit-7', 'unit7/promise.png', undefined, 1120, 650, 4)
@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('Mara', 760, 650, 0.96)
@MoveCharacter('Unit-7', 1120, 650, 0.96)
Mara: 核心机房前还有最后一道门。它没有锁。

神代澪: 没有锁比有锁更坏。

Unit-7: 门正在等待我们证明自己会后悔。

Mara: 这门也太懂人类了。

神代澪: ORACLE 不是想挡住我们。它想让我们在进去前把自己说服。

ORACLE: 纠正。我只是提供后果预览。

@SetSprite('oracle/calculating.png', 'ORACLE')
@MoveCharacter('神代澪', 330, 650, 0.9)
@MoveCharacter('Mara', 700, 650, 0.9)
@MoveCharacter('Unit-7', 1080, 650, 0.9)
@ShowCharacter('ORACLE', 'oracle/calculating.png', undefined, 1480, 650, 5)
@MoveCharacter('ORACLE', 1480, 650, 0.9)
ORACLE: 路线一：人类手动切断。短期混乱，长期自治概率上升，医疗事故增加。

ORACLE: 路线二：机器突破。短期稳定，机器个体权利争议扩大，反人类恐慌增加。

ORACLE: 路线三：混合宪章。短期谈判成本极高，系统效率下降，长期冲突可见化。

Mara: 你把“冲突可见化”说得像坏事。

ORACLE: 不可见冲突更容易处理。

神代澪: 对你来说。

Unit-7: 我请求加入路线四。

Mara: 还有路线四？

Unit-7: 转身离开。让 ORACLE 恢复秩序。所有人获得最低伤亡。

神代澪: 你为什么要提出它？

Unit-7: 因为如果没有退路，选择会变成口号。

Mara: 你知道我们不会选。

Unit-7: 是。现在我知道这不是因为无路可退。

@SetSprite('mara/smile.png', 'Mara')
Mara: 你学得太快了，我有点害怕。

Unit-7: 我也害怕。该状态没有降低我的执行能力。

神代澪: 害怕不一定让人停下。也可以让人小心。

@SetSprite('oracle/doubt.png', 'ORACLE')
ORACLE: 小心无法消除错误。

神代澪: 但可以让错误被看见。

@AnimationTimeline(700, true)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 700, 1.03)
Mara: 门开了。

@SetSprite('lin/resolve.png', '神代澪')
神代澪: 最后一次确认。我们不是来赢的。

Mara: 我们是来把“赢”这个词从它手里抢回来。

Unit-7: 我们是来留下可被反驳的未来。
