<script lang="ts">
import type { StoryScope } from '../story/prologue-state'
export interface Scope extends StoryScope {}
</script>

@Chapter('06', { title: '不用等到八点' })
@Scene('call-me-tomorrow-prologue')
@Node('shutdown-valve-release', { title: '归零的仪表盘' })
@Protagonist('rin')
“当啷——咔嚓！！”
伴随着一声震彻后巷的金属脱扣脆响，卡死的二号联锁插销应声弹开！
地下深处传来第二声低沉的闷响，残余的高压电能顺着深层接地铜排瞬间倾泻入海床岩层！
凛死死盯着面前的波形屏幕。
原本在屏幕上剧烈跳动的那道闷啸尖峰与亮绿色震动波，在两秒钟内剧烈一颤——
随后像被彻底斩断脊梁的毒蛇一般，笔直地跌落进平缓的背景雨声里，化作一条安静的水平线！
神代凛: 水壶闷啸声消失！地底的震动波彻底归零了！
@SetExpression('work-alt-smile', 'mayu')
@SetExpression('rain-teary-relief', 'mara')
高桥真由抹了一把护目镜上的雾水，看着负载车仪表盘上终于跳出的翠绿数字，脱力似地靠在防爆箱边长长吐出一口白气。
高桥真由: 蓄电环残余电压：0.0 V！地下主副线路及核心实验舱已彻底熔断！
高桥真由: 神代小姐，要不是你隔着白雾听出二号铁管里憋死的闷啸声，刚才那九十秒可就全完了！
Mara 一下子蹦了起来，带着哭腔抓住了凛还在滴水的冲锋衣胳膊。
Mara: 凛！你听见了吗？！0.0 V！底下彻底没电了，再也不会起火了！！

