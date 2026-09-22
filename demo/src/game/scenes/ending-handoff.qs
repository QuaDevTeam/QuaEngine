@Chapter('05', { title: '下一次见面' })
@Scene('call-me-tomorrow-prologue')
@Node('ending-handoff', { title: '有人接下去' })
@Protagonist('rin')
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@SetBackground('backgrounds/radio-breakroom-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('yumi', { expression: 'neutral', position: { x: 700, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('mara', { expression: 'tired', position: { x: 1220, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
神代凛: 我想先结束现场工作。交接做完，明天回东京。
由美点头，将接收人的名字重新圈给凛。
青木由美: 按这个顺序。没有确认的，不要写已完成。
凛打开目录，先整理已经交付的档案，再把与警报相关的记录单独列出来。哪些经过处理、哪些只是收录原音，都在文件名旁边说明。
接手的同事通过电话问，十七号那段为什么有六分钟。凛先说明这是现场录下的泵声，和三分钟的回声不同，再解释当时站的位置和状态屏。讲到复检回单时，她发现自己把二十号说成了二十一号。
神代凛: 对不起，是二十号。我刚才说错了。看后面附的回执，上面有日期。
同事说等一下，电话里响起退格键的声音。凛把嘴边下一句收住，换一只手握手机，等对方说“改好了”才继续。
Mara 在旁边确认日常线路的联系人，没有替凛回答。轮到她负责的部分，她报完单号，问同事是否需要看原模板。
对方说需要，Mara 便把文件发过去，等电话那头确认下载完成，才继续。
十三点，辅助支路的测量结果到了，仍然带电。昨夜封闭的维护楼继续禁入，专业组开始确定能源处置方案。由美把正式通知发进她们都能看到的工作群。
神代凛: 这份也交吗？
青木由美: 列进去。后续负责人已经收到，你保留自己的副本。
凛将这份通知添到清单末尾，把刚收到的附件也发过去。电话那头说收到了，又问起上一页的日期。
第二通电话结束前，接收人将未结问题逐项念回来，也准确区分了现场泵声和返回录音。凛对过自己的清单，确认他没有漏项。由美核对完，在清单末尾签了名。
由美让凛收好自己那份，然后去休息。
Mara 拿着线路文件经过门口。凛叫住她，问现在是否有空说两句。
Mara: 十分钟以后。我把班组这通打完。
凛在门边等。Mara 回来时没拿工作电话，口袋里自己的手机却仍开着提示音。
神代凛: 昨晚的事，对不起。还有刚才……
Mara: 交接的事不用道歉。你做完了。
神代凛: 我还是想知道你今晚——
凛停下来，换了问法。
神代凛: 你愿意给我报一下平安吗？不是催你，等忙完也可以。
Mara 看了凛一会儿，点头。
Mara: 好。现场结果也会在群里。你别光等我一句话。
神代凛: 嗯。
Mara: 昨晚的事，我还没想好。现在也没办法好好谈。
神代凛: 我知道。
@AnimationTimeline(420, true)
@Key('character:mara', 'position.x', 0, 1220, 'ease-in-out')
@Key('character:mara', 'position.x', 420, 1350, 'ease-in-out')
Mara 往门边让开一点，手仍搭着包带。凛走出半步，没有再往前。她们之间够另一个人通过，却没有谁经过。
Mara: 到了给我消息吧。
神代凛: 好。
@HideCharacter('mara')
@HideCharacter('yumi')
@SetBackground('backgrounds/rin-room-day.webp', { transition: { type: 'crossfade', duration: 480 } })
回到住处，凛把工作证放进箱子，又拿出来。明天用不上了，可那格原本是放耳机的。她重新铺好一件衬衣，证件仍留在膝上。
十七点五十分，群里发来停机完成通知：两路电源均已切断并隔离，设备剩余能量处理完毕，机器本地的定时试验计划已清除，结果经过独立核验，配对组件损毁，禁入范围继续保留。
凛读完，由美又发来确认，说普通播出已切到备用链路。
@SetBackground('backgrounds/rin-room-night.webp', { transition: { type: 'crossfade', duration: 600 } })
十九点十二分，手机没有响。凛坐在床沿，屏幕暗了就再按亮。十三分跳出来，她松开被角，手心已经出汗。
十九点二十七分，Mara 发来一张吃了一半的热汤照片。
Mara（消息）: 在台里。准备八点的普通节目。
神代凛（消息）: 好。谢谢你告诉我。
凛本来想多写一些，最后没有。二十点，广播里是春香确认过的天气和绕行信息。监听研究已经停止，台里的节目还在继续。

@Node('handoff-platform', { title: '车开以前' })
@HideCharacter('rin')
@HideCharacter('haruka')
@HideCharacter('mayu')
@HideCharacter('reiko')
@HideCharacter('yumi')
@SetBackground('backgrounds/station-platform-day.webp', { transition: { type: 'crossfade', duration: 320 } })
@ShowCharacter('mara', { expression: 'hesitant', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月二十四日，上午。青叶站。
由美把凛的委托确认书发来，说剩下的档案由接手同事处理，返程报销照合同走。邮件末尾另外加了一句，今天不用回复工作消息。
凛仍回了收到，然后把电脑放回包里。
Mara 赶到车站大厅时，检票口还没有开始排队。她十点要回台里交说明，赶在那之前来送凛。她穿着平常那件外套，手里拎一只小纸袋。
Mara: 面包店今天只有这个了。你原来买的卖完了。
神代凛: 这个我也喜欢。
Mara: 甜的也喜欢？我看你前几次都挑咸口。
神代凛: 甜的也吃。太咸的才不喜欢。
Mara: 你不是喜欢腌菜？
凛低下头，把纸袋折好，放进随身包最上面。
神代凛: 喜欢它酸。要是光剩咸味，就吃不下了。
Mara 笑了一声，很短，随后看向到站时间牌。
凛想问课程的事，又担心听起来像在安排 Mara 的九月。她还在犹豫，Mara 已先拿出了手机。
Mara: 明天要回录取邮件。我跟由美试过排班，缺的那一班找到了人。
神代凛: 你想去吗？
Mara: 想。还在算房租。
神代凛: 我在东京也看过几家。回去发给你看看？
Mara: 先陪我看学校发的这份吧。我已经挑花眼了，哪一家都说自己离车站近。
手机收到文件。凛点开第一页，没有马上往下翻。
广播通知乘客进站。旁边有人拖动行李，车轮接连碾过地面上的缝。凛把手机收进口袋，握住包带。
神代凛: Mara，昨天不是因为我不想再见你，才决定走的。
Mara: 我没这么想。
神代凛: 我还想见你。只是昨天……实在不知道该怎么接着待下去。
Mara 看着凛，似乎在等她继续。检票口又响起提示音。凛终于说出来，希望等 Mara 愿意的时候，两人能好好谈一次。
Mara: 好。等你到了，我们再聊。别又打了半天字，最后只发一句没什么。
神代凛: 好。
@AnimationTimeline(500, true)
@Key('character:mara', 'position.x', 0, 960, 'ease-in-out')
@Key('character:mara', 'position.x', 500, 900, 'ease-in-out')
Mara 替凛把露在包外的证件绳塞好。指尖隔着布料碰到凛，很快收回去。凛低头看那处折痕，直到检票声又响，才拉好包。
@CharacterExit('mara', 'right', 600, { x: 900, y: 750, offset: 160, opacityFrom: 1, opacityTo: 0, easing: 'ease-in-out' }, true)
凛过了检票口，又回头望去。Mara 正站在外面挥手。凛也抬起手，一直到下站台的楼梯挡住对方的身影。
@HideAllCharacters()
@SetBackground('backgrounds/station-platform-day.webp', { transition: { type: 'crossfade', duration: 320 } })
下到站台，凛又摸了摸包外。证件绳已经塞好，手指只碰到潮湿的布。
@SetBackground('backgrounds/train-window-day.webp', { transition: { type: 'crossfade', duration: 550 } })
列车开出车站不久，手机亮了。Mara 发来消息，说纸袋底下还有一张收据，不要当糖纸丢掉。
凛翻出来。背面写着面包店的营业时间，周三上午那一栏被圈住，旁边补了一句，下次别挑休息日。
@HideAllCharacters()
神代凛（消息）: 看到了。下次先查。
凛把收据夹进笔记本，打开她发来的课程资料。窗外的房屋渐渐稀疏，站前那条街很快看不见了，工作群里还有后续核查的消息。
到了东京，凛给 Mara 发了到站照片。过了一会儿，Mara 回复，知道了，先去吃饭。
凛走出检票口，在饭店门前停下，给她回了一张菜单。
她们的话还没有说完。


@Node('handoff-followup', { title: '寄来的更正' })
@HideAllCharacters()
@SetBackground('backgrounds/company-office-day.webp', { transition: { type: 'crossfade', duration: 600 } })
十一月，由美寄来调查结束后的回复。信先到了公司，同事转交给凛时，问那箱磁带后来修完了没有。
凛说修完了。同事便去接另一通电话，凛独自在门口又站了一会儿。
回复列出了后续核查的结果：原视频和登记证明，居民只在获准的外巷清扫；借道签名被拼进失实的投诉回函。批准截取视频、把怀疑引向居民的人也已查明，是礼子。更正已经送达原收件人。
报告将辅助隔离未修、临时试验反复放行、排水和防火封堵缺陷列为现场风险。调查没有找到人为点火或居民破坏设备的证据，也没有将未来录音中的死亡列作现实发生的案件。
凛接着往下读。项目已终止，礼子被解除管理职务，处理决定已经送达。真由也被追究失职责任，不能再单独签发试验放行。海音承担整改、拆除及核实的居民损失，已付款项附有回执，没有附加撤诉条件。
由美另写了近况：原始录音和接收资料继续保管，只供调查查阅，原型不再启用，电台已搬到新址。信后附着声音展照片和节目表；接手同事完成的目录交到了图书馆，春香也有了自己的时段。
凛给 Mara 发消息，问她是否也收到。
Mara（消息）: 收到了。刚下课，回去再看。
凛想起九月的两次见面。第一次，Mara 问到被隐瞒的那晚，她把手机翻扣在桌上，慢慢讲完。第二次，两人聊课程和新委托，饭吃完才想起看时间。分别时，Mara 在台阶下等她收好伞，最后仍只挥了挥手。
神代凛（消息）: 看完想聊聊的话，给我打电话吧。不急着今天。
Mara（消息）: 周六一起吃饭吧。先说，我不想整顿饭都讲这个。
神代凛（消息）: 好。找家能慢慢吃的吧。
她发来两个地址，让凛选一个。凛看过营业时间，选了星期六确定开门的那家。
信里需要回答的问题已经答完，凛将它收进文件夹。手机还停在餐馆页面，她点开菜单，将 Mara 上次说想吃的那一道截了下来。
@HideAllCharacters()
她们的话还没有说完。
