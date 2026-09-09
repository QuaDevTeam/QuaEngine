# 资产制作流程

2026-09-08 用户已要求开始图片制作，覆盖此前暂停。当前完整队列为 [art-production.json](art-production.json)；[prologue-art.json](prologue-art.json)保留首批八项提示词。六人基础透明PNG、39张审核背景与6张CG/标题图已准备到assets并通过素材检查，尚未全部添加剧情出场；生成、拒稿与审阅状态以机器清单为准。

## 当前执行状态

用户已明确授权使用Replicate CLI的`openai/gpt-image-2`继续生图；2026-09-09已实际生成并下载灯塔等背景。使用Replicate已有登录配置，不向模型传Codex密钥。此前503仅属于原OpenAI兼容provider，不再视为制作阻塞。无需再次确认接口或模型。

首张凛参考被用户否决为偏写实风格。旧批次已停止，旧图移到`.generated/art/rejected/semi-realistic`，不可继续作为参考。背景使用anime-cel-v2；人物v2再次因同脸、等高与年龄感过大被否决，已停止人物批次。两位主角现改用heroine-summer-v7，先做凛中性便服、Mara长发温柔御姐、172cm且比凛高9cm的同季节双人设计对照；配角保持distinct-cast-v3。每个身份由独立文字定义，只允许同一人的差分引用她自己的图；先检查脸型与身高对照，再制作差分。

## 制作与审阅

1. 先查characters、worldbuilding、prompt-bible与候选QS段落；同一节点可能转场，usedBy不等于第一句的接图位置。
2. 先做各人独立参考与基础空间，再用同一个角色自己的已审阅图片派生表情、服装；天气变体使用同一个空间参考，CG组合各自的身份参考。内置编辑本地图片前先view_image；不要只把参考文件名写进提示词冒充提供图片。
3. 所有生成结果先进入`.generated/art/drafts`；参考图进入`.generated/art/references`。记录工具、模型、参数、原始输出路径、文件哈希与审阅结论。失败图不进发行包。
4. 逐张检查成年体态、角色脸、头发、手、衣服、背景几何、文字禁区和QS连续性。雨衣不透衣，白色衣服与眼白不得被抠掉；脸部差分保持同一画布和锚点。
5. 真透明立绘保存PNG；背景和CG保留16:9原图，导出适合1920×1080逻辑舞台的发行图。不扭曲长宽比例、不机械裁掉脚或线索。CLI模式的模型与透明能力以imagegen当前文档为准，未经选择不悄悄换模型。
6. 仅实际审阅通过的文件进入`assets`，由sprite/background/gallery等现有插件接入，状态从planned→draft→reviewed→integrated。参考图不是立绘，不打包；不存在的路径不得注册。
7. 静态素材使用Quack主QPK；将来运行时增量才使用Runtime QPK。Web/native共享QS与逻辑投影，不引入散文件直推或渲染层剧情状态。
8. 检查标题长中文文本和菜单、人物脚底与对白框、背景转场、存读档恢复、分支CG解锁与画面清理。别让CG提前透露文本尚未揭示的消息，也不要因显示远程现场照片制造凛亲临禁区的错觉。

## 验证入口

```sh
pnpm --filter demo assets:build
pnpm --filter demo typecheck
pnpm --filter demo exec vite build --config vite.native-quickjs.config.ts
pnpm --filter demo build
pnpm --filter demo test:story
```

先native编译，再清理其生成的native bootstrap后做Web构建，防止跨目标文件混入。现阶段只修改制作文件，不新增虚假的assets:generate命令、不改QS，不因清单调整重跑整套游戏回归。实际接入图片后再执行相关编译、QPK与浏览器验证。配乐、环境音和配音仍是独立待制作范围。

## Replicate人物抠图

用户已确认v7造型并指定用Replicate修复抠图。当前采用851-labs/background-remover的soft alpha，原始RGB输入，不继承旧手工mask。流程、固定版本和审阅结果见[人物抠图交付](character-cutouts.md)。本地仅拆分人物、裁切留边与等比排版；禁止重新用RGB阈值、腐蚀或手绘补洞破坏模型边缘。后续表情应从合格身份图派生。
