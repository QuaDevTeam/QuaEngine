<script lang="ts">
import type { StoryScope } from '../story/prologue-state'
export interface Scope extends StoryScope {}
</script>

@Chapter('08', { title: '明天，请再一次呼唤我' })
@Scene('call-me-tomorrow-prologue')
@Node('epilogue', { title: '六月三十日的最后一播' })
@Protagonist('rin')
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-empty.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('haruka', { expression: 'neutral', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'neutral', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月三十日，星期日下午一点，海岬旧楼迎来了最后半天。
走廊两侧码满了贴着封条的搬家纸箱，连去茶水间的过道都窄了一半。
平时随手就能拿到的备用耳机架和防喷罩，此刻都收进了编号箱里。
四个人围在二号导播室里，做着傍晚告别直播前的最后一次设备联调。
青木由美: 备用发射机和市民中心那头的接收链路都通了，电平表也很稳。
@SetExpression('hesitant', 'haruka')
水野春香: 由美台长，新直播间的热线电话和短信平台公告，我放在整点报时后念吧？
青木由美: 嗯，把市民中心三楼的新地址和邮编念两遍，方便老听众记下来。
神代凛: 专题母带的二十四个分轨我已经导入主控台了，备用光盘也放在手边。
Mara: 监听耳机的四路分配器我也查过啦，今天下午绝对不会有一丝杂音！
水野春香: 太好啦，那我们趁开播前先把各自的耳机和话筒高度调到最舒服的位置。
神代凛: 一号话筒的防喷网刚才有点歪，我已经用内六角扳手重新旋紧了。
@SetExpression('smile', 'mara')
Mara: 二号副控台的提示灯我也擦得干干净净，连推子槽里的灰都吹过一遍啦。
青木由美: 辛苦你们两个了，离六点开播还有点时间，大家先喝口温水润润嗓子。
水野春香端起自己那只印着小海鸥的马克杯，对着隔音玻璃深呼吸了两次。
水野春香: 明明平时每天都要播两个钟头，怎么今天一想到是旧楼最后一期，手心又出汗了。
Mara: 春香别紧张，我和凛就在玻璃外头的副控台守着你，每一轨都会准时切进去的。
神代凛: 嗯，你只管像平时一样跟街坊们聊天就好，技术推子交给我们。
窗外的日影从西坡一点点滑向海面，转眼间，挂钟时针指向了傍晚六点整。
陪伴了青叶市三十三年的海岬旧楼，正式迎来了最后一场一小时告别直播。
门框上方的“ON AIR”红色灯箱亮起，暖融融的光映在导播室的玻璃窗上。
随着水野春香按下绿色播放键，直播间里首先流淌出二十秒清亮的海港晨音。
那是清晨渡轮悠长的汽笛、海水拍打木桩的轻响，以及掠过甲板的海鸥鸣叫。
@SetExpression('neutral', 'haruka')
水野春香: 各位听众朋友傍晚好，您现在听到的是技术助理 Mara 在白岛码头采录的晨音。
水野春香: 感谢声音修复师神代凛与 Mara 两个月来的整理，带大家重温三十年海港记忆。
隔着导播室的双层隔音玻璃，凛听见自己初到青叶港那天录下的环境声融进了电波。
那些在鱼市、坡道与防波堤采集的素材，如今已自然而然成了整座小城记忆的一部分。
坐在副控台前的 Mara 没有频频转头看凛的反应，而是专注地盯着电平表推起推子。
@SetExpression('smile', 'haruka')
水野春香: 下面这段来自去年八月《海风点歌台》的留言，是甜品店老板川岛老先生点给女儿的。
广播里缓缓传出川岛老爷子带着笑意的叮嘱声，紧接着是结尾那四秒温和的喘息声。
就在那四秒轻轻的呼吸声落下的瞬间，导播室墙上的热线指示绿灯忽然急促地闪了起来。
Mara 戴上一侧监听耳麦，按下接听键，压低声音熟练地应答。
Mara: 喂，您好，这里是青叶海岸电台导播室……咦，是甜品店的绘里小姐吗？！
@SetExpression('smile', 'mara')
电话那头传来带着鼻音的话语，Mara 一边认真倾听，一边飞快地在便签纸上记下两行字。
Mara: 嗯，那四秒钟是凛从原始开盘带末尾找回来接上去的……好，我下节目一定转告她！
Mara: 您别客气，老爷子当年录下那通电话的时候，心里一定也盼着您能听见这一段。
挂断外线电话后，Mara 摘下耳麦，转过头朝站在身后的凛轻轻点了点头。
神代凛: 是街角甜品店的小绘小姐打来的电话吗？
@SetExpression('teary-relief', 'mara')
Mara: 对呀，她说刚才正在店里收账，听见收音机里传出那四秒钟，眼泪一下子就掉下来了。
Mara: 她说自从老爷子过世以后，这还是头一回重新听见爸爸舍不得挂电话的呼吸声呢。
Mara: 她在电话里谢了你好几遍，说等我们路过商店街，一定要去吃她新烤的柠檬挞。
神代凛: 能让真正想念那段声音的人听见，这几周在资料室里花的时间就全都值了。
Mara: 嗯！刚才听见你第一天来台里录下的笑声放出来时，我心里也暖洋洋的。
随着舒缓的钢琴片尾曲缓缓响起，一小时的告别特辑走到了最后的尾声。
青木由美和水野春香并排坐在主麦克风前，面前摆着那份对过无数遍的最终台本。
@SetExpression('calm', 'yumi')
青木由美: 各位听众朋友，从一九八六年十月一号开播算起，这座旧楼已经陪大家走过了三十三年。
青木由美: 关于上周东堤中继站的设备隐患，市政厅已下令全面关停拆改，感谢街坊们的关心。
@SetExpression('smile', 'haruka')
水野春香: 从明天七月一号早上六点整开始，我们就要在市民中心三楼的新直播间跟大家见面啦！
青木由美: 无论直播间搬去哪里，只要海风还吹过青叶港，我们的电波就会一直陪在大家耳边。
水野春香: 感谢大家三十三年来的收听与陪伴，祝各位今晚好梦，我们明天早上六点见！
时针稳稳指向晚上七点整，由美伸手拉下红色的总控推子，门框上的灯箱慢慢暗了下去。
凛在主控电脑上按下保存键，将刚刚播完的《六月三十日最终播出版》完整封存进硬盘。

@Node('epilogue-locking-up', { title: '锁上旧楼的门' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-studio-empty.webp', { transition: { type: 'crossfade', duration: 400 } })
@ShowCharacter('mara', { expression: 'relieved', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
晚上七点四十分，送走第一辆装满核心机柜的搬家货车后，旧楼里安静得能听见回声。
青木由美在走廊口核对最后一箱异地备份硬盘的封条，水野春香则在整理七月头一周的值班表。
凛和 Mara 走进已经彻底搬空的资料室，借着走廊透进来的灯光做最后一次水电巡检。
原本摆满两百一十盘开盘带的木架如今空空荡荡，只留下一缕淡淡的防潮樟脑木香。
@HideAllCharacters()
@SetBackground('inserts/return-line-closeup.webp', { transition: { type: 'crossfade', duration: 450 } })
墙角踢脚线旁，那根曾经在雷雨夜传来未知讯号的二号返送监听线，已被剪断并封上了绝缘盖。
神代凛: 墙角那根二号返送监听线，今天下午电信局的老师傅已经彻底断电封进踢脚线里了。
Mara: 嗯，刚才师傅施工的时候我也去看了，线槽外头还结结实实打了防火封堵泥。
神代凛: 没有了那条老化的地下并线回路，以后再大的雷雨天，导播室也不会再串进奇怪的底噪了。
@SetBackground('backgrounds/radio-studio-empty.webp', { transition: { type: 'crossfade', duration: 400 } })
@ShowCharacter('mara', { expression: 'smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
Mara: 这样一来，它也能跟着这座辛苦了三十三年的老楼一起安心退休啦。
神代凛: 除湿机的电源总闸我已经拉下来了，窗户的防风插销也全都扣紧了。
走出资料室时，Mara 看见墙根还放着两箱旧刊物，下意识弯下腰想去抱。
@ShowCharacter('yumi', { expression: 'calm', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
青木由美走过来轻轻按住纸箱盖，温和地拦住了她。
青木由美: 别搬了 Mara，那几箱旧报刊已经预约了明早九点的货运班车，由搬家工人拉去市民中心。
青木由美: 今天属于你们两位的协助工作已经圆满完成了，把工具交还给春香，准备锁门去吃晚饭吧。
Mara 看了看贴着“明日承运”黄标签的纸箱，不好意思地拍了拍手上的灰尘。
Mara: 好，听由美台长的！那我今天就不抢搬家师傅的活儿啦。
凛将借用的螺丝刀与测电笔放回工具箱，提起自己早已收拾妥当的深灰色随身行李包。
@SetBackground('backgrounds/radio-exterior-night.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('yumi', { expression: 'calm', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'smile', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
夏夜的晚风拂过海岬台阶，四个人并排站在玄关屋檐下，抬头望着已经熄灭灯光的二楼窗户。
青木由美掏出那把磨得发亮的黄铜钥匙，插进锁孔，“咔哒、咔哒”两声锁上了旧楼的大门。
@SetExpression('neutral', 'yumi')
青木由美: 行了，都别站在台阶上垂头丧气的，明天一早六点新直播间还得准时开麦呢。
青木由美: 走，下坡去商店街的小食堂，今晚这顿庆功宴我私人掏腰包，想吃什么随便点！
@SetBackground('backgrounds/aoba-diner-evening.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('haruka', { expression: 'smile', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'blush', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
小食堂里热气腾腾，烤竹筴鱼与关东煮的香气混在一起，驱散了夜风的微凉。
水野春香: 老板，先来四份招牌烤鱼定食，再加一大盘炸鱿鱼圈和四瓶冰弹珠汽水！
青木由美: 慢点喊，锅里的关东煮萝卜和竹轮也给大家各盛一碗热乎的。
趁着由美和春香拿着塑封菜单讨论加菜的工夫，Mara 悄悄往凛身边凑了凑。
在红白格子桌布的遮掩下，Mara 伸出右手小指，轻轻勾住了凛放在膝头的小指。
@SetExpression('neutral', 'mara')
Mara: 凛，虽然今晚这顿是由美台长买单，不过等七月中旬你回来开说明会的时候——
Mara: 就轮到我以正式女朋友的身份，请你去码头吃最丰盛的海鲜刺身定食啦！
神代凛: 好，女朋友请的这顿饭我记下了，到时候我一定空着肚子下车。
@SetExpression('smile', 'mara')
Mara: 七月和八月我在市民中心值早班，你在东京把白川音像剩下的收尾项目做完，我们每隔两周就能见一面。
Mara: 明天早上八点那班回东京的高速巴士，我七点半去车站月台送你！
@HideAllCharacters()
@SetBackground('backgrounds/station-platform-day.webp', { transition: { type: 'crossfade', duration: 500 } })
@ShowCharacter('mara', { expression: 'leisure-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
七月一日清晨七点五十分，初夏的阳光洒在青叶市车站的露天月台上。
凛提着行李箱站在巴士车门旁，接过 Mara 一早买来的热罐装咖啡。
Mara: 路上要坐三个半钟头呢，到了东京站记得给我发条消息报平安。
神代凛: 嗯，市民中心新直播间的声学障板要是调试遇到问题，随时给我打电话。
Mara: 放心吧凛！两个礼拜后的周六，我们在市民中心说明会见！
巴士缓缓启动驶出站台，凛隔着车窗玻璃，一直望向月台上挥手的少女。

@Node('epilogue-july-meeting', { title: '七月的居民说明会' })
@HideAllCharacters()
@SetBackground('backgrounds/july-meeting-day.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mayu', { expression: 'work-alt-documents', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'calm', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
七月第二个周六上午九点半，凛如约从东京乘早班车赶回青叶市，走进市民中心二楼会议室。
长桌两侧坐满了东堤周边的二十多位居民代表，台前摆着厚厚一摞打印出来的检测底稿。
这场《东堤信号中继站安全整改与调查说明会》没有搞寒暄，一开场便直奔主题。
青木由美率先站起身，对着台下的五金店夫妇与老街坊们深深鞠了一躬。
青木由美: 首先，我代表海岸电台向东堤后巷的住户们郑重致歉。
@SetExpression('neutral', 'yumi')
青木由美: 六月中旬海音公司发来那份声称“低频震动纯属错觉”的失实回函时，我没核实就做了转达。
青木由美: 今天我们已经将更正声明发往市公报栏与所有受影响住户手中，彻底恢复街坊们的名誉。
台下的五金店老板娘揉了揉眼角，坦言自从二十三号停机后，后巷再也没嗡嗡响过了。
这半个月她总算能睡上整觉，但也担心设备会不会等风头过去又悄悄开机。
旁边的街坊们也纷纷开口，追问下大雨时后巷的排水格栅究竟由谁负责独立复查。
@SetExpression('work-alt-serious', 'mayu')
坐在中间的高桥真由站起身，将自己签过字的三份例外审批单与通道清扫记录投影在幕布上。
高桥真由: 各位街坊请看，这是我本人当时违规签字放行的临时跳线单与未复验交接表。
高桥真由: 六月二十二日至二十三日，该站因排水格栅堵塞与防火封堵缺失，确实发生了严重过热险情。
高桥真由: 至于森田课长此前出示的“安全绿灯截图”，经核查系后台脚本覆写。
高桥真由: 电台保留的原音通道表与录音记录，已证实当晚确实存在异常的地下带电结构嗡鸣。
@SetExpression('work-alt-neutral', 'mayu')
高桥真由: 市役所建设课已于昨日吊销该项目许可，所有地下设备将于八月二十五日前由第三方彻底拆除。
住在东堤坡下的老船长举手追问，要求拆除施工与排水沟改造绝不能再让海音自己人验收。
青木由美: 请大家放心，市政安全课已经指派了独立监理工程师，每次大雨过后都会公开排水复查记录。
神代凛: 我今天也带来了六月二十二日夜间的原始频谱图，街坊们若需留档核对，散会后可随时索取。
Mara: 市民中心三楼的新导播室也会保留专门的街坊投诉专线，有任何异响我们都会第一天现场核实！
听到这里，台下紧绷的气氛终于缓和下来，几位老住户在整改监督回执单上签下了名字。
@SetExpression('work-alt-smile', 'mayu')
散会后，居民们陆续离场，高桥真由收起桌上的文件袋，走到凛和 Mara 面前停下脚步。
高桥真由: 虽然背了停职处分，还得配合追责，不过把这些底稿亲口讲出来，我这半个月总算能睡踏实了。
高桥真由: 神代小姐，还有小 Mara，等九月份你们在东京安顿下来，我有空一定请你们喝杯咖啡。
神代凛: 谢谢您今天把所有技术细节公开讲清，高桥工，到时候东京见。
@HideCharacter('mayu')
@HideCharacter('yumi')
@SetBackground('backgrounds/harbor-walk-day.webp', { transition: { type: 'crossfade', duration: 450 } })
@ShowCharacter('mara', { expression: 'smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
从市民中心走出来，离 Mara 下午一点的值班还有两个钟头。
两人趁着正午的阳光，并肩沿着海风清爽的海滨步道慢慢散步。
在步道边的面馆吃完热腾腾的盐味拉面后，Mara 摸出手机点开购票软件递到凛面前。
Mara: 凛你看，九月二号早上八点十二分从青叶站发车的新干线，十点四十分就能到东京站！
神代凛: 你的车次和车厢号我早就置顶存在手机备忘录里了，那天我直接去十四号月台接你。
@SetExpression('serious', 'mara')
Mara: 嘿嘿，那今天下午我回市民中心上晚班，你回东京的路上注意安全，我们下下周见！
神代凛: 好，刚才你说请客的那顿海鲜刺身我还没忘，八月中旬我再来找你兑现。

@Node('epilogue-after-class', { title: '东京的秋雨与分线器' })
@HideAllCharacters()
@SetBackground('backgrounds/tokyo-neighborhood-rain.webp', { transition: { type: 'crossfade', duration: 600 } })
@ShowCharacter('mara', { expression: 'autumn-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
转眼到了九月下旬的周六傍晚，淅淅沥沥的秋雨将东京街头两侧的银杏树叶洗得发亮。
半小时前，正在上同期声实操课的 Mara 发来消息，说老教授讲得兴起要拖堂二十分钟。
凛便按照两人平时的默契，先在学校后街挑好了一家供应热汤定食的小饭馆。
看准下课时间后，她才撑着那把深蓝长伞，不疾不徐地走到专门学校的门廊下。
下课铃响后没过三分钟，围着暖色格纹围巾的少女便背着单肩包快步跑下了台阶。
@SetExpression('autumn-smile', 'mara')
Mara: 凛！幸好你按约定五点二十才过来，没在秋风里傻站着等我吧？
神代凛: 没有，我刚在独立工作室审完今天这批修复母带，顺路去后街看好了晚饭的位子。
凛伸手想去接她肩上的帆布包，Mara 却笑着侧身躲开。
她只把怀里抱着的轻便铝制麦克风盒递到了凛手里。
Mara: 讲义包我自己背就行啦，这只刚借出来的立体声电容麦归神代前辈帮我拿！
@SetExpression('autumn-neutral', 'mara')
Mara: 你不知道，实操课那个老教授一聊起六十年代的铝带麦就刹不住车，硬是拖堂了二十分钟。
神代凛: 铝带麦的瞬态响应确实很有味道，走吧，再不去小饭馆就要排长队了。
@SetBackground('backgrounds/tokyo-diner-evening.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'autumn-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
走进热气扑面的后街小饭馆，凛顺手把收拢的深蓝长伞立在了进门右手边伞桶的最里头。
点了两份姜汁烧肉定食后，Mara 捧着热玄米茶，聊起开学三周来的收获与苦恼。
Mara: 这礼拜的室内拟音课我拿到 A 评啦！老师夸我录的雨靴踩水声层次特别清楚。
Mara: 不过周四那堂多轨混音限幅练习我还是手忙脚乱，压缩器阈值一调快就容易把人声压扁。
神代凛: 刚开始用硬件压缩器都会这样，下周三晚上你要是没课，来我住处练两遍就顺手了。
正聊着，两人的手机同时震动了一下，屏幕上是青木由美从青叶港发来的近况简讯。
@SetExpression('autumn-relieved', 'mara')
Mara: ${scope.pick('formal-followup', '由美台长发消息说，东堤中继站的地面设备上周已经彻底拆除完毕，市政厅的善后结案书下个月初就寄出来啦！', '由美台长发消息说，东堤中继站的地下设备上周已经彻底清理完毕，市政厅的终审结案书下个月初就寄出来啦！')}
神代凛: ${scope.pick('formal-followup', '高桥小姐调去市政海洋声学研究所之后，听说还帮着重新设计了整条东堤后巷的防潮管网。', '高桥小姐调去市政海洋声学研究所之后，听说还亲自督工重铺了整条东堤后巷的宽口径排水管。')}
@SetExpression('autumn-smile', 'mara')
Mara: ${scope.pick('formal-followup', '而且东堤后巷的排水改造上周已经通过验收，五金店老板还给市民中心新台址送了一封手写感谢信呢！', '而且佐伯修船行门口再也不积水了，五金店老板还给市民中心新台址送了一封手写感谢信呢！')}
神代凛: 这样一来，青叶港那边的夏天就算画上圆满的句号了，先把手机收起来趁热吃饭吧。
神代凛: 对了，我六月份交的那份《地方消逝声景采录》资助申请，昨天收到初审通过的通知了。
Mara: 真的吗？！太棒了凛！我就知道你写的那份自述一定能打动评审委员！
神代凛: 只是过了初审，评委还提了两条修改意见，让我把夜间洗衣店那一段的环境过渡再剪紧凑一点。
@SetBackground('backgrounds/tokyo-neighborhood-rain.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'autumn-relieved', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
吃完晚饭走出小饭馆时，淅淅沥沥的秋雨已经停了，银杏公园的石板路映着澄澈的路灯光。
两人擦干长椅上的水珠并排坐下，凛从包里摸出那只熟悉的“一分二”分线器插在播放器上。
@HideAllCharacters()
@SetBackground('cg/shared-earbuds.webp', { transition: { type: 'crossfade', duration: 550 } })
就像六月在防波堤上那样，两人一人分戴一只耳机。
她们先靠在一起，听完了 Mara 这周录的《秋雨银杏》课堂作业。
神代凛: 立体声录得很干净，连雨滴打在银杏落叶上的微弱余音都收进去了……你进步真快，Mara。
接着，凛切换到自己昨晚刚剪好的《夜间自助洗衣店》修改版。
干衣机滚筒低沉而温暖的转动声，在两人的耳机里缓缓流淌。
录音接近尾声时，背景里忽然传来一声轻微而温柔的少女声音——
那是带着困意的一声轻语：“凛，这么晚还不睡呀，晚安。”
Mara 睁大眼睛转过头，耳根一下子红到了围巾边。
Mara: 欸？！这句不是上礼拜天我在你家留宿时，临睡前随口说的晚安吗！怎么被你剪进作品里了！
@SetBackground('backgrounds/tokyo-neighborhood-rain.webp', { transition: { type: 'crossfade', duration: 450 } })
@ShowCharacter('mara', { expression: 'autumn-blush', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
神代凛: 那天正好开着机器录窗外的夜雨，不小心把你这句也收进去了。
神代凛: 我听回放的时候觉得很温暖，就在给我们两个听的私人试听版里留着了。
神代凛: 不过下个月提交公开参展版之前，到底留不留这句，全听你的决定。
@AnimationTimeline(460, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 460, 900, 'ease-in-out')
@SetExpression('autumn-laugh-soft', 'mara')
Mara 把发烫的脸颊往格纹围巾里埋了埋，嘴角却翘得压都压不住。
Mara: 私人试听版就准你留着天天听！至于公开参展版嘛……等我回去再认真考虑三天再批准你！

@Node('epilogue-phone', { title: '忘在饭店的伞与晚安电话' })
@HideAllCharacters()
@SetBackground('backgrounds/tokyo-neighborhood-rain.webp', { transition: { type: 'crossfade', duration: 400 } })
@ShowCharacter('mara', { expression: 'autumn-laugh-soft', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
收好分线器与耳机，两人牵着手走到公园出口，顺便把春香刚发来的新节目链接存进手机。
正准备过马路往学生公寓走，凛下意识摸了摸空荡荡的右手——那把深蓝长伞又忘在小饭馆了。
看着凛忽然顿住的脚步，Mara 顺着她的目光望向空空的右手，顿时弯起眉眼笑出了声。
Mara: 我说神代前辈，两百一十盘老磁带你能闭着眼睛背出编号和采样率——
Mara: 怎么偏偏手里一把深蓝雨伞，从六月的青叶港到九月的东京，走哪里忘哪里呀？
神代凛: ……我没忘，我清清楚楚记得它就立在小饭馆进门右手边伞桶的最里头。
@SetExpression('autumn-smile', 'mara')
正好夜空又飘起了零星的细雨丝，Mara 从单肩包侧袋抽出自己的浅色折叠伞撑开举高。
Mara: 好啦好啦，知道我们凛记性最好了，快钻进我的折叠伞里来，我们回去把你的伞领回家！
@HideAllCharacters()
@SetBackground('inserts/two-blue-umbrellas.webp', { transition: { type: 'crossfade', duration: 500 } })
两人并肩挨在一把小小的折叠伞下折返后街，从笑着迎出来的老板娘手里领回了那把深蓝长伞。
@SetBackground('backgrounds/tokyo-neighborhood-rain.webp', { transition: { type: 'crossfade', duration: 450 } })
@ShowCharacter('mara', { expression: 'autumn-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
取回雨伞后，雨丝已经停歇，两人拎着各自收好的伞，慢悠悠走到了学生公寓暖黄色的门厅前。
眼看就要刷门禁卡进去，Mara 却停在台阶第一级上，仰起脸轻声叫住了她。
@SetExpression('autumn-shy-look-down', 'mara')
Mara: 凛，你稍微往我这边低一下头，好不好？
神代凛: 嗯？怎么了，是我围巾上沾了银杏树叶吗？
@SetExpression('autumn-blush', 'mara')
凛刚听话地低下头，站在台阶上的少女忽然踮起脚尖，飞快地在凛微凉的左嘴角亲了一下。
Mara: 树叶没有，这是奖励你今天特意带分线器来接我下课的！
神代凛: ……在学生公寓门口搞突然袭击，可是犯规的。
凛把刚找回来的深蓝长伞往门廊柱子边一靠，扶住少女的肩膀，低下头稳稳地吻住了她的嘴唇。
秋夜微凉的空气里，格纹围巾蹭过两人的脸颊，直到门厅自动感应灯闪了一下，两人才分开。
@SetExpression('autumn-serious', 'mara')
Mara: ……笨蛋凛，说好只亲一下的，快坐电车回去吧，到家洗完澡记得接我电话哦！
@HideAllCharacters()
@SetBackground('backgrounds/tokyo-room-night.webp', { transition: { type: 'crossfade', duration: 600 } })
晚上九点十五分，回到自己公寓洗完澡的凛刚拿毛巾擦干发梢，书桌上的手机便准时响了起来。
Mara（电话）: 凛，平安到家了吗？那把深蓝长伞，今晚总算跟着主人一起进家门了吧？
神代凛: 这次没落下，进门第一件事就是把它乖乖立在玄关的滴水盘里了。
Mara（电话）: 那就好！刚才春香发来的那期市民中心新节目，我们明早一边吃早饭一边连麦听好不好？
神代凛: 好，明天早上九点，我泡好热咖啡准时打给你。
电话那头忽然传来阳台窗户被风吹响的动静。
Mara 轻声说了句：“等我半分钟哦，我去把窗边晾干的衬衫收进来。”
听筒里只剩下少女走动的脚步声与衣架碰撞的细响。
凛没有催促，只是坐在床沿边，安安静静地握着手机等她回来。
半分钟后，电话那头重新响起少女温暖而踏实的呼吸声。
Mara（电话）: 衣服收好啦，久等啦凛！那我们明天早上九点电话里见，晚安。
神代凛: 嗯，夜里盖好被子，好好睡一觉，晚安，Mara。

@Node('epilogue-final-report', { title: '明天，请再一次呼唤我' })
@HideAllCharacters()
@SetBackground('backgrounds/tokyo-room-night.webp', { transition: { type: 'crossfade', duration: 600 } })
十一月中旬的周六下午四点半，深秋的暮色早早笼罩了东京安静的街巷。
刚交完期中混音作业的 Mara，拎着满满一袋超市食材按响了凛公寓的门铃。
一进玄关换好拖鞋，Mara 就看见矮桌正中央摆着一只盖着青叶市邮戳的厚牛皮纸公文袋。
Mara: 咦，桌上的牛皮纸袋是由美台长寄来的《东堤信号中继站调查终审报告》吗？
神代凛: 嗯，今天下午邮递员刚送到的挂号信，我特意留着等你过来一起拆。
Mara: 那我们先把袋子拆开看完，彻底跟那桩旧事道个别，再去厨房做晚饭吧！
@ShowCharacter('mara', { expression: 'autumn-serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@AnimationTimeline(400, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 400, 890, 'ease-in-out')
@Key('character:mara', 'position.y', 0, 750, 'ease-in-out')
@Key('character:mara', 'position.y', 400, 785, 'ease-in-out')
两人并排坐在矮桌前，凛用裁纸刀划开牛皮纸袋封口。
她从袋中抽出了那份盖着青叶市政厅与消防署印章的善后结案通报。
神代凛: 通报上写得很清楚，森田礼子因为隐瞒 B 路带电故障、伪造居民回函与违规强推过载测试，已被海音公司除名并移送追责。
神代凛: 高桥真由主动配合举证并完成了整座共鸣阵列的彻底拆解，目前已转入市政海洋声学研究所戴罪立功。
神代凛: 另外，后巷排水改建与老台周边管廊加固工程已于十月底全部竣工，专项调查确认现场无人员伤亡。
报告末尾附着一张十月下旬雨后回访的彩色照片。
曾经堆满杂物箱的后巷如今干净通畅，五金店二楼亮着温暖的灯光。
由美在附页便签上写道，五金店老板娘如今已经搬回原本的临街主卧。
现在的她，再也不用每逢夜里下大雨就提心吊胆地半夜惊醒了。
@SetExpression('autumn-neutral', 'mara')
看着结案书最后一页上的“现场无人员伤亡”字样，Mara 安静了片刻，轻轻开了口。
Mara: 凛，六月二十三号早上头一回听见那段起火录音的时候，我心里特别害怕，总在想是谁要害我。
Mara: 可今晚看完这份通报才明白，森田礼子当初在联单上画下红叉、禁止停机封堵的时候，压根就没想过隔壁电台会有谁值班。
Mara: 在她眼里只有那组非刷出来不可的满负荷测试曲线，和星期一早上十点的签字仪式。
神代凛: 嗯，比起针对某个人的恶意，这种为了数据与执念而对具体的人视而不见的傲慢，才是最让人后怕的地方。
神代凛: 好在那天晚上我们没有向那盏假绿灯妥协，而是把那个原本会出事的明天稳稳拦下来了。
@SetExpression('autumn-teary-relief', 'mara')
Mara: 噗，你快看信封底下的合照背面——
Mara: 由美台长和春香在上面写着“圣诞节记得带凛回青叶港吃大餐”呢！
神代凛: ${scope.pick('formal-followup', '由美台长在便签末尾还写了一句，说六月二十三日傍晚我们留下的那些加密音频副本，已经洗去涉密部分、转入市民声学档案馆作为安全警示教材了。', '由美台长在便签末尾还写了一句，说六月二十三日我们锁进铅封箱里的环境底噪母盘，已经完成历史使命、正式封存进市民声学档案馆了。')}
${scope.pick('formal-followup', '凛拿起牛皮纸袋正要收好，指尖忽然触到信封最底层还垫着一只淡蓝色信封与一盒磁带。', '凛把终审通报与合照整整齐齐收进文件夹归档，笼罩了她们一整个夏天的风雨终于彻底散尽。')}
${scope.pick('formal-followup', '透明磁带盒的标签贴纸上，用娟秀的字迹写着一行标题——《雨后的来信·致秋天的凛》。', '看着矮桌桌面重新变得清爽干净，Mara 拍了拍手掌站起身，眼睛亮晶晶地指向厨房购物袋。')}
@SetExpression('autumn-blush', 'mara')
Mara: ${scope.pick('formal-followup', '哇，由美台长居然真的把我八月底离开青叶港前寄存的这盒磁带，跟结案信一起寄来啦！', '好啦，从六月到十一月，那些让人提心吊胆的旧图纸和旧工单，今天终于全都翻篇啦！')}
神代凛: ${scope.pick('formal-followup', '八月底寄存在台里的磁带？你搬来东京之前，什么时候背着我偷偷录了一盒卡式磁带？', '嗯，旧图纸、声音展作品和母带都各归其位了，今晚剩下的时间全都属于我们自己。')}
Mara: ${scope.pick('formal-followup', '那是八月二十八号下午，青叶港下完最后一场夏雨之后，我一个人在白岛码头录下来的。', '凛大厨，快来看我刚才在超市精挑细选的北海道男爵土豆，今晚煮寿喜烧削三个够不够吃？')}
Mara: ${scope.pick('formal-followup', '因为六月份我们选了走正式调卷程序，案子要等好几个月才结案，我怕你到了秋天心里还一直替我紧绷着。', '还有这盒霜降牛肉片和春菊，超市阿姨看我挑得认真，还笑眯眯地多送了我两把金针菇呢！')}
Mara: ${scope.pick('formal-followup', '所以我那时候就跟由美台长约好，等十一月结案信寄出的那天，把这盒磁带随信寄给你。', '我先把春菊、香菇和金针菇洗干净摆盘，削男爵土豆和调寿喜烧酱汁的重任就交给你啦！')}
神代凛: ${scope.pick('formal-followup', '原来你从八月份就已经替我想到了今天……那我现在可以把这盒磁带放进卡座里听听看吗？', '三个男爵土豆刚刚好，省得某个小迷糊又把糖当成盐放，我今天特意在罐子外头贴好标签了。')}
@SetExpression('autumn-smile', 'mara')
Mara: ${scope.pick('formal-followup', '当然可以呀！不过光干坐着听可不行，我去厨房泡一壶热腾腾的肉桂苹果红茶端过来配着听！', '哎呀，我那就九月份刚来的时候失手过一回嘛，你怎么从初秋记仇记到十一月呀！')}
${scope.pick('formal-followup', '不一会儿，矮桌上飘起苹果红茶的甜香，凛将那盒透明磁带放进便携卡座，轻轻按下播放键。', '面对少女气鼓鼓的抗议，凛忍着笑意走进厨房，指了指料理台并排摆着的两只白瓷罐。')}
${scope.pick('formal-followup', '磁带先是沙沙转过两秒空白引导带，随后流淌出八月末青叶港雨后清脆的航标钟声与潮声。', 'Mara 挽起毛衣袖口跟进厨房，一眼就瞧见两只白瓷罐肚子上端端正正贴着的宽纸条。')}
${scope.pick('formal-followup', '那是只有雨过天晴、海面风平浪静时，才能在白岛栈桥尽头录到的干净立体声场。', '左边那只贴着凛用黑色记号笔手写的“盐”，右边那只则清清楚楚写着一个大大的“糖”字。')}
${scope.pick('formal-followup', '紧接着，磁带里传出了少女在海风中略带羞涩、却格外清晰的说话声。', '看着那两张堪比档案封条的醒目标签，Mara 扑哧一声笑了出来。')}
@SetExpression('autumn-laugh-soft', 'mara')
Mara: ${scope.pick('formal-followup', '“喂喂，试音一二三……秋天的神代凛小姐，当你听到这盒磁带时，青叶港的夏天一定已经圆满收尾了吧？”', '哼哼，贴得这么显眼，今晚我调寿喜烧酱汁要是再放错调料，就罚自己洗一个礼拜的碗！')}
Mara: ${scope.pick('formal-followup', '“其实六月二十三号那天傍晚，看见你握着水瓶连盖子都拧不开的时候，我心里酸得差点当场哭出来。”', '来，凛，这把削皮刀递给你，我们今天比赛看看谁先把各自手头的食材处理完！')}
${scope.pick('formal-followup', '磁带里的海风声轻轻起伏，少女的语速放慢下来，像是在对着麦克风认真整理思绪。', '看着凛熟练地削去男爵土豆的薄皮，Mara 一边在水槽边冲洗春菊，一边哼起了电台片头曲。')}
Mara: ${scope.pick('formal-followup', '“我知道你总是习惯把所有责任都背在自己肩上，哪怕过了那个夜晚，也一定会等看到最后的结案信才肯彻底安心。”', '凛，你看我今天切烤豆腐的刀工是不是比上个月整齐多了，每一块都是标标准准的四方块！')}
神代凛: ${scope.pick('formal-followup', '……傻瓜，只要每天能看见你活蹦乱跳地来找我吃晚饭，我早就已经安心了。', '确实切得很匀称，连魔芋丝结也绑得一个都没散开，看来这阵子周末特训很有成效。')}
@SetExpression('autumn-relieved', 'mara')
Mara: ${scope.pick('formal-followup', '“那时候你在药妆店答应我，心里害怕时不会再一个人硬扛，我也想为你做一件踏实的事。”', '那是当然，也不看看是谁每个周六都在这间小厨房里接受神代主厨的手把手指导！')}
Mara: ${scope.pick('formal-followup', '“所以我今天趁着雨过天晴，把青叶港最干净的钟声和海浪声录下来，装进信封寄给十一月的你。”', '对了，切剩下的这半根京葱我收进保鲜盒放冰箱了，留着明天周日早上给你煮味噌汤喝。')}
@SetExpression('autumn-shy-look-down', 'mara')
${scope.pick('formal-followup', '听到这里，矮桌旁的 Mara 不好意思地捧着茶杯把脸埋低了一半，磁带里的声音仍在继续。', '把切好的蔬菜拼盘端上客厅矮桌后，凛取出那口厚实的黑色铸铁浅锅架在卡式炉上。')}
Mara: ${scope.pick('formal-followup', '“我想告诉秋天的凛，你已经把所有委托都完成得不能再好了，不用再替任何人提心吊胆了。”', '火苗拧燃了，先把这一小块牛脂放进锅底化开，等京葱段煎出香味再下牛肉片吧！')}
Mara: ${scope.pick('formal-followup', '“如果在东京剪片子累了，你就把这盘带子倒回去听听海浪，我在每一个明天都会陪着你的。”', '哇，牛脂和京葱一碰上热锅底，整个屋子一下子就飘满寿喜烧店的味道了！')}
${scope.pick('formal-followup', '“啪嗒”一声轻响，磁带走到 A 面尽头自动弹起，房间里静悄悄的，只有苹果红茶袅袅的热气。', '滋啦一声轻响，霜降牛肉片下锅煎出诱人的焦香，凛随后淋入两人一起调好的甜酱汁。')}
神代凛: ${scope.pick('formal-followup', '……笨蛋，既然八月底就已经录好了这么温柔的话，怎么那时候不当面说，非要藏到十一月？', '把切好的男爵土豆、烤豆腐、香菇和魔芋丝顺着锅边码放整齐，盖上木盖焖煮五分钟。')}
@SetExpression('autumn-smile', 'mara')
Mara: ${scope.pick('formal-followup', '因为写在信纸上和录在磁带里的声音，是可以像档案一样保存一辈子的呀！', '矮桌上的铸铁浅锅很快咕嘟咕嘟冒起了甜香的白气，把客厅玻璃窗熏上了一层薄薄的白雾。')}
Mara: ${scope.pick('formal-followup', '再说了，要是八月底当面念给你听，我肯定念不到第三句就害羞得跑掉啦！', '哇，北海道男爵土豆在甜酱汁里滚过一圈，闻起来简直香得让人流口水！')}
神代凛: ${scope.pick('formal-followup', '那封淡蓝色信封里装的也是同天写下的信吗？我现在可以拆开看吗？', '味道差不多进去了，我先把卡式炉的火调小一格，免得底下的春菊和牛肉煮老了。')}
Mara: ${scope.pick('formal-followup', '嗯！信纸上是磁带里没来得及念完的后半截话，本来就是写给今晚的你看的。', '好呀！那第一筷子烤豆腐就由我来孝敬神代大厨，快把你的小碗递过来！')}
${scope.pick('formal-followup', '凛轻轻抽出信封里的两页棉纸信笺，上面除了一幅小灯塔插画，还写满了工整的字迹。', 'Mara 用公筷夹起一块吸饱了浓郁汤汁的烤豆腐，仔细吹了吹热气，稳稳放进凛的碗里。')}
${scope.pick('formal-followup', '信笺第一段记着八月二十八日白岛码头的风速、湿度，以及她使用的双电容麦型号与间距。', '凛夹起豆腐尝了一口，又夹了一块炖得绵密起沙的男爵土豆，满意地点了点头。')}
${scope.pick('formal-followup', '信笺第二段写着：“这是新晋搭档交的第一份独立外景作业，请凛收进私人典藏库。”', '窗外的深秋夜风轻轻拍打着窗框，屋里的暖黄灯光将两人的影子柔和地投在榻榻米上。')}
@SetExpression('autumn-laugh-soft', 'mara')
${scope.pick('formal-followup', '而在信笺最后一行，则端端正正写着：“谢谢你在六月听见了我的声音，以后换我每天叫醒你。”', '看着凛吃得眉眼舒展的模样，Mara 托着腮帮子，笑吟吟地开了口。')}
Mara: ${scope.pick('formal-followup', '怎么样，凛？这盘八月底录的雨后海港磁带，能拿到你的合格印章吗？', '嘿嘿，汤底的咸淡怎么样？今天调酱汁的时候，我可是认准白瓷罐上的字才下勺的！')}
神代凛: ${scope.pick('formal-followup', '电平很稳，雨后海浪的立体声相位也挑不出毛病……这是我今年收到过最珍贵的一盘母带。', '男爵土豆煮得粉粉糯糯的，边缘一点都没散，烤豆腐也刚刚好吸足了甜酱油的汤汁。')}
神代凛: ${scope.pick('formal-followup', '而且里面录进了这个世界上我最喜欢的声音，满分一百分的话，我给两百分。', '甜咸刚刚好，多一分太腻，少一分不够香，看来今晚的调味大厨确实功力大涨。')}
Mara: ${scope.pick('formal-followup', '嘿嘿，能拿到神代前辈的双倍满分鉴定，我那天在码头吹了两小时海风可算值啦！', '那是当然，也不看看我是跟谁练出来的！以后我们家的周末晚饭你就放心地交给我吧！')}
${scope.pick('formal-followup', '看着少女亮晶晶的琥珀色眼睛，凛伸手覆上她搭在膝头的手背，语气温柔而郑重。', '看着凛连吃了两块男爵土豆，Mara 得意地弯起琥珀色的眼睛，给自己也盛了一小碗热汤。')}
神代凛: ${scope.pick('formal-followup', '这封信和这盒磁带，我会跟那张手绘灯塔卡片放在一起，一辈子好好收在木盒里。', '对了，刚才由美台长在信里说圣诞节请我们回青叶港吃饭，你十二月下旬的考试周排出来了吗？')}
@SetExpression('autumn-neutral', 'mara')
Mara: ${scope.pick('formal-followup', '不止这一盘呢，等明年春天樱花开了，我还要再给你录一盘春天的来信！', '排出来啦！十二月二十三号下午考完最后一门声学基础，我们二十四号一早就能坐新干线回去！')}
神代凛: ${scope.pick('formal-followup', '好，那我就把木盒最上层的位置留出来，专门放你每年寄给我的声音档案。', '那我下周就把手头的排期空出二十四号和二十五号两天，顺便订好往返的车票。')}
${scope.pick('formal-followup', '凛珍重地将手写信与《雨后的来信》磁带收进私人木盒，随后拉起少女微凉的手走向厨房。', 'Mara 开心地晃了晃脑袋，又往浅锅里下了一把滑溜溜的乌冬面和剩下的牛肉片。')}
@AnimationTimeline(600, true)
@Key('character:mara', 'position.x', 0, 890, 'ease-in-out')
@Key('character:mara', 'position.x', 600, 1240, 'ease-in-out')
@Key('character:mara', 'position.y', 0, 785, 'ease-in-out')
@Key('character:mara', 'position.y', 600, 750, 'ease-in-out')
Mara: ${scope.pick('formal-followup', '好啦，信也读完啦，我的肚子已经咕噜咕噜叫了！快来看我买的北海道男爵土豆，我们做饭吧！', '下周六我还来给你做北海道奶油炖菜，到时候还要用这几个男爵土豆！')}
神代凛: ${scope.pick('formal-followup', '好，为了防止某个小迷糊又把白糖当成盐放，我今天特意在两只白瓷罐上贴好“盐”和“糖”了。', '好啊，不过下周六做奶油炖菜之前，先把今晚剩下的这半锅牛肉和乌冬面消灭干净吧。')}
@SetExpression('autumn-laugh-soft', 'mara')
Mara: ${scope.pick('formal-followup', '哎呀，我那就九月份失手过一回嘛！今晚的寿喜烧酱汁包在我身上，保证甜咸刚刚好！', '遵命！乌冬面吸饱了寿喜烧的甜汤，就算再吃两碗我也绝对吃得下！')}
${scope.pick('formal-followup', '两人并肩站在暖黄色的厨灯下削着男爵土豆，铸铁浅锅很快在矮桌上冒起了甜香的白气。', '两人围着热气腾腾的铸铁浅锅说说笑笑，窗玻璃上的白雾越积越厚，将秋夜映得格外温柔。')}
${scope.pick('formal-followup', 'Mara 夹起一块吸饱汤汁的烤豆腐吹了吹递进凛碗里，窗玻璃上的薄雾将秋夜映得格外温柔。', '吃完最后一口滑溜溜的乌冬面，两人一起端着碗盘走进厨房，用温水把餐具冲洗干净。')}
${scope.pick('formal-followup', '热气腾腾的寿喜烧驱散了十一月的寒意，两人一边分吃着男爵土豆，一边聊着圣诞节回青叶港的计划。', '擦干料理台的水渍后，凛拿起挂在玄关衣帽架上的风衣外套，准备送 Mara 去电车站。')}
Mara: ${scope.pick('formal-followup', '凛，等十二月二十四号我们坐新干线回青叶港，先去甜品店找绘里小姐买柠檬挞，再去市民中心看大家！', '凛，今晚的寿喜烧吃得好饱呀，正好我们可以慢悠悠散步去车站消消食！')}
神代凛: ${scope.pick('formal-followup', '嗯，我下周就把平安夜和圣诞节的年假申请交上去，订好靠窗的并排座位。', '外头夜风凉，把你那条格纹围巾再绕一圈围好，我们慢慢走过去。')}
${scope.pick('formal-followup', '吃完最后一口乌冬面，两人一起收拾好碗筷，牵着手走进深秋清爽的夜色里往车站走去。', '深秋夜晚的街道安静而清爽，两人在车站月台上拥抱道别，约好了明天周日早上的通话时间。')}
@HideAllCharacters()
@SetBackground('backgrounds/tokyo-room-night.webp', { transition: { type: 'crossfade', duration: 600 } })
吃过热乎乎的寿喜烧、把 Mara 送上回学生公寓的电车后。
晚上九点半，床头柜上的手机准时响了起来。
Mara（电话）: 凛，我已经平安刷卡进宿舍楼啦！刚才煮寿喜烧那口铸铁锅，你乖乖放温水泡上了没有？
神代凛: ……我现在、立刻、马上就去厨房放温水泡上。
电话那头传来一阵清脆的笑声，随后少女的声音在秋夜的安静里放得又轻又暖。
Mara（电话）: 凛，明天是礼拜天，我们俩都不用早起赶电车去学校和工作室。
Mara（电话）: 不过……明天早上你睡醒睁开眼的时候——
Mara（电话）: 还能像平时一样，再给我打个电话、叫我起床吗？
凛看着玄关滴水盘里的深蓝雨伞和厨房台面上的两只白瓷罐，嘴角不自觉地弯了起来。
她再也不需要那根跨越二十四小时的返送监听线了。
因为她最珍惜的人，已经稳稳当当地留在了每一个触手可及的明天里。
神代凛: 好。明天一早醒来，我再叫你的名字。晚安，Mara。
Mara（电话）: 晚安，凛。明天早上电话里见，我们明天见。
