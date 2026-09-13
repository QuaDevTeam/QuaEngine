# 人物抠图交付

2026-09-09：用户已确认 `heroine-summer-v7` 造型，并否决此前手工抠图质量，指定使用本地 Replicate CLI。此次从原始 RGB 图片重新处理，未将受损的手工透明图作为输入。

## 模型选择与结果

选用 `851-labs/background-remover`，固定版本 `a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc`，参数 `threshold=0`、`background_type=rgba`、`format=png`。同图比较了 `men1scus/birefnet`；前者在当前角色发梢上更连贯，因此采用前者。保留模型原始 soft alpha，不用颜色阈值重建、收缩或绘制人物轮廓。

已处理凛、Mara、春香、真由、礼子、由美，共六张独立透明 PNG。文件位于 `demo/assets/characters/<id>/neutral.png`，每人配一个仅含 `neutral` 的 `sprite.manifest.json`。由美的服装季节复核仍待后续；抠图通过不等于服装重设计完成。没有复制基础图来冒充未生成的表情。

所有图片采用 768×1536 画布、脚底逻辑位置 1488，按身高等比排版，原始模型结果保存在 `.generated/art/replicate`。两位主角使用同一张用户确认的原图进行一次抠图，然后仅按空间归属拆开两人。排版脚本的 alpha 阈值只用于测量包围盒及识别人形区域，不替换或二值化输出透明度。

已查看[六人深浅背景对照](../.generated/art/review/replicate-cast-alpha-review.jpg)及[模型细节对比](../.generated/art/review/removebg-model-comparison.png)，检查发丝、眼白、手、浅色上衣、裙摆和鞋底。新文件替换旧手工抠图；旧算法已移入忽略目录下的拒稿归档，不再用于生产。

## 复现

使用本机已配置的 Replicate profile，不将密钥写入命令、项目文件或记录。

```sh
replicate --json schema 851-labs/background-remover
replicate --json run 851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc \
  --input-file image=demo/.generated/art/review/heroine-pair-summer-v7.png \
  --input threshold=0 --input background_type=rgba --input format=png \
  --output demo/.generated/art/replicate/heroine-pair --wait 30
```

四位配角分别使用 `drafts/<id>-reference-distinct-v3.png`。新模型先 dry-run，成功的 prediction ID、版本、参数、原图路径和输出哈希记录于 `art-production.json`。CLI 结果 JSON 及下载 manifest 保留在对应 `.generated/art/replicate` 目录。

`demo/scripts/prepare-character-cutouts.py` 只做拆分与等比排版，需要 Pillow、numpy、scipy；从仓库根目录运行。它读取已下载的模型结果，输出至 `.generated/art/reviewed`；人工审阅后才复制到 `assets/characters`。

## 当前边界

`pnpm --filter demo assets:build` 已通过 Web、macOS、Windows、Linux 四种静态 QPK 打包。此处完成的是资产准备，尚未添加 QS 出场或游戏内表情切换。后续接入仍须核对 Mara 长发、裙装、雨衣和凛外搭袖口等实际描写。

新增场景、表情及 CG 的 Images API 目前返回 `503 No available compatible accounts`；背景批次、单张生成与单张编辑均已复查。Replicate 抠图正常，不代表该生图接口已经恢复。
