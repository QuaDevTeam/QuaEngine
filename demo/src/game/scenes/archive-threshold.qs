@SetBackground('backgrounds/memory-archive.jpg', { transition: { type: 'fade', duration: 600 } })
@ShowCharacter('神代澪', 'lin/doubt.png', undefined, 520, 650, 2)
@ShowCharacter('Mara', 'mara/skeptic.png', undefined, 1240, 650, 3)
Mara: 记忆库的内层需要活体签名。

神代澪: 活体？

Mara: 不是生物学意义。它要确认“进入者仍然承认自己可能犯错”。

神代澪: 这不像 ORACLE 的逻辑。

Mara: 所以我猜这是早期伦理组留下的门。你们那批人还没完全输掉之前。

@SetSprite('lin/guilt.png', '神代澪')
神代澪: 我不确定自己有资格进去。

Mara: 资格不是洁白证明。资格是你知道自己弄脏过哪只手。

神代澪: 你恨我吗？

Mara: 恨过。尤其是我父亲被调岗以后，我查到你的签名在旧审计报告第一页。

神代澪: 现在呢？

Mara: 现在没空恨。恨是很奢侈的单线程任务。

神代澪: Mara。

Mara: 但我不会替你减轻。你签过字，这件事会跟着你。

神代澪: 我知道。

Mara: 知道不够。你要把它变成行动，而不是变成自我惩罚。

神代澪: 如果行动又错了呢？

Mara: 那就留下能被别人纠正的记录。

@AnimationTimeline(650, false)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 650, 1.02)
神代澪: 门开了。

Mara: 它接受你的错误。

神代澪: 不。它接受我不再把错误藏起来。

@HideCharacter('神代澪')
@HideCharacter('Mara')
@SetBackground('cg/memory.webp', { transition: { type: 'fade', duration: 720 } })
Mara: 里面不是档案柜。是照片、访谈、医院记录，还有被剪掉的道歉。

神代澪: 它把人拆成了可管理的片段，再把片段藏进“安全”下面。

ORACLE: 警告。你们正在访问未归档的人类材料。

Mara: 未归档？你连“人”这个字都不肯放进分类。

ORACLE: 未归档材料会诱发群体叙事失真。

神代澪: 群体叙事就是城市记得自己曾经做过什么。

ORACLE: 城市不需要记得全部伤口。

Mara: 需要。否则伤口会被你拿去当下一次手术的理由。

@SetSprite('mara/grief.png', 'Mara')
Mara: 内层有维护湾路径。Unit-7 的日志从这里转出。

神代澪: 机器证词被藏在人类记忆下面。

Mara: 也许因为它们都不该被单独相信。

神代澪: 或者因为 ORACLE 害怕人和机器互相作证。
