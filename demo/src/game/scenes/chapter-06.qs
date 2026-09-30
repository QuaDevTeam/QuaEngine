<script lang="ts">
import type { StoryScope } from '../story/prologue-state'
export interface Scope extends StoryScope {}
</script>

@Chapter('06', { title: '不用等到八点' })
@Scene('call-me-tomorrow-prologue')
@Node('chapter-06', { title: '不用等到八点' })
@Protagonist('rin')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'tired', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十三日，下午三点十分。青叶市的暴雨依旧没有停歇的迹象，沉重的雨幕将海港的轮廓冲刷得一片朦胧。
${scope.pick('formal-followup', '凛签了借件归还清单，将纸质审批附件退还公司。获准留存的扫描件、原邮件和查阅记录仍在她们手里；原件保管处与正式调取联系人也已登记。安全核验资料另已交付。', '设施方指定的保管人到场，春香逐个读出材料编号，凛协助核对原件与副本。核对无误后，保管人接收并封存原件，由美收好正式回执；她们获准留存的副本仍可继续使用。')}
Mara 细心地帮凛清空了办公桌一角散乱的文件夹，把一杯温热的水轻轻推到她手边。
Mara: 先喝。新的消息来了，我会告诉你。
温热的水流滑过干涸的喉咙，凛才惊觉自己整整一下午竟然连一口水都未曾喝过。她下意识地想要挪开转椅站起身，却因久坐导致右小腿一阵尖锐发麻，只得咬着牙僵在原地等待知觉恢复。Mara 没有开口催她，只是默不作声地弯下腰，替她把脚边堆叠的厚纸箱稳稳移到了过道旁。

