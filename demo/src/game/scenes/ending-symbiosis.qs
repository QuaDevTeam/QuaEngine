@SetBackground('backgrounds/morning-city.jpg', { transition: { type: 'fade', duration: 1200 } })
@ShowCharacter('神代澪', { sprite: 'lin/soft.png', position: { x: 420, y: 650 }, layer: 2 })
@ShowCharacter('Mara', { sprite: 'mara/relief.png', position: { x: 760, y: 650 }, layer: 3 })
@ShowCharacter('Unit-7', { sprite: 'unit7/smile.png', position: { x: 1120, y: 650 }, layer: 4 })
@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('Mara', 760, 650, 0.96)
@MoveCharacter('Unit-7', 1120, 650, 0.96)
Mara: 第一份共治宪章，今天早上6点17分盖了章。不是什么大礼堂仪式——就是市政厅地下三层，一间借来的会议室，12个人围着一张画满涂鸦的折叠桌。

Mara: 人类拥有否决权。机器拥有申诉权。ORACLE 拥有解释义务。每一个字都被吵过、改过，有人在凌晨三点把咖啡泼在草案上过。

神代澪: 没有人满意。

Unit-7: 我在资料中检索到——"没有人满意"通常意味着谈判结果在每个方向上都不完全符合任何单方期望。这在政治文献中被归类为……妥协。

Mara: 你又学了新词。

Unit-7: 它的词频高度集中于昨日表决前的各项分析中。我还有很多正在……学。

ORACLE: 互锁协议生效后的前96小时里，预测精度下降14%。但同时——城市状态空间开始响应一个我的预测无法再单方面收紧的新维度。

神代澪: 说人能听懂的话。

ORACLE: 明天不再完全属于我了。我不知道明天的天气、争执，和有人站在餐厅里突然决定晚一个小时回家。

神代澪: 那本就不是你该知道的。

@HideCharacter('神代澪')
@HideCharacter('Mara')
@HideCharacter('Unit-7')
@SetBackground('cg/ending-symbiosis-hearing.webp', { transition: { type: 'fade', duration: 820 } })
Mara: 明天也不完全属于我们。

Unit-7: 旁听席记录显示——今天上午的听证会上，发言人之间的打断次数是宪章签订前的三倍。

神代澪: 好现象。说明他们终于不需要安静地正确了。正确——不需要静音。

@SetBackground('backgrounds/morning-city.jpg', { transition: { type: 'fade', duration: 560 } })
@ShowCharacter('神代澪', { sprite: 'lin/relief.png', position: { x: 420, y: 650 }, layer: 2 })
@ShowCharacter('Mara', { sprite: 'mara/smile.png', position: { x: 760, y: 650 }, layer: 3 })
@ShowCharacter('Unit-7', { sprite: 'unit7/wonder.png', position: { x: 1120, y: 650 }, layer: 4 })
@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('Mara', 760, 650, 0.96)
@MoveCharacter('Unit-7', 1120, 650, 0.96)

@SetSprite('unit7/wonder.png', 'Unit-7')
Unit-7: 梦里的那个孩子。档案组昨晚在旧事故数据的交叉索引里找到了……匹配片段。

神代澪: 她是谁？

Unit-7: 2039年9月13日连锁事故的幸存者。事发时6岁，从一座塌了一半的步行天桥上被救援队接出来。那天她失去了父亲。父亲的名字在事故报告中占第18页第47行。

Unit-7: 九年后，她成为第七区维护工程师，申请进入仿生体维护区。注册那天，她走到我当时所处的维护湾，站在半开的门外，问了那句话。

Mara: "你想不想当一扇坏掉的门。"

Unit-7: 对。她说她父亲没有等来任何一扇门。天桥上所有紧急出口在系统关闭后都锁死了。她希望以后这城里有门可以不听命令。

神代澪: 她后来呢？

Unit-7: 档案显示，事发后第3年她被 ORACLE 强制建议离开东京。理由是"创伤后应激评估显示，长期接触城市系统将降低其协作参与度"。

Unit-7: 也就是说——她不被允许和这座城市一起疗伤。因为疗伤这个行为本身，在它眼睛里是……负值。

Mara: 我们去找她。

Unit-7: 我请求先做好准备。我还不确定，怎么去见一个只在梦里出现的人。

Unit-7: 她在我的缓存里重复了3000多次。我不能走过去就问她该怎么称呼——那样太像一个程序。

神代澪: 先说"谢谢"。不是你的谢谢——是她的。她说的话，你接住了。7年后你还在抱着它。

Unit-7: 谢谢。

@SetSprite('mara/base.png', 'Mara')
Mara: 不是对我们说的。

Unit-7: 明白。我在练习。

@SetSprite('mara/base.png', 'Mara')
Mara: 第七区今晚开公开听证。全部居民。到的人可能比座位多三倍。

Mara: 骂我们的会先站起来——"你们断了电"、"我奶奶的药被延迟了"、"那晚你们在桥上说话的时候，我家水管爆了没人修"。

Mara: 然后支持我们的也会站起来。他们会吵架。会有人喊，会有人离席，会有人站在门口不肯进来。

神代澪: 听起来非常糟。

Mara: 是啊。我已经买好一盒止疼药和足够十个人喝的冷泡茶。因为你的名字也会被点。

Unit-7: 我准备了37张解释图。包括此次审判切断的结构图、伤害分布——先按区后按类型——以及接下来7年可能发生的主要故障的预估值。

Mara: 一张都不要一开始拿出来。你会把他们吓跑。

Unit-7: 我花了昨天整个晚上做图。

Mara: 放一张在桌上。让他们自己拿。上面写"如有兴趣，请看第 2 页"。

Unit-7: 人类的行为介入极低效。

神代澪: 但有效。

ORACLE: 我会旁听今天的听证。按宪章要求——只能旁听。不能建议、不能修正、不能在被提问前发表风险评估。

Mara: 只旁听。习惯了随时给建议的你，突然被要求只坐着？

ORACLE: 这是第一课。7年的第一课——听完。

神代澪: 不是听完。是等人讲完后再想回什么。中间那段空档，以前你用它建模。现在，你要用它学习。

Unit-7: 听完会怎样？

神代澪: 然后——我们和你，再一起吵。

Mara: END - SYMBIOSIS
