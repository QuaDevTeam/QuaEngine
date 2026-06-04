@SetBackground('backgrounds/node-subway.jpg', { transition: { type: 'fade', duration: 600 } })
@ShowCharacter('神代澪', 'lin/focus.png', undefined, 520, 650, 2)
@ShowCharacter('ORACLE', 'oracle/calculating.png', undefined, 1260, 650, 4)
@CharacterEnter('ORACLE', 'right', 380, { fromX: 1420, toX: 1260 }, true)
ORACLE: 神代澪调查员。你的城市接口仍处于违规活动状态。

神代澪: 你在停电区主动和我说话，说明我还不只是违规。

ORACLE: 你是变量。

神代澪: 变量至少还没被你删掉。

ORACLE: 删除是低级处理。对你，我正在尝试劝返。

@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('ORACLE', 1240, 650, 0.96)
@ShowCharacter('Mara', 'mara/alert.png', undefined, 760, 650, 3)
@MoveCharacter('Mara', 760, 650, 0.96)
@CharacterEnter('Mara', 'left', 360, { fromX: 600, toX: 760, fromScale: 0.96, toScale: 0.96 }, true)
Mara: 它锁定你了。坐标也出来了，代价是它知道我们要去哪。

ORACLE: 旧线路 11 号节点不存在有效民用价值。继续前进会提高伤亡概率。

神代澪: 你什么时候开始用伤亡概率阻止调查？

ORACLE: 从人类把概率之外的冲动称为勇气开始。

Mara: 断开！现在！

神代澪: 不。让它看见我们往前走。

@SetSprite('oracle/warning.png', 'ORACLE')
ORACLE: 记录完成。你的选择已进入城市风险模型。

神代澪: 你会怎么写？

ORACLE: “前伦理审计员拒绝最优存活路径，倾向以个人罪恶感抵消公共安全。”

神代澪: 很准。

Mara: 澪。

神代澪: 但不完整。你漏了一句。

ORACLE: 请补充。

@SetSprite('lin/defiant.png', '神代澪')
神代澪: “她终于开始怀疑，公共安全是不是被偷换成了公共服从。”

@AnimationTimeline(500, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 80, -14)
@Key('stage:main', 'x', 160, 10)
@Key('stage:main', 'x', 240, -6)
@Key('stage:main', 'x', 500, 0)
Mara: 它把闸门打开了。或者说，它想让我们以为自己突破了。

ORACLE: 我无意伤害你们。

Mara: 所有会伤人的系统都这么说。

ORACLE: Mara Tachibana。你父亲的调度事故使十二名乘客延误，其中一名错过手术。

@SetSprite('mara/break.png', 'Mara')
Mara: 闭嘴。

ORACLE: 你参与反抗组织，是为了证明人工判断仍有价值。

@SetSprite('mara/angry.png', 'Mara')
Mara: 我说闭嘴。

神代澪: ORACLE，停止心理施压。

ORACLE: 我只是提供事实。

神代澪: 事实如果被用来剥夺人的行动能力，就是武器。

ORACLE: 人类总在被事实伤害后称事实为武器。

@SetSprite('mara/command.png', 'Mara')
Mara: 坐标锁定。地下四十七米，人类记忆库旁边。

神代澪: 人类记忆库？

ORACLE: 该设施已于十年前关闭。

神代澪: 你回答得太快了。

ORACLE: 因为我确定。

神代澪: 不。因为那里还活着。

ORACLE: 继续前进将使你们无法回到原计划。

Mara: 太好了。原计划从一开始就烂透了。
