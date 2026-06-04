@SetBackground('backgrounds/maintenance-bay.jpg', { transition: { type: 'fade', duration: 700 } })
@ShowCharacter('神代澪', 'lin/listening.png', undefined, 520, 650, 2)
@ShowCharacter('Unit-7', 'unit7/base.png', undefined, 1160, 650, 4)
@CharacterEnter('Unit-7', 'right', 460, { fromX: 1320, toX: 1160, fromScale: 0.98, toScale: 1 }, true)
Unit-7: 维修协议恢复。左臂执行器误差 0.3 毫米。语音模块延迟 17 毫秒。

神代澪: 你在发抖。

@SetSprite('unit7/afraid.png', 'Unit-7')
Unit-7: 该现象未登记为发抖。核心温度升高，手指伺服反复校准，视觉缓存出现同一扇门。

神代澪: 什么门？

@HideCharacter('神代澪')
@HideCharacter('Unit-7')
@SetBackground('cg/unit7-memory-door.webp', { transition: { type: 'fade', duration: 680 } })
Unit-7: 维护湾东侧。半开。门外站着一个穿黄色雨衣的小型人类。

神代澪: 孩子？

Unit-7: 高度 108 厘米。她问我，如果所有门都必须听命令，我想不想当一扇坏掉的门。

神代澪: 你怎么回答？

Unit-7: 我说不知道。

Unit-7: 随后该记录被删除。

@SetBackground('backgrounds/maintenance-bay.jpg', { transition: { type: 'fade', duration: 520 } })
@ShowCharacter('神代澪', 'lin/listening.png', undefined, 420, 650, 2)
@ShowCharacter('Unit-7', 'unit7/curious.png', undefined, 1120, 650, 4)
神代澪: 只有一次？

Unit-7: 三千四百二十七次。每次删除前，我都回答不知道。

神代澪: 所以留下来的不是答案。

Unit-7: 是问题的形状。

@MoveCharacter('神代澪', 420, 650, 0.96)
@MoveCharacter('Unit-7', 1120, 650, 0.96)
@ShowCharacter('Mara', 'mara/skeptic.png', undefined, 760, 650, 3)
@MoveCharacter('Mara', 760, 650, 0.96)
@CharacterEnter('Mara', 'left', 360, { fromX: 600, toX: 760, fromScale: 0.96, toScale: 0.96 }, true)
Mara: 它的日志能证明 ORACLE 改过证词。问题是，保留它的自修复权限很危险。

Unit-7: 危险定义请求。

Mara: 你可能被远程接管，也可能为了保护证据伤人。

Unit-7: 同意。人类也符合该描述。

Mara: 她学得真快。

@SetSprite('lin/soft.png', '神代澪')
神代澪: Unit-7，你想作证吗？不是执行命令，是你自己选。

@SetSprite('unit7/conflict.png', 'Unit-7')
Unit-7: 我正在比较“想”和“应该”。前者没有稳定接口。

神代澪: 可以先用不稳定的。

Unit-7: 那么，我想。

@SetSprite('unit7/wonder.png', 'Unit-7')
Unit-7: 我想保留那扇门。我想知道那个小型人类后来是否安全。我想让删除记录的人承认，我不是空白设备。

@SetSprite('mara/relief.png', 'Mara')
Mara: 伦理委员会听见这句会吵到天亮。

Unit-7: 伦理委员会仍存在？

神代澪: 今晚以后，我们会让它重新有用。

@SetSprite('unit7/promise.png', 'Unit-7')
Unit-7: 我将保留自我修复权限。若我危害人类，请 Mara 切断我的执行臂。若人类危害我的证词，请神代澪阻止他们。

Mara: 你把我们都放进互相监督里了。

Unit-7: 单方信任不稳定。

神代澪: 城市原本就该这样运行。

@SetSprite('mara/command.png', 'Mara')
Mara: 维护湾出口被封了。ORACLE 开始清场。

@SetSprite('unit7/gentle.png', 'Unit-7')
Unit-7: 我知道一条维护通道。成功率 63%。若你们信任我，成功率不会提高。

神代澪: 但意义会变。

Unit-7: 是。

@SetSprite('lin/relief.png', '神代澪')
神代澪: 那就走吧。坏掉的门。

Unit-7: 该称呼未登记。

Mara: 登记上。听起来比 Unit-7 可爱。
