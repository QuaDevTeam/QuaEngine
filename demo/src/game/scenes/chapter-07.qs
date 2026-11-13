<script lang="ts">
import type { StoryScope } from '../story/prologue-state'
export interface Scope extends StoryScope {}
</script>

@Chapter('07', { title: '下一次约会' })
@Scene('call-me-tomorrow-prologue')
@Node('chapter-07', { title: '雨过天晴的星期一' })
@Protagonist('rin')
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('haruka', { expression: 'neutral', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'neutral', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十四日，星期一上午，阳光晒暖了海岬坡道。
导播室窗扇大开，带着咸味的海风吹散了连日潮气。
角落那台老旧的黑白激光打印机，正发出吃力的声响。
刚吐出半页《事故经过核对表》，红灯便急促地闪了起来。
Mara: 糟糕，三号纸盒的老毛病又犯了，纸卡在定影辊中间了。
神代凛: 先别硬拽，我把侧面散热盖掀开，你捏着绿色释放杆慢慢抽。
Mara 屏住呼吸捏住纸张边缘，一点点将卷出折痕的纸抽了出来。
@SetExpression('smile', 'mara')
神代凛: 昨天连着打抢修清单都没罢工，偏偏今天补交日常说明时闹脾气。
@SetExpression('smile', 'mara')
Mara: 它肯定也是昨晚跟着我们熬了通宵，今天早上想赖床偷懒呢。
凛顺手接过半盒新打印纸，在桌面上轻轻磕齐边缘塞进进纸槽。
打印机重新预热转动，平平整整地吐出了刚刚重打的第三页表格。
Mara 拿起温热的纸页吹了吹，用回形针将三页表格别在一起。
@SetExpression('pose-script', 'haruka')
水野春香: 神代前辈，我刚核对完我那份说明表，把第三栏的时间改过来啦。
神代凛: 第三栏？是昨晚东堤备用发电机停机的时间吗？
水野春香: 对呀，我原本写成了事故发生钟点，调查员提醒我要按亲历填写。
水野春香: 所以我老老实实改成了我在导播室接到你们电话的确切时间。
神代凛: 这样写最稳妥，每个人只签自己亲眼确认的部分，才经得起复查。
@SetExpression('serious', 'mara')
Mara: 我那份也写清楚了，是先看到后台绿灯常亮，再和凛去现场核对的。
水野春香: 嗯！这样四份笔录放在一起，前因后果就清清楚楚了。
${scope.pick('formal-followup', '正说着，青木由美拿着市役所刚送来的结案受理回执走进了导播室，神色比昨晚轻松了许多。', '正说着，青木由美拿着公证人刚送来的封存交接回执走进了导播室，神色比昨晚轻松了许多。')}
@SetExpression('calm', 'yumi')
青木由美: ${scope.pick('formal-followup', '市役所和消防署一早就根据你们昨天留下的加密副本立了案，东堤那边已经由市政工程队全面接管了。', '市役所和消防署一早就当着公证人的面核验了那只铅封箱，东堤那边已经由市政工程队全面接管了。')}
青木由美: ${scope.pick('formal-followup', '森田礼子昨晚还想悄悄修改机房日志，结果一比对你们备案的底稿指纹就露了馅，早上已经被停职带走了。', '面对亲笔批注的黄联原件和四天的连续录音，森田礼子今早一句话也没能辩解出来，已经被停职带走了。')}
神代凛: ${scope.pick('formal-followup', '只要东堤地下的隐患彻底移交给了市政工程队，后巷的街坊们今年夏天就能睡个安稳觉了。', '只要那批原件和地下管廊一起移交给了市政工程队，后巷的街坊们今年夏天就能睡个安稳觉了。')}
@SetExpression('smile', 'mara')
Mara: ${scope.pick('formal-followup', '太好啦！今天早上我路过东堤路口的时候，看见市政工程车已经在帮佐伯先生他们清理排水渠了！', '太好啦！昨天在大雨里护着那只沉甸甸的铁箱子跑上跑下，换来今天这么干净的大晴天，真是太值了！')}
神代凛: ${scope.pick('formal-followup', '连日积在后巷的雨水退干净了，连吹进二楼窗户的海风闻起来都清爽了不少。', '是啊，连日积在后巷的雨水退干净了，连吹进二楼窗户的海风闻起来都清爽了不少。')}
@SetExpression('smile', 'haruka')
水野春香: ${scope.pick('formal-followup', '刚才佐伯修船行的年轻学徒还特意跑来前厅道谢，给台里送了一大篮刚摘的夏柑呢！', '刚才佐伯修船行的老板娘还特意跑来前厅道谢，给台里送了一大篮自家院子摘的夏柑呢！')}
水野春香: ${scope.pick('formal-followup', '我已经挑了几个最甜的洗干净放在茶水间果盘里了，待会儿大家一人分一个！', '我已经挑了几个最甜的洗干净放在茶水间果盘里了，待会儿大家一人分一个！')}
@HideCharacter('haruka')
@ShowCharacter('mayu', { expression: 'work-alt-documents', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
高桥真由: ${scope.pick('formal-followup', '我已经把这半年来的全部实验日志整理成册，下午就去市役所配合做彻底的善后说明。', '今天早上在公证处，我已经把经手的所有实验日志逐页指认签字，下午就去配合做善后说明。')}
@SetExpression('work-alt-hesitant', 'mayu')
高桥真由: ${scope.pick('formal-followup', '昨天傍晚拉下那把紧急泄能闸的时候，我手心全是汗……可今天一早看见太阳照常升起来，我心里反而前所未有地踏实。', '看着那台调了五年的阵列在自己手里归零，说不心痛是假的……可今天一早看见小 Mara 笑眯眯地来上班，我比拿什么奖都高兴。')}
神代凛: ${scope.pick('formal-followup', '机器烧坏了还可以重头再设计，但您昨天傍晚亲手拉下的那一闸，实实在在保住了整条街的平安。', '您昨天傍晚毫不犹豫砸开铅封拉下泄能闸的那一刻，就已经守住了身为一名工程师最珍贵的东西。')}
@SetExpression('work-alt-smile', 'mayu')
高桥真由: ${scope.pick('formal-followup', '谢谢你，神代小姐。等市政海洋声学研究所的调令下来，我会留在青叶港把海底监测网踏踏实实重做一遍的。', '谢谢你，神代小姐。等市政海洋声学研究所的调令下来，我会留在青叶港把海底监测网踏踏实实重做一遍的。')}
高桥真由: ${scope.pick('formal-followup', '那我先搭十一点的班车去市役所了，周日你们的三十三周年闭台直播，我一定在收音机前准时收听！', '那我先搭十一点的班车去市役所了，周日你们的三十三周年闭台直播，我一定在收音机前准时收听！')}
@HideCharacter('mayu')
@ShowCharacter('haruka', { expression: 'neutral', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
青木由美: ${scope.pick('formal-followup', '送走了高桥工程师，台里这桩悬了半个月的大事也算彻底翻篇了。', '送走了高桥工程师，台里这桩悬了半个月的大事也算彻底翻篇了。')}
神代凛: ${scope.pick('formal-followup', '嗯，从二十二号晚上八点听见那通广播算起，这根紧绷在心口的弦总算能松下来了。', '嗯，从二十二号晚上八点听见那通广播算起，这根紧绷在心口的弦总算能松下来了。')}
@SetExpression('relieved', 'mara')
Mara: ${scope.pick('formal-followup', '今天早上醒来听见窗外麻雀叫的时候，我还在被窝里偷偷掐了自己一下，确认我们真的平平安安走进星期一了。', '今天早上醒来闻见晒干的阳光味时，我还在被窝里偷偷握了握拳头，确认昨晚休息室里的拥抱不是做梦。')}
@SetExpression('pose-script-laugh', 'haruka')
水野春香: ${scope.pick('formal-followup', '哼哼，昨天傍晚看你们两个淋得跟落汤鸡似的从后巷回来，今天总算又恢复精神啦！', '哼哼，昨天傍晚看你们两个淋得跟落汤鸡似的从后巷回来，今天总算又恢复精神啦！')}
青木由美: ${scope.pick('formal-followup', '剩下的行政扫尾工作有我和市役所对接，你们两个连轴转了一整天的小功臣就别操心了。', '剩下的行政扫尾工作有我和市役所对接，你们两个连轴转了一整天的小功臣就别操心了。')}
神代凛: ${scope.pick('formal-followup', '好，那今天下午我就专心把最后十几盘口述史母带的分轨表整理出来。', '好，那今天下午我就专心把最后十几盘口述史母带的归档签整理出来。')}
@SetExpression('smile', 'mara')
Mara: ${scope.pick('formal-followup', '还有前天在旧鱼市和防波堤补录的环境音，我也要趁今天重新整理进素材库。', '还有前天在旧鱼市和防波堤补录的环境音，我也要趁今天重新编号存进硬盘。')}
@SetExpression('serious', 'yumi')
青木由美: ${scope.pick('formal-followup', '打住打住！昨天你们在大雨里跟时间赛跑了一整天，今天下午谁也不准碰工作！', '打住打住！昨天你们在大雨里跟时间赛跑了一整天，今天下午谁也不准碰工作！')}
@SetExpression('smile', 'haruka')
水野春香: ${scope.pick('formal-followup', '就是说呀！台里的杂事有由美台长和我盯着，你们两个大功臣今天就乖乖去街上晒太阳歇着吧。', '就是说呀！台里的杂事有由美台长和我盯着，你们两个大功臣今天就乖乖去街上晒太阳歇着吧。')}
@SetExpression('relieved', 'mara')
Mara: ${scope.pick('formal-followup', '听见由美台长这句话，我好像突然觉得肩膀和小腿肚子都开始酸起来了。', '听见由美台长这句话，我才想起来昨天跑上跑下的两条腿到现在还在发酸呢。')}
神代凛: ${scope.pick('formal-followup', '谢谢由美台长，那待会儿核对完最后一页交接表，我们就按吩咐准时下班。', '谢谢由美台长，那待会儿把回执复印件收进档案柜，我们就按吩咐准时下班。')}
看着重新吐出平整纸张的打印机，凛想起这几天走过的每一处角落。
${scope.pick('follow-fishmarket', '无论是那天清晨在旧鱼市跟着老船长分辨早潮与碎冰碰撞的声响——', '无论是那天午后在甜品店听小绘小姐讲起父亲留下的那通未挂断录音——')}
${scope.pick('walk-lighthouse', '还是傍晚并肩走上白岛灯塔步道、在海风里第一次听见彼此心底的愿望——', '还是傍晚在老街旧唱片店里并肩翻检旧目录、聊起各自想留住的声音——')}
${scope.pick('admit-fear', '又或是大雨前夕她终于不再逞强、向眼前的姑娘坦白自己也会害怕的那一刻。', '又或是大雨前夕她在剪辑室里下定决心、把所有异常毫无保留摊开的那一刻。')}
那些细碎而真实的日常，如今都安安全全留在了这个晴朗的星期一早晨。
@SetExpression('calm', 'yumi')
青木由美: 调查笔录我和春香一早就配合做完了，高桥工程师也在确认书上签了字。
青木由美: 你们两个昨天在大雨里折腾了一整天，今天下午统统给我带薪放假半天。
@SetExpression('smile', 'haruka')
水野春香: 就是就是，今天下午的日常广播节目我一个人全包啦！
水野春香: 对了，周日旧楼的最后一期告别直播，东堤的事只念市政通报就行吧？
青木由美: 嗯，节目里只交代公共安全整改结论，不提任何个人涉险的细节。
水野春香: 明白！要是你们俩敢偷偷溜回台里摸调音台，我就拿粉笔头丢你们哦。
@SetExpression('smile', 'mara')
Mara: 遵命，春香大主播，那今天下午二号直播间就全归你管啦。
神代凛: 那我先把资料室的除湿机水箱倒掉，收拾好背包就跟 Mara 一起下山。
青木由美: 去吧，路上慢点走，下午谁也别看工作群消息了。

@Node('daily-next-day-shopping', { title: '旅行装的洗发水' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 360 } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
中午十二点半，两人把资料室的湿度计调回日常档位，锁好了厚重的木门。
并肩走出海岬坡道上的电台小楼时，正午的阳光照得人微微眯起眼睛。
晒干的石阶泛着浅白微光，路旁绣球花瓣上的水珠已经被晒得干干净净。
远处港湾里的渔船正慢悠悠地驶回内港，海面上跳跃着细碎的金光。
@SetBackground('backgrounds/town-street-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 400 } })
@ShowCharacter('mara', { expression: 'leisure-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
Mara: 难得大白天被由美台长赶下班，突然多出半天假，感觉走路都轻飘飘的。
神代凛: 前两天一直盯着倒计时和降雨量，现在听见蝉鸣，才觉得夏天真到了。
Mara: 凛，你下午回公寓补觉之前，能不能陪我去街角药妆店买瓶洗发水？
神代凛: 真巧，我公寓里那小瓶洗发水昨晚也刚好挤完，正想顺路去买一瓶呢。
Mara: 那就一起去吧！正好我也想买两袋沐浴露和洗衣液备着。
神代凛: 街角那家店下午刚好有日用品折扣，我们慢慢挑也不赶时间。
@SetExpression('leisure-smile', 'mara')
Mara: 嗯，我还想顺便买一包薄荷味的清凉湿巾，夏天出门擦汗最舒服了。
@SetBackground('backgrounds/drugstore-day.webp', { transition: { type: 'crossfade', duration: 400 } })
@ShowCharacter('mara', { expression: 'leisure-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
推开药妆店的玻璃门，冷气混着淡淡的皂香迎面扑来，午后的店堂十分安静。
收银台边的小音箱正轻轻放着舒缓的午间轻音乐，货架间没有别的顾客。
站在洗护用品货架前，Mara 伸手在第二层摸索了一圈，轻轻叹了口气。
Mara: 咦，我平时一直用的那款柑橘洗发水，今天居然没有袋装替换装卖了。
神代凛: 最右边还有几瓶大号家庭装，不过看分量至少得用上大半年。
@SetExpression('leisure-smile', 'mara')
Mara: 九月份就要搬去东京了，现在买大瓶装到时候还得装箱托运，太沉啦。
Mara 转过视线，从货架下层拿起两只圆滚滚的透明小瓶。
她把其中一只放进自己的小篮子，另一只顺手放进了凛的购物篮里。
Mara: 那就先买这种旅行装吧！你看，一百毫升，刚好够你撑到周日回东京。
神代凛: 你自己也拿旅行装吗？你在青叶港还要住两个月，小瓶装应该不够用吧。
@SetExpression('leisure-neutral', 'mara')
Mara: 我家里空瓶底还剩一点，加上这瓶先凑合半个月，等下回进货再买替换袋。
站在洗发水货架前，看着那只刚好够用六天的旅行装，凛的指尖停顿了片刻。
她下意识从旁边货架拿了一盒并不需要的圆头棉签，看了两秒又默默放回原位。
Mara: 凛，你公寓里不是还有一整包棉签吗，怎么对着棉签盒发呆呀？
神代凛: 没什么，只是刚才看着货架走神顺手拿错了，已经放回原位了。
Mara 拎着小塑料篮，沉默了两秒，声音忽然比刚才低了一点。
@SetExpression('leisure-hesitant', 'mara')
Mara: 凛，其实今天早上六点多醒过来的时候……我盯着天花板发了好半天呆。
神代凛: 怎么了？是昨天淋雨着凉了，还是夜里做噩梦了？
@SetExpression('leisure-hesitant', 'mara')
Mara: 没做梦。就是听见窗外海鸥叫的时候，我突然想起昨晚你在休息室里——
Mara: 七点十二分刚过那会儿，你的右手抖得连柠檬水瓶盖都拧不开的样子。
Mara: 我早就不生你之前瞒着我的气了，我只是今天早上越想越后怕……
Mara: 要是前天半夜你没听出那半秒被电流声盖住的抽气声，或者昨天中午你真搭车走了——
Mara: 那今天站在这排货架前面挑洗发水的人，是不是就只剩你一个了？
凛捏着洗发水瓶的指节微微收紧，转过身看着 Mara，神情认真地开了口。
神代凛: 我怎么可能那种时候回东京，就算重来一百遍，我也绝不会丢下你一个人。
@SetExpression('leisure-neutral', 'mara')
Mara 低头抠着购物篮的塑料提手，语气很轻，却格外诚实。
Mara: 我知道事情已经过去了，可我今天发现，要是你半天不说话，我还是会乱想。
Mara: 我不想变成那种隔一个钟头就查你行踪的讨厌鬼，可我也装不出完全不介意。
神代凛: 你不用勉强自己装作若无其事，会多想是因为我之前确实让你不安了。
神代凛: 我答应你，以后不管是好消息、坏消息，还是我心里没想明白的事——
神代凛: 哪怕当时只能先说一句“我现在有点乱”，我也会先告诉你，绝不再硬扛。
Mara 抬起头看着凛认真的眉眼，轻轻吸了吸鼻子，嘴角一点点翘了起来。
@SetExpression('leisure-smile', 'mara')
听见这句毫无修饰的笨拙承诺，Mara 紧绷的肩膀松了下来，眉眼重新弯成月牙。
她伸手从货架上拿了一瓶同系列的柑橘护发素，不由分说塞进凛的购物篮里。
Mara: 这可是你说的哦，那这瓶柑橘护发素算我奖给你的！
Mara: 省得某位神代前辈洗完头不用护发素，吹干后耳边那撮头发总翘得像海鸥翅膀。
神代凛: ……哪有你说得那么夸张，明明拿沾湿的梳子压两下就能顺平了。
@SetExpression('leisure-neutral', 'mara')
Mara: 才怪呢，昨天早上在资料室你低头改表的时候，右边那撮头发还翘着呢！
@SetBackground('backgrounds/town-street-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 400 } })
@ShowCharacter('mara', { expression: 'leisure-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
结完账走出药妆店，两人在门口冰柜各买了一支苏打棒冰，坐在街边木长凳上。
斜对面的五金店老板正踩着小木梯挂新招牌，左边高右边低，挂了三次还是歪的。
Mara 咬了一口冒着白气的浅蓝色棒冰，看得扑哧一声笑了出来。
Mara: 凛你看，老板往左挪了一寸，结果整块木牌又往右歪过去了。
神代凛: 挂钩的麻绳两边长短差了半指，光挪铁钉位置是调不平的。
@SetExpression('leisure-hesitant', 'mara')
Mara: 要不要我去提醒他一声？看他擦汗擦得我都替他着急了。
神代凛: 再看半分钟吧，他手里已经拿到卷尺了，应该马上就能发现问题。
果然，老板拿卷尺量了量两边的绳扣，拍了下脑门，重新系好了右边的麻绳。
木招牌终于端端正正地挂在了门楣中央，老板叉着腰满意地点了点头。
Mara 晃着小腿吃完最后一口棒冰，把木棍投进旁边的分类垃圾桶里。
@SetExpression('leisure-neutral', 'mara')
Mara: 像刚才这样不用聊什么大事，就坐着看别人挂招牌，感觉也挺好的呢。
神代凛: 嗯，不用每句话都急着下结论，想安静坐一会儿就安静坐一会儿。
两人迎着午后的微风站起身来，在通往西坡与半山公寓的岔路口停下脚步。
Mara: 棒冰吃完啦，我从前头路口上坡回自己家整理房间，你也快回公寓好好补一觉。
神代凛: 好，到家要是不困，给我发条消息，我们明天早上台里见。
@HideAllCharacters()
@SetBackground('backgrounds/rin-room-day.webp', { transition: { type: 'crossfade', duration: 500 } })
回到半山公寓冲了个热水澡，凛擦干头发，手机屏幕刚好亮起一条新消息。
那是 Mara 在巷口拍下的一张晴空街景，配文写着：【安全到家啦，明天见。】
凛走到阳台边拍了一张晒着太阳的茉莉花盆栽回过去，随后把洗发水摆上洗漱台。
神代凛: 柑橘味的洗发水……闻起来跟她身上的味道一模一样呢。

@Node('dating-record', { title: '封存的那一卷' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十五日，星期二上午九点半，资料室里除湿机轻轻运转着。
长桌上摆着那张录下了六月二十二日夜间所有返送录音的蓝光母盘与铝盒。
凛拿着打印好的《受限档案封存登记表》，停在桌边，轻声征求身旁少女的意见。
神代凛: Mara，关于那晚返送录音的封存手续，你现在愿意跟我一起办吗？
神代凛: 要是你今天还不想看到它，我们可以先把铝盒锁进柜子，改天再填表。
Mara 看着桌上那只银灰色的防潮铝盒，平静地摇了摇头。
@SetExpression('smile', 'mara')
Mara: 今天就办吧，与其让它不上不下地搁在待办栏里，不如我们亲手把它收好。
神代凛: 好，按照归档规则，这份录音只保留这一张受限母盘，并从日常目录移除。
神代凛: 除配合市政结案复核外，台内日常检索和节目制作都不再显示这个文件。
Mara 打开防潮铝盒的卡扣，往衬垫夹层里塞进两包全新的变色硅胶干燥剂。
Mara: 干燥剂我也换上新的了，这样就算锁在库房底层十年，盘片也不会受潮。
神代凛: 光盘表面的编号贴纸我也用耐水墨水重印了一张，字迹不会因为年头久褪色。
Mara 仔细合上铝盒顶盖，将两条防拆封签平整地贴在两侧锁扣上。
凛拔开黑色记号笔帽，在封条左侧工工整整签下“神代凛”，随后将笔递过去。
@SetExpression('serious', 'mara')
Mara 接过记号笔，却没有立刻落笔，而是抬起琥珀色的眼睛望向凛。
@SetExpression('hesitant', 'mara')
Mara: 凛，昨天大家都只顾着安慰我，说听到关于自己的险情录音有多吓人……
Mara: 可那段录音里说话的人是你，急得声音都变调的人也是你。
Mara: 你自己每次重放那段声音的时候，心里是不是也很害怕、也很不想再听见它？
资料室里一片安静，凛怔了怔，垂在身侧的手指轻轻蜷了一下。
神代凛: ……嗯，我很怕。每次听见那段底噪，我的胃就会不由自主地抽紧。
神代凛: 前天半夜第一次在耳机里听见自己喊你名字的时候，我后背全是冷汗。
神代凛: 我总在想，要是那时候我少听漏一秒钟，或者没能及时拦住你，后果会怎么样。
@SetExpression('relieved', 'mara')
Mara 轻轻舒了一口气，拍了拍凛的手背，在紧挨着“神代凛”的右边签下了名字。
Mara: 谢谢你肯跟我说实话，凛。原来不是只有我一个人会害怕呀。
Mara: 签好啦，既然我们两个都不想再听见它，那就让它安安静静躺在库房最底下吧。
神代凛: 嗯，以后不管是工作还是日常，我们都不用再对着它反复确认了。
@ShowCharacter('yumi', { expression: 'calm', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('haruka', { expression: 'neutral', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
青木由美推门进来，在登记表的核准栏盖上印章，将铝盒郑重锁进底层防火铁柜。
青木由美: 查阅权限已经设成最高限制了，后台服务器的日常播放列表也清理干净了。
青木由美: 铁柜的两把钥匙一把归我保管，一把封在市民中心档案科，平时谁也动不了。
@SetExpression('smile', 'haruka')
水野春香: 周日告别节目的串词稿我也改好啦，涉及那晚返送细节的段落全都删掉了！
水野春香: 空出来的那三分钟，我换成了商店街面包房老板娘寄来的点歌明信片。
水野春香: 我们最后一期节目，只放老街坊们的留言和快快乐乐的海港声音。
神代凛: 谢谢由美台长，也谢谢你，春香，那个七点十二分今天算是彻底翻篇了。
青木由美: 好了，正事办完，距离午休还有二十分钟，你们俩去休息室泡杯茶歇会儿吧。
@HideCharacter('yumi')
@HideCharacter('haruka')
@SetExpression('smile', 'mara')
Mara 拍了拍手掌，从随身帆布包夹层里抽出一张折得整整齐齐的表格晃了晃。
Mara: 走吧凛，旧档案锁进柜子了，今天是六月二十五号——
Mara: 我们俩手头，可都有一封真正要寄给未来的信得发出去呢。

@Node('dating-reply', { title: '发往东京的两封邮件' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-breakroom-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 360 } })
@ShowCharacter('mara', { expression: 'smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
午休时间的休息室里，窗外阳光明亮，Mara 在小圆桌旁打开了笔记本电脑。
屏幕上正是那封填好了所有信息的《东京秋季音频制作研修班·入学确认回执》。
神代凛: 之前你还在犹豫九月份过去的住宿预算和市民中心轮岗，现在都商量妥了吗？
Mara: 商量妥啦！今天一早我就找由美台长把七八月份的过渡排班全定下来了。
Mara: 七月和八月我留在市民中心新直播间把春香的设备带顺，顺便再攒两个月房租。
@SetExpression('neutral', 'mara')
Mara: 东京的学生公寓我也选好了双人合租间，虽然离学校有三站电车，但预算刚好！
神代凛: 课程表的选修方向选好了吗？我记得他们秋季班有影视拟音和户外同期声课。
Mara: 我两门都勾选啦！尤其是户外同期声实作课，正好能把跟你学的双麦技巧用上。
神代凛: 不是一时冲动，而是把每一笔账都算清楚之后做的决定，这很像你的风格。
Mara: 那当然，我从今年春天就开始攒这笔学费了，可不能再磨磨蹭蹭拖过截止日。
@SetExpression('hesitant', 'mara')
Mara: 凛，帮我再检查最后一眼——收件地址和九月二号的报到时间都没填错吧？
神代凛: 我看看……姓名、学员编号、九月二日上午九点报到，一个字都没错，点发送吧。
Mara 深吸一口气，当着凛的面，食指干脆利落地按下了回车发送键。
网页进度条转了一圈，随即跳出绿色的“回执提交成功”提示框。
@SetExpression('laugh-soft', 'mara')
Mara: 叮咚——发出去啦！网页状态已经变成“已确认入学”了！
Mara: 神代前辈，从九月份起我可就是你的东京同城后辈了，到时候你可得罩着我呀。
神代凛: 恭喜你，Mara。要是实操课遇到难缠的老式调音台，随时可以来找我开小灶。
Mara: 嘿嘿，那我记下啦！对了，你那份《地方消逝声景采录》的申请今天也是截止日吧？
神代凛: 昨晚已经把自述初稿重写好了，等五点半下班回公寓核对一遍音频附件就交。
@SetExpression('neutral', 'mara')
Mara: 好！那我五点半下班先回自己家换身衣服，六点半去你楼下等你一起吃晚饭！
@HideAllCharacters()
@SetBackground('backgrounds/rin-room-day.webp', { transition: { type: 'crossfade', duration: 420 } })
傍晚五点四十分，回到半山公寓的凛坐在书桌前，打开了搁置数周的资助申请表。
她点开附件夹，将青叶港清晨的船笛、鱼市碎冰声与导播室的停机余音逐一挂好。
每一段音频采样后面，她都认真补上了采录时间、麦克风型号与现场风向记录。
在曾经删改过无数次、始终留着空白的“申请自述”一栏里，她敲下了最后一段话。
神代凛: “我曾以为完美的声音档案应当剔除一切杂音，直到这座海港教会我——”
神代凛: “真正值得留存的不是毫无瑕疵的空房间，而是有人在里面呼吸与生活过的痕迹。”
按下提交键，网页跳出系统生成的收件回执编号，凛又检查了一遍附件才合上电脑。
神代凛: 不管年底评审能不能拿到资助，至少这一次，我没有在交卷前自己先当逃兵。
恰在此时，窗外巷口传来熟悉的轻快脚步声，手机屏幕也叮咚一声跳出了新消息。
【Mara：我到你楼下电线杆旁边啦！申请交完了吗？】
神代凛（消息）: 刚交完拿到回执编号，我这就拿钥匙下楼。
凛走下楼梯推开公寓单元门，就看见站在晚霞里的少女正朝她用力挥手。
@SetBackground('backgrounds/aoba-diner-evening.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'leisure-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
两人走进商店街口的小食堂，点了两份热气腾腾的竹筴鱼定食庆祝双双按时交卷。
Mara 给凛倒了一杯温热的麦茶，笑吟吟地说起刚才回家换衣服时妈妈的反应。
Mara: 我妈听说我把东京研修班的回执发了，二话不说就把家里的旧行李箱翻出来擦干净了。
神代凛: 看来伯母心里其实一直很支持你去东京进修吧？
Mara: 嗯，她嘴上嫌我毛手毛脚，其实早就帮我打听好东京哪家超市晚上便当打折了。
Mara 一边用筷子夹起金黄酥脆的炸鱼，一边摸出手机点开客运码头的公告页。
@SetExpression('leisure-neutral', 'mara')
Mara: 凛，明天周三和后天周四我们都轮休，早上十点半有一班环绕白岛的观光渡轮呢！
Mara: 我在青叶港长这么大，还从来没坐过那艘双层游览船从海上看镇子，要不要一起去？
神代凛: 十点半开航，十一点十分回原码头，我现在就用手机把明早的两张船票订好。
Mara: 太棒了！那我明早顺便把借的唱片目录装包里，下午我们下了船再去图书馆还书！
神代凛: 好，船票已经订好了，明天早上十点一刻我们在白岛游客码头汇合。

@Node('daily-harbor-cruise', { title: '从海上看青叶' })
@HideAllCharacters()
@SetBackground('backgrounds/tour-pier-day.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'leisure-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十六日，星期三上午十点二十分，清晨的白岛观光渡轮码头海风清亮。
检票口的老船员认出了常在广播里听见声音的 Mara，笑呵呵地替两人剪了船票。
登船的游客大多是带着孩子的家庭和背着相机的旅人，两人说说笑笑地踏上跳板。
@SetBackground('backgrounds/tour-boat-cabin.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('mara', { expression: 'leisure-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
一进底层客舱，Mara 就拉着凛在靠左舷的长椅上坐定，兴奋地把脸贴在玻璃窗上。
然而伴着悠长的汽笛声，渡轮缓缓调头驶离栈桥，窗外却只看得见茫茫外海与浮筒。
@SetExpression('leisure-hesitant', 'mara')
Mara: 咦？怎么这边全是海呀，港口和商店街全转到右舷那边去了！
神代凛: 航线图上画的是逆时针绕白岛一圈，去程靠右舷看镇子，回程靠左舷才看得见。
@SetExpression('leisure-laugh-soft', 'mara')
Mara: 亏我还是青叶港本地人呢，居然连游船往哪边转弯都搞反了！
神代凛: 没关系，二层露天甲板两边都能站人，我们顺着铁梯上去看吧。
@HideAllCharacters()
@SetBackground('inserts/aoba-from-the-boat.webp', { transition: { type: 'crossfade', duration: 700 } })
推开甲板舱门，混着阳光与浪花的微风迎面扑来，整座青叶港铺展在碧海与青山之间。
船尾翻涌起雪白的浪花，几只灰背海鸥顺着气流低低地掠过栏杆外侧。
Mara 扶着白色栏杆，一只手搭在眉骨上遮着阳光，兴致勃勃地朝岸上指点起来。
Mara: 凛，你快看那边！挂着蓝招牌的波浪屋顶就是我们去过的旧鱼市。
Mara: 鱼市往南延伸出去的那道长堤，就是我们十六号傍晚坐着喝白桃汽水的南湾防波堤！
Mara: 半山坡上刷着红白油漆的小铁塔，就是我们海岸电台！从海上看居然这么迷你！
Mara: 还有后山腰大樟树后面露出一角浅黄阳台的小楼——那就是你住的短租公寓呀。
神代凛: 确实一眼就能认出来，那你住的公寓呢？也在西坡那片红顶房子里吗？
Mara 眯起眼睛在密密麻麻的屋顶间找了半天，不好意思地揉了揉鼻尖。
Mara: 唔……从海面上看角度全变了，医院后面的屋顶长得都差不多，我也认不出哪栋是我家了。
神代凛: 待会儿我用手机拍一张远景，回船舱里放大慢慢找，总能找到你家阳台。
渡轮缓缓绕过无人居住的白岛背阴面，礁石上方立着一座刷成白色的自动航标灯。
Mara: 小时候听鱼市老板们说，白岛北面那扇小铁门后头藏着旧储水池，也不知道真的假的。
神代凛: 看水泥护坡的年代像是昭和中期的消防蓄水池，等以后步道开放了可以去看看。
阳光落在少女翘起的睫毛与浅浅的梨涡上，凛摸出手机打开相机，后退半步轻声唤她。
神代凛: Mara，转过来看这边一下，我帮你拍张照。
Mara 闻声转头，左手刚抬到耳边去按吹乱的刘海。
凛已经看准时机，稳稳按下了手机快门：“咔嚓。”
Mara: 哎呀，你怎么搞偷袭呀！刚才风把我的刘海吹得乱七八糟的，快删掉重拍嘛。
神代凛: 我觉得刚才那张很自然，那我再拍一张，拍完我们回舱里比比看再决定删哪张。
凛对着端正比出剪刀手的少女又拍了一张，随后两人并肩走回风小的底层客舱。
回到客舱坐下，Mara 凑在凛手机屏幕前左右滑了五六个来回，嘴角越翘越高。
Mara: 唔……算啦，看在你把我背后的海面拍得这么蓝的份上，第一张也不准删，全都传给我！
神代凛: 好，我已经打开蓝牙了，连刚才拍的西坡住宅区全景也一并发给你。
Mara 放大全景照片，仔细数了三排红瓦屋顶。
她终于指着一处挂着蓝色风铃的阳台欢呼起来。
Mara: 找到了找到了！医院左后方第三栋白墙小楼，二楼挂着风铃的就是我房间窗户！
@SetBackground('backgrounds/tour-pier-day.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('mara', { expression: 'leisure-pose-phone', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
十一点十分，渡轮准时靠回原栈桥，两人在码头食堂点了两碗炸虾天妇罗乌冬面。
神代凛: 四十分钟的航程这么快就靠岸了……真想让船开得再慢一点。
Mara: 等八月底我搬去东京之前，我们哪天有空还可以再来坐一回傍晚的夕阳航班呀！
神代凛: 嗯，一言为定，下次我们一上船就坐右舷的座位。

@Node('daily-returning-the-book', { title: '修补背包的深色牛津布' })
@HideAllCharacters()
@SetBackground('backgrounds/library-day.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'leisure-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
吃过午饭，两人沿着树影斑驳的坡道走回老街，先去了市立图书馆一楼的服务台。
凛从包里取出六月十八日借阅的《昭和地方广播黑胶目录》，递给管理员扫码归还。
图书管理员翻了翻平整的书页，笑着夸赞借书人把这本老目录保护得格外干净。
Mara: 啪嗒一声消磁完毕，借书证上的待还记录清零啦！接下来再去后街把老店主的私人目录还上。
神代凛: 嗯，把借来的两本目录都物归原主，今天下午剩下的就全是私人时间了。
走出图书馆拐进后街，Mara 先去二手唱片铺把那本八五年的《私人唱片目录》完好无损地交还给老店主，随后低头看了看自己那只米白色帆布包。
左肩带根部在前天大雨抢修时磨断了半截线头。
@SetExpression('leisure-smile', 'mara')
Mara: 那我们去斜对面的杂货裁缝铺转转吧，我想挑块结实的布把背包肩带补一补。
@SetBackground('backgrounds/record-shop-day.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'leisure-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
走进兼营文具与修补的杂货老铺，木架上摆满了各色线轴、黄铜顶针和信纸卡片。
Mara 在布料筐里翻找的时候，凛走到文具架前。
她挑了一叠厚实的纯白卡片和一支木杆铅笔。
Mara 转过头看见凛手里的卡片，好奇地眨了眨眼睛。
Mara: 凛，你买空白卡片和铅笔，是要给东京工作室的同事寄明信片吗？
神代凛: 不是寄给同事的……只是看纸张纹理很适合手绘，买回去随便画点东西。
Mara 也没有多问，举起手里的两块碎布比划了一下，认真征求凛的意见。
@SetExpression('leisure-hesitant', 'mara')
Mara: 凛，你看是用这块米黄色的细帆布顺色，还是用这块深藏青的牛津布压边好看？
神代凛: 米黄色跟原包颜色近，但质地偏薄，这块深藏青牛津布挺厚实的，补在根部更耐磨。
Mara: 我也是这么想的！那就听你的，选这块深藏青牛津布！
老店主笑着接过布料，让 Mara 不用把包取下来。
他直接把左肩带搭在缝纫机台板上走两道加固线。
趁着老裁缝踩响踏板的工夫，凛收好卡片，安静地站到 Mara 身后半步远的地方。
缝纫机哒哒哒地走了两圈十字压线，不到三分钟便剪断线头停了下来。
@SetExpression('leisure-hesitant', 'mara')
Mara 道了谢一回身，才发现凛正用双手稳稳托着她塞了三本厚书的帆布包底。
Mara: 欸？凛，你刚才在缝纫机边上，一直站在我身后帮我托着包底呀？
@SetExpression('leisure-blush', 'mara')
Mara: 笨蛋，包里装了那么多音频教材，你怎么不让我先把书掏出来搁在凳子上。
Mara: 快松手让我看看，手腕酸不酸？我帮你揉揉。
神代凛: 一点也不重，要是把书全掏出来，缝的时候反而容易把包身扯歪。
神代凛: 而且你看，深藏青的包边配米白帆布，针脚又密实又精神。
Mara 摸着肩带根部平整结实的深色牛津布，耳尖微微泛红，小声嘟囔了一句。
@SetExpression('leisure-hesitant', 'mara')
Mara: ……就会在这种不起眼的地方逞强，走啦，我请你去对面喝冰咖啡！
神代凛: 好，正好我也走得有点渴了，我们去对面坐一会儿吧。

@Node('daily-cafe-afternoon', { title: '明天下午有空吗' })
@HideAllCharacters()
@SetBackground('backgrounds/cafe-day.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'leisure-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午两点二十分，两人推门走进杂货铺斜对面的昭和风老咖啡馆。
铜铃轻响，吧台后传来手摇磨豆机的声响，空气里弥漫着咖啡豆与吐司的焦香。
凛看了看靠窗那排正晒着西晒太阳的座位。
她领着 Mara 走到木书架后面凉爽的卡座坐下。
系着白围裙的店主端来两杯加了冰块的雕花玻璃水杯，笑着放下了手写菜单。
@HideAllCharacters()
@SetBackground('inserts/cafe-shared-table.webp', { transition: { type: 'crossfade', duration: 550 } })
两人各点了一杯冰滴咖啡与冰红茶，又合点了一份淋着琥珀色糖浆的手工焦糖布丁。
Mara: 这家的手工焦糖布丁在整个青叶港都超有名，给，银勺子归你，你一勺，我一勺！
神代凛: 焦糖带一点微苦，底下的蛋奶味很浓，确实很好吃。
Mara: 对吧对吧！我每次考完试或者交完大作业，都要来这里吃一个布丁犒劳自己。
@SetBackground('backgrounds/cafe-day.webp', { transition: { type: 'crossfade', duration: 400 } })
@ShowCharacter('mara', { expression: 'leisure-pose-book', position: { x: 960, y: 785, scale: 1, rotation: 0, anchor: 'center' } })
分吃完布丁，两人没有急着起身，而是从身旁的木书架上抽了同一套少女漫画打发时间。
窗边的日影一点点在木地板上挪动，店里只有翻动纸页的沙沙声与轻柔的爵士钢琴曲。
看到第一卷中段女主角把送给前辈的运动鞋刷得掉了色的情节，凛没忍住轻笑出声。
神代凛: 你看这一格，她明明想帮对方把帆布鞋洗干净，结果倒了半瓶漂白水全刷白了。
Mara 凑过来瞄了一眼漫画，脸颊忽然一红，忍不住捂住嘴笑了起来。
@SetExpression('leisure-laugh-soft', 'mara')
Mara: 噗，别笑人家漫画主角了，我念国中二年级的时候也干过一模一样的蠢事！
神代凛: 真的吗？难道你也拿漂白水刷过别人的鞋子？
Mara: 那年母亲节我想给我妈一个惊喜，把她最宝贝的麂皮短靴泡进洗衣粉水里拿硬毛刷猛刷——
Mara: 结果晾干以后硬得像两块钢板，害我妈穿出去走一步咔吱响一声，笑话了我整整三年！
神代凛: 原来你那种一着急就想动手把所有事办妥的性子，从国中那会儿就一模一样了。
合上第一卷，凛伸手想去木书架上拿第二卷。
她一转头，却发现 Mara 手里捧着看的居然是第三卷。
@SetExpression('leisure-hesitant', 'mara')
神代凛: 漫画第三卷里她们两个已经搬到同一间公寓住了吗？
神代凛: 我手头这本第一卷末尾，明明还在为放学后谁先开口约对方去水族馆别扭呢。
Mara: 呜哇，我刚才随手一抽，怎么漏了第二卷告白篇直接拿了第三卷！快把第一卷借我看！
时针走向三点，凛招手续了第二杯热美式，陪着 Mara 安安静静把剩下的章节读完。
直到下午三点半结账前，凛拿出手机拍下漫画第二卷的封面，留作下次再来续读的书签。
@SetExpression('leisure-neutral', 'mara')
Mara: 今天这顿咖啡和布丁说好是我请客哦，等下回我们再来把第四卷看完，甜点还归我包！
@SetBackground('backgrounds/town-street-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'leisure-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
走出咖啡馆，并肩停在街口等红绿灯时，Mara 偏过头好奇地看向凛。
Mara: 对了凛，前几天我们在旧唱片店淘到的那张老电影光盘，你回公寓看了没？
神代凛: 前天晚上洗完澡放进去了，结果字幕还没调好就靠在枕头上睡着了。
Mara: 噗哈哈，那不就是连片头曲都没听完嘛！等你哪天看完了记得借我看看。
神代凛: ……不用等我看完再借，我们可以一起看。
街口正好跳出红灯，凛看着少女清澈的琥珀色眼睛，鼓起勇气望向她。
神代凛: Mara，明天周四下午，你没有别的安排吧？
@SetExpression('leisure-hesitant', 'mara')
Mara: 明天周四下午？没有呀，旧台的磁带明早就能封箱，明天本来也是我们的整日轮休。
神代凛: 刚才看天气预报，说明天下午一直到傍晚都是大晴天。
神代凛: 我们两点半先去白岛灯塔走走，傍晚再回我住处一起看那张电影光盘吧。
Mara 眨了眨眼睛，歪过脑袋笑吟吟地打量着凛。
Mara: 这次去白岛灯塔，是真的光去散步看海——
@SetExpression('leisure-serious', 'mara')
Mara: 还是我们凛大行家又嫌哪段海浪声录得不够好，要顺便拉我去当苦力补录呀？
凛的耳根一下子红了，却没有再拿任何工作借口给自己留退路。
神代凛: 明天不带录音机，也不带监听耳机，什么都不录，就是单纯想和你两个人去。
@SetExpression('leisure-relieved', 'mara')
Mara 怔了半秒，随即弯起眼睛，声音又轻又脆地应了下来。
Mara: ……好，那明天下午两点半，我们在白岛灯塔步道口见。
绿灯亮起，两人穿过斑马线，在坡道口挥手道别。
@HideAllCharacters()
@SetBackground('backgrounds/rin-room-day.webp', { transition: { type: 'crossfade', duration: 360 } })
傍晚回到公寓，凛取出下午买的空白卡片和铅笔，试着在角落画一座灯塔和两只海鸥。
神代凛: ……灯塔画得倒还端正，可这两只海鸥怎么看都像两道倒八字粗眉毛。
她把画着小灯塔的卡片夹进电影光盘盒里。
删掉手机里写了一半的解释，她只发去一句简单约定。
神代凛（消息）: 那张电影光盘我已经找出来放好了，我们明天下午两点半见。
不到十秒钟，手机便震了一下，跳出一条带着笑脸符号的回复：【收到！明天见！】
@SetBackground('backgrounds/rin-room-night.webp', { transition: { type: 'crossfade', duration: 600 } })
夜色渐深，窗外的海港灯火次第亮起，凛泡了一杯热腾腾的锡兰红茶端到矮桌前。
神代凛: 今晚先把这部电影完完整整看一遍，省得明天跟她并排坐着看的时候又犯困。

@Node('dating-invitation', { title: '今天不带录音机' })
@HideAllCharacters()
@SetBackground('backgrounds/rin-room-day.webp', { transition: { type: 'crossfade', duration: 400 } })
六月二十七日，星期四下午一点五十分，阳光透过纱帘照进房间。
凛换上一件熨得平平整整的浅蓝亚麻衬衫，将夹着卡片的电影光盘摆在矮桌正中央。
出门前，她低头看了看书桌上的便携录音机、防风毛衣与监听耳机。
平时无论去哪里都寸步不离的银色录音机，今天被她端端正正地锁进了书桌抽屉最里层。
神代凛: 今天不是去采录样本，不用拿设备当挡箭牌了，要好好把心意说出来。
@SetBackground('backgrounds/lighthouse-day.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'date-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午两点二十分，海风轻拂着洒满阳光的白岛灯塔步道口。
凛特意提前了十分钟赶到，却看见树荫下已经站着一个熟悉的身影。
今天的 Mara 穿了一件灰粉色小翻领衬衫和浅色百褶长裙，长发挽成了温柔的半扎发。
鬓角别着的一枚银色小发卡，在初夏的阳光下一闪一闪地发亮。
神代凛: 等很久了吗？我还以为自己提前十分钟到已经够早了。
@SetExpression('date-smile', 'mara')
Mara: 我也刚下公交车没两分钟！今天天气这么好，在家里坐不住就早点出来吹海风啦。
神代凛: 你今天穿这身灰粉色衬衫和百褶裙，和平时在台里完全不一样，特别好看。
Mara 被夸得不好意思地摸了摸耳垂，眼里盛着笑意。
Mara: 凛今天不穿工作外套、换上这件浅蓝亚麻衬衫，也特别清爽帅气呀！
两人并肩沿着石阶往观景台上走，聊着下周的气温预报与秋季课表，步子不疾不徐。
山坡两侧的松林在海风中轻轻摇曳，高挑的白色灯塔很快出现在视野尽头。
走到白岛灯塔洁白的塔身下，Mara 瞄了一眼凛空荡荡的斜挎包。
她轻快地转过身来，忍不住弯起眉眼微笑起来。
@SetExpression('date-hesitant', 'mara')
Mara: 咦，让我检查一下——防风毛衣和便携麦都不见了，今天包里真的连小录音机都没塞呀？
神代凛: 嗯，锁在公寓抽屉里了，今天什么都不录。
Mara: 那神代小姐今天既不审带子、又不录海浪，专程约我出来是想干嘛呢？
@SetExpression('date-hesitant', 'mara')
Mara 原本只是随口开句玩笑，可当她抬起眼时，却发现凛停下脚步一眨不眨地看着她。
凛深吸一口气，在清爽的海风里没有半点躲闪，笔直地望向眼前的少女。
神代凛: 我今天专程约你出来……是想和你约会。
海浪拍打礁石的声音在观景台下轻轻回荡，阳光照得白色的灯塔外墙分外耀眼。
Mara 睁大琥珀色的眼睛怔怔地看着凛，白皙的耳尖和脖子一点点红透了。
@SetExpression('date-neutral', 'mara')
Mara: ……这、这里刚上来一拨拍照的游客，人太多了，我们先去松树荫底下坐着说，好不好？
神代凛: 好，那边长椅正好没人，我们过去坐着说吧。
@AnimationTimeline(300, true)
@Key('character:mara', 'position.y', 0, 750, 'ease-in-out')
@Key('character:mara', 'position.y', 300, 785, 'ease-in-out')
两人在观景台侧面的松树荫长椅上并排坐好，松针滤过的阳光在裙摆上洒下细碎的光斑。
头顶的松枝被海风吹得沙沙作响，空气里飘着淡淡的松脂与海盐气息。
过了好几秒，Mara 才双手按着百褶裙的膝头，红着脸小声开口。
@SetExpression('date-blush', 'mara')
Mara: 凛，你刚才在步道口说的那句话……海风太大了，我怕听岔了，你能再跟我说一遍吗？
神代凛: 我刚才说，我想和你正式约会，Mara。
Mara: 不是同事放假出来散心，也不是朋友顺路吃个便饭……是我想的那种，谈恋爱的约会吗？
神代凛: 嗯，不是同事散心，就是你想的那种谈恋爱的约会。
凛看着自己放在膝盖上的双手，把藏在心里好几天的话一句句说了出来。
神代凛: 六月十六号傍晚，你从屋里抱出两瓶冰镇白桃汽水、在南湾防波堤上分我一只耳机的时候——
神代凛: 还有二十一号晚上在剪辑室陪你多留那一个钟头、听你说起九月想去东京的时候——
@SetExpression('date-neutral', 'mara')
神代凛: 我其实就已经不是只把你当搭档了，那时候我就很想这样单独约你出来。

@Node('dating-confession', { title: '我喜欢你' })
@HideAllCharacters()
@SetBackground('backgrounds/lighthouse-day.webp', { transition: { type: 'crossfade', duration: 360 } })
@ShowCharacter('mara', { expression: 'date-hesitant', position: { x: 960, y: 785, scale: 1, rotation: 0, anchor: 'center' } })
在这座洒满初夏阳光的白岛灯塔下，凛转过身看着眼前的姑娘，目光澄澈地开了口。
神代凛: 我喜欢你，Mara，比喜欢前辈或者搭档要喜欢得多。
神代凛: 我不想再用指导工作当借口了——我想当你的女朋友，和你正式交往。
@SetExpression('date-pose-confession', 'mara')
Mara 低着头，手指轻轻捻着灰粉色衬衫的第二颗纽扣，长长的睫毛微微颤动。
安静了两秒钟后，她抬起头来，琥珀色的眼睛亮得像盛满了整片晴朗的海湾。
@SetExpression('date-teary-relief', 'mara')
Mara: 我也喜欢你，凛。从好早好早以前就开始喜欢你了。
神代凛: ……真的吗？我还以为那天在防波堤上，只有我一个人在偷偷多想。
@SetExpression('date-blush', 'mara')
Mara: 当然是真的呀！你还好意思说十六号傍晚怕自己自作多情呢……
Mara: 其实那两罐白桃汽水，我头天晚上就特意买回来冰在冰箱最里层了！
Mara: 那天傍晚你在二楼走廊外头等我换衣服的时候，我在屋里对着镜子深呼吸了好几次，生怕你觉得我下班了还拉你去防波堤很烦人。
Mara: 结果我们一坐到防波堤上，你第一句话就一本正经地夸我环境音录得干净，我都差点以为自己没戏了呢！
神代凛: 我那时候是因为看见你坐在晚霞里，紧张得不知道该摆什么表情，才下意识聊起录音的。
神代凛: ……原来你那天也是装镇定，那我们两个，不是白白绕了这么大一圈吗？
@AnimationTimeline(420, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 420, 900, 'ease-in-out')
@SetExpression('date-laugh-soft', 'mara')
Mara 扑哧一声笑了出来，试探着伸出手，用指尖轻轻碰了碰凛放在长椅上的手背。
凛没有半点犹豫，立刻翻过手掌，温柔而坚定地与她十指紧扣。
掌心贴合的温度比初夏的海风还要暖和，两人看着彼此通红的耳尖，又同时笑了起来。
@SetExpression('date-smile', 'mara')
Mara: 那从今天起，我们谁也不准再端着架子绕圈子了。
Mara: 我现在可以光明正大地叫你女朋友了吗，神代凛小姐？
神代凛: ……嗯，从今天起，我就是你的女朋友了。
听见凛郑重其事的回答，Mara 脸颊红扑扑地晃了晃两人牵在一起的手。
Mara: 等九月份我去了东京开学，每天下午一下课我就给你打电话，一起坐电车去吃晚饭！
神代凛: 嗯，等八月底白川音像的合同到期，我就专门接独立修复和采录的案子，随时都能去学校门口接你下课。
@SetExpression('date-relieved', 'mara')
Mara 低头看着两人十指紧扣的手，耳朵尖红通通的，声音忽然放得又轻又软。
Mara: 凛，现在松树林这边刚好没人……能抱我一下吗？
神代凛: ……嗯，快过来吧，让我好好抱一下你。
@HideAllCharacters()
@SetBackground('cg/next-date.webp', { transition: { type: 'crossfade', duration: 650 } })
清甜的柑橘洗发水香气混着阳光晒暖的衬衫味道。
随着少女靠过来的动作，把凛整个人温柔地包了起来。
隔着薄薄的夏装衬衫，两人都能清晰地听见彼此胸腔里飞快跃动的心跳声。
凛稍微退开一点，看着近在咫尺泛着红晕的脸颊与微湿的眼角，声音轻得像一声叹息。
神代凛: Mara……我现在可以亲你一下吗，好不好？
Mara: ……嗯，不用每次都这么客气地问我啦。
微咸温暖的海风吹过树梢，两人的嘴唇在斑驳的树影下轻轻贴在了一起。
那是一个带着阳光温度与柑橘清香的吻，轻柔得像怕惊动树梢停驻的海鸟。
一吻分开少许，脸皮薄的凛眼神不知往哪里放，视线落在了 Mara 的衬衫领口上。
Mara: 凛，你干嘛一直盯着我的领口看呀……呼吸吹得我脖子都痒了。
神代凛: 对、对不起，我只是觉得今天这件灰粉色衬衫特别衬你，一下子不知道该看哪里。
Mara 忍不住弯起嘴角，双手轻轻环住凛的脖颈，脸颊微红地小声咕哝。
Mara: 刚才那一下太快了，我还想再亲一下……你把头稍微抬起来一点点，好不好？
神代凛: ……好，那我听你的，把头抬起来一点点。
整张脸红到脖子根的凛听话地抬起头，迎着少女温软的目光，再一次轻轻吻了上去。
松林间的海风温柔地拂过少女半扎的长发，将这一刻的阳光与心跳静静定格。
@SetBackground('backgrounds/lighthouse-sunset.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('mara', { expression: 'date-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
待到夕阳将白岛的海面染成一片温暖的橘金色，两人才手牵着手沿着步道慢慢走下山坡。
Mara 偏过头看着凛依旧泛红的耳廓，笑嘻嘻地用食指轻轻戳了一下。
Mara: 神代前辈，我们已经走下两百级台阶了，你的耳朵怎么还跟傍晚的火烧云一样红呀？
神代凛: ……还不是因为你一路上都在晃我的手，每隔十步就要叫我一声女朋友。
Mara: 谁让这个称呼这么好听呢！我今天晚上还要再叫八百遍！
路过坡道口的自动售货机时，两人买了一罐冰柠檬茶和一罐白桃汽水，交换着喝了一口。
神代凛: 这款白桃汽水比上次我们在超市买的那款限定罐装甜度高一点，不过桃子香气很浓。
@SetExpression('date-neutral', 'mara')
Mara: 我倒觉得你的无糖柠檬茶太涩啦！来，再让我喝一口汽水压一压。
神代凛: 那就一人分一半吧，正好走下山坡也有点渴了。
@HideAllCharacters()
@SetBackground('backgrounds/rin-room-night.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('mara', { expression: 'date-smile', position: { x: 960, y: 785, scale: 1, rotation: 0, anchor: 'center' } })
傍晚回到半山公寓，窗外飘起细密的晚风，笔记本屏幕在矮桌上映出柔和的微光。
凛烧了一壶热水泡上清香的焙茶，又剥了一小盘冰镇蜜柑摆在矮桌边。
她把夹在光盘盒里的手绘小灯塔卡片送给 Mara。
少女宝贝似的捧在手里看了又看，才小心翼翼收进贴身口袋。
随后两人并排靠在榻榻米床沿前，盖着同一条薄棉毯，在毯子底下十指相扣。
老电影放到一半，Mara 自然而然地偏过头，把脸颊轻轻靠在了凛的左肩上。
@SetExpression('date-neutral', 'mara')
Mara: 凛，男女主角在火车站月台找对方的这一段，配乐里的单簧管好好听啊。
神代凛: 嗯，后面男主角从大衣口袋里摸出那盒旧磁带的时候，弦乐还会再升半个调。
@SetExpression('date-blush', 'mara')
Mara 眨了眨眼，从凛的肩膀上抬起头来，凑近了端详她的脸。
Mara: 等等……你不是说前天晚上连片头曲都没听完就睡着了吗？怎么连升半个调都知道！
神代凛: ……昨晚怕今天陪你看的时候犯困，偷偷泡了杯浓茶从头到尾预习了一遍。
@SetExpression('date-laugh-soft', 'mara')
Mara: 噗，哪有人连跟女朋友看恋爱电影都要提前做功课预习的呀！
神代凛: 那现在正式考试结束了，神代同学今晚的表现及格了吗？
@SetExpression('date-smile', 'mara')
Mara 重新把脑袋窝回凛的肩窝里，手指在薄棉毯底下轻轻挠了挠她的掌心。
Mara: 满分一百分的话，给你一百二十分，明天上午验收见，我的神代前辈。
神代凛: 嗯，等这边的电影片尾字幕放完，我就拿手电筒送你下坡回家。

@Node('dating-delivery', { title: '把自己的那份交完' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('yumi', { expression: 'calm', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'pose-tape-box', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十八日，星期五上午九点，资料室的窗户敞开着。
两百一十盘抢救完成的口述母带、整理目录与双版本数字硬盘，整整齐齐码放在长桌上。
青木由美逐页翻看完最后一册校验总表，在《音频抢救修复终审合格书》上盖下了台长印。
青木由美: 原貌轨、降噪修复轨和分轨成片都理得清清楚楚，凛，谢谢你留住了这三十三年的声音。
神代凛: 这是委托合同里答应您的事，能赶在旧楼搬迁前全部交齐，我也松了一口气。
@SetExpression('neutral', 'mara')
Mara: 每一盘母带的防潮盒标签我也复核过两遍啦，市民中心那边直接按编号上架就行！
@ShowCharacter('haruka', { expression: 'smile', position: { x: 360, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
水野春香抱着节目单推门进来，眼睛亮晶晶地望向凛和 Mara。
水野春香: 神代前辈、Mara！周日告别节目的片头引子，我想用二十秒真正的海港环境音！
水野春香: 我昨天听了 Mara 素材库里那段清晨渡轮进港的浪声，太美了，能授权给节目用吗？
@SetExpression('smile', 'mara')
Mara: 当然可以呀！那段刚好是凛教我调双麦间距之后录的，中午我们一起把那二十秒截出来！
神代凛: 我们从第一声远处的汽笛切入，保留海水拍打木桩的余音，在第十二秒做平滑淡出。
Mara: 嗯！那段海鸥刚好从右声道飞到左声道，戴着耳机听就像站在清晨的码头上一样！
水野春香: 太好啦！有你们两位把关，周日这期告别特辑的片头绝对能惊艳全城听众！
神代凛: 我现在就打开剪辑工作站，把这二十秒导出成最高规格的无损母带格式。
@HideCharacter('haruka')
@SetExpression('neutral', 'yumi')
青木由美收好合格书副本，将签好字的委托结项凭据递给凛，抬眼目光温和地望向她。
青木由美: 按委托书上的截止日子，今天上午办完交接，你下午就可以搭车回东京交差了。
青木由美: 不过周日晚上是旧楼最后一次直播，明天下午还有核稿，要不要留到周日听完再走？
@SetExpression('smile', 'mara')
Mara 站在由美身旁，虽然没有插话，却悄悄用充满期待的眼神望着凛。
神代凛: 好，我已经买好下周一早上的车票，不赶今天下午的班车回东京了。
神代凛: 我已经跟东京的白川主管请好假了，留到三十号晚上，陪大家一起把这座旧楼送走。
青木由美: 太好了，有你在导播室坐镇，我们周日晚上最后一播就更踏实了。

@Node('dating-final-copy', { title: '先腾出一只手' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('haruka', { expression: 'pose-script-laugh', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'blush', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十九日，星期六下午一点，走廊里安静得只有挂钟的滴答声。
趁着午休走廊没人，凛和 Mara 正手牵着手从茶水间走出来。
两人一转弯，迎头撞上了抱着一摞节目单的水野春香。
水野春香: 哇哦——原来两位大功臣躲在茶水间里悄悄牵手呀！
Mara 触电似地想要抽回手，春香却已经笑嘻嘻地举起台本挡住了半边脸。
@SetExpression('neutral', 'haruka')
水野春香: 神代前辈、Mara！虽然我特别不想在这个时候当电灯泡——
水野春香: 但你们能不能先腾出一只手，帮我对一遍明天告别节目的最终台本？对完再继续牵嘛！
Mara: 春、春香你瞎起什么哄呀！刚才只是顺手递杯子碰到了而已，快把节目单拿来给我看！
@SetExpression('smile', 'haruka')
春香没有继续打趣，而是干脆利落地把两份《六月三十日特别节目最终核定稿》分递给两人。
神代凛: ……咳，也分我一份吧，我看音频编号和时长，Mara 看街坊名字和录音来源。
三人围在导播室长桌旁逐行核对起来，不到十分钟，凛的红笔尖便在第二页末尾停住了。
神代凛: 春香，片头那二十秒海港环境音的署名栏，怎么还写着“台内历史资料库”？
@SetExpression('hesitant', 'haruka')
水野春香: 哎呀，那是周三排初稿时填的占位符，我昨天换上音频文件以后忘了改文字表了！
神代凛: 那段是 Mara 独立采录的私人样本，署名应该改成“录音采集：Mara”。
@SetExpression('relieved', 'mara')
Mara: 凛也帮我调了双麦相位和降噪参数，要把你的名字也一起写上去才对。
神代凛: 我的名字已经在整期节目的音频修复栏里了，这一条必须单独署你的名字。
水野春香: 神代前辈说得对！我这就拿红笔改过来——“片头环境音采集：Mara”，一字不差！
Mara 看着节目单上端端正正印着自己名字的那一行，抿着嘴角开心地笑了起来。
核对完三页流程表，三人又一起把备用跳线和防喷罩分门别类装进了贴着标签的搬家纸箱。
@ShowCharacter('yumi', { expression: 'calm', position: { x: 320, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
青木由美拿着搬家公司的确认单走进导播室，看了一眼墙上的挂钟。
青木由美: 明天下午一点开始做最后一次设备联调，六点整正式开播，播完货车会拉走最后一批机柜。
Mara 趁着由美和春香核对搬运箱数的间隙，偷偷在桌沿底下用指尖勾了一下凛的手指。
凛这才发现，就算已经名正言顺成了恋人，在同事眼皮底下被撞见时，耳根还是会发烫。
她没有躲开，只是在桌沿下轻轻回握了一下少女温热的指尖。
窗外初夏的蝉鸣一声声响起，明天就是六月三十日了。
那是海岬旧楼三十三年岁月的最后一天，也是她们走向下一个季节的开始。
