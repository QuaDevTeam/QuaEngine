<script lang="ts">
import type { StoryScope } from '../story/prologue-state'
export interface Scope extends StoryScope {}
</script>

@Chapter('06', { title: '不用等到八点' })
@Scene('call-me-tomorrow-prologue')
@Node('chapter-06', { title: '暴雨中的两条战线' })
@Protagonist('rin')
@HideAllCharacters()
@SetBackground('backgrounds/relay-exterior-rain-anime-v3.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mayu', { expression: 'work-alt-serious', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十三日，下午三点十分。暴雨如注，海岬坡道两侧的排水明沟已经掀起了浑浊的白沫。
${scope.pick('formal-followup', '办妥了全套电子防伪备案与签收手续后，东堤中继站外围拉起了双层黄黑警戒线。', '办妥了第三方公证与双锁防潮铝箱铅封后，东堤中继站外围拉起了双层黄黑警戒线。')}
${scope.pick('formal-followup', '市役所安监课的专员将防伪备案表锁入公文包，市政抢险队的橘色工程车随即驶入后巷。', '市役所安监课的专员将贴好钢印封条的铅封箱搬上专车，市政抢险队的工程车随即驶入后巷。')}
青木由美撑着大黑伞站在防雨棚下，大声向正在指挥接地的真由确认步骤。
青木由美: 高桥工程师，下午五点五十硬拉短路泄能闸的时候，地下走廊里的弱电线必须全拔掉吗？
@SetExpression('work-alt-neutral', 'mayu')
高桥真由: 对！硬拉短路闸的那一瞬间，四千八百伏的储能环会在十秒内往深层接地网倾泻几千安培电流！
高桥真由: 到时候整条地下共用走廊的金属桥架上，都会因为电磁感应窜起上千伏的地电位反冲！
高桥真由: 不仅那条走廊里绝对不能留人，连你们电台走底下的铜芯音频线也必须在五点前彻底断开！
高桥真由: 否则反冲电流顺着屏蔽层倒灌进你们电台主楼，二楼导播台和整屋子的修复设备全得烧穿！
@SetExpression('pose-equipment-worried', 'mara')
听见这句话，站在旁边的 Mara 脸色一变，连忙翻开手里的全镇共鸣终端线路图。
Mara: 可是由美台长，我们通往全镇三百台定制收音终端与港区音柱的广播主干线，还走在这条地下走廊里啊！
Mara: 傍晚五点到八点正好是街坊们收工回家、守着收音机听晚间节目的最高峰——
Mara: 要是不把地下主干线改成独立隔离线，五点五十泄能时的强电磁反冲和次声波就会直接打进全镇三百台收音机里！
Mara: 可要是直接把主干线一拔了之，还没收到通知的老人和商户又会莫名其妙被断掉信号！
说着，Mara 咬紧下唇，目光不由自主地飘向了十米外那扇挂着铁锁的地下维护廊铁门。
@SetExpression('hesitant', 'mara')
Mara: 现在才三点一刻，离六点四十分的定时器点火还有三个多钟头呢……
Mara: 要不趁现在底下还没起火，我穿好绝缘靴冲进去，只要五分钟就能把二号物理隔离跳线改接出来！
神代凛: 不行！
青木由美: 绝对不行！
凛和由美几乎在同一秒厉声喝止。
凛一步跨上前，张开右臂严严实实地挡在了 Mara 与那扇墨绿色铁门之间。
神代凛: 谁也不准进那条地下走廊！你忘了吗，现在电缆沟里的积水已经漫到桥架底座了！
@SetExpression('neutral', 'mara')
神代凛: 哪怕不提六点四十分的定时测试，380 伏 的高压主铜排随时都可能对积水拉弧放电！
@SetExpression('hesitant', 'mara')
Mara: 我知道危险……可全镇街坊家里的收音终端总不能就这么暴露在反冲电流底下不管啊！
Mara: 鱼市的福田爷爷、甜品店的绘里小姐，还有那么多戴着助听耳机的老人家，全都开着我们的频道呢！
看着少女焦急泛红的眼眶，凛深吸一口气，脑海里飞快闪过这十几天走过的街巷与图纸。
下一秒，凛猛地转过身，抬手指向停在海岸台西侧前院高地上的那辆蓝白相间的五十铃移动广播车！
神代凛: 全镇的广播不会断，而且我们根本用不着下地窖去切那条隔离线！
@SetExpression('pose-equipment-soft', 'mara')
Mara 怔了一下，顺着凛手指的方向望去。
Mara: 咦？你是说……我们前院那辆移动广播车？
神代凛: 对！前天我跟你们去查蓝雨伞和移动广播联调的时候，特意看过西院墙外那根水泥分线杆！
神代凛: 通往全镇受试终端与港区音柱的架空总分线箱，根本不在地下走廊里，就在西侧前院外头的电线杆上！
神代凛: 地下走廊里走的那段，只是当年为了并入东堤低频驻波、从一楼机房绕去电线杆的引出线而已！
青木由美眼睛一亮，轻轻击了一下掌。
@SetExpression('neutral', 'yumi')
青木由美: 没错！三年前海音科技改建共鸣网的时候，就是从西院外头那只灰铁箱子往镇上拉的架空明线！
Mara 也一下子反应了过来，眼睛亮晶晶地接上了话头。
Mara: 我记起来了！那只灰铁分线箱离地面只有一米五，打开盖子就能直接插拔航空插头！
神代凛: 我们只要站在西侧前院的平地上，把从地下走廊引出来的旧主线插头拔掉、做绝缘封死；
神代凛: 然后从二楼窗户甩一根三十米同轴线下来，先接进广播车功放，再直接并进分线箱！
@SetExpression('calm', 'yumi')
青木由美: 这样一来，不仅把地下走廊那根可能倒灌高压电的旧铜线彻底物理切断了——
青木由美: 而且全程都在前院露天高地和二楼窗户之间作业，连地下室的台阶都不用踩半步！
@SetExpression('smile', 'mara')
高桥真由也长长舒了一口气，朝凛竖起了大拇指。
高桥真由: 神代小姐，你脑子转得真快！只要拔掉地下引出线，我五点五十拉闸就彻底没后顾之忧了！
青木由美: 好，全员都有！现在立刻回主楼换雨靴、搬防水电缆，四点半之前把地面新回路搭起来！

@Node('shutdown-plan', { title: '地面切线与决不踏入的禁区' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('haruka', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午三点四十分，二楼导播室外。三个人都已经换上了厚底防滑雨靴与荧光黄反光背心。
水野春香把两只刚刚充饱电的防爆对讲机塞进由美和 Mara 的口袋里，拍了拍胸口。
水野春香: 由美台长、神代前辈、Mara，二楼窗口那盘三十米的军规防水同轴线我已经顺下去了！
水野春香: 下午我一个人守在二楼直播间盯总控台，每隔十五分钟跟港务局和气象台核一次潮位！
青木由美: 好。春香，记住，四点四十五分我们剪断地下旧线的时候，你会看到主控台三号表头掉底。
@SetExpression('neutral', 'yumi')
青木由美: 等对讲机里喊“并机完成”，你再把推子切到五号外接同轴口，千万别推错了！
水野春香: 放心吧由美台长！我已经在五号推子上贴了三条红胶带，闭着眼睛都不会推错！
由美点点头，先拎着大号绝缘断线钳下楼去开前院侧门了。
走廊里只剩下凛和 Mara 两个人。
凛走到正在套绝缘手套的少女面前，伸出双手，替她把安全帽的下巴扣带仔细收紧了一格。
神代凛: 稍微低一点头，领口这颗防风扣还没系好，待会儿前院风大，雨水会往脖子里灌。
@SetExpression('blush', 'mara')
感受着凛温热的指尖擦过下颌，Mara 乖乖低下头，长长的睫毛轻轻颤了颤。
${scope.pick('admit-fear', '看着凛专注而紧绷的侧脸，Mara 想起早上凛坦白昨晚有多害怕的样子，心头一阵发软。', '看着凛专注而紧绷的侧脸，Mara 想起早上凛强忍发抖把录音放给她听的样子，心头一软。')}
神代凛: 东堤后巷和一楼通往地下走廊的两扇铁门，刚才安监课已经挂上双层大铁锁锁死了。
神代凛: 不管待会儿雨下得多大、哪怕分线箱那边遇到什么小麻烦，我们都只在前院地面上解决。
神代凛: 半步也不准靠近东侧的地下室入口，再跟我保证一次，好吗？
@SetExpression('smile', 'mara')
Mara 抬起头，琥珀色的眼睛清澈而认真，隔着厚厚的绝缘手套轻轻碰了碰凛的手背。
Mara: 我保证，凛。那条黑乎乎的地下走廊，我今天连看都不会多看一眼。
Mara: 整个下午我就在前院的移动广播车边上待着，一步也不离开你的视线——
Mara: 你只要一抬头，就肯定能看见我好端端地站在你身边！
神代凛: ……好。我们下去吧。

@Node('shutdown-mobile', { title: '狂风暴雨里的广播车' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-mobile-rain-anime-v3.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('mara', { expression: 'rain-serious', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午四点二十分，狂风裹挟着倾盆大雨，把前院老樟树的枝叶吹得哗哗作响。
在五十铃移动广播车的车尾遮雨棚下，青木由美打开了水泥电线杆上的灰铁分线箱。
凛单膝半跪在积水的石板地上，死死撑住一把大黑伞，替正在剥线的 Mara 挡住横飞的雨幕。
狂风一次次撞在伞面上，震得凛的虎口发麻，冰凉的雨水顺着她的后背往下淌，她却纹丝不动。
Mara: 凛！风是从西边斜着刮过来的，你的左肩膀和后背全都淋透了！
@SetExpression('rain-neutral', 'mara')
Mara: 快把伞往你自己那边挪一点呀，分线箱上头有小铁檐挡着呢！
神代凛: 我穿着双层冲锋衣，淋一点雨不要紧。
神代凛: 你手里的卡侬公头和车载功放接口绝对不能进水，一旦受潮短路，高音喇叭就会啸叫！
神代凛: 别管我，专心看手里的万用表——左声道屏蔽层压紧了没有？
@SetExpression('rain-hesitant', 'mara')
Mara 吸了吸鼻子，把眼角被风吹出来的水珠蹭在袖口上，手底下的剥线钳稳得没有半分偏差。
Mara: 左声道压紧了！接地测试完全正常！
神代凛: 我这边监听表已经收到二楼春香发来的试音信号了，左声道非常干净。
神代凛: 右声道还有一点点接触杂音，把二号防水螺母再顺时针拧紧半圈！
@SetExpression('rain-smile', 'mara')
Mara: 收到！顺时针半圈——拧死啦！双层丁基防水胶泥也彻底封严实啦！
青木由美: 干得漂亮！我现在拔掉地下走廊引上来的那根旧主线插头！
由美握住分线箱底部的黑色旧航空插头，用力一拧一拔，直接将它从母座上卸了下来！
紧接着，Mara 将从广播车功放引出的橙色防水跳线稳稳推入母座，“咔哒”一声锁紧了卡簧！
Mara: 地面新回路并机完成！春香，春香听见吗？把五号推子推上去试试！
对讲机里传来春香清脆的应答，下一秒，前院高处与山下街巷的收音终端同时传出了纯净清晰的播报声。
水野春香（广播）: 各位青叶港的街坊邻居请注意，这里是青叶海岸电台四点四十五分特别插播——
水野春香（广播）: 目前旧港北侧潮位平稳，东堤后巷因管线抢修实施临时交通管制，请往来车辆一律绕行滨海大道……
听着雨幕中彻底滤除了海音科技地下低频杂音、变得无比清澈温暖的广播声，由美重重挥了一下拳头。
@SetExpression('neutral', 'yumi')
青木由美: 通了！声音比以前走地下老线的时候还要亮堂！
由美拎起长柄黄色绝缘断线钳，对准那根从地下穿管引出来、已经拔掉插头的旧铜缆。
青木由美: 来，彻底断了它的念想，省得五点五十反冲电流顺着断头爬上来！
“咔嚓！咔嚓！”
两声清脆利落的金属咬合声后，断头被套上厚实的橡胶绝缘帽，严严实实封进了防水盒里。
神代凛: 地下引出线已经彻底物理截断。这下哪怕底下闹翻了天，也传不到地面分线箱半点电了。

@Node('shutdown-weather-copy', { title: '十七点五十分的熔断' })
@HideAllCharacters()
@SetBackground('backgrounds/relay-isolated-rain-anime-v3.webp', { transition: { type: 'crossfade', duration: 520 } })
@ShowCharacter('mayu', { expression: 'work-alt-serious', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'rain-serious', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
下午五点四十五分，雨势稍歇，天色却已经暗得如同傍晚。
在东堤中继站围墙外侧的安全区，两辆市政特种防爆负载车已经将碗口粗的接地铜排打入海滩岩层。
高桥真由用铁锤砸碎了红色防爆箱上的旧铅封，将那把长柄黄铜钥匙插进了“紧急短路泄能”锁孔里。
凛站在五米外的监测桌旁，录音机的屏幕上，依然跳动着那道代表地下高压运转的刺眼亮线。
神代凛: 五点四十八分。地下油冷泵和蓄电环的震动波还在持续。
Mara 站在凛身侧，双手紧紧握着胸前的对讲机，连大气都不敢喘。
@SetExpression('rain-hesitant', 'mara')
Mara: 高桥小姐……接地网和防爆断路器都已经自检完毕了，随时可以拉闸。
高桥真由的手掌搭在冰冷的红色拉杆上，隔着安全护目镜，深深看了一眼脚下这片她守了五年的海岸。
高桥真由: 五年零四个月……一千九百多个日夜的实验数据，全都在底下了。
高桥真由: 再见了，我的五号设备。
下午五点五十分整！
高桥真由没有任何犹豫，将黄铜钥匙拧到底，双手握住红色泄能拉杆，用尽全身力气往下一扳——
“轰——！！”
脚下的海岬岩层深处传来一声沉闷如雷的巨响！
紧接着，中继站北侧的防爆泄压百叶窗猛地喷出一股三米多高的乳白色水蒸气柱！
凛死死盯着面前的液晶屏幕。
原本在屏幕上耸立了十几个日夜的那根亮绿色震动波，在三秒钟内剧烈震颤了一下——
随后像被抽去脊梁的毒蛇一般，笔直地跌落进平缓的背景雨声里，消失得无影无踪！
@SetExpression('rain-serious', 'mara')
神代凛: 地底的震动波彻底消失了！底下的油冷泵和蓄电环全都停了！
@SetExpression('work-alt-smile', 'mayu')
@SetExpression('rain-teary-relief', 'mara')
高桥真由看着负载车仪表盘上跳出的绿字，脱力似地靠在防爆箱边，长长吐出一口白气。
高桥真由: 蓄电环残余电压：0.0 V！地下核心实验舱已彻底熔断！
高桥真由: 底下那座高危蓄电设备，从这一刻起彻底断电停机了！
Mara 一下子蹦了起来，带着哭腔抓住了凛的胳膊。
Mara: 凛！你听见了吗？！0.0 V！底下彻底没电了，再也不会起火了！！

@Node('shutdown-complete', { title: '空转的十八点四十分' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('haruka', { expression: 'smile', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'relieved', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'calm', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
傍晚六点三十八分，众人回到海岸台二楼导播室，围在实时传回的市政安全监控画面前。
虽然所有人都清楚底下的储能环已经在五点五十分彻底放空了电，但随着分针逼近“18:40”，房间里还是安静了下来。
神代凛: 六点三十九分五十秒……五十五秒……
墙上的电子钟跳成“18:40:00”。
在远端井口拾音器传回的音轨里，只听见断电的独立定时开关，靠纽扣电池发出一声微弱的“咔哒”声。
定时开关的金属触点在空荡荡、冷冰冰的铜排上合拢，却连半颗火星都没有溅出来。
没有 380 伏 的高压电弧，没有引燃电缆护套的滚滚浓烟，更没有刺耳的消防警铃。
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
凛、Mara、由美与真由四个人，最后一次围坐在东头那间挂着“RET-02”跳线盒的监听室里。
这一次，凛把便携录音机的输出接上了桌面小音箱，让屋里的每一个人都能直接听见。
高桥真由看着墙上的挂钟，轻轻开了口。
高桥真由: 七点五十九分五十秒。五号阵列的地下蓄能舱已经在五点五十分彻底断电熔毁了。
@SetExpression('work-alt-smile', 'mayu')
高桥真由: 按理说，今晚八点整，这条旧铜线上不会再有任何来自明天的回波信号了。
二十点整。
墙上的秒针稳稳跨过“12”的刻度。
桌面小音箱里没有传来熟悉的电流低鸣，也没有传来二十四小时后的节目垫乐与人声。
八点零一分、八点零二分、八点零三分。
整整三分钟里，音箱里只有均匀温和的铜线沙沙底噪，以及窗外轻柔的退潮海浪声。
凛静静凝视着那条平稳延展的绿色基线，在心底向那个未曾降临的黑暗未来轻轻道了一声谢。
那个在二十四小时后的浓烟与泪水里孤身守在话筒前的“神代凛”，终于随着这条归于寂静的铜线，融化在了今夜温润的海风里。
@SetExpression('smile', 'mara')
神代凛: 八点零三分过去了。
神代凛: 指针没有跳动，那阵怪异的低沉嗡鸣也彻底消失，二号返送线上再也没有来自明天的声音了。
@SetExpression('work-alt-smile', 'mayu')
高桥真由看着平直如水的频谱线，非但没有懊丧，反而如释重负地笑了起来。
高桥真由: 海底断层底下的意外驻波配对，终于彻底散干净了。
高桥真由: 从今往后，这根“RET-02”就只是一条再普通不过的老铜线了。
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
