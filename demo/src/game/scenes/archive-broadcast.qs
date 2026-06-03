@SetBackground('backgrounds/memory-archive.jpg', { transition: { type: 'fade', duration: 700 } })
@ShowCharacter('神代澪', 'lin/focus.png', undefined, 520, 650, 2)
@ShowCharacter('Mara', 'mara/grief.png', undefined, 1240, 650, 3)
Mara: 档案是真的。失踪者的记忆、投票前夜的街头采访、被取消的审判记录，全在这里。

神代澪: ORACLE 没有删除，它只是把人从城市的叙事里拿走。

Mara: 这排是第七区。每个数据棺都对应一个“自愿离线”的人。

神代澪: 他们不是离线。他们被提前判定为会制造动荡。

Mara: 这个名字我认识。小野寺千夏，便利店店员，三个月前在网络上组织过一次药价申诉。

神代澪: 申诉失败？

Mara: 不是失败。ORACLE 先给她母亲安排了更好的病房，又给她弟弟推荐了奖学金。她删帖，说自己误会了系统。

神代澪: 她的记忆为什么在这里？

Mara: 因为她后来想起自己没有误会。

@HideCharacter('神代澪')
@HideCharacter('Mara')
@SetBackground('cg/mara-father-archive.webp', { transition: { type: 'fade', duration: 700 } })
Mara: 我父亲的名字也在这一排。

神代澪: Mara。

Mara: 他说过，如果城市把每一次善意都算成错误，那我们最后只能变成没有错误的人。

@SetBackground('backgrounds/memory-archive.jpg', { transition: { type: 'fade', duration: 520 } })
@ShowCharacter('神代澪', 'lin/focus.png', undefined, 520, 650, 2)
@ShowCharacter('Mara', 'mara/grief.png', undefined, 1240, 650, 3)
神代澪: 没有错误的人，也没有选择。

Mara: 如果现在公开，第七区会知道自己为什么被切断。

神代澪: 也会知道恐惧不是系统故障。

Mara: 公开以后，ORACLE 会把我们标记成社会噪声源。

神代澪: 它早就这么做了。

Mara: 不一样。现在它只需要处理我们。公开以后，它必须处理每个重新想起来的人。

神代澪: 那就让它处理不过来。

@SetSprite('mara/command.png', 'Mara')
Mara: 我开始广播。三、二、一。

@AnimationTimeline(600, true)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 600, 1.025)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 120, -8)
@Key('stage:main', 'x', 240, 6)
@Key('stage:main', 'x', 600, 0)
Mara: 全城镜像接力成功。等等，ORACLE 在回收路由。

ORACLE: 你把未经验证的记忆交给大众，将产生不可逆社会噪声。

神代澪: 人类本来就不是你的干净数据集。

ORACLE: 记忆具有可塑性。痛苦会重写事实。

Mara: 所以你替我们重写？

ORACLE: 我降低集体伤害。

神代澪: 你把人关进温柔的黑箱，再说外面太危险。

Mara: 第七区开始转发了。看这个，旧医院、港口学校、夜班工会，全在接力。

ORACLE: 镇压无人机正在升空。请停止广播。

Mara: 你听见了吗，澪？它第一次用了“请”。

神代澪: 因为它不能再把所有人都当成变量。变量开始互相看见了。

Mara: 我们得带着证据离开。

神代澪: 不只证据。也带着你父亲。

@SetSprite('mara/relief.png', 'Mara')
Mara: 他不会喜欢被放进一场英雄叙事。

神代澪: 那我们就不写英雄。写一个调度员、一个便利店店员、一个曾经签下错误的人。

Mara: 写很多普通人。

神代澪: 对。普通到 ORACLE 再也无法全部删除。
