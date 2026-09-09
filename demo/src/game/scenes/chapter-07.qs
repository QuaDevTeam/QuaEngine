<script lang="ts">
import type { StoryScope } from '../story/prologue-state'
export interface Scope extends StoryScope {}
</script>

@Chapter('07', { title: '下一次约会' })
@Scene('call-me-tomorrow-prologue')
@Node('chapter-07', { title: '下一次约会' })
@Protagonist('rin')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十四日，上午。海岸台的打印机又卡纸了。
昨天所有人都很小心地对待设备，今天 Mara 蹲在它前面，一边按说明拉出纸盒，一边抱怨它只会在有急件时选择休息。
神代凛: 没急件的时候卡纸，你也没这么生气。
@SetExpression('smile', 'mara')
Mara: 你到底帮谁？把那包纸递给我。
她取出皱纸，重新打印停工通知。出纸口慢慢送出来半页，她蹲着不动，直到整张出来。
由美说明今天的分工。需要补笔录，核对移交回执，还要继续搬家。由美把午饭以后的格子都划空，叫她们接电话时把能到场的时间说清楚。昨天临时加出的工时另记，今天只做约好的晨间说明，之后补休。
真由通过正式渠道提交了说明，将自己接受修复报告、没有到场复验的经过一并写进去。
她来台里归还访客证时，在门口叫住了凛。证件摘下后，绳子还攥在她手里。
@ShowCharacter('mayu', { expression: 'neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@CharacterEnter('mayu', 'right', 280, { x: 960, y: 750, offset: 70, easing: 'easeOutCubic' }, true)
高桥真由: 十七号那段录音，还要麻烦你再留一份。调查人员问到了。
神代凛: 还在。我把当时的照片一起给你。
高桥真由: 好。我也写了，十七号列进复检，二十号又用旧报告结案了。两次都没有现场测量。
Mara: 他们要问那天的事，我也去。泵声一直没停，我在旁边听见了。
调查人员在隔壁核对礼子交来的材料。轮到凛补说明时，桌上还摊着费用和签字记录，礼子正逐页回答哪些是自己批准的。
${scope.pick('formal-followup', '审批附件还在公司。调查人员按保留的副本和清单一项项申请调取，由美说收到之前，有几处暂时没法往下查。', '调查人员开始核对封存的附件，几次来问邮件里的缩写。春香翻出当时的联系人表，逐个打电话确认。')}
春香问最后一期节目能不能介绍设备停用。由美说可以播核实后的公共信息，责任还没查清的先不写。春香拿起笔，问旧录音怎么处理。
@ShowCharacter('haruka', { expression: 'neutral', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@CharacterEnter('haruka', 'right', 280, { x: 1440, y: 750, offset: 70, easing: 'easeOutCubic' }, true)
水野春香: 那份死亡录音呢？
青木由美: 先问她们两个。调查要用，走资料借阅的手续，节目里别放。
春香把提及录音的草稿移到资料夹，公开稿只留下设备停用与已核实的公共信息，又拿来给由美确认。
@Node('daily-next-day-shopping', { title: '只买洗发水' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十四日，下午。
午饭以后，由美让她们按排班休息。需要补充的说明已经各自提交，下一次核对在明天，不用几个人一起守着电话。
凛坐在资料室里，打开一份准备交付的目录，看了半页，又回到第一行。
Mara 在门口喊了凛的名字。她换掉工作用的包，手里只拿着手机和零钱袋。
Mara: 我要去买洗发水。一起吗？
神代凛: 台里要带什么？
Mara: 不带。我的用完了。
凛点头，合上电脑。Mara 往外走了半步，又停下来等她拿好包。
街上已经没有昨晚那么多积水，店主们在门口刷地。凛小心绕过一片还没干的地面，Mara 在前面推开药妆店的门。
门铃响起，Mara 回头看了一眼。凛愣了愣，才跟进店里。
洗发水在最里面。Mara 找到平时用的那种，发现只剩大瓶，拿起来看价格，嘀咕怎么没有替换装。
凛原想说大瓶也可以，见 Mara 盯着手里的小包，便改问另一排会不会有替换装。
她们找完另一排，又请店员查了一下库存。确实没有，下一次到货要过两天。
Mara 把大瓶放回去，挑了一瓶旅行装。
神代凛: 这个算下来更贵。
Mara: 但只要用两天。我不想背那一大瓶回去。
神代凛: 嗯。
Mara 看了凛一眼，将小瓶放进篮子，又问她有没有要买的。
凛走到棉签那一排，拿起一盒。Mara 跟过来看了看包装，问这个不是前天刚补过吗。
台里前天刚拆了一盒，住处也还有。凛放回棉签，手在篮子上方停了停，又收回来。
神代凛: ……好像也没什么要买的。我再看看。
Mara: 那帮我拿篮子。
Mara 将篮子递过来。凛接过，里面只放着那一小瓶洗发水。
她们又绕了半排，最后谁都没加东西。付账时，店员问要不要袋子，Mara 说不用，把洗发水握在手里，零钱袋收进口袋。
出来以后，凛才问她，怎么突然想去买。
Mara: 昨晚挤了半天，最后兑水洗的。今天不想再这样。
Mara 说完，在门边的长凳上坐下，拍了拍旁边。凛坐过去，两人之间留着一点距离。
对面一家店正在换纸招牌，下面的人举得歪了一点，上面的人让他往左。他往自己的左边挪，反而更歪了。
Mara 看了一会儿，笑出声。凛跟着笑，等他们终于说明白是谁的左边，才收回目光。
Mara: 今天出门之前，我还想过要不要跟你说每一步。
凛转向她。
Mara: 到店里，买完，去哪坐。后来觉得这样太累了。
神代凛: 不用每一步都说。
Mara: 我知道。所以只问你要不要来。
凛捏了捏包带。刚才一路跟着她挑洗发水，倒比坐在台里反复看那张目录轻松。
神代凛: 我想来。你不买东西，只走一会儿，我也想来。
Mara 低头看着自己的鞋尖，轻轻蹭了蹭地面。
Mara: 那我下次还叫你。
神代凛: 好。
她往椅背上一靠，伸直了腿。凛也坐着，门铃又响了几次，有人提着满袋日用品从她们面前经过。
过了好一会儿，Mara 说有点想吃冰的，今天不用再找热汤。凛起身去旁边买，两个人各选了自己的口味。
坐回长凳后，凛问 Mara，现在和自己一起出来，会不会仍觉得不舒服。
Mara 没马上回答。凛撕开冰杯的封口，安静地等着。
Mara: 有一点。你忽然不说话的时候，我还会想是不是又有什么没告诉我。
神代凛: 刚才在店里，我没想好要买什么。
Mara: 嗯，我看出来了。
神代凛: 下次我直接说。省得你又以为我在瞒什么。
她抬眼看了凛一会儿，说，那就先这样试试吧。凛点点头，挖下一小块冰，含在嘴里等它慢慢化。
两人吃完冰，把空杯扔进店外的分类桶。回去走到路口，凛习惯性地朝台里拐，Mara 叫住她，指了指相反的方向。
Mara: 今天下午你休息。回去睡一会儿吧。
神代凛: 你呢？
Mara: 也回去。刚才真只出来买洗发水。
她晃了晃那只小瓶，朝凛挥手。凛笑着答应，在路口跟她分开。
回到房间，凛放下包，推开一点窗。外面不知哪儿有蝉在叫，躺到床上仍听得清楚。她拉过薄被，不知不觉睡着了。
醒来时，手机上有 Mara 发来的照片。是那张终于挂正的店牌，配了一句，刚好在车窗里看见。
凛回复，至少现在左右分清了。Mara 很快发来笑脸。
凛也笑了一下，起身去烧水。

@Node('dating-record', { title: '先不听那一份' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-breakroom-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十五日，休息间。
凛把封存目录放到桌上，问 Mara 吃完了没有。
@SetExpression('pose-listening', 'mara')
神代凛: 我想把那份录音从平常用的目录里移走，单独锁起来。每次打开都看见它，我还是受不了。你呢？
Mara: 留着吧。我暂时不想听。以后谁要用，你先跟我说一声。
神代凛: 好。我跟由美说。调查那份还得留着，但要拿来做节目，我也不答应他们直接用。
Mara: 我知道。你呢？里面说话的是你。
凛愣了一下，手指还压在目录上。想到耳机里那句“对不起”，她的胃又一阵发紧。
神代凛: 我也不想再听见自己说那句话。
她们共同确认封存的位置和查阅规则，由美保管登记。目录里留下说明，日常播放器不再显示那一条。
@Node('dating-reply', { title: '回信发出去以后' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-breakroom-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'hesitant', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
Mara 从包里拿出一份打印的课程回复，放在凛刚移开的地方。
@SetExpression('smile', 'mara')
Mara: 回信发了。九月去东京。现在还差住处，两家都不便宜。
神代凛: 你告诉由美了吗？
Mara: 说了。春香一听，非要下次同班时自己换备用电池，让我在旁边看着。
神代凛: 她上周就会了。
Mara: 是啊。我说会了，她还嫌我答得敷衍。
凛笑了。Mara 看着她，问申请表发出去没有。
神代凛: 今天晚上交。
Mara: 晚饭前？吃完可就该犯困了。
神代凛: 晚饭前。……你等我一下？交完一起去。
Mara: 好。我先看哪家今天开门。
五点半下班以后，凛先回房间，打开自己的申请。今天台里的归档工作已经交完，晚饭约在六点半。
凛在发送页面停了很久。附件已经换好，介绍里也删掉了自己读着都含糊的话。
Mara 发来店名，说已从家里出发，到楼下再叫她。凛回复好，把外套先搭在椅背上。
凛重新点开样本。洗衣店的滚筒停下，店主问袜子是谁的。听了这么多遍，她还是能挑出音量忽大忽小的地方，忍不住想再修一下。
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@ClearBackground()
Mara（消息）: 还有多久？我问的是晚饭。
神代凛（消息）: 十分钟。
Mara（消息）: 好。我给店里打电话。
凛又把那几秒听了一遍，手指搭上鼠标，停了停，关掉试听。收件地址没错，附件也是刚才那版。再改下去，又要赶不上晚饭了。
凛按下发送。
进度很快走完。Mara 的电话打来时，凛的手仍放在鼠标上。
Mara: 发了？
神代凛: 发了。
Mara: 那收包？
神代凛: 等回执。
电话那头安静了一会儿。不到一分钟，提示音就响起来。凛打开附件看了一遍，确认没有传错版本。
Mara: 现在呢？
神代凛: 现在可以了。
凛关掉电脑，下楼看见 Mara 正靠在屋檐下等。两人走到街上，凛才问起，Mara 回录取邮件时是不是也检查了很多次。
Mara: 看了。发送以后也看。第一遍还以为忘填电话。
神代凛: 填了吗？
Mara: 填了。我甚至又抄了一遍。然后被我妈问，为什么给她发自己的电话号码。
凛停下脚步笑起来。Mara 轻碰她的胳膊，提醒她别挡在店门口。凛这才换了只手拿包，让开了路。
她们那晚换了一家店。等饭时，Mara在窗边看见游览船的时刻表，问凛来青叶以后坐过没有。
神代凛: 只坐过巴士。
Mara: 明天上午有一班，四十分钟就回来。要去吗？回来吃饭，下午再还目录。
凛翻了翻表。航线从旧港外侧绕过白岛，再回同一个码头，不用赶另一班接驳。
神代凛: 好。我来订票？
Mara: 等一下，我看明天开不开。
Mara 查到正常开航的公告，将日期指给凛。两人选了十点半那一班，订好船票。回去时，连在码头哪边碰头也说好了。

@Node('daily-harbor-cruise', { title: '从海上看青叶' })
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/tour-pier-day.webp', { transition: { type: 'crossfade', duration: 320 } })
六月二十六日，星期三，上午。今天和明天都是排好的休息日。
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/tour-pier-day.webp', { transition: { type: 'crossfade', duration: 320 } })
游客码头在鱼市外侧。凛到时，卖冰的车刚走，售票亭前已经排了几个人。她打开手机上的蓝色船票，确认登船口。
Mara站在路线图旁，穿一件薄外套。见凛过来，她从包里取出唱片目录，敲了敲封面。
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@ClearBackground()
Mara: 带上了。下午就不会忘。
神代凛: 我还以为你会拿录音机。
Mara: 今天坐船。拿了又得护着，连手都空不出来。
她把目录装回包里，拉好拉链。船靠岸时，码头边的轮胎被挤得轻轻动了一下，船员放稳跳板，等前一班的游客全下来才开始检票。
凛把屏幕亮度调高，扫过闸口。Mara已经走到跳板另一端，回头见凛盯着脚下，往边上让了让。
Mara: 扶这里。站稳再走。
神代凛: 我在看缝有多宽。
Mara: 你的鞋掉不进去。
神代凛: 谢谢，忽然知道还有这件事可以担心了。
她笑着等凛走完。她们选了靠窗的两个座位，包放在脚边。船员讲完行程，收起跳板，坐在前排的小孩抬手向岸上挥，岸边一位拎着购物袋的老人看见了，也朝他挥了挥手。
船刚离岸，凛就发现自己选错了边。旧港在另一侧，她面前全是水。
Mara往那边探了一下头，又坐回来。
Mara: 回程就轮到我们了。
神代凛: 你以前坐过几次？
Mara: 这条线？小学的时候一次。刚才在路线图前才发现，现在绕另一边。
她说得坦然。凛原本把她当成半个导游，只好自己点开电子船票附的路线图。
出了港口，船慢慢转向。先前重叠的屋顶渐渐错开，露出商店街后面的学校操场，操场再往上是医院。凛认出十九号巴士停过的雨棚，没想到从这里能一次看见它们。
Mara指着一栋楼，说那是她住的地方。凛对着她手指的方向看了半天，只见一排灰色窗户。
神代凛: 带红水箱的？
Mara: 旁边。阳台有绿色遮雨布。
神代凛: 那有两栋。
Mara 也迟疑了，拿出手机里的照片对比。旁边一位阿姨听见，笑着说从水上看都长得差不多，她住了三十年，出一次海也要认一遍。
Mara把照片放大，终于找到公寓楼边的吊臂。它从陆地看很高，从这里看却细得像插在屋顶上的一根针。
Mara: 就那栋。下回在阳台挂条更大的毛巾。
神代凛: 先挡住的是楼下的窗户吧。
白岛比地图上看着小，岛上没码头，低矮的草坡上有一座白色航标。讲解声正在介绍岛上的航标，前排的小孩追问住在那里的人怎么去上学。他母亲说没人住，他仍认真地望着那扇小门。
凛顺着孩子的目光看过去，也不由得猜，门后会不会摆着一张窄床。等船靠近些，她才看清那只是维护用的金属盖。
Mara 见凛在笑，问起原因。凛低声解释，Mara 便朝岛上看了一眼。
Mara: 床得折起来。桌子也放不下。
神代凛: 你还想放桌子？
Mara: 不然在哪吃饭。
Mara 说得一本正经，说完却先笑了。船绕过岛的外侧，青叶的海岸线终于完整地出现在窗前。
船舱外的观景平台已经开放。凛想去看一会儿，Mara跟着起身，将包带缩短，贴着身体背好。风比船舱里大，凛靠到栏杆旁，外套下摆立刻被吹起。
Mara把额前的头发压住，另一只手拿手机，对着小城拍了两张。屏幕上全是反光，她遮了半天，也没看清拍到了什么。
神代凛: 给我吧。你站这边，背着光。
Mara 把手机递过来。凛想替她拍一张，举起手机时，Mara 却还在指远处的楼。
神代凛: 看这里。
Mara转过来，刚想整理头发，凛已经按下了。照片里她嘴微微张着，像是有一句话没说完。
Mara: 这张删了。
神代凛: 再拍一张再删。
第二张里，Mara 盯着镜头，表情反而更僵。第三张是她伸手来拿手机时拍下的。回到船舱，两人一起翻看，最后她只删了第二张。
靠岸前，船从防波堤旁经过。水面平下去，刚才在海上看不清的东西又回来了：台阶边的自行车、晒在二楼的围裙、鱼市后门有人搬空筐。
凛认出早晨那家卖票的小亭，居然有些不想这么快下船。
Mara: 还想坐？
神代凛: 四十分钟这么快。
Mara: 下次可以去远一点。先吃饭，我早饭吃少了。
跳板放稳，两人跟着人群回到岸上。Mara 循着煎鱼的味道，看见码头对面的食堂已经挂出定食牌。她又拿出手机，请凛把刚才的照片也发给她。

@Node('daily-returning-the-book', { title: '明天下午有空吗' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/record-shop-day.webp', { transition: { type: 'crossfade', duration: 320 } })
六月二十六日，午后。吃过饭，她们从游客码头走回商店街。
Mara要还十八号借的唱片目录，老板今天提早关门。凛想买一个装自己作品资料的袋子，和她一起进店。
店里有些闷。Mara 脱下薄外套，搭在包上，露出里面的浅桃色衬衫。
@ShowCharacter('mara', { expression: 'leisure-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
归还只花几分钟。老板接过目录，问她上次找到的歌还放不放。
Mara: 放。另一张也找到了，我妈发的链接。
旧唱片店老板: 那这次不找东西了？
Mara: 今天不找。
她说完，却已经在门边停下，看一张刚摆出来的旧电影碟。凛往文具那一排走，找尺寸合适的袋子。
袋子有透明的，也有不透明的。凛选了一只磨砂的，刚要付钱，看见旁边卖空白卡片，想起手机套里那张已经有点折痕的灯塔画。
凛取了一包小卡片，纸张比普通信纸厚一点，背面可以写字。
Mara 走过来，问是不是又要给设备贴标签。
神代凛: 不是。
Mara: 那拿来做什么？
那包卡片还捏在手里。凛一时也说不出准备用它画什么。
神代凛: 还没想好。只是觉得可以带着，下次画一点东西。
Mara 低头看那包卡片，又朝凛手机看了一眼，笑着说那记得买铅笔。
凛把铅笔也拿上。Mara 替她找了个笔帽，免得笔尖在包里压断。
买好东西，天空比来时亮了些。Mara 说不急着回去，想看看附近那家小店是不是还开着，凛便跟她走了一段。
店里卖旧纽扣和缝补用品。她的包带上有一处磨损，暂时还能用，她想找一小块布缝起来。
神代凛: 换条带子是不是更容易？
Mara: 可能。不过这条长度刚好。先试试，实在不行再换。
她挑了两块，颜色都与原来的包不同。店主建议用深色，她却更喜欢浅的一块，说这样能看清补过哪里。
凛帮 Mara 扶着包，等她比较布料大小。胳膊撑久了有些酸，凛刚换了只手，Mara 就问是不是太重，要不要放下。
神代凛: 放这里吧。你慢慢挑。
两人将包放到椅子上，站在同一侧看。Mara 最后还是选了深色，付钱时自己笑了，说到底还是听了老板的。
@Node('daily-cafe-afternoon', { title: '再坐一会儿' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/cafe-day.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'leisure-neutral', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
缝补用品店隔壁有间咖啡厅。门口挂着今日甜点的牌子，玻璃后面的空桌上摆了一只很矮的花瓶。
Mara在门口停住，看了眼时间。才两点多。
Mara: 我想喝点东西。你急着回去吗？
神代凛: 不急。
凛替她拉开门。店里没有从街上看着那么安静，咖啡机正在磨豆，靠窗有两个人对着一台电脑说话，手边的冰已经融了大半。
店员让她们自己选位置。Mara走向窗边，又回头问凛坐不坐里面。凛看见书架后面还有一张两人桌，便指给她。
神代凛: 那里吧。太阳照不到。
Mara: 好。我刚才已经晒够了。
两人把购物袋挂在椅背上。Mara 很快选好奶油苏打，见凛在咖啡那页看了许久，就把菜单翻过来，指给她看茶的那一栏。
神代凛: 我在找能续杯的。
Mara: 准备坐多久？
神代凛: 不知道。你有事吗？
Mara: 没有。我回去也是补这个包。
她拍拍袋子里的布，又用手掌轻轻压了压，免得包装纸一直响。
凛最后还是点了热咖啡。店员说第二杯半价，Mara 便笑着说，那可以多坐一会儿。凛应了声好，又和她一起翻到甜点那页。
她们选了一份烤布丁。店员问要几只勺子，Mara说两只，凛才从包里取出手机，想把钱转给她。
Mara: 还没结账。
神代凛: 哦。
凛放下手机。Mara 也没再算账，转而去拿桌边的一本旧漫画。
书脊已经松了，封面上的猫趴在一个饭盒里。凛拿到同一套的前一册，讲一家人搬到乡下经营旅店。主人公花三页整理庭院，第四页客人说，能不能不住这么多虫子的地方。
凛笑出声，Mara从书后面抬眼。
Mara: 哪一页？
凛把书转过去。Mara 翻了翻前后两页，指着院子里晾的那排鞋。
Mara: 我比较担心这个。怎么把客人的鞋全洗了，有些不能泡水吧。
神代凛: 你怎么只看这个。
Mara: 因为我干过。我妈的鞋。
神代凛: 后来呢？
@SetExpression('leisure-smile', 'mara')
Mara: 后来我有一双特别难穿的雨天鞋。
@AnimationTimeline(300, true)
@Key('character:mara', 'position.y', 0, 750, 'ease-in-out')
@Key('character:mara', 'position.y', 300, 785, 'ease-in-out')
饮料送来，两人移开书。Mara 看着苏打上那颗冰淇淋，说比想的还大，先舀了一勺。凛搅开咖啡里的糖，却见 Mara 放下勺子，等着她先尝布丁。
神代凛: 你先吃啊。
@SetExpression('leisure-hesitant', 'mara')
Mara: 我怕一挖就全倒了。
Mara 从靠近自己的一边挖了一小块，布丁仍稳稳立着。两人各吃了几口，话渐渐少下来，又翻起桌上的书。
咖啡机停了。靠窗那桌的人收起电脑，走时碰歪了花瓶，店员扶正它，重新擦了一遍桌面。阳光落在空椅背上，慢慢移到地板。
凛读到这一册末尾，顺手往旁边一摸，才发现续集在Mara手里。
神代凛: 你已经看这么后面了？
Mara: 我从这里开始看的。
神代凛: 那你知道这两个人——
@SetExpression('leisure-annoyed', 'mara')
Mara: 先别告诉我。我想自己猜。
凛及时住了嘴，没再说后面的情节。Mara 低头继续翻，过了一会儿却皱起眉，又借走凛那一册，从第一页读起。
凛忍着笑，把杯子端起来。咖啡已经温了，刚好能连续喝几口。
店员来添水，问还要不要点什么。凛见 Mara 又拿来下一本，便续了一杯咖啡。Mara 抬头朝她笑了笑，把剩下的布丁推到两人都够得着的地方。
两人坐到三点半。Mara 看完一话，抬头看了看时间，又翻过一页，才有些舍不得地合上书。
Mara: 下回来要是找不到这本怎么办？
神代凛: 把封面拍一下。
Mara 拍完，发现凛也拿着手机。凛原想拍自己那册的封面，却连 Mara 扶书的手一起拍进去了。她看了一眼，留下了这张。
结账时她们各付饮料，布丁由凛付。Mara算了一下，说下次她请甜点。凛答应得很快，收零钱时又把两枚硬币碰到了地上。
凛弯腰捡起一枚，另一枚已经被 Mara 拾起来，摊在掌心递到她面前。接过时，凛的指尖碰到 Mara 的手，这才发现自己一直在笑。
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/town-street-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'leisure-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
走出咖啡厅，街上的光比里面亮得多。Mara眯起眼睛，等凛将购物袋换到另一只手，才继续往前走。
她摸着布料边缘，问凛那部爱情片看完没有。
神代凛: 还没开始看。
Mara: 怕结尾？
神代凛: 前天打开了，还没选好字幕就睡着了。
Mara: 好吧，片头都没看完。
凛看着她，过了一会儿也笑了。
神代凛: 总会看的。
Mara: 看完告诉我。我想借。
@SetExpression('leisure-hesitant', 'mara')
神代凛: 可以一起看。
前面亮起红灯，她停下脚步看凛。凛也停了下来，手指捏住购物袋的提手。
Mara: 什么时候？
神代凛: 你明天下午有空吗？
Mara: 有。不是说可能下雨？
神代凛: 看了天气，下午那一阵不会下。可以先去灯塔，回来再看。
Mara: 这次也收声音？
她看着凛，嘴角微微抬起。凛也想起自己问过多少次是不是去收声。
神代凛: 不收。就是想和你一起。
她转回去看红灯，又看了一眼自己刚买的布。直到灯快变了才说好，明天下午两点半。
凛也说好，记下时间。Mara 等她收起手机，才一起过街。
神代凛: 如果临时有事……
Mara: 我明天下午就是空着的。真有事再给你打电话。你记得把电影带上。
Mara 走在旁边，肩上的包带还是旧的。凛看见口袋里露出的补布，已经开始想，下次见面时那块布会不会缝好了。
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/rin-room-day.webp', { transition: { type: 'crossfade', duration: 320 } })
到商店街的岔路，她们各自回家。凛坐在房间里，拿出空白卡片，试着画了一只海鸥。
只有两笔，看着仍像眉毛。凛又画一只，结果更像眉毛了。
晚上，凛把电影从头看完，片尾字幕亮起来时，才发现手边的零食一直没拆。
凛给 Mara 发消息，说可以借了。随后把“明天给你”打到一半，改成明天下午见。
Mara 也回了“明天下午见”，又补一句，记得先吃午饭。
凛答应，关掉手机。床边那张小桌已经收空，够放两杯茶。

@Node('dating-invitation', { title: '今天不录' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/lighthouse-day.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'date-smile', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十七日，下午。灯塔观景台。
Mara 今天穿了件灰粉色衬衫，裙摆随着脚步轻轻晃。凛低头理了理自己的蓝衬衫，里面的白 T 恤下摆不知什么时候翻了出来。
前一天已经当面约好。出门前凛还是检查了两遍天气，把录音机留在桌上，带上了电影和那包空白卡片。
Mara 比约定早到了五分钟。她朝凛的包看了一眼，笑着问，今天连录音机也没带？
神代凛: 嗯。今天不录。
Mara: 那今天准备干什么？
@SetExpression('date-hesitant', 'mara')
神代凛: 我想……和你约会。
凛本来想等走到长椅那边再说。话先出了口，手还攥着包带。Mara 停下来，看着凛。
旁边有游客在看路线牌。凛说得太轻，说完便有些担心 Mara 没听清。
她低头看了一眼手里的地图，把它折好，放进口袋。然后朝靠里的步道指了一下。
Mara: 先走到那边吧。这里挡着人了。
经过第一个转角，Mara 放慢脚步等凛。两人并肩走了一小段，她看了凛一眼，将手伸进口袋，又很快拿出来。
@AnimationTimeline(300, true)
@Key('character:mara', 'position.y', 0, 750, 'ease-in-out')
@Key('character:mara', 'position.y', 300, 785, 'ease-in-out')
长椅上的水已经干了。她在一边坐下，替凛留出位置。凛却站了两秒才坐，包仍抱在腿上。
Mara 看见了，伸手指向中间空着的木板。
Mara: 可以放这儿。不抢你的。
神代凛: 我知道。
包终于放下，凛的手没地方去了，只好压到膝上。
@SetExpression('date-blush', 'mara')
Mara: 你刚才那句话，再说一次？
神代凛: 我想和你约会。
Mara 抬头望向凛。这次，凛没有避开。
Mara: ……你说的，是我想的那种约会？
神代凛: 嗯。去港口那天，我就想问你。又怕是我想多了。
神代凛: 一起剪录音那晚也是。我在手机上写了好几遍，没敢发。结果你先来问我了。
过去几次单独出门，凛总劝自己，Mara 也许只是顺路。可现在，两人已经说好了要约会，Mara 就坐在身边。凛松开攥着裤料的手，抬起头，决定把剩下的话也说完。
@Node('dating-confession', { title: '我喜欢你' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/lighthouse-day.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'date-hesitant', position: { x: 960, y: 785, scale: 1, rotation: 0, anchor: 'center' } })
神代凛: 我喜欢你，Mara。想和你交往。
@SetExpression('date-shy-look-down', 'mara')
Mara 低下头，用拇指蹭了蹭衬衫下摆的扣子。再看凛时，耳朵也红了。
@SetExpression('date-blush', 'mara')
Mara: 我也喜欢你，凛。
Mara: 那天我在你门口站了半天。饮料都拿着了，还在想你会不会不想去。
神代凛: 我都没发现。
Mara: 你一问是不是去收声音，我差点就顺着说了。
神代凛: ……那我们白绕了这么远。
@AnimationTimeline(420, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 420, 900, 'ease-in-out')
Mara 笑了一下，挪近些，轻碰凛放在膝上的手。凛摊开手掌，让她握住。
@SetExpression('date-smile', 'mara')
Mara: 那我以后想见你，就直接找你了？不拿录音当借口了。
神代凛: 嗯。我也想见你。你下课给我打电话，我们一起吃饭。
神代凛: ……周六我去接你，好吗？
Mara: 好。实作课不一定准时结束，我提前告诉你，别饿着等。
凛说好，手还被 Mara 握着。Mara 低头看了看，轻声问能不能抱一下。凛便向她靠过去。
Mara 的手绕到凛背后。凛靠在她肩上，听见一声很轻的吸气。
凛抬起头。两人离得很近，她几乎贴着 Mara 的耳边，轻声问能不能亲她。
@SetExpression('date-blush', 'mara')
Mara: 可以。
Mara 也向前靠了一点。嘴唇轻轻碰上，又分开。凛忘了闭眼，只看见 Mara 近在眼前的睫毛。
Mara 稍稍退开，凛也低下头。洗衣液的淡淡气味还在鼻端，步道另一侧传来撑伞声。
Mara: 凛，你看我一下。
神代凛: ……我在看。
Mara: 你一直看我领口。我还想亲你，抬一下头？
凛忍不住笑，抬起头。这一次，她闭上眼睛，手指攥住 Mara 的衣角。直到起身才发觉还没松手。Mara 低头看了一眼，等她松开，便牵住了她。
两人走到售货机前。Mara 想喝的口味终于补货，凛也跟着选了一罐，喝一口却甜得皱眉。
Mara: 不喜欢？给我吧，你买茶。
神代凛: 你喝两罐？
Mara 伸手接过凛那罐，就着刚才的位置喝了一口。凛看着她，又低下头去找零钱。
@Node('dating-delivery', { title: '把自己的那份交完' })
@HideCharacter('mara')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('yumi', { expression: 'neutral', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十八日，上午。凛按合同交出档案目录和修复版本。今天排了半天验收，下午空着。
由美拿着验收表，抽了三盘最开始打不开的录音，又请春香按目录找到原播出日期和对应的未剪文件。她没有因为这些天发生的事，就少查其中一项。
凛坐在桌子另一侧，等由美听完。当初向公司说三周未必够时，她没想到最后一周会这样过去。
青木由美: 原件和修复版分开放了？
神代凛: 嗯。不能确认的字句也列了，旧港专题的成片和分轨在下一页。
由美检查完最后一项，签下日期，说了声辛苦。随后问凛能不能留到最后一期节目结束，多留的几天另算费用。
凛答应留下，但要先和公司安排返程。邮件发出以后，她把工作证收进包里，忽然不知道下午该先做什么。
Mara 在门边等，问凛要不要去市民中心看她们搬进去的架子。
神代凛: 是帮忙，还是一起去？
@ShowCharacter('mara', { expression: 'neutral', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@CharacterEnter('mara', 'right', 280, { x: 1220, y: 750, offset: 70, easing: 'easeOutCubic' }, true)
Mara: 一起去。架子已经装好了，不用你扛。
神代凛: 那走吧。
@HideCharacter('yumi')
@SetExpression('pose-offer-hand', 'mara')
Mara 伸出手，又看了一眼还在屋里的由美。凛也跟着望过去。由美正核对下一张表，头都没抬。
@SetExpression('smile', 'mara')
最后，凛先牵住 Mara。Mara 收紧手指，低头笑了一下。两人走到楼梯口，凛才想起还没拿伞。
她们折回去，由美把门边那把递出来，问这次是不是凛的。凛说是，脸有点热。
第二天下午，她们再一起进台的时候，至少记得先把伞放好了。

@Node('dating-final-copy', { title: '先腾出一只手' })
@HideCharacter('rin')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/radio-studio-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('haruka', { expression: 'neutral', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'smile', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十九日，下午。月底另外约定的协助班从一点开始，凛和 Mara 在门口碰头。
春香将最后一期节目单拿来，看到 Mara 牵着凛的手时停了一秒，然后把单子递给了凛。
@SetExpression('smile', 'haruka')
水野春香: 先空一只手，帮我对一遍？下午就要录了。
@SetExpression('blush', 'mara')
Mara: 好，我看前半段。凛，你看署名和素材表。
水野春香: 署名那儿我改了两次，怕又留了旧的。
她指完修改的地方，就回去拿耳机了。凛接过节目单，才发现刚才一直捏着同一个纸角。
Mara: 你比被她检查录音还紧张。
神代凛: 她检查录音的时候，我至少知道哪里可能有错。
凛签完自己的那份，才发现笔帽还在 Mara 手里。Mara 递过来，顺便轻碰了一下她的手。
