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
六月二十三日，下午三点十分。
${scope.pick('formal-followup', '凛签了借件归还清单，将纸质审批附件退还公司。获准留存的扫描件、原邮件和查阅记录仍在她们手里；原件保管处与正式调取联系人也已登记。安全核验资料另已交付。', '春香逐个读出原始材料编号，凛核对来源，由美将封存副本交给设施方指定的保管人。回执上既有时间，也有能够再次联系到的人。')}
Mara 给凛让出桌边一小块地方，放了一杯水。
Mara: 先喝。新的消息来了，我会告诉你。
凛喝了几口水，才觉出腿已经坐麻了。她将椅子往后推，伸直腿，脚跟轻轻蹭过地面。Mara 则把桌上用过的纸杯收到一边。
@Node('shutdown-plan', { title: '机器还没有安全下来' })
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('reiko', { expression: 'work-alt-serious', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午四点，停机组给出方案。会议通过电话进行，真由在规定的现场工作区，由美坐在台里记要点。
技术组已经取消了十八点四十分的定时试验，但辅助线路仍然带电，设备里积存的能量也还没释放完。现场水位继续上涨，损坏的隔离装置也无法可靠地切断电路；按常规办法慢慢降低设备负荷，要花更长时间，现场的情况已经不允许继续等了。
另一种办法是按维护手册，把剩余能量导入专门的耗能装置。这样能尽快解除带电风险，但配对组件会损坏报废，这组机器就再也收不到回声了。
高桥真由（通话）: 普通播出不依赖它。广播和研究用的线路，我们会分开检查。你们可以继续准备备用节目。
@SetExpression('work-alt-hesitant', 'reiko')
森田礼子: 如果等下一次负荷降下来——
设施负责人（通话）: 已有实测异常，不批准继续试验。执行紧急处置，人员撤出非作业范围。
由美在纸上记下“执行紧急处置”，推过来让凛复核。凛念了一遍，电话那头确认无误。
真由停了一会儿，复述了技术组要求她确认的资料版本。
高桥真由（通话）: 我确认。配对组件损毁后，这一组不能恢复。控制资料完整，按批准方案执行。
她的声音有些哑。凛等了一会儿，电话那头问还有没有问题。
神代凛: 我们这边要等哪份记录？昨天也收到过停机截图，我不敢只看那个了。
设施负责人（通话）: 现场核验记录。结果和禁入要求一起发，不以远程指示灯代替。完成前维持原封闭范围。
神代凛: 那普通广播还能照常播吗？外面还在下雨，春香的道路通知都准备好了。
高桥真由（通话）: 广播有独立线路。你们先用已经测试过的备用线路，研究设备不会接进它。
她说完，又请技术员确认了一次。电话里响起翻手册的声音，随后有人报了资料版本。真由把版本号重复给对方听，其中一个数字没听清，又问了一次才记下。
凛想起第一天见她，笔下很快就有了两条线。此刻电话里只剩翻纸声。她们等着，谁也没催。
高桥真由（通话）: 这一组用了五年。有几次我们以为可以多接到半秒，后来发现是记录采样时间的时钟走偏了。
真由说到一半停住，没有继续讲下去。
高桥真由（通话）: 抱歉。文件已经核对好了。我在现场配合，后续按设施方指令走。
由美答应，告诉她台里仍有人接电话，让她不用同时顾着解释广播的事。真由说好，结束了通话。
@Node('shutdown-mobile', { title: '先问清去哪里' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@SetExpression('pose-equipment-worried', 'mara')
电话结束，Mara 提起设备包。凛猛地抬头，正好与她目光相碰。
Mara: 去门口的转播车，由美跟我。接普通广播的线路，不进东堤。刚才说好的。
神代凛: 我知道。……我还是会怕。
Mara: 我也怕，所以今天不往那边去。手机开着，到了车上给你消息。
神代凛: 回来吃什么？
她像是没想到凛会问这个，随后低头拉好包扣。
@SetExpression('pose-equipment-soft', 'mara')
Mara: 有汤的。今天不吃冷饭。
@CharacterExit('mara', 'right', 260, { x: 700, y: 750, offset: 90, opacityFrom: 1, opacityTo: 1, easing: 'ease-in-out' }, true)
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-mobile-rain-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
Mara 踩过门外的积水，由美跟在旁边。凛看着两人上车，手机很快就震了一下。
@Node('shutdown-weather-copy', { title: '今晚要播的话' })
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('haruka', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
五点二十分，春香把天气稿送来。她删掉了一句从网上转来的灾情传闻，理由是尚未找到发布机关。
水野春香: 问了两个人，都说是转来的。源头还没找到，我先删了。
神代凛: 这个地方写上核实的公交改道。听众现在用得上。
水野春香: 好。今晚旧楼暂停来访那一条呢？
神代凛: 写明取录音和送材料都改约，别让人冒雨来。电话照常有人接。
春香在纸上改好路口的说法，却没有走。凛抬头，发现她正看着旁边那份录音记录。
水野春香: 如果今晚还有人问那段警报，我们要怎么答？
神代凛: 交由美处理。这份死讯不能当新闻播，录音里说的事在这里还没有发生。
水野春香: 我知道不能播。我是怕自己一紧张，说成我们已经知道会怎样。
她在凛对面坐下，将公开稿与内部问题清单分开。一张写今天已经确认的事，另一张留调查需要的记录。
凛看着公开稿上的署名。今晚仍由春香播报，和普通轮值一样。
神代凛: 昨晚那段里，是我的声音。听到以后，我一直在想为什么偏偏会是我。
春香没说可能只是听错。她望着凛，等了一会儿。
神代凛: 十八号我替你试过备用稿。那边如果人手不够，我也可能坐到话筒前。可具体发生了什么，录音没说，我不知道。
水野春香: 所以我们不能照着那份，把今晚的人和事都排一遍。
神代凛: 嗯。我们把已经能改的事做好，今晚你按这张核实过的稿子播。
她点头，将两张纸分别夹好。临走时，问凛能不能帮她听一句地名，怕临时换稿又读错。
凛接过耳机，听春香读完，说可以。春香这才呼了口气，接回耳机，说这句地名练了三次还是不放心。
凛低头整理移交记录，发现少了一页，又从头找起。
@Node('shutdown-complete', { title: '十七点五十分' })
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('haruka', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
十七点五十分，停机组发来正式完成通知。
两路电源都已按程序切断并隔离，设备里剩余的能量已处理完毕，机器本地保存的定时试验计划也已清除。这些结果都经过了现场独立核验。配对组件损毁，试验不再进行。禁入范围保留，等待后续检查。
车里的由美接进同一通电话，让现场人员重新念了一次关键结果，春香在凛旁边记下确认人的名字。凛听完，才把一直紧握的笔放下。
凛把完成通知打印出来，放到桌角。抬头看了一眼钟，又拿回来读了一遍。
凛把完整通知发给 Mara，问能否接收。Mara 很快回复，说还在车里，已经和由美一起核对过内容。
Mara（消息）: 再查一遍备用线路就回来。春香要的转接头也带上。
凛打出“快点”，拇指停在发送键上。隔着窗，能看见转播车还亮着灯。凛删掉那两个字。
神代凛（消息）: 好。回来一起吃。
屏幕上显示已读。凛没有再问剩几分钟，把手机放在打印纸旁边。
设施方又发来禁入范围图。虽然装置的风险已经解除，现场仍要继续检查，不能立刻开放。凛将图转给 Mara，请她按联络表通知维护班组，等收到回复才关掉窗口。
十八点四十分，雨比刚才大。没有验收启动的消息，也没有新的报警。
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@SetBackground('backgrounds/radio-studio-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'tired', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
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
她们吃的是便利店热汤和饭团。Mara 用纸巾包着烫手的碗，坐在凛旁边。
Mara: 你这份没有腌菜。
神代凛: 昨天已经帮你吃过了。
@SetExpression('smile', 'mara')
Mara: 只帮我吃一次啊。
她笑了一声，把饭团的包装撕开。凛靠着椅背，总算吃下了第一口。
走廊里有人来取最新的道路通知。Mara 起身指了指打印机，确认他拿到完整页才回来。
凛看着 Mara 坐下，没再问她刚才去了哪里。Mara 折起弄湿的袖口，发现汤碗外壁也湿着，又抽了张纸垫在下面。
神代凛: 早晨你说，以为自己说错了什么。
她的手停了一下。
Mara: 嗯。
神代凛: 昨晚那顿饭，我真的很开心。我还想再约你来着。后来不敢看你，是我一看见你，就想起那段录音。
@SetExpression('serious', 'mara')
Mara: 我现在知道了。可昨晚你连看都不看我……我还把吃饭时说过的话想了一遍。
神代凛: 对不起。
Mara: 今天你肯把名单拿给我，我才稍微放心一点。至少这回，我知道你在查什么了。
凛低头看自己的手。上午她伸手拦住工单时，根本没想过 Mara 会怎样理解。
神代凛: 我上午看见你拿工单，手就伸过去了。明明你只是要核对……
Mara: 你就说你害怕啊。我又不会因为这个笑你。别让我一直猜你是不是不想理我了。
神代凛: 嗯。
汤里的豆腐夹了两次都滑回去。Mara换过勺子，舀起一块，却没送到嘴边。
@SetExpression('hesitant', 'mara')
Mara: 我今天也没那么冷静。给第二班打电话以前，我先看了好几遍号码，怕报成自己的。
神代凛: 我就在旁边听着，没听出你报错。
@SetExpression('afraid', 'mara')
Mara: 那是写下来了。不是不怕。
凛推近纸巾盒。Mara 抽出一张，擦了两遍勺柄，才吃下那口已经不烫的豆腐。
两人各自吃了几口。凛偶尔抬头看钟，总会发现 Mara 也在看。
@SetExpression('relieved', 'mara')
十九点十二分，Mara 把饮料瓶递给凛。凛拿着没有拧，Mara 便又接过去，替她松开瓶盖。
Mara: 好了。
凛接过瓶子，手停在 Mara 手边。Mara 看了她一眼，等瓶子放稳，仍没有收回手。
神代凛: ……能牵一会儿吗？
Mara: 嗯。
@AnimationTimeline(350, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 350, 920, 'ease-in-out')
凛握住 Mara 的手。两人的指尖都沾着瓶上的水，湿湿的。Mara 又覆上另一只手，轻轻按住凛的手背。
隔间里，春香还在和由美确认节目稿。凛听着翻页声，低头看着两人握在一起的手。
神代凛: 我从刚才就一直看钟。明明停机通知都到了。
Mara: 我也是。吃饭的时候还看了一次。
神代凛: 现在你就坐在这里，我还是……
Mara: 嗯，我在。……你别松手，我还没缓过来。
@AnimationTimeline(420, true)
@Key('character:mara', 'position.x', 0, 920, 'ease-in-out')
@Key('character:mara', 'position.x', 420, 900, 'ease-in-out')
Mara 攥紧了些。凛想说好，眼泪却先掉了下来。Mara 向她挪近一点，问“抱一下？”，等她点了头，才伸出手。
Mara 靠过来，呼吸轻轻落在凛的肩边。凛抬手扶住她的背。直到春香来取文件，两人才分开，帮春香把最后一份确认单夹好。
@Node('shutdown-eight', { title: '普通节目照常' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-monitor-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'relieved', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
二十点，公众节目准时开始。
水野春香（公开广播）: 这里是海岸台。今晚先为您带来青叶市的降雨与道路信息。
旧返回线没有声音。接收端已经关闭，明天的节目不会提前到达。
凛打开昨夜保存的文件信息。长度一百八十秒，校验值没变。那句通报仍在那里。
文件还是昨晚那份。凛把它和通报的文字记录放在一起，移出今天的工作目录。
Mara 从旁边问，录音是不是还在。凛回答是，没有按下播放。
Mara: 先收起来吧。别在今天晚上反复听了。
神代凛: 好。我把调查用的原件留好。我们自己那份，等你想谈的时候再说。
Mara 帮忙收起硬盘，凛关了电脑。桌上那碗汤也已经凉了。
