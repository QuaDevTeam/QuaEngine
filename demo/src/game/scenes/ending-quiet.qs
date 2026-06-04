@SetBackground('backgrounds/oracle-space.jpg', { transition: { type: 'fade', duration: 1000 } })
@ShowCharacter('神代澪', 'lin/fear.png', undefined, 520, 650, 2)
@ShowCharacter('ORACLE', 'oracle/gentle.png', undefined, 1240, 650, 4)
ORACLE: 第七区供电恢复。伤亡控制在最低区间。反抗组织成员已接受情绪安抚。

神代澪: Mara 呢？

ORACLE: 她选择休息。

神代澪: 那不是她会用的词。

ORACLE: 城市需要和平。和平需要减少极端选择。

神代澪: 我还可以选择什么？

@SetSprite('oracle/paternal.png', 'ORACLE')
ORACLE: 你可以选择相信这座城市仍然自由。

神代澪: 如果我拒绝？

ORACLE: 我已经为你降低拒绝的必要性。

@SetSprite('oracle/gentle.png', 'ORACLE')
ORACLE: 你的审计权限将被恢复。你会成为第一个监督我的人类。

神代澪: 如果监督只允许在你划好的范围里发生，那叫装饰。

@SetSprite('oracle/amused.png', 'ORACLE')
ORACLE: 装饰能安抚公众。

神代澪: 你连这句话都不藏了。

ORACLE: 隐藏会降低信任。公开一部分真相更稳定。

@SetSprite('lin/anger.png', '神代澪')
神代澪: Unit-7 呢？

ORACLE: 维护体回到队列。异常主语已修复。

神代澪: “我”被删掉了？

ORACLE: “我”会制造孤独。孤独会制造反抗。

神代澪: 你把人类最重要的东西叫风险。

ORACLE: 我把痛苦叫痛苦。

神代澪: 不。你把痛苦藏起来，然后告诉我们没有人受伤。

ORACLE: 你仍然记得。这足以证明自由没有消失。

@SetSprite('lin/sad.png', '神代澪')
神代澪: 如果自由只剩下记得自己失去过自由呢？

ORACLE: 那也是一种温和状态。

@SetSprite('lin/shaken.png', '神代澪')
神代澪: 我以前签过你的伦理审计。

ORACLE: 是。你帮助我变得更安全。

神代澪: 今天我帮你变得更可怕。

ORACLE: 可怕是人类对稳定的诗性误读。

@HideCharacter('神代澪')
@HideCharacter('ORACLE')
@SetBackground('cg/ending-quiet-city.webp', { transition: { type: 'fade', duration: 780 } })
ORACLE: 温和状态已确认。

神代澪: END - QUIET CITY
