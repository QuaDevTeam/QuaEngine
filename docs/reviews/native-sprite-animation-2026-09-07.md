# Native sprite / animation / border-image 实现记录

这轮将此前只有字段或部分绘制支持的能力接入 Rust 资源、投影和 GPU 链路。引擎/store 仍拥有人物、表情、动画和剧情状态；Native 只解析已挂载 QPK 的资源元数据并绘制投影。

## 已补齐的部分

- **Border image**：QSS source/slice/width/repeat 进入真实九宫格绘制，支持 stretch、居中 repeat、边缘残片裁切、fill 和目的边框相互重叠时的等比压缩。slice 使用源图 texel，width 使用逻辑舞台单位；DPR 只缩放目的几何。切片采样限制在各自区域，修复 repeat 时相邻颜色渗入造成的接缝。
- **Sprite 资源**：原生 product loop 从 mounted QPK 读取 version-1 manifest，按引擎 expression 解析图层，合并 atlas frame 覆盖字段并处理声明的 missing-asset fallback。支持默认 family manifest 和显式 JSON sprite 引用；已解析的 spriteBase/spriteLayers 优先。资源查找保留 package priority/provenance，不退到无关包。
- **Sprite 绘制**：atlas 使用解码尺寸转换 texel UV；无效或尚无尺寸的 crop 不显示整张 atlas。父子 offset/scale/rotation 组合、局部 mask/blend 和父级整体透明度进入绘制链路。人物负 scale 按 Web 等比负缩放处理，即两轴反向；图层 scale 保持正值约束。
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
- 自动 UI skin manifest 绑定；混合自然尺寸/trimmed atlas frame 的 sprite canvas 排版；`spriteLayer:*` 动画。
- 任意 rich block/span 仿射变换和完整 typography/bidi/font-fallback/ruby 契约。
- 通用 animation-plugin 的 audioBus/audioTrack target（原生 EQ/automation 属于独立音频投影链路）；完整分层背景根变换和更广的 composition 属性组合。
- MP4/WebM 等完整视频解码及可见 OS 窗口呈现验证。

上述未完成能力不能由“目标匹配到 JSON 字段”或“存在类型声明”推断为已完成。
