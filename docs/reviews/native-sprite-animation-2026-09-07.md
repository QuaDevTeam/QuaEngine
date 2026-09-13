# Native sprite / animation / border-image 实现记录

这轮将此前只有字段或部分绘制支持的能力接入 Rust 资源、投影和 GPU 链路。引擎/store 仍拥有人物、表情、动画和剧情状态；Native 只解析已挂载 QPK 的资源元数据并绘制投影。

## 已补齐的部分

- **Border image**：QSS source/slice/width/repeat 进入真实九宫格绘制，支持 stretch、居中 repeat、边缘残片裁切、fill 和目的边框相互重叠时的等比压缩。slice 使用源图 texel，width 使用逻辑舞台单位；DPR 只缩放目的几何。切片采样限制在各自区域，修复 repeat 时相邻颜色渗入造成的接缝。
- **Sprite 资源**：原生 product loop 从 mounted QPK 读取 version-1 manifest，按引擎 expression 解析图层，合并 atlas frame 覆盖字段并处理声明的 missing-asset fallback。支持默认 family manifest 和显式 JSON sprite 引用；已解析的 spriteBase/spriteLayers 优先。资源查找保留 package priority/provenance，不退到无关包。
- **Sprite 绘制**：atlas 使用解码尺寸转换 texel UV；无效或尚无尺寸的 crop 不显示整张 atlas。父子 offset/scale/rotation 组合、局部 mask/blend 和父级整体透明度进入绘制链路。人物负 scale 按 Web 等比负缩放处理，即两轴反向；图层 scale 现也支持有界负值和零值；见下方追加的图层动画验证。
- **引擎动画**：修正 delay/fill 导致停止请求帧、playbackRate 与活动期不一致等问题。实时 app 使用 Rust 瞬时插值，固定时间 TS 序列化继续复用共享 render-core；没有活动 timeline 时保留引擎已结算的 dialogue/choices motion。
- **可见动画目标**：stage/camera 对场景子树变换；dialogue、choices panel、choice 和 UI overlay 的位置、scale、rotation、opacity 作为整组绘制，命中测试反变换，hover variant 保留组变换，UI 保留原有效叠层位置。rich-text document/block/span 的 typography 动画同时更新 revealed text 和 full-layout text。数值 font-weight 插值取原生整数字重。span target 使用共享格式 `richTextSpan:dialogue:<id-or-index>`，允许跨 block 同名目标。
- **生命周期**：sprite metadata cache 限制为 128 个查询、单 manifest 2 MiB、单表情 256 层；mount/version/hash 变化、显式 lifecycle tick 和 shutdown 清理缓存。静态缓存帧不额外查询 host。图片和 mask 继续进入既有 package 资源清理链路。

## 实际光栅验证

macOS Apple M4 / Metal 与 Chrome，1920×1080 逻辑舞台，同一 Quack QPK。`features.mjs` 使用显式尺寸的 sprite/atlas fixture 和 Web `spriteLayerStyle` 变换/mask 样式；它不覆盖混合自然尺寸的完整 Web sprite DOM 布局。

| 用例 | RGB MAE（0..255） | 最大通道差超过 32 的像素占比 |
|---|---:|---:|
| border stretch/repeat/fill/hollow/重叠宽度 | 0.635 | 0.0614% |
| border，1920×1200 留黑边 | 0.635 | 0.0614% |
| manifest + atlas + 父子旋转/负缩放 | 0.808 | 0.3818% |
| sprite mask/blend + 父子变换 | 0.266 | 0.1442% |
| stage/camera + sprite 组合 | 0.572 | 0.1263% |

误差按两张图片已绘制区域的并集归一化，黑边不稀释误差；门槛保持 MAE ≤ 3、超 32 比例 ≤ 1.5%。首次对照确实检出了切片接缝并据此修复，未放宽门槛。另有 **11/11** resolved sprite 回归通过，包括透明度、presence、隐藏层、局部和人物层级、mask/blend、留黑边；该组最坏 MAE 0.111，超 16 像素比例为 0。

```sh
node scripts/native-render-audit/features.mjs
node scripts/native-render-audit/sprite.mjs
```

报告及成对 PNG：`packages/native/target/render-audit/{features,sprite}/{measurements.json,review.html}`。允许用 `QUA_NATIVE_AUDIT_APP` + `--skip-build` 指定已构建二进制；features 报告记录 SHA-256。截图验证包含解码上传和退出清理，无资源错误。这些是指定夹具的覆盖结果，不是整个 renderer 的视觉评分。

## 验证与后续边界

Rust renderer 871 项、完整 native-window/QuickJS/audio app 282 项 + 14 CLI 项通过；engine-native 完整套件 108 项、typecheck/build 通过；native-ui-compiler 225 项通过。完整 demo E2E 已验证剧情、分支、settings/gallery、原生音频退出清理和实际 Metal PNG 回读，最终完整流程日志为 `packages/native/target/parity-demo-e2e-final.log`；详见 [执行优化记录](native-quickjs-performance-2026-09-07.md)。窗口仍报告 occluded，不宣称已验证可见 OS 窗口呈现。

仍需继续补齐：

- CSS border-image percentage slice、gradient、outset、round/space；超过 4096 个 tile 的病态输入目前退回 stretch。
- 自动 UI skin manifest 绑定；混合自然尺寸/trimmed atlas frame 的 sprite canvas 排版；spriteLayer 最终状态 commit adapter（下述瞬时绘制已支持）。
- 任意 rich block/span 仿射变换和完整 typography/bidi/font-fallback/ruby 契约。
- 通用 animation-plugin 的 audioBus/audioTrack target（原生 EQ/automation 属于独立音频投影链路）；完整分层背景根变换和更广的 composition 属性组合。
- MP4/WebM 等完整视频解码及可见 OS 窗口呈现验证。

