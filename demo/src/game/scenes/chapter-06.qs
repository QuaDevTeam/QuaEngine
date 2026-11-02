<script lang="ts">
import type { StoryScope } from '../story/prologue-state'
export interface Scope extends StoryScope {}
</script>

@Chapter('06', { title: '不用等到八点' })
@Scene('call-me-tomorrow-prologue')
@Node('chapter-06', { title: '暴雨中的两条战线', scope: StoryScope })
@Protagonist('rin')
@HideAllCharacters()
@SetBackground('backgrounds/relay-exterior-rain-anime-v3.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mayu', { expression: 'work-alt-serious', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十三日，下午三点十分。
${scope.pick('formal-followup', '固定了全套电子哈希与现场记录后，东堤中继站外围拉起了双层警戒线。', '完成了全套原始证据的铅封保全后，东堤中继站外围拉起了双层警戒线。')}
青木由美: 高桥工程师，下午五点五十拉闸短路泄能的时候，地下走廊里的线必须全拔掉吗？
高桥真由: 对！短路泄能的那一瞬间，金属桥架上会窜起上千伏的地电位反冲！
高桥真由: 共用走廊里的电缆必须在五点前全拔掉，而且那时候绝对不能有人待在走廊里！
@SetExpression('pose-equipment-worried', 'mara')
Mara: 可是由美姐，咱们通往旧港区防灾喇叭的那根防汛广播主线，还走在这条地下走廊里啊！
Mara: 下午五点到八点正好是天文大潮最高峰，每隔半小时就得插播一次撤离通知——
Mara: 要是拔了地下主线，又没人能进走廊切二号备份口，三万多户人家今晚就听不见广播了！
Mara 咬紧嘴唇，眼神往地下走廊那扇铁门飘了过去。
Mara: 要不趁现在才三点一刻，我戴上防毒面具冲进去，五分钟就能把二号备份跳线改出来……
神代凛: 不行！
青木由美: 绝对不行！
凛一步跨上前，严严实实地挡在 Mara 和那扇铁门中间。
神代凛: 谁也不准进那条地下走廊！现在电缆沟里的水已经漫到桥架边上了，随时都会漏电！
Mara: 可旧港区的防汛喇叭总不能断掉不管啊……
神代凛: 防汛喇叭不会断，也根本用不着下地窖切线！
凛转过身，抬手指向停在电台西侧前院高地上的那辆五十铃移动广播车！
神代凛: 旧港区防汛喇叭的总分线箱根本不在地下走廊里，就在西边前院外头的水泥电线杆上！
@SetExpression('pose-equipment-soft', 'mara')
Mara: 啊，对哦！前天在市民中心联调的时候，春香才刚试过那辆广播车的车载功放！
神代凛: 我们只要在西边前院的地面上，把地下引出来的旧主线从分线箱里拔掉；
神代凛: 再从二楼直播间窗户甩一根架空线下来接进广播车功放，就能直接喂给防汛喇叭总网了！
青木由美: 全程都在院子地面和二楼明线上干活，半步都不用沾地下室的边！好，就这么办！

@Node('shutdown-plan', { title: '地面切线与决不踏入的禁区', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('haruka', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
众人换好雨靴与防水外套，在导播室外做最后的对表。
青木由美: 春香守在二楼直播间盯总控台，每隔十五分钟跟港务局对一次潮位。
水野春香: 明白！二楼窗口那盘三十米的防水同轴线我也已经放下去啦！
出发去前院前，凛走到戴着绝缘手套的 Mara 面前，双手替她把安全帽扣带勒紧了一格。
神代凛: 地下走廊两头的铁门，我已经让人挂上两道大铁锁锁死了。
神代凛: 不管待会儿雨下得多大，我们都只在前院广播车边上接线，半步也不靠近地下室，答应我？
@SetExpression('smile', 'mara')
Mara: 我答应你，凛。那条黑乎乎的地下走廊，我今天连看都不会多看一眼。
Mara: 我就在前院车边上待着，一步也不离开你的视线——你一抬头就能看见我！

@Node('shutdown-mobile', { title: '狂风暴雨里的广播车', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/radio-mobile-rain-anime-v3.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('mara', { expression: 'rain-serious', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
狂风裹着暴雨抽打着前院的石板地。
凛半跪在配电箱旁撑起大黑伞，替正在接线的 Mara 挡住横飞的雨水。
Mara: 凛，你后背全淋湿了，伞往你自己那边挪一点呀！
神代凛: 我套着防水冲锋衣没事，千万别让雨水溅进功放接口里！
神代凛: 一号线压紧了！左声道底噪 `-68.5dB`，右声道螺母再顺时针拧半圈！
@SetExpression('rain-smile', 'mara')
Mara: 拧死啦！防水胶泥也封好啦！凛，春香，准备并机——三、二、一，推上去！
前院高处的防汛喇叭里立刻传出了水野春香清晰响亮的播报声：
水野春香（广播）: 各位街坊邻居请注意，这里是青叶海岸电台五点整防汛应急插播……
青木由美: 通了！快，拿绝缘钳把地下走廊引出来的那几根旧铜线全剪断封死！
“咔嚓、咔嚓！”
神代凛: 旧铜线全剪断了！这下谁也不用再进那条地下走廊了！

@Node('shutdown-weather-copy', { title: '十七点五十分的熔断', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/relay-isolated-rain-anime-v3.webp', { transition: { type: 'crossfade', duration: 520 } })
@ShowCharacter('mayu', { expression: 'work-alt-serious', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'rain-serious', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午五点四十九分，高桥真由一个人站在防爆击发器前，手心里紧攥着那把黄铜钥匙。
神代凛: 频谱仪上，底下那道 120Hz 的油冷泵尖峰还在抖个不停。
Mara: 高桥姐……
高桥真由: 再见了，我的五号阵列。
五点五十分整，她把钥匙拧到底，一巴掌重重拍下了鲜红的紧急泄能按钮！
地底传来一声闷响，配电井排气窗猛地喷出一股三米高的白气！
频谱仪上那根 **120Hz 尖峰**在三秒内直直掉到底，彻底融进了哗哗的雨声里！
神代凛: 120Hz 的尖峰没了！油冷泵停了！
@SetExpression('work-alt-smile', 'mayu')
@SetExpression('rain-teary-relief', 'mara')
高桥真由: 储能环残余电压：`0.0V`！地下电缆沟彻底没电了！！

@Node('shutdown-complete', { title: '空转的十八点四十分', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('haruka', { expression: 'smile', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'relieved', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'calm', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
傍晚六点四十分，所有人都屏住呼吸盯着东堤方向的监控表盘。
早就彻底断了电的底层芯片，只在空荡荡的机柜里传出“咔哒”一声干巴巴的空响。
没有电弧，没有浓烟，也没有刺耳的消防警报。
水野春香: 六点四十五分过去啦！广播车信号稳稳当当，全城平平安安！
@SetExpression('smile', 'mara')
Mara: 太好啦，连后巷排水沟的水位也退下去一半了！
@SetExpression('neutral', 'yumi')
青木由美: 你们俩从下午一点就在大雨里跑前跑后，头发梢还在滴水呢。
青木由美: 剩下的晚班交给我和春香，你们快去小休息室换身干衣服、喝碗热姜汤！

@Node('shutdown-dinner', { title: '十九点十二分的双手', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/radio-breakroom-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'tired', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
小休息室里很安静，挂钟的分针正一格一格逼近“19:12”。
凛想拿桌上的柠檬水喝一口压压惊，发抖的右手却连着滑了三次，“啪”地把水瓶碰倒在桌上！
Mara: 凛……？
七点十二分整，Mara 坐到凛身边，伸出暖融融的双手紧紧包住了凛冰凉发抖的手指！
@HideAllCharacters()
@SetBackground('inserts/nineteen-twelve-hands.webp', { transition: { type: 'crossfade', duration: 650 } })
没有浓烟，也没有火光，只有暖黄壁灯下紧紧握在一起的两双手。
Mara: 凛，你抬头看钟。已经七点十二分啦。
神代凛: ……嗯。
Mara: 我好好地在这儿呢。你看，我的手是热乎的，喘气也是顺畅的，一口烟都没呛着。
Mara: 昨晚那个可怕的七点十二分，已经被你挡在门外头啦。
低头看着两人紧握的手，凛憋了一天一夜的眼泪终于大颗大颗砸在手背上。
@SetBackground('backgrounds/radio-breakroom-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'teary-relief', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@AnimationTimeline(420, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 420, 880, 'ease-in-out')
Mara 眼圈也红了，张开手臂一把将浑身发抖的凛搂进怀里。
Mara: 没事了，全都过去了……对不起啊凛，今天早上是我太凶了。
Mara: 我早上光顾着冲你发火，都不知道你昨晚一个人听见那段声音的时候有多害怕。
@SetExpression('relieved', 'mara')
Mara: 谢谢你昨晚没放过那声喘气，谢谢你今天留下来，把我留在了今天。
神代凛: ……只要你还好好地在这儿，就够了。

@Node('shutdown-eight', { title: '归于寂静的二十点整', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/radio-monitor-night-anime-v3.webp', { characterLighting: { ambient: [0.93, 0.96, 1.02], shade: { color: [0.88, 0.92, 1], from: [0.2, 0], to: [0.8, 1] } }, transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mayu', { expression: 'work-alt-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'calm', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
晚上八点整，大伙儿最后一次围在二号返送监听线前。
挂钟的秒针一格一格走过八点零一分、八点零二分，直到八点零三分。
神代凛: 八点零三分过去了……
神代凛: 耳机里只有 `-72dB` 的铜线底噪，再也没有明天的声音了。
@SetExpression('work-alt-smile', 'mayu')
高桥真由: 断层底下的配对彻底散了。从今往后，它就只是一根普普通通的老铜线了。
青木由美: 普普通通才好呢。广播嘛，本来就是放给今天活着的人听的。
@HideCharacter('mayu')
@HideCharacter('yumi')
由美和真由去前厅锁门后，Mara 歪过头，冲正在收录音机的凛笑了笑。
@SetExpression('smile', 'mara')
Mara: 凛，以后再也听不见明天的广播了，你会不会觉得有点可惜呀？
神代凛: 一点也不可惜。
神代凛: 从明天开始，明天会发生什么、你想跟我说什么，我都用自己的耳朵去听。