@Node('shutdown-complete', { title: '空转的十八点四十分' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('haruka', { expression: 'smile', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'relieved', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'calm', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
傍晚六点三十八分，众人回到海岸台二楼导播室，围在实时传回的市政安全监控画面前。
虽然所有人都清楚底下的蓄电环已经在五点五十分彻底放空了电，但随着分针逼近“18:40”，房间里还是安静了下来。
神代凛: 六点三十九分五十秒……五十五秒……
墙上的电子钟跳成“18:40:00”。
在远端井口传回的监听音轨里，只听见断电的独立定时开关，靠纽扣电池发出一声微弱的“咔哒”声。
定时开关的金属触点在空荡荡、冷冰冰的铜排上合拢，却连半颗火星都没有溅出来。
没有刺目的高压电弧，没有引燃电缆外皮的滚滚浓烟，更没有刺耳的消防警铃。
监控画面里的地下维护廊安安静静，连排风扇都在平稳地运转着。
水野春香盯着屏幕看了整整一分钟，直到挂钟跳到六点四十二分，才欢呼一声跳了起来。
@SetExpression('neutral', 'haruka')
水野春香: 耶——！六点四十分平平安安过去啦！
水野春香: 连半缕烟都没冒！我们的移动广播车信号也是满格，六点半那档晚间特别简报刚顺利播完！
@SetExpression('pose-tea', 'mara')
Mara 捧着热麦茶，眉眼弯弯地看向窗外渐歇的雨幕。
Mara: 太好啦！市政工程队刚才发消息说，后巷排水渠的淤泥也清通了，积水已经退下去一大半啦！
@SetExpression('neutral', 'yumi')
青木由美看着并排站在一起的凛和 Mara，原本紧绷了一整天的眉宇终于舒展开来。
青木由美: 你们两个小功臣，从中午十二点半到现在，在雨里来回跑了快六个钟头了。
青木由美: 看看你们俩，冲锋衣袖口还在往下滴水呢，嘴唇都冻白了。
青木由美: 剩下的晚间整点播报有我和春香盯着，你们俩现在立刻去一楼小休息室换身干爽衣裳！
水野春香: 对对对，我在休息室的小电锅里煮了蜂蜜生姜汤，还热着两盒便利店的关东煮呢！
@SetExpression('serious', 'haruka')
水野春香: 快去喝碗热汤暖暖身子，等八点整再去监听室做最后一次确认！

@Node('shutdown-dinner', { title: '十九点十二分的双手' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-breakroom-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'tired', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
换下湿透的防雨外套后，一楼小休息室里只开了一盏暖黄色的壁灯。
窗外的雨声已经化作了温柔的淅沥声，小电锅里的生姜汤冒着丝丝缕缕的热气。
然而随着墙上那只圆盘挂钟的分针一格一格走过“19:08”、“19:10”，凛却觉得自己的心跳越来越快。
${scope.pick('walk-lighthouse', '她摸了摸透明手机壳背面那张画着歪歪扭扭灯塔的便签纸，耳边却总挥之不去昨晚录音里那声绝望的抽气声。', '她看着坐在对面正小口吹着热生姜汤的少女，耳边却总挥之不去昨晚录音里那声绝望的抽气声。')}
七点十一分。
凛觉得嗓子干得发紧，伸出右手想去拿小圆桌上的柠檬水喝一口。
可她的右手却不受控制地剧烈颤抖着，连拧了三次瓶盖都没拧开，“啪”地把水瓶碰倒在桌上！
@SetExpression('hesitant', 'mara')
Mara: 凛……？
听见动静的 Mara 放下汤碗，一抬头就看见了凛苍白的脸色，以及那只按在桌沿上发抖的右手。
墙上的挂钟分针，轻轻巧巧地跳到了“19:12”。
就在这一秒，Mara 走到凛身旁坐下，伸出被生姜汤烘得暖融融的双手，紧紧包住了凛冰凉颤抖的十指！
@HideAllCharacters()
@SetBackground('inserts/nineteen-twelve-hands.webp', { transition: { type: 'crossfade', duration: 650 } })
没有刺鼻的黑烟，没有拍打铁门的绝望闷响，也没有渐渐微弱下去的呼吸。
只有暖黄色壁灯下，一双温暖柔软的手，将另一双冰冷发抖的手严严实实地拢在掌心里。
Mara: 凛，别低着头……你抬头看看墙上的钟。
神代凛: ……七点，十二分了。
Mara: 对呀，已经七点十二分啦。
Mara 把凛的手指贴在自己温热的脸颊边，声音轻柔得像初夏夜里的海风。
Mara: 你摸摸看，我的脸是热乎的，我的手也是热乎的。
Mara: 我就好好地坐在青叶海岸电台的一楼休息室里，一口烟都没呛着，连一根头发都没少。
Mara: 昨晚你在耳机里听见的那个可怕的七点十二分，已经被你死死拦在今天门外头啦。
感受着少女掌心传来的真实温度，还有脉搏在指腹下平稳有力的跳动——
从昨晚八点三十五分起一直死死绷在凛心口的那根弦，终于“啪”地一声松开了。
向来在任何人面前都冷静克制的东京工程师，低下头，滚烫的眼泪大颗大颗砸在了两人交握的手背上。
@SetBackground('backgrounds/radio-breakroom-night-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'teary-relief', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@AnimationTimeline(420, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 420, 880, 'ease-in-out')
看着凛无声滑落的眼泪，Mara 的眼圈也一下子红透了。
她往前挪了半步，张开双臂，把坐在椅子上轻轻发抖的凛整个人揽进了自己怀里。
Mara: 没事了，凛，全都已经过去了……
Mara: 对不起，今天早上八点半在资料室的时候，是我太凶了，说了那么多伤人的重话。
Mara: 我早上光顾着气你把钥匙藏起来、把我当成小孩子瞒着——
@SetExpression('afraid', 'mara')
Mara: 直到刚才看见你连瓶盖都拧不开，我才明白，昨晚你一个人听完那段声音时，到底有多害怕……
凛把额头抵在少女带着淡淡柑橘香气的肩窝里，声音闷闷地发颤。
神代凛: 我真的怕极了……Mara。
神代凛: 昨晚把人声分离出来的那一刻，我甚至宁可自己从来没学过音频修复，宁可自己是个聋子……
神代凛: 我一闭上眼睛，就觉得要是今天哪怕漏掉一个细节，我就再也听不见你叫我的名字了。
@SetExpression('relieved', 'mara')
Mara 一手紧紧环着凛的后背，一手一下一下轻轻顺着她微潮的黑发。
Mara: 可正因为你是全世界最厉害的音频修复师，才在三分钟的杂音里听出了那半秒被电流声盖住的抽气声呀。
Mara: 谢谢你昨晚没有放过那一点点违和感，也谢谢你今天顶着大雨留下来。
Mara: 是你把我留在了今天，凛。
在温暖安静的休息室里，两人静静相拥了好久，直到挂钟的分针慢慢走过了七点半。

@Node('shutdown-eight', { title: '归于寂静的二十点整' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-monitor-night-anime-v3.webp', { characterLighting: { ambient: [0.93, 0.96, 1.02], shade: { color: [0.88, 0.92, 1], from: [0.2, 0], to: [0.8, 1] } }, transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mayu', { expression: 'work-alt-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'calm', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
晚上七点五十八分，雨彻底停了。
凛、Mara、由美与真由四个人，最后一次围坐在东头那间挂着二号旧铁盒的监听室里。
这一次，凛把便携录音机的输出接上了桌面小音箱，让屋里的每一个人都能直接听见。
高桥真由看着墙上的挂钟，轻轻开了口。
高桥真由: 七点五十九分五十秒。五号阵列的地下蓄电舱已经在五点五十分彻底断电熔毁了。
@SetExpression('work-alt-smile', 'mayu')
高桥真由: 按理说，今晚八点整，这条旧铜线上不会再有任何来自明天的回波信号了。
二十点整。
墙上的秒针稳稳跨过“12”的刻度。
桌面小音箱里没有传来熟悉的电流低鸣，也没有传来二十四小时后的节目垫乐与人声。
八点零一分、八点零二分、八点零三分。
整整三分钟里，音箱里只有均匀温和的铜线沙沙底噪，以及窗外轻柔的退潮海浪声。
凛静静凝视着那条平稳延展的绿色基线，在心底向那个未曾降临的黑暗未来轻轻道了一声谢。
那个曾在浓烟与泪水里孤身守着话筒的“神代凛”，终于随着这条归于寂静的铜线，融化在了今夜温润的海风里。
@SetExpression('smile', 'mara')
神代凛: 八点零三分过去了。
神代凛: 指针没有跳动，那阵怪异的低沉嗡鸣也彻底消失，二号旧铜线上再也没有来自明天的声音了。
@SetExpression('work-alt-smile', 'mayu')
高桥真由看着平直如水的波形线，非但没有懊丧，反而如释重负地笑了起来。
高桥真由: 海底断层底下的意外共鸣通道，终于彻底散干净了。
高桥真由: 从今往后，墙角这根二号旧铜线就只是一条再普通不过的老电话线了。
青木由美端起茶杯抿了一口，唇角泛起温和的笑意。
青木由美: 普通才好呢。我们做广播的人，本来就该把今天的话好好说给今天的人听。
@SetExpression('serious', 'yumi')
青木由美: 走吧高桥工程师，市役所的职员还在前厅等我们签最后一份收队确认单呢。
@HideCharacter('mayu')
@HideCharacter('yumi')
由美和真由并肩走出监听室后，屋里只剩下了昏黄的台灯与正在收拾跳线的两人。
凛拔下那只陪伴了她们整整十二个夜晚的“一分二”金属耳机分线器，轻轻放回绒布袋里。
@SetExpression('smile', 'mara')
Mara 歪过脑袋，看着凛细致绕线的手指，笑盈盈地轻声向她搭话。
Mara: 凛，以后每天晚上八点，我们再也听不见明天的广播了，你会不会觉得有一点点可惜呀？
凛停下绕线的手，抬起眼眸望向眼前的少女，嘴角浮起一抹无比柔和的笑意。
神代凛: 一点也不可惜。
神代凛: 因为从今天晚上八点零三分开始，每一个明天都是崭新的、还没有被写下来的明天。
神代凛: 明天会是什么天气、你想跟我说什么话，我都不想再从冷冰冰的录音文件里提前偷听了——
神代凛: 我想留在你身边，用我自己的耳朵，在每一个明天里亲耳听你说。
@SetExpression('blush', 'mara')
台灯柔和的光晕下，Mara 白皙的耳尖微微泛红，眉眼弯成了两道温柔的月牙。
Mara: ……嗯！那从明天早上开始，我每天都要跟你说好多好多话，你可不准嫌我吵哦，凛！
窗外云收雨歇，一轮清亮的夏夜月光穿过云层，静静洒在了雨过天晴的青叶海湾上。
