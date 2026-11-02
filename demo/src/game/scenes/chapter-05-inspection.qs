<script lang="ts">
import type { StoryScope } from '../story/prologue-state'
export interface Scope extends StoryScope {}
</script>

@Chapter('05', { title: '绿色指示灯' })
@Scene('call-me-tomorrow-prologue')
@Node('chapter-05-inspection', { title: '穿墙的空洞与倒计时', scope: StoryScope })
@Protagonist('rin')
@HideAllCharacters()
@SetBackground('backgrounds/relay-firestop-inspection-anime-v3.webp', { transition: { type: 'crossfade', duration: 480 } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 480, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mayu', { expression: 'work-alt-serious', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 1440, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
午后一点十五分，豆大的雨点砸在东堤外墙上。
众人卸下铸铁观察窗，手电光直直照进地下穿墙电缆井——
青木由美: 老天，那是什么？！混凝土隔墙上怎么会凿出那么大一个窟窿？！
高桥真由: 这是前天外包队换线时凿开的！他们居然连一圈防火泥都没糊上！
神代凛: 你们看那个窟窿正下方不到半米的电缆沟底。
手电光下，浑浊的雨水已经漫过沟底，高压桥架的底座正泡在积水里！
Mara: 墙上这个大洞足有脸盆大，刚好把两边连成了一个大烟囱……
Mara: 要是傍晚六点四十分底下起火，毒烟不用十秒就能把整条维护廊灌满！
Mara: 哪怕那时候有人在走廊里切线，连往回跑三十米去推门的时间都没有。
防雨棚的阴影里，凛伸出右手，稳稳握住了 Mara 微凉的手背。
神代凛: 别怕。今天有我在，绝不会让你往那条走廊迈一步的。
@SetExpression('relieved', 'mara')
Mara: ……嗯！

@Node('investigation-local-schedule', { title: '来不及的常规放电', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/relay-drain-inspection-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mayu', { expression: 'work-alt-serious', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
刚过两点，高桥真由抱着工程电脑，脸色惨白地从控制室跑了出来！
高桥真由: 完了……全锁死了！本地芯片里的“18:40 过载测试”写死在硬件看门狗里了！
Mara: 啊？！连你用最高管理员密码也没法从电脑上停掉吗？！
高桥真由: 因为半年前那个“假绿灯补丁”把刀闸状态锁死成了只读常量！
高桥真由: 底下的芯片一收到取消指令就会死锁重启，重启完又会重新倒计时到六点四十分！
神代凛: 那就别管软件了，直接给储能环做物理放电！现在离六点四十分还有四个半小时！
@SetExpression('work-alt-hesitant', 'mayu')
高桥真由: 常规放电来不及了……底下那套储能环里攒着整整四千八百伏的高压电！
高桥真由: 要是接水冷电阻箱慢慢放，少说也得六个钟头！
Mara: 六个钟头？！那不得放到晚上八点去？根本赶不上六点四十分啊！
神代凛: 高桥工程师，除了接水冷箱慢吞吞地放，就没有能在两小时内把电放光的硬办法吗？
高桥真由死死咬住下唇，扭头望向围墙外侧那只贴着铅封的红铁箱。
高桥真由: 有……唯一的办法是砸开配电井铅封，硬拉下里面的紧急短路泄能闸。
高桥真由: 可那一闸拉下去，几千安培的反冲电流会在一瞬间烧穿超导耦合腔——
高桥真由: 我这五年没日没夜调出来的五号阵列，当场就会彻底报废！
高桥真由: 连今晚八点最后一次接收未来声音的窗口，也会永远消失！
@SetExpression('work-alt-serious', 'mayu')
高桥真由看了一眼站在警戒线旁才十九岁的 Mara，狠狠抹了一把脸上的雨水！
高桥真由: 烧就烧吧！
高桥真由: 要是为了保住这台听见未来的机器，得搭上小 Mara 一条命——
高桥真由: 那我这五年的研究从头到尾就是个笑话！
高桥真由: 什么狗屁实验，哪有人命金贵！我现在就去拿锤子砸铅封！

@Node('investigation-deliberate-omission', { title: '两套不同的施工图', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/documents-comparison.webp', { transition: { type: 'crossfade', duration: 450 } })
趁抢修队铺设接地网的工夫，凛和 Mara 翻开了森田礼子抽屉里的深蓝活页夹。
神代凛: 你看这张六月二十号外包工头交上来的《现场联系单》原件。
神代凛: 上面明明写着：“穿墙洞急需防火泥封堵；隔离刀闸粘死，必须停机更换。”
Mara: 可森田礼子居然在上面画了两个大红叉，批了句“24日即撤场，免除封堵及更换”！
Mara: 就为了在账本上省那十八万块钱……
Mara: 她居然把四千八百伏的高压电和毒烟窟窿留在了咱们脚底下！
Mara: 她算准了只要把绿灯瞒过明天早上十点的签字仪式，这儿就算烧成灰也赖不到她头上了！
凛用肩膀轻轻靠住 Mara 发抖的肩头，举起相机拍下了每一页红笔批注。

@Node('investigation-provenance', { title: '原件的去向', scope: StoryScope })
@HideAllCharacters()
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 360 } })
@ShowCharacter('yumi', { expression: 'serious', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'serious', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
回到资料室时，由美干脆利落地啪一声扣断了座机电话。
青木由美: 是海音科技东京总部的法务打来的。
青木由美: 他们非要我们在三点半之前把所有纸质账本交回总部，美其名曰“内部自查”。
Mara: 他们这是想趁咱们下午忙着防汛抢险，把那些要命的原件收回去毁尸灭迹吧？！
青木由美: 在下午五点拉闸泄能之前，这批证据怎么保住，你们俩拿个主意？

@Choice('现在办理原始资料的外部保全', undefined, { id: 'external-preservation' })
@Choice('保留已有副本，后续正式调取原件', undefined, { id: 'formal-followup' })

神代凛: ${scope.pick('formal-followup', '录音和扫描件我都算好防篡改校验码存进备份盘了，现在还是先全力去盯防汛和泄能吧。', '原件绝对不能交出去。趁市役所的公证员还在，我们当场把原件和录音母盘一起锁进铅封箱！')}
Mara: ${scope.pick('formal-followup', '好！既然电子备份已经锁死了，那咱们赶紧去前院准备三点钟的防汛抢险！', '好！我这就去抱防潮箱和封条，二十分钟内把它们全锁死！')}
窗外一道闪电劈开海天，墙上的挂钟稳稳跳到了下午三点整。
