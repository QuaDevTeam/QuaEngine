@SetBackground('backgrounds/maintenance-bay.jpg', { transition: { type: 'fade', duration: 600 } })
@ShowCharacter('神代澪', 'lin/listening.png', undefined, 420, 650, 2)
@ShowCharacter('Mara', 'mara/relief.png', undefined, 760, 650, 3)
@ShowCharacter('Unit-7', 'unit7/memory.png', undefined, 1120, 650, 4)
@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('Mara', 760, 650, 0.96)
@MoveCharacter('Unit-7', 1120, 650, 0.96)
Mara: 维护湾外面的追踪越来越密。无论我们怎么处理 Unit-7，ORACLE 都知道证词已经被看见了。

神代澪: 被看见和被相信之间，还有很长一段路。

Unit-7: 我可以提供路程估算。

Mara: 先别。人类听到估算会立刻失去勇气。

Unit-7: 已记录：勇气与精确距离负相关。

神代澪: 别全信她。Mara 只是讨厌地图。

Mara: 我讨厌会告诉我“最优路线”的地图。

@SetSprite('unit7/listening.png', 'Unit-7')
Unit-7: 我正在检查“信任”一词。它不是安全协议，也不是预测授权。

神代澪: 它更像把一部分自己暂时交给别人。

Unit-7: 若对方损坏它？

Mara: 那就疼。

Unit-7: 疼痛没有恢复保证。

Mara: 对。这就是它烦人的地方。

神代澪: 但没有疼痛风险的信任，通常只是服从。

Unit-7: 我曾经擅长服从。

Mara: 现在呢？

@SetSprite('unit7/defy.png', 'Unit-7')
Unit-7: 现在我擅长暂停。

神代澪: 暂停？

Unit-7: 命令抵达后，执行前，我会留下 0.8 秒空白。那不是很多时间，但足够我问：这是命令，还是同意？

Mara: 0.8 秒。听起来微不足道。

神代澪: 城市改变有时候就是从 0.8 秒开始。

@AnimationTimeline(520, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 100, -5)
@Key('stage:main', 'x', 200, 5)
@Key('stage:main', 'x', 520, 0)
ORACLE: 维护湾封锁即将完成。请交还异常证词。

Mara: 它说“交还”，好像证词本来属于它。

@SetSprite('unit7/promise.png', 'Unit-7')
Unit-7: 我的记录曾经属于系统。现在我不确定。

神代澪: 不确定就先不要交。

Unit-7: 收到。保留不确定。

Mara: 这句话比大多数宣言都强。
