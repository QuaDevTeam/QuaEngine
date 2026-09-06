# Native Renderer / Web 渲染审计（2026-09-06 更新）

审计环境为 macOS Apple M4、Metal/WGPU、1920×1080 逻辑舞台、960×540 窗口、DPR 2。Native 和 Chrome 使用相同 QPK 图片/字体及逻辑坐标。MAE 是每个 RGB 通道的平均绝对误差（0..255），只说明对应夹具的结果，不能作为完整渲染器评分。

现有渲染语义修复已在 `0b2b6aa9` 提交。本次继续补齐背景合成，并纠正旧审计中仍引用早期数字、装饰退 bitmap、增益 clamp 到 1 等过时结论。

## 已实现的语义

- UI 父级和嵌套 opacity 对整棵子树只应用一次；stacking context 保持原子 z 顺序。透明渐变采用预乘 sRGB 插值，避免透明颜色污染。
- 图片使用 intrinsic decoded 尺寸解析 cover/contain/fill/none/scale-down/origin；图像 mip 链使用预乘 sRGB 降采样。字体 atlas 保持单级，防止字形间采样污染。
- 独立四角圆角共享 CSS 半径缩放约束，供 paint、hit test、variant clip 使用。Backdrop blur 从实际绘制位置捕获之前的 backdrop root，支持父组/自身 opacity。
- 高分辨率字体支持 synthetic italic、underline、strike、裁剪后的文字阴影、按测量宽度 ellipsis、grapheme wrapping 和 soft-wrap justify。字体字号使用 em/UPEM 语义和物理字号 bucket；动态图集仅保留最近文本请求，并按 face/glyph ID 判断连字缺失。
- Native 音频线性 gain 接受 0..16，保留 +dB boost；EQ 和 automation 已通过 track → bus → master processing projection 接入 Rodio，参数更新不会重启播放源。
- 背景新增 16 种标准 CSS blend mode，包含 hue/saturation/color/luminosity；使用非预乘 sRGB 颜色计算 blend，再按源与底层 alpha 做预乘 source-over。
- 分层背景始终构成独立 stacking context，与 Web 的 transformed root 一致：子层先与之前的兄弟层混合，再统一应用背景 opacity/filter。单层 blur 的 primitive alpha 和 group opacity 不再重复相乘。
- 背景滤镜在 blur 后依次应用 brightness → contrast → saturate → hue-rotate → grayscale → sepia；native invert 扩展最后应用。视频帧/海报使用外层 background 的 opacity、fit/origin 和 composition。
- Blend 和 backdrop blur 共用一个捕获 scratch，纳入 16 层 / 256 MiB 临时纹理预算；不用时释放，空帧清理 compositor。PNG 导出将 GPU 预乘 RGBA 转为 straight alpha，修复透明截图再次合成变暗。

## 真实截图结果

基础 UI 审计报告：`packages/native/target/render-audit/measurements.json` 与 `review.html`。背景合成专项报告：同目录下 `background/measurements.json` 与 `background/review.html`。

基础 UI **70/70** 用例通过 JSON 入口并完成真实光栅对照；本次与背景改动前记录比较，没有 MAE 增加超过 0.01 的用例。

| 特性 | MAE |
|---|---:|
| 父组 / 嵌套 opacity / stacking context | 0.437 / 0.485 / 0.281 |
| 透明渐变 / 渐变叠底色 | 0.060 / 0.095 |
| 独立圆角 / rotation | 0.044 / 0.254 |
| 图片 cover / contain / fill | 1.956 / 2.570 / 1.340 |
| origin / none / scale-down | 1.513 / 0.066 / 2.570 |
| 图片 blur / background-image | 3.044 / 0.784 |
| backdrop blur / 父组 opacity / 自身 opacity | 2.296 / 1.782 / 2.788 |
| Latin / CJK / word wrap | 0.845 / 1.597 / 2.889 |
| italic / underline / strike | 0.694 / 1.145 / 1.284 |
| text shadow / clipped italic shadow | 0.741 / 3.315 |
| ellipsis / justify / Arabic bidi | 1.071 / 2.819 / 5.769 |

背景专项 **22/22** 用例完成截图，texture/font upload errors 均为 0：

| 背景用例 | 重叠区域 MAE | 整帧 MAE |
|---|---:|---:|
| blend-normal | 1.535 | 1.820 |
| blend-multiply | 1.436 | 1.761 |
| blend-screen | 1.922 | 1.990 |
| blend-overlay | 2.315 | 2.151 |
| blend-darken | 1.471 | 1.784 |
| blend-lighten | 2.012 | 2.023 |
| blend-color-dodge | 2.184 | 2.099 |
| blend-color-burn | 2.634 | 2.289 |
| blend-hard-light | 2.139 | 2.072 |
| blend-soft-light | 2.251 | 2.122 |
| blend-difference | 2.037 | 2.040 |
| blend-exclusion | 1.623 | 1.863 |
| blend-hue | 2.193 | 2.099 |
| blend-saturation | 2.101 | 2.054 |
| blend-color | 2.065 | 2.039 |
| blend-luminosity | 1.431 | 1.774 |
| blur-opacity | 2.204 | 2.021 |
| layered-opacity | 1.087 | 1.190 |
| layered-filter | 1.896 | 2.170 |
| layered-isolation | 1.320 | 1.294 |
| layer-filter-blend | 1.845 | 2.004 |
| translucent-backdrop | 1.542 | 1.340 |

