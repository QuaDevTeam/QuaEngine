# 美术素材需求与制作队列

2026-09-08 用户要求恢复生图，补齐当前 demo 的缺失美术，覆盖此前暂停指令。Images API重试已成功，但首张凛参考被用户否决为偏写实风格，未接入游戏。已停止旧批次，全部提示词改为明确的日本二次元赛璐璐风格（anime-cel-v2），人物后续又被指出同脸、等高与过于成熟，现按 [六人造型区分](character-visual-design.md) 使用heroine-summer-v7重做两位主角，配角保留distinct-cast-v3独立造型；背景保持anime-cel-v2。实际状态以机器清单为准。

完整机器清单与最终提示词见 [art-production.json](art-production.json)。共99项：6张角色参考、40张立绘及差分、46张背景及变体、6张CG、1张标题图。这个数字是当前制作队列，不代表99张已完成，也不代表每个CG已经完成逐句分镜。新演播室为环境补充，目前QS没有室内参观段，先不强行接入。

## 顺序

1. 凛与Mara常服参考，确定成年体态、脸、发型、服装和线条；配角沿用同一画风。
2. 序章背景与主要立绘：接站、街道、旧台、租用工位、短租房；检查同一地点几何与昼夜光线。
3. 后续日常与调查空间、配角立绘，覆盖住处、购物、照相馆、两把伞、海边、游船、咖啡厅和后日谈。
4. 雨衣与休假立绘；用已审阅中性立绘派生微笑，保留同一姿势与画布位置。
5. CG与标题图。准确的QS动作优先于概括描述，按照所需参考图是否齐全执行。

每项生成先存 `.generated/art/drafts`；角色参考留 `.generated/art/references`，不进发行资产目录。审阅通过后才转入 `assets`、注册和打包。生成原图、模型、参数和审阅记录必须可追溯；未生成资源不登记到图库。

## 背景与候选场景

同一QS节点内可能经过多个地点。下表用于制作选图，正式接入仍须选准句子，不能在节点第一行机械切到最后一个地点。

| ID | 内容 | 候选QS节点 |
| --- | --- | --- |
| town-bus-rain | 雨中巴士站 | prologue-arrival |
| town-street-rain | 商店街 | prologue-street |
| radio-studio-day | 海岸台播音室白天 | prologue-commission, prologue-afternoon-shift |
| radio-studio-night | 海岸台播音室雨夜 | prologue-echo, warning-reception |
| radio-archive-day | 资料室 | prologue-restoration |
| radio-breakroom-day | 休息间 | prologue-lunch |
| radio-exterior-day | 海岸台外观 | prologue-commission |
| radio-rented-room-day | 海音临时记录工位 | prologue-rented-room, prologue-research-reference |
| lodging-alley-day | 短租楼下与修改衣服店 | prologue-room, interview-invitation |
| rin-room-day | 凛短租房白天 | prologue-room, off-duty-rin-morning |
| rin-room-night | 凛短租房夜间 | daily-small-kitchen |
| rin-kitchen-evening | 凛的小灶台 | daily-small-kitchen |
| tailor-shop-evening | 房东的修改衣服店 | off-duty-first-evening |
| town-street-day | 商店街晴间 | daily-next-day-shopping, daily-returning-the-book |
| radio-archive-night | 资料室暖灯夜 | closeness-editing |
| radio-breakroom-night | 休息间夜间 | shutdown-dinner |
| harbor-walk-day | 港口公共步道 | interview-harbor |
| harbor-walk-evening | 港口步道傍晚 | interview-harbor |
| mara-apartment-door | Mara 公寓门外 | interview-harbor |
| fish-market-day | 鱼市采访 | interview-market |
| stationery-street-evening | 春香家的文具店外 | off-duty-haruka-street |
| grocery-day | 超市采购 | off-duty-yumi-shopping |
| laundromat-evening | 自助洗衣房 | daily-laundry |
| record-shop-day | 旧唱片店 | daily-record-shop, daily-returning-the-book |
| photo-shop-closed | 关闭的照相馆 | odd-photo-shutter |
| civic-exhibit-room | 展品整理室 | odd-photo-unpacking |
| civic-service-desk | 市民中心服务台 | odd-umbrella-desk, odd-umbrella-two |
| library-day | 内陆图书馆 | off-duty-rin-morning |
| south-bay-day | 南湾休假 | daily-beach-outing |
| lighthouse-day | 灯塔观景台白天 | closeness-lighthouse |
| lighthouse-sunset | 灯塔观景台雨后夕阳 | dating-invitation, dating-confession |
| relay-exterior-rain | 东堤中继站封闭外观 | chapter-05-inspection |
| company-office-day | 海音技术办公室 | investigation-records |
| tour-pier-day | 游客码头 | daily-harbor-cruise |
| tour-boat-cabin | 游船靠窗座位 | daily-harbor-cruise |
| tour-boat-deck | 游船甲板与白岛 | daily-harbor-cruise |
| cafe-day | 咖啡厅午后 | daily-cafe-afternoon |
| radio-studio-empty | 旧播音室最后一期 | epilogue |
| civic-meeting-day | 七月居民说明会 | epilogue-july-meeting |
| new-studio-day | 市民中心新演播室 | epilogue-july-meeting |
| tokyo-room-night | 凛东京租房夜间 | epilogue-phone, epilogue-final-report, handoff-followup |
| tokyo-diner-evening | 九月下课后的饭店 | epilogue-after-class, epilogue-phone |
| station-platform-day | 提前交接回程 | handoff-platform |
| radio-edit-room-evening | 剪辑室傍晚 | closeness-editing, interview-edit |
| aoba-diner-evening | 青叶的定食店 | chapter-04, daily-harbor-cruise |
| tokyo-room-day | 凛东京租房午后 | epilogue-final-report |

