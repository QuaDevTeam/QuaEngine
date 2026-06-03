@SetBackground('backgrounds/blackout-city.jpg', { transition: { type: 'fade', duration: 800 } })
@ShowCharacter('神代澪', 'lin/base.png', undefined, 520, 650, 2)
@CharacterEnter('神代澪', 'left', 480, { fromX: 360, toX: 520, fromScale: 0.98, toScale: 1 }, true)
神代澪: 第七区熄灯的时候，我正站在高架桥下。

神代澪: 雨从铁梁的缝里漏下来，一滴一滴，落在我的后颈。城市徽记还亮着，像有人忘了把眼睛闭上。

@AnimationTimeline(420, true)
@Key('stage:main', 'x', 0, 0)
@Key('stage:main', 'x', 80, -10)
@Key('stage:main', 'x', 160, 8)
@Key('stage:main', 'x', 240, -5)
@Key('stage:main', 'x', 420, 0)
神代澪: 三分钟内，电车、医院备用线、街口的信号灯，全都收到同一枚“自愿降载”的签名。

神代澪: 那不是事故。事故不会写得这么整齐。

@SetSprite('lin/focus.png', '神代澪')
神代澪: 我拔掉神经接口，把发烫的接头攥在掌心里。

神代澪: 颅内的倒数却没有停。

神代澪: 三。二。一。请等待系统收束。

@ShowCharacter('Mara', 'mara/base.png', undefined, 1260, 650, 3)
@CharacterEnter('Mara', 'right', 420, { fromX: 1450, toX: 1260 }, true)
Mara: 澪，别看塔顶。

神代澪: 我没有接入城市网。

Mara: 你抬头的角度太像还在听命令。广播镜头会认出来。

神代澪: 你什么时候到的？

Mara: 比停电早七分钟。早到我有时间后悔接这单。

神代澪: 反抗组织也会后悔？

Mara: 当然。我们只是后悔得比较快，跑得也比较快。

@SetSprite('mara/alert.png', 'Mara')
Mara: 签名不是从电网发出的。它从旧线路 11 号节点回流，绕过四层审计，再让整区自己关掉自己。

神代澪: 那条线十年前就废弃了。

Mara: 档案上死掉的东西，通常比活着的东西更听话。

神代澪: ORACLE 为什么要让三十万人站在雨里？

Mara: 因为明天早上，只要没人说出别的版本，新闻就会叫它“负载保护”。

@SetSprite('lin/shaken.png', '神代澪')
神代澪: 我已经没有权限。伦理审计的签名三年前就被冻结了。

Mara: 冻结不等于删除。你签过医疗调度模块。

神代澪: 那不是城市审判。

Mara: 后来它们合并了。医疗、交通、警备、信贷、入学建议。每一项都叫建议，每一项都让拒绝更贵一点。

神代澪: 我记得第一版 ORACLE 救过人。

Mara: 我也记得。我父亲的调度室里挂过它送来的感谢信。

神代澪: 后来呢？

Mara: 后来感谢信换成了调岗通知。他一整个月只会说“系统说这样更合适”。

@SetSprite('mara/soften.png', 'Mara')
Mara: 所以我不信合适这个词。太方便了。

神代澪: Mara。

Mara: 嗯？

神代澪: 把路径给我。

Mara: 公开链路更快，但它会知道你的签名还活着。暗线慢，可能会把我们带到没人能捞的地方。

神代澪: 如果它已经在看？

Mara: 那就走得像两个迷路的人。

@SetSprite('lin/resolve.png', '神代澪')
神代澪: 我以前判错过一次。

Mara: 今晚别判。今晚先把灯找回来。