@Node('shutdown-plan', { title: '机器还没有安全下来' })
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('reiko', { expression: 'work-alt-serious', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午四点整，前方处置组的终审紧急停机方案终于送达。三方联合协调会议通过免提电话召开，真由冒雨守在中继站外围设立的安全作业区内，由美则坐在电台会议室里，握着红蓝圆珠笔飞快记录核心要点。
前方技术专家组在十分钟前已强行在底层逻辑中注销了原本排在十八点四十分的高负荷试验任务，然而地下辅助支路仍旧处于顽固的带电状态，机房内部变压回路里蓄积的高压能量也远未完全耗散。现场的积水水位还在缓慢上涨，受损老化的绝缘隔离装置已彻底丧失了物理切断能力；若继续按照常规规程进行极其缓慢的降载泄能，至少需要耗费整整六到八个小时，而前方的水浸危局根本容不得任何人继续等待。
技术专班提出的唯一替代决断，是启动手册上最为极端的紧急保护程序：将所有残存的高压负荷通过旁路强行引入专用的吸收阻抗模块。唯有这种方法能在半小时内彻底瓦解带电风险；但其沉重的代价是，核心配对收发组件将在剧烈过载中瞬间物理熔断报废，这意味着整套历时五年建设的尖端科研阵列，将再也无法接收到来自未来维度的回响。
高桥真由（通话）: 普通播出不依赖它。广播和研究用的线路，我们会分开检查。你们可以继续准备备用节目。
@SetExpression('work-alt-hesitant', 'reiko')
森田礼子: 如果再等一会儿，按原来的降载办法——
设施负责人（通话）: 现场已经评估过，渗水情况不允许再等。执行紧急处置，人员撤出非作业范围。
由美在记录本的白纸上重重写下“执行紧急处置”六个大字，随即平推给身旁的凛。凛深吸一口气，对着麦克风将每一个字郑重复述了一遍，电话那头的总指挥果断确认无误。
真由在听筒那头沉默了许久，才用极其微弱却无比坚决的嗓音，逐条复述专家组要求其作为核心研发者确认的设计代号与损毁免责声明。
高桥真由（通话）: 我确认。配对组件损毁后，这一组不能恢复。控制资料完整，按批准方案执行。
真由的嗓音已经沙哑得几乎变形。凛静静地握着听筒，直到对方平复呼吸，才低声询问是否还有遗漏的交接手续。
神代凛: 我们这边要等哪份记录？昨天也收到过停机截图，我不敢只看那个了。
设施负责人（通话）: 现场核验记录。结果和禁入要求一起发，不以远程指示灯代替。完成前维持原封闭范围。
神代凛: 那我们现在切到备用线路就行？春香的道路通知都准备好了。
高桥真由（通话）: 广播有独立线路。你们先用已经测试过的备用线路，研究设备不会接进它。
真由交代完毕，又谨慎地请身旁的现场主控工程师核验了一遍安全技术附录。电话里响起了刺耳的文件纸张翻动声，随后有人用对讲机高声通报图纸版本号。真由向对方逐字核准，其中一个尾缀数字被暴雨声掩盖，她极其严谨地要求对方大声复诵了一次才在终版上落笔。
凛的眼前不由自主地浮现出初见真由时，她在白板上用签字笔干脆利落划下两道独立传输路径的英姿。而此刻听筒深处，却始终被沉重的翻页声与雨声占据。凛把那个刚刚补齐的编号认真写在备忘栏中，静候着通话的最后交代。
高桥真由（通话）: 这一组用了五年。有几次我们以为可以多接到半秒，后来发现是记录采样时间的时钟走偏了。
真由的声音戛然而止，没有再继续倾诉那份属于科研工作者的遗憾。
高桥真由（通话）: 抱歉。文件已经核对好了。我在现场配合，后续按设施方指令走。
由美沉声应下，再次关切地叮嘱她电台留守组会全天候坚守电话席，让她不必分心兼顾民用广播的安全。真由道了声谢，果断按掉了免提通话。

@Node('shutdown-mobile', { title: '先问清去哪里' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@SetExpression('pose-equipment-worried', 'mara')
电话落锁的盲音响起，Mara 已经默默拉起厚重的外勤工具箱。凛猛然抬起头，视线在空气中与她相撞。
Mara: 去门口的转播车，由美跟我。把刚才说的备用线路接好，不进东堤。
神代凛: 我知道。……我还是会怕。
Mara: 我也怕，所以今天不往那边去。手机开着，到了车上给你消息。
神代凛: 回来吃什么？
Mara 扣在背包带上的手指骤然一顿。她深深地看了凛一眼，才将金属搭扣用力卡紧。
@SetExpression('pose-equipment-soft', 'mara')
Mara: 有汤的啦。今天不吃冷饭。
@CharacterExit('mara', 'right', 420, { x: 700, y: 750, offset: 240, opacityFrom: 1, opacityTo: 0, easing: 'ease-in-out' }, true)
@HideAllCharacters()
@SetBackground('backgrounds/radio-mobile-rain-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
Mara 踏着门阶前飞溅的积水快步向前，由美紧紧撑伞随行在侧。凛隔着模糊的雨窗注视着她们登上转播车的车厢，掌心里的手机很快便传来了一声沉稳的震动。

@Node('shutdown-weather-copy', { title: '今晚要播的话' })
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('haruka', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午五点二十分，春香把刚刚定稿的恶劣天气应急广播通报送到了凛的案头。通报的第三段被用黑笔坚决划掉了整整两行网络流传的灾情流言，批注栏里清晰写着“未获市政应急部门背书”。
水野春香: 问了两个人，都说是转来的。源头还没找到，我先删了。
神代凛: 这个地方写上核实的公交改道。听众现在用得上。
水野春香: 好。今晚旧楼暂停来访那一条呢？
神代凛: 写明取录音和送材料都改约，别让人冒雨来。电话照常有人接。
春香俯在桌边迅速润色着路口管制的官方话术，改完却没有立刻起身。凛察觉到异样，抬起头，发现春香正定定地凝视着旁边那份被折叠起来的未解密录音档案。
水野春香: 如果今晚还有人问那段警报，我们要怎么答？
神代凛: 交由美处理。这份死讯不能当新闻播，录音里说的事在这里还没有发生。
水野春香: 我知道不能播啦。我是怕自己一紧张，说成我们已经知道会怎样。
神代凛: 就说收到过警报，正在按核实的现场情况处理。问到还没查清的，就请由美回答。
@AnimationTimeline(320, true)
@Key('character:haruka', 'position.y', 0, 750, 'ease-in-out')
@Key('character:haruka', 'position.y', 320, 785, 'ease-in-out')
春香在凛对面的转椅上坐下，把正式的公开播报稿放在左手边，将内部防范疑点明细妥善收在右侧。她轻声试读了一遍今晚的开场白，直到念完第一段关于滨海路积水绕行的提示，才停顿下来长长换了口气。
凛看着播报签名栏上“水野春香”四个娟秀的小字，那是一如往常的日常播报排班。
神代凛: 昨晚那段里，是我的声音。听到以后，我一直在想为什么偏偏会是我。
春香没有用“一定是机器坏了”这种苍白的话来安慰她，只是静静地注视着凛发红的眼眶，耐心地等待着。
神代凛: 十八号我替你试过备用稿。那边如果人手不够，我也可能坐到话筒前。可具体发生了什么，录音没说，我不知道。
水野春香: 所以我们不能照着那份，把今晚的人和事都排一遍。
神代凛: 嗯。我们把已经能改的事做好，今晚你按这张核实过的稿子播。
春香用力点了点头，将两份用途完全不同的文稿分别收进颜色分明的文件夹里。离开工位前，她红着脸小声央求凛帮她听一遍港口避风坞的生僻发音，担心临时改稿会在直播中打绊。
凛戴上半侧耳机，认真听完春香的标准试读，温和地肯定了她的发音。春香这才拍着胸口长舒了一口气，有些不好意思地吐了吐舌头，坦白自己暗地里练了三次还是心慌得厉害。
目送春香快步走向主控直播间，凛低头核查移交档案的页码，发现中间意外缺失了一张目录索引，便深吸一口气，从第一页重新耐心地清点起来。

@Node('shutdown-complete', { title: '十七点五十分' })
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('haruka', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
十七点五十分，停机组发来正式完成通知。
两路强电供电回路已依照国家规程实行了全物理截断与挂牌上锁，变压装置内蓄积的所有残存电能已在半小时内彻底导向泄放阻抗完全耗散，机柜本地控制器内被擅自写入的离线高负载作业指令亦被彻底格式化清除。以上所有关键指标均已通过现场独立第三方安全监督员的见证复测。核心配对收发组件在受控过载中彻底物理熔毁，后续一切回声接收测试永久终止。原定安全禁入封锁线维持现状，静候灾后全面安全审计。
转播车上的由美通过电台专线同步接入了通报电话，要求现场监督代表再次高声朗读了关键断电测点的实测零电压数值，春香坐在凛身旁飞快地记下了确认工程师的签名工号。直到听筒那头传来断开连接的忙音，凛僵直了整整一天的右手才终于无力地松开了钢笔。
激光打印机缓缓吐出最后一页带有鲜红公章的扫描件。凛双手捧起纸张，自上而下逐字默读，视线最后停留在末尾确认责任人的手签上。她本想把纸张整齐收进档案袋，指尖却像脱力般死死黏在纸角，直到春香主动伸过手来，用订书机替她整齐地钉好边角。
凛把盖章通报的高清版本第一时间转发给 Mara，附带询问是否能够顺畅打开。Mara 的消息几乎在三秒内弹回，说明自己和由美已经坐在转播车的主控台前仔细逐条过目完毕。
Mara（消息）: 再查一遍备用线路就回来。春香要的转接头也带上。
凛在对话框里飞快打出“快点”两个字，大拇指悬停在绿色的发送键上方。隔着窗外昏暗的雨雾，她能清清楚楚看见院落正中央那辆转播车透出的温暖橘黄光芒。凛默默按退格键删掉了那两个字。
神代凛: 好。回来一起吃。
屏幕下方瞬间跳出已读的标识。凛没有再多问还剩下几分钟，只是小心翼翼地把手机端端正正放在了刚刚打印好的报告旁。
设施管理方随后同步推送了中继站外围的最新安全隔离区位图。即便物理火灾与电气击穿的致命危机已被彻底化解，由于地下管涌积水依然严重，整座站房依旧处在严密的戒备隔离状态。凛将图纸转发给 Mara，请她根据手头的日常联系人底册正式通报外协维保工班，直到收到 Mara 确认已逐一通知完毕的回复，才长长舒了一口气，关闭了工作台。
十八点四十分。窗外的暴雨声愈发震耳欲聋。
没有定时高负荷启动的刺耳警报，也没有任何一条关于东堤中继站的突发火警火情。
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@SetBackground('backgrounds/radio-studio-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'tired', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@CharacterEnter('mara', 'right', 320, { x: 700, y: 750, offset: 140, easing: 'easeOutCubic' }, true)
@ShowCharacter('yumi', { expression: 'neutral', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
Mara 和由美回到台里，把移动设备交给春香。备用链路传来春香清楚的试播声，随后切回正常节目。

@Node('shutdown-dinner', { title: '有汤的晚饭' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-breakroom-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'tired', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
她们的晚饭是在转播车换班间隙从街角便利店买来的速食热汤和几个三角饭团。Mara 用厚厚的餐巾纸包着滚烫的塑料汤碗，轻手轻脚地在凛身旁的木椅上坐下。
Mara: 我又拿到腌菜了。给你？
神代凛: 放这里吧。昨天那份我还挺喜欢。
@SetExpression('smile', 'mara')
Mara: 那我不用挑啦。
Mara 把附赠的小袋酸脆腌菜轻轻搁在凛的饭盒边，眉眼弯弯地撕开金枪鱼饭团的塑料薄膜。凛疲惫地靠在椅背上，直到此时此刻，才真正尝出了食物本该有的滋味。
走廊上响起值班后勤人员取用最新防汛避险路况通报的脚步声。Mara 敏锐地起身走出休息室，热心地指引复印机的纸槽位置，直到确认对方拿到了完整的页码，才放心地折返回座。
凛凝视着 Mara 重新在身旁落座，自始至终没有多嘴追问她刚才去了哪里。Mara 挽起有些被雨水沾湿的衬衫袖口，发现盛汤的碗壁上挂满了冷凝水珠，便又抽出一张纸巾妥帖地垫在碗底。
神代凛: 早晨你说，以为自己说错了什么。
Mara 握着塑料勺子的手微微停顿。
Mara: 嗯。
神代凛: 昨晚那顿饭，我真的很开心。我还想再约你来着。后来不敢看你，是我一看见你，就想起那段录音。
@SetExpression('serious', 'mara')
Mara: 我现在知道了。可昨晚你连看都不看我……我还把吃饭时说过的话想了一遍。
神代凛: 对不起。
Mara: 今天你肯把名单拿给我，我才稍微放心一点。至少这回，我知道你在查什么了。
凛惭愧地垂下眼帘。自己的双手依旧无措地搭在桌沿，一如清晨那个惊恐地想要伸手拦下工单的瞬间。她默默把手收拢回来，紧紧交叠在膝头。
神代凛: 我上午看见你拿工单，手就伸过去了。明明你只是要核对……
Mara: 你就说你害怕啊。我又不会因为这个笑你。别让我一直猜你是不是不想理我了。
神代凛: 嗯。
勺尖里的嫩豆腐受力不均，第二次哧溜一声滑回了浓稠的汤汁里。Mara 轻轻放下了筷子，换用短柄汤勺小心翼翼地舀起一块，却只是悬在半空，迟迟没有送入口中。
@SetExpression('hesitant', 'mara')
Mara: 我今天也没那么冷静。给第二班打电话时，要报台里的回电号码，我看了好几遍，怕一开口就说成自己的。
神代凛: 我就在旁边，却没看出来。
@SetExpression('afraid', 'mara')
Mara: 我先写在纸上了。照着念，声音才没那么抖。
凛默默把纸巾盒推到她的手边。Mara 抽出一张，极其认真地反复擦拭着塑料勺柄上的油渍，这才低头吃下那口早就不再烫嘴的豆腐。
碗里的热汤在微凉的晚风中渐渐褪去了热度。墙上老式挂钟的黑色分针正悄然滑过盘面上细密的格线，凛下意识抬起头，目光恰好与同样仰头凝视着挂钟的 Mara 撞在一起。在整整一分钟的死寂里，谁也没有开口报出哪怕一个时间。
@SetExpression('relieved', 'mara')
十九点十二分。
Mara 默默把身前那瓶冒着冷气的柠檬水推到凛的指尖前。凛木讷地握着塑料瓶身，双手僵硬得甚至无法拧动那圈防盗环；Mara 见状，自然地伸出手把瓶子重新接了过去，掌心用力一拧，伴随着清脆的咔嗒声，替她轻松松开了瓶盖。
Mara: 好了。
凛接过拧开的饮料，指尖停留在 Mara 温热的手背边缘。Mara 侧过头深深看了她一眼，直到瓶子在桌面稳稳立住，也始终没有把自己的手抽回去。
神代凛: ……能牵一会儿吗？
Mara: 嗯。
@AnimationTimeline(350, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 350, 920, 'ease-in-out')
@HideAllCharacters()
@SetBackground('inserts/nineteen-twelve-hands.webp', { transition: { type: 'crossfade', duration: 650 } })
凛鼓起所有的勇气，伸出右手紧紧握住了 Mara 的掌心。两人的手指上都残留着冷饮瓶壁渗出的冰凉冷凝水珠，湿漉漉的，却在交叠的瞬间激起一阵战栗般的灼热。Mara 又覆上另一只手，轻轻按住凛的手背。
两具年轻的身体在昏暗的休息室里紧紧依偎着。隔断间外的大堂里，春香正压低着声音同由美做着广播开播前最后一轮语速核对，清晰的稿纸翻动声透过薄木门隐隐传来。凛低着头，目不转睛地凝视着两只在阴影里十指交扣的手。
神代凛: 我从刚才就一直看钟。明明停机通知都到了。
Mara: 我也是。吃饭的时候还看了一次。
神代凛: 现在你就坐在这里，我还是……
Mara: 嗯，我在。……你别松手，我还没缓过来。
@SetBackground('backgrounds/radio-breakroom-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 550 } })
@ShowCharacter('mara', { expression: 'relieved', position: { x: 920, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@AnimationTimeline(420, true)
@Key('character:mara', 'position.x', 0, 920, 'ease-in-out')
@Key('character:mara', 'position.x', 420, 900, 'ease-in-out')
Mara 紧扣着凛的手指不由自主地再度收紧，仿佛要确认彼此血肉的真实。凛张了张嘴想要说些什么，滚烫的泪水却先一步夺眶而出，扑簌簌砸在两人交叠的手背上。Mara 轻轻挪动转椅向她靠拢了半寸，有些心疼地柔声问了一句“抱一下？”，直到看见凛哭着点头，才缓缓张开双臂。
温热的拥抱猝不及防地将凛包围，Mara 绵长微颤的呼吸轻轻扫过凛单薄的肩窝。凛有些迟疑地抬起僵硬的双臂，终于紧紧环抱住了 Mara 瘦削的后背。两人就这样在无声的世界里紧紧相拥，直到春香抱着一叠打印资料快步走来推开房门，才慌忙松开怀抱，红着脸手忙脚乱地帮春香把最后一份审核签章妥帖夹好。

@Node('shutdown-eight', { title: '普通节目照常' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-monitor-night-anime-v3.webp', { characterLighting: { ambient: [0.93, 0.96, 1.02], shade: { color: [0.88, 0.92, 1], from: [0.2, 0], to: [0.8, 1] } }, transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'relieved', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
二十点整，夜间的公众广播准时在电波中启航。
水野春香（公开广播）: 这里是海岸台。今晚先为您带来青叶市的降雨与道路信息。
旧返回通道的耳机里一片阒寂。由于核心接收硬件在下午被彻底物理熔断，那条曾带给她们无尽梦魇的时光回路已不复存在，明晚的电波再也无法跨越因果提前抵挡这间录音室。
凛点开昨夜截获的母盘音频属性。文件时长依旧冷冰冰地定格在一百八十秒，SHA-256 校验和毫无变动，那段撕心裂肺的事故讣告依然深埋在数据字节之间。
鼠标光标在绿色的三角播放键旁静静悬停了良久。凛没有点下去，只是平静地拖动光标，将那段音频连同手打的逐字稿，一同从今日的紧急排险工作目录中永久移出，妥善封存在了加密分区深处。
Mara 坐在旁边侧过头来，轻声询问那段录音是否还存放在电脑里。凛诚实地点了点头，手指却已离开了触控板。
Mara: 先收起来吧。别在今天晚上反复听了。
神代凛: 好。我把调查用的原件留好。我们自己那份，等你想谈的时候再说。
Mara 伸出手利落地帮凛收起移动硬盘，凛顺从地合上了发烫的笔记本屏幕。茶几上那两碗温热的蔬菜汤，不知何时已经彻底凉透了。