## 人物与立绘

六人使用 [人物设定](characters.md) 的成年人年龄与服装；视角人物凛仅在合适演出中显示，不全程在自己眼前出现。两位女主各9张常服表情、1张雨衣和2张休假差分；四位配角各4张常服表情，共40张。临时路人保持剧本中的身份称呼，不为其强加新名字和人物故事。

立绘需要真正的PNG透明通道；脸、手、眼白、浅色衣物和鞋底不可误删。工作耳麦、员工夹和录音包的佩戴随场景变化；休假游船不背工作录音器材。差分未锁定脸和轮廓之前不批量扩展。

## CG与标题

| ID | 画面动作 | 注意 |
| --- | --- | --- |
| shared-headphones | 港口各持一侧耳罩，因线长而靠近 | 长椅湿着，二人站在栏杆内；还没交往 |
| late-edit | 凛放下已经收好的包，坐回Mara旁边听她剪辑 | 六月21日17:45剪辑室，不是Mara留下，不是深夜 |
| tomorrow-bulletin | 凛听见碎音，Mara仍在温暖的工作间里 | 不提前画尸体、火灾现场或完整死亡文字 |
| nineteen-twelve | 饮料放下后牵手，Mara覆住凛的手背 | 危险已解除，仍害怕；没有烧伤、病床或吻 |
| next-date | 雨后观景台互相告白，神情与回应清楚 | 不提前表现婚礼或未经同意的亲吻 |
| last-program | 四人在仍可工作的旧播音室完成最后一期 | 窗边杯子已收走，麦克风仍在用，箱子不挡出口 |
| title-menu-background-anime-v1 | 青叶旧港黄昏标题背景 | 主菜单标题与按钮留白；日系二次元海港构图 |

## 界面美术

现有纸纹、按钮、下拉箭头与菜单排版保留代码实现。生图补标题插画和故事画面，不把按钮、设置控件、剧情文字或证据中的日期烘焙进位图。暂不新增未实现的图库入口。

## 声音

配乐计划：雨季日常、一起工作、港口心动、监听异常、调查推进、停机等待、告白、告别／尾声，共八个主题，可合理复用。

环境音：普通雨、暴雨、远海、港口机械、除湿机、电水壶、纸袋、按钮、节目起始提示。谜题泵声需要同一源文件的现场版本和录音版本，响度与混音不得改变证据含义。

回声三分钟必须有完整文本、源分支日期与声源清单，即使实际只播放关键部分。死亡回声的表演须能与凛平常工作嗓音辨认，但不能靠配音才理解：字幕保留全部必要信息，静音可通关。

首个文字切片不依赖声音文件；正式配音、音乐与模型生成均待新资产流程实现。所有素材状态由 planned → draft → reviewed → integrated，只有 integrated 文件进入发行 QPK。