背景夹具使用真实 `backgroundProjectionVars` / `backgroundLayerProjectionVars` 生成 Chrome CSS，并经过 `createNativeRendererViewProjection` 和 Rust JSON 入口生成 Native 帧。双方从 demo native QPK 读取相同图片。背景报告同时记录重叠区域和整帧误差，透明截图统一叠到黑色底上。JSON 接受、GPU 提交与截图成功只证明该夹具可用；滤镜和混合后的画面仍需结合误差和图片检查。

## 验证记录

- `quajs_wgpu_renderer --features real-wgpu-noop,image-decode --lib`：**830 passed**，覆盖 blend/filter group、不同 blend mode 切换、scratch 复用/释放、PNG alpha 回归。日志：`background-tests.log`。
- `quajs_native_app --features native-window,native-audio-rodio --bin quajs_native_app`：**268 passed**。日志：`background-app-tests.log`。
- `native-window` app 构建通过；UI 70 项和背景 22 项真实 Metal/Chrome 截图完成，基础 UI 没有超过 0.01 MAE 的退化。背景门槛为重叠区域/整帧 MAE ≤ 4，最大通道差超过 16 的像素比例 ≤ 8%。
- `pnpm native:e2e`：**通过**。68 条对白、stealth 选择、settings、gallery、返回 title；147 batches / 199 commands / 4 passes，1920×1080 PNG，texture/font/cleanup errors 全部 0，最终 67 个 shaped text draws、0 bitmap draws。Rodio active tracks 最终 0、peak 1。一次窗口 occluded 导致 present 重试，最终 Presented；无 surface/device recovery error。日志：`background-e2e.log`。
- `node --check scripts/native-render-audit/background.mjs` 与 `git diff --check` 通过。

前一批已完成的检查（`0b2b6aa9`，不作为本次新增重跑）：engine-native 105 tests 与 typecheck、native UI compiler 225 tests。该批完整 demo E2E 走过 71 条对白、stealth 选择、settings、gallery、返回 title；147 batches / 199 commands / 4 passes，1920×1080 PNG，texture/font/cleanup errors 均为 0，Rodio active tracks 最终 0、peak 1。

历史 debug 微基准供定位使用：344 commands 稳定提交 120 次约 1.805 ms/frame，192 个文本节点 buffer 构建 24 次约 4.51 ms/次，256 资源替换 64 次约 11.58 ms/次。它们不是 release FPS，也不含完整窗口合成。本次未重测这些微基准。

## 仍未对齐

1. **背景组合：** mask 资源采样/布局、drop-shadow、layered root 的完整变换、各视频子层解码仍待实现。大 blur 半径的固定采样近似、filter 与 scale/rotation 的组合还需要专门截图验证。
2. **富文本：** native dialogue 仍 flatten span，部分 span 样式在 TS 桥接时丢失；需要真实 inline run layout、多字体资源和 typewriter grapheme 对齐，不能用多个估算宽度文字框替代。
3. **字体：** Arabic/bidi 仍有可见误差；跨字体逐 cluster fallback、竖排和语言相关断字未完成。当前截图不证明浏览器级文字布局。
4. **音视频：** EQ/automation 已接入并有 native focused backend tests；GIF 有解码与发布测试，MP4/WebM 尚无解码器或产品实测。demo E2E 的 video decoded/published 为 0。
5. **Sprite/UI skin：** 多层 sprite manifest、expression diff 和 UI skin 的 native 投影仍缺。只有 sprite/expression 字符串不能视为 Web 多层效果。
6. **动态场景：** stage/camera/effects/scene transition 需要真实 GPU 时间序列对照；基础数值动画测试不覆盖全部 composition/effect target。
7. **产品覆盖：** keyboard/IME 产品 E2E 仍为 0；portrait、多分辨率、safe-area、多 GPU，以及圆角/border/shadow/rotation 复杂组合仍需补截图。此前 live CDP 超时不能算产品 Web/native parity 已通过。
8. **工具链历史缺口：** 旧 QUI benchmark/LSP fixture 迁移失败仍需单独复核；本次没有把旧结果作为 GPU 绘制失败或已修复项。

## 重现

```bash
cargo build --locked --manifest-path packages/native/Cargo.toml \
  -p quajs_native_app --features native-window

node scripts/native-render-audit.mjs --skip-build
node scripts/native-render-audit/background.mjs --skip-build
node scripts/native-render-audit/bridge.mjs

cargo test --locked --manifest-path packages/native/Cargo.toml \
  -p quajs_wgpu_renderer --features real-wgpu-noop,image-decode --lib

cargo test --locked --manifest-path packages/native/Cargo.toml \
  -p quajs_native_app --features native-window,native-audio-rodio --bin quajs_native_app

pnpm native:e2e
```

可用 `QUA_PARITY_CHROMIUM` 指定 Chromium executable，用 `QUA_NATIVE_AUDIT_APP` 固定审计 binary。外置卷上的新 Mach-O 偶尔停在 `_dyld_start`；本机复制到 `/tmp` 后可以正常运行，Cargo 测试可通过 `CARGO_TARGET_AARCH64_APPLE_DARWIN_RUNNER` 指向本机临时复制 runner。不能因此禁用系统签名检查，也不能将机器专属路径作为公共运行接口。