上述未完成能力不能由“目标匹配到 JSON 字段”或“存在类型声明”推断为已完成。


## 追加：Sprite 图层动画已接通

本批补齐真实引擎 timeline → Rust 帧时钟 → QPK manifest → GPU 绘制链路。图层资源在 product loop 才解析，因此时钟先采样 transient `spriteLayerAnimationValues`，绘制阶段再应用到已解析图层。未增加时钟、事件总线或权威状态；测试验证动画不修改原始 manifest，也不额外读取已缓存的 QPK。

支持 `offsetX`、`offsetY`、`scale`、`rotation`、`opacity`、整数 `zIndex`、`visible`、`blendMode`。选择器分组依次应用 `spriteLayer:<id>:<kind>:<index>`、`spriteLayer:<id>:<kind>`、`spriteLayer:<id>:<index>`，后组覆盖前组；base 索引为 0，expression 从 1 起，atlas 保留 base/expression kind。支持含冒号的角色 id，避免前缀碰撞。单角色最多 1024 个采样值，忽略不安全的数值和不支持的属性。移除 timeline 清除派生值，暂停不会积累位移。

图层零缩放隐藏该层，有界负缩放按两轴反向处理，image 和 mask 一同旋转；base 层级不再被强制归零。固定时间 TS serializer 复用 render-core；帧级 `projectAnimations:false` 现在正确转发。精简帧缺少 plugins 时，动画序列化也不会访问不存在的 audio 字段。引擎 timeline 的 ease-in/out/in-out 已修正为共享 render-core 的二次曲线，CSS interaction 曲线保持 CSS 语义。

`commit: 'none'` 是当前图层效果的使用方式。Web 与 Native 均没有官方 spriteLayer 最终状态 adapter：默认非严格模式会警告但仍发布 timeline，`strictAdapters:true` 要求应用提供 adapter。`commit:none` 加 forwards/both fill 可由引擎保留结束投影。资源切换 asset/mask/frame 不属于本批样式动画支持，不能宣称默认 commit:final 或只写 decorator 就能持久化最终图层状态。

### 最终构建的真实截图

使用实际 Web `updateSpriteLayerAnimations` / `spriteLayerStyle`，Native 使用真实 Rust 时钟并由 app 解析同一 Quack QPK。固定 240×240 图层画布、1920×1080 逻辑舞台，父级缩放/旋转/透明度共同参与。测试 epoch 保证角色入场已结束，两端共享确定的 timeline 局部时间。12/12 通过，门槛未放宽。Native 回读保留 alpha，Web 截图已合成到黑色；比较时两者均先合成到相同黑色背景，报告图片也使用黑色底。

| 用例 | RGB MAE（0..255） | 最大通道差超过 32 的像素占比 |
|---|---:|---:|
| 原始组合 | 0.091 | 0.0049% |
| 表情组位移 + 单层透明度 | 0.143 | 0.0091% |
| 选择器优先级 | 0.181 | 0.1659% |
| base 缩放为零 | 0.245 | 0.4162% |
| 负缩放 + mask + 旋转 | 0.112 | 0.0050% |
| base 动画改变层级 | 0.182 | 0.0000% |
| 离散隐藏 + blend | 0.005 | 0.0000% |
| delay / fill:none | 0.091 | 0.0049% |
| 0.5 倍速 + alternate 循环 | 0.349 | 0.5888% |
| 暂停后固定采样 | 0.100 | 0.0049% |
| 引擎 ease-in | 0.313 | 0.3597% |
| 引擎 ease-out + 留黑边 | 0.210 | 0.3278% |

全部用例纹理上传、字体及 shutdown cleanup 错误为零，上传纹理全部释放。浏览器 152.0.7977.76；app SHA-256 `474ffb381e05a2b0e4953c9c99e35cfea66fff72093b1ff9162d07b53164c70d`；时钟 adapter SHA-256 `89e55d5e1046d1f538f44482b78cbd179c38d4159a4eaf2e5a217ef1aa18ea82`。报告记录生成时的工作树状态和 revision。

```sh
node scripts/native-render-audit/sprite-animation.mjs
```

报告与成对 PNG 位于 `packages/native/target/render-audit/sprite-animation/`。可用 `QUA_NATIVE_AUDIT_APP`、`QUA_NATIVE_AUDIT_CLOCK` 与 `--skip-build` 指定两个已构建的精确二进制。外置卷启动受阻时，将相同二进制复制到 `/tmp` 后运行；不关闭签名校验。

### 本批验证

- Rust renderer **876** 项；完整 native-window/QuickJS/audio app **283 + 14 CLI** 项通过。
- engine-native 完整 **110** 项通过，含真实 Rust/rquickjs 调用 character/animation helpers、采样图层轨道、实际 render graph 与结算几何对照、package unload；typecheck/build 通过。最后补充的前缀隔离用例另行复核通过。
- 完整 `pnpm native:e2e` 通过：**63** 条 dialogue projection、stealth 分支、settings/gallery/返回 title；**199 commands / 4 passes**，1920×1080 Metal PNG 回读有效。纹理/字体/清理错误为零，退出后音频轨道为零。日志：`packages/native/target/sprite-animation-demo-e2e.log`。
- OS 窗口仍报告 `OccludedAfterRetry` / `presented:false`；上述 GPU 证据来自真实 offscreen Metal 回读，不代表可见 OS 窗口已验证。

混合自然尺寸/trimmed atlas 排版、自动 UI skin、任意富文本仿射变换、通用音频 timeline、完整视频解码等仍按上方边界继续推进。
