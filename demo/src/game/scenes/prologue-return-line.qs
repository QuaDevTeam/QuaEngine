@Chapter('00', { title: '序章 · 雨天来客' })
@Scene('call-me-tomorrow-prologue')
@Node('prologue-workday', { title: '窗台上的蓝鲸杯' })
@Protagonist('rin')
@HideAllCharacters()
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'neutral', position: { x: 640, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
@ShowCharacter('haruka', { expression: 'neutral', position: { x: 1280, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
六月十二日傍晚，窗外的海面已经暗成了深蓝色。
春香抱着明天的排播单推门进来，苦着脸叹了口气。
水野春香: 港务局那边又拖堂了！
水野春香: 本来说好明早要播北侧栈桥的排水抢修通知。
水野春香: 结果科长说维修队半夜才下井看现场，得明早局长签了字才发传真。
Mara: 明早才发传真？那赶早潮的渔船岂不是只能听午间和晚间补播了？
水野春香: 谁说不是呢，人家连封几号栈桥、排第几号公文都没定下来呢。
水野春香: 我只好先把明天八点档《海岸三分钟》的空位留出来，明早拿到传真再填词。
@SetExpression('pose-mug', 'haruka')
春香拿起窗台上的蓝鲸白瓷马克杯，咕嘟咕嘟喝了一大口麦茶。
@SetExpression('neutral', 'haruka')
接着她撕下一张黄便利贴写上字，严严实实压在杯底。
神代凛: 怎么还在杯子底下压张便利贴？
@SetExpression('smile', 'mara')
Mara: 因为上礼拜春香把杯子忘在导播台，被由美姐当成公用杯锁进消毒柜整整两天。
@SetExpression('serious', 'haruka')
水野春香: 才不是我忘的！明明是 Mara 姐借去压采访稿，顺手塞进茶水间篮子里的！
水野春香: 哼，我把黄便利贴压在最外头，这回谁也别想收错我的鲸鱼杯！
水野春香: 我去前厅锁门啦，你们测完线也早点回去哦。
@HideCharacter('haruka')
春香夹着台本跑出资料室，Mara 走到东墙角的旧跳线架旁蹲下。
@SetExpression('pose-equipment-worried', 'mara')
Mara: 那个……神代小姐，趁现在离八点还有二十分钟。
Mara: 能帮我看一眼墙角这根二号返送监听线吗？

@Node('prologue-return-line', { title: '不该说话的旧线路' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-archive-day-anime-v3.webp', { transition: { type: 'crossfade', duration: 360 } })
@ShowCharacter('mara', { expression: 'pose-equipment-worried', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
凛摘下耳机挂在脖子上，走到 Mara 身旁半步远的地方蹲下。
标着“RET-02”的双绞屏蔽线，还插在墙角那只老旧的备用监听盒里。
神代凛: 高桥工程师昨天不是说，八点校准的时候这根线会有杂音，让我们别插耳机吗？
Mara: 就是因为她特意提了一嘴，我昨晚值夜班时才犯了嘀咕。
Mara: 昨晚差一分钟八点的时候，我蹲在这儿理空盒。
Mara: 结果听见上面没拔掉的旧耳塞里，突然“滋啦”响了一声。
神代凛: 听见什么了？
Mara: 我本来以为是串进来的电流声，就凑过去听了两秒……
Mara: 可里头传出来的根本不是杂音，而是咱们的节目垫乐，还有春香播天气的声音！
Mara: 那时候春香明明早就锁门回家了，直播间放的是自动整点音乐啊。
神代凛: 会不会是延时器里存的旧录音串音了？
@SetExpression('hesitant', 'mara')
Mara: 我今早跟由美姐说了，由美姐也拿不准，让我今晚请你也听听看。
Mara: 月底就要拆楼交接了，要是不弄清楚声音是从哪儿冒出来的，我总觉得心里发毛……
神代凛: 现在是七点五十四分，还有六分钟。
神代凛: 从监听盒引一路信号进我的录音机，我们插分线器一起听。
@SetExpression('pose-equipment-soft', 'mara')
Mara: 好！我这儿有双芯跳线和一分二插头。
两人关掉头顶的日光灯，只留一盏小台灯，免得镇流器电流声串进录音里。

@Node('prologue-echo', { title: '二十四小时后的声音' })
@HideAllCharacters()
@SetBackground('backgrounds/radio-monitor-night-anime-v3.webp', { characterLighting: { ambient: [0.93, 0.96, 1.02], shade: { color: [0.88, 0.92, 1], from: [0.2, 0], to: [0.8, 1] } }, transition: { type: 'crossfade', duration: 520 } })
@ShowCharacter('mara', { expression: 'pose-listening', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
分线器很短，两人的肩膀隔着薄衬衫轻轻挨在一起。
神代凛: 七点五十九分五十五秒……目前只有 `-72dB` 的底噪。
Mara: 快到八点整了……
二十点整，地基深处准时传来一声沉闷的低频震动。
同一瞬间，二号返送线电平表猛地跳起了翠绿色的峰值！
@HideAllCharacters()
@SetBackground('inserts/return-line-closeup.webp', { transition: { type: 'crossfade', duration: 600 } })
半秒古怪的扫频声后，一段清晰得让人后背发凉的广播声撞进耳膜——
监听返回／春香的声音: 这里是青叶海岸广播电台，插播六月十三日晚间通行提醒。
监听返回／春香的声音: 接港务局今日上午九点二十分签发的第 14 号通告……
监听返回／春香的声音: 旧港北侧三号、四号栈桥因排水抢修封闭东侧引道……
Mara: ？！
神代凛: 嘘，先别出声，继续听。
通告念完后吉他垫乐推起，导播室的副麦似乎忘了拉下推子。
隔着音乐传来翻找抽屉的动静，紧接着竟响起 Mara 自己的声音——
监听返回／Mara 的声音: 奇怪，春香，你看见窗台那只蓝鲸杯了吗？
监听返回／Mara 的声音: 怎么连底下的黄便利贴一起不见了？
监听返回／春香的声音: 咦？我昨天傍晚走的时候明明压在窗台上的，该不会扫进筐里了吧？
监听返回／Mara 的声音: 完了完了，要是打碎了你又要念叨我一礼拜，我再去柜子底下找找……
二十点零三分整，人声与音乐像被刀齐根切断，只剩空洞的底噪。
@SetBackground('backgrounds/radio-monitor-night-anime-v3.webp', { characterLighting: { ambient: [0.93, 0.96, 1.02], shade: { color: [0.88, 0.92, 1], from: [0.2, 0], to: [0.8, 1] } }, transition: { type: 'crossfade', duration: 420 } })
@ShowCharacter('mara', { expression: 'afraid', position: { x: 960, y: 750, scale: 1, rotation: 0, anchor: 'center' } })
Mara 僵硬地转过头，望向窗台角落里的蓝鲸马克杯。
杯子正安安静静地立在原处，杯底还压着二十五分钟前刚写好的黄便利贴。
Mara: 神代小姐……刚才在耳机里到处找杯子的人，是我？
神代凛: 音色、咬字，连说话前先吸半口气的习惯……全都是你。
Mara: 可杯子现在就好好摆在窗台上啊！
Mara: 而且她怎么会知道春香二十五分钟前才写的黄便利贴？！
Mara: 还念出了明天上午九点二十才签发的第 14 号通告……
Mara: 这到底是怎么回事呀？！
神代凛: 没有任何外接播放设备，也不可能是恶作剧。
神代凛: 这条旧线上串进来的，不是以前的录音。
神代凛: 刚才那三分钟，是二十四小时之后——
神代凛: 明天，六月十三号晚上八点的青叶海岸电台。
Mara 下意识伸出手，一把抓住了凛放在桌沿上的小臂。
神代凛: 别怕。既然明天还没到，我们就留下来亲眼看看。
凛反手轻轻覆在少女微凉的手背上，将这段来自明天的录音锁为了只读文件。
