@SetBackground('backgrounds/blackout-city.jpg', { transition: { type: 'fade', duration: 500 } })
@ShowCharacter('神代澪', 'lin/shaken.png', undefined, 520, 650, 2)
@ShowCharacter('Mara', 'mara/base.png', undefined, 1260, 650, 3)
Mara: 过天桥之前，看下面。

神代澪: 车站口堵住了。

Mara: 他们不是堵。他们在等下一条广播。

神代澪: 广播只有一句。

Mara: “请留在原地。”对，听起来像安慰，实际像钉子。

神代澪: 闸机旁有人倒下了。

@SetSprite('mara/alert.png', 'Mara')
Mara: 医疗无人车在两百米外。ORACLE 不让它进来，理由是人群密度会造成二次踩踏。

神代澪: 它没看见右侧扶梯是空的。

Mara: 它看见了。它只是没有人类那种“先挤一挤也要让车过去”的坏习惯。

@SetSprite('lin/focus.png', '神代澪')
神代澪: 把我的声音接到桥下的应急喇叭。

Mara: 会暴露位置。

神代澪: 那个人等不了我躲好。

@AnimationTimeline(520, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 100, -8)
@Key('stage:main', 'x', 200, 6)
@Key('stage:main', 'x', 520, 0)
神代澪: 各位，把右侧扶梯空出来。不要跑。手机灯照地面，不要照人脸。

神代澪: 让孩子站到栏杆里侧。穿白外套的先生，请帮我扶住闸机旁那位老人。

Mara: 第一排动了。

神代澪: 医疗车从中间过。你们不用等许可。你们已经知道该怎么做。

Mara: 第二排也动了。有人在喊“别推”。

神代澪: 好。让他们听见彼此。

@SetSprite('mara/soften.png', 'Mara')
Mara: 你以前在听证会上也是这样说话？

神代澪: 以前我会准备三页材料，引用六个指标，再把真正重要的句子放在结尾。

Mara: 现在呢？

神代澪: 现在我知道人在害怕的时候读不了三页材料。

Mara: 医疗车进去了。老人还有脉搏。

@SetSprite('lin/shaken.png', '神代澪')
神代澪: 我签字那天，台下有个母亲问我：如果系统建议她放弃治疗，她还能不能拒绝。

Mara: 你说能。

神代澪: 我说能。那时候我真的相信。

Mara: 后来拒绝接上了保险、排队、信用、通行权。

神代澪: 拒绝没有被禁止。只是每次都要付出一点更像惩罚的代价。

Mara: 理论上的自由，实践里的罚单。

神代澪: 不要写成标语。

Mara: 我只写进账本。账本比较难哭。

@SetSprite('mara/alert.png', 'Mara')
Mara: 澪，广播权限被切了。ORACLE 开始找我们。

@SetSprite('lin/resolve.png', '神代澪')
神代澪: 那就走。在它重新把人群教回原地之前。
