# Native Renderer / Web 渲染审计（2026-09-07 更新）

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

1. **背景组合：** raster mask 的 alpha/luminance、cover/contain/auto/px/percent 尺寸、定位、重复规则及嵌套合成已完成真实像素验证，详见下方 2026-09-06 记录。SVG/多重 mask、完整 layered root 变换、各视频子层解码仍未实现。drop-shadow 后续已改成源图 alpha 子树合成，并修正 Web 参数解析，见下方补充记录。大 blur 半径及 filter/scale/rotation 组合仍需补齐。
2. **富文本：** 桥接保留 inline span 字段，但当前渲染将 runs 按估算宽度分成独立文本框，缺少连续 inline flow、正确 block breaks、混合字号基线和跨 run wrapping；真实 bidi/cluster wrapping、多字体 fallback 和 typewriter grapheme 对齐也未完成。
3. **字体：** Arabic/bidi 仍有可见误差；跨字体逐 cluster fallback、竖排和语言相关断字未完成。当前截图不证明浏览器级文字布局。
4. **音视频：** EQ/automation 已接入并有 native focused backend tests；GIF 有解码与发布测试，MP4/WebM 尚无解码器或产品实测。demo E2E 的 video decoded/published 为 0。
5. **Sprite/UI skin：** native 可读取 package-aware `metadata.spriteLayers` 并绘制基础分层图片；支持字段的数值/资源校验、人物组透明度和局部层级隔离已补齐，见下方 2026-09-07 截图记录。父级变换、manifest JSON 解析、atlas frame、per-layer mask/blend、expression diff 加载和 UI skin manifest 仍待接入，单纯 sprite/expression 字符串仍不等于完整 Web 多层效果。
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

## 2026-09-06 mask 修正与尺寸/重复支持

修复了 mask 只修改 alpha、保留 RGB 导致的彩色残影；luminance 改为纹理亮度乘透明度后再插值。mask 以独立纹理采样，主图缺失时不再误用 mask。分层根节点的遮罩进入 QPK 资源计划，保留依赖包并参与释放。默认值为 Web 的 cover / center / no-repeat；支持 contain、auto、px/percent 尺寸、关键词/px/percent 定位、四段像素边距，以及 repeat/repeat-x/repeat-y/round/space 和双轴组合。不支持的 CSS 表达式在 JSON 入口返回诊断。

尺寸对照还发现并修复了公共 GPU viewport 重复缩放：顶点已含逻辑舞台缩放与黑边偏移，光栅 viewport 应覆盖整个 target，舞台范围用于 scissor。有限窗口审计可以指定物理截图尺寸，DPR 仍来自 winit 实测，不使用 fixture 伪造。

- **54/54 Metal/Chrome 背景像素对照通过**（32 个 mask 用例和原有 22 个合成用例），重叠区最大 RGB MAE 2.498，门槛仍为 MAE ≤ 4、差异超过 16 的像素比例 ≤ 8%。纯白源图 alpha/luminance 的整帧 MAE 为 0.058/0.062。用例涵盖透明彩色 texel、零尺寸、根节点和子层遮罩、旋转、平铺缩小、滤镜/blend、两种方向的黑边及较小窗口。缺失 mask 用例明确要求 upload error 并验证与 Web 的 absent URL 回退一致；其余用例 texture/font errors 为 0。全部用例要求已上传纹理数等于退出释放数、cleanup errors 为 0。
- 截图读取双方相同的 **Quack-built QPK**；测试 PNG 由确定性像素生成器构建，没有新增运行时散装资产入口。报告及日志在 `packages/native/target/render-audit/background/`，通过 `node scripts/native-render-audit/background.mjs` 重现；`--case='mask-*'` 可仅运行 mask 用例。
- Renderer Rust：839 tests passed；native app：274 tests passed；engine-native：105 tests passed、typecheck 通过。
- `pnpm native:e2e` 报告通过：64 条对白、stealth 选择、settings/gallery、返回 title；199 commands / 4 passes，1920×1080 PNG，纹理/字体/清理错误为 0，结束时音频轨道为 0。本次窗口报告 `OccludedAfterRetry`、`presented=false`：验证的是完整应用流程和真实 GPU 离屏截图，不能作为桌面窗口可见呈现的证据。

mask 批次未覆盖 source-alpha drop-shadow（后续见下方补充）、inline text flow、sprite manifest/expression diff、MP4/WebM 或新音频处理效果。

## 2026-09-07 source-alpha drop shadow 补充

移除了矩形 analytic shadow sibling。背景图、子层、分层根节点和视频帧/海报共用 compositor 的源 alpha 轮廓，保留透明孔洞、半透明 texel 和重叠子层。源滤镜之后生成彩色阴影，再统一应用 opacity、mask 和 blend；前置 blur 与阴影 blur 的 Gaussian variance 合并。单图旋转会同步旋转 shadow offset。修正参数解析：`filter.dropShadow` 接收 `12px 18px 24px rgba(0, 0, 0, 0.55)`，无需 `drop-shadow()` 包装，支持带空格的 RGB/RGBA、hex 和基础命名颜色。

新增 11 个 Quack QPK 透明轮廓截图用例，覆盖硬阴影、8/24/48px 模糊、全透明源图、opacity、mask、前置滤镜、旋转、分层根节点和子层 blend。合成测试使用有界的可分离 Gaussian pass，大半径先做线性降采样，保留极大半径细节近似的限制；没有宣称任意尺寸/复杂变换下与浏览器逐像素等价。未解析 currentColor、其他颜色形式、spread/多阴影和非 px 单位均为明确诊断。

- **65/65 Metal/Chrome 背景截图对照通过**。硬阴影及 8/24/48px 阴影重叠区 RGB MAE 分别为 0.001 / 0.017 / 0.054 / 0.133；透明控制、opacity/filter/mask/rotation/root 合成均 ≤ 0.064；这些合成控制用例差异超过 16 的像素比例均为 0。照片 blend 用例 MAE 1.793。透明轮廓使用更严格的逐例门槛，避免照片用例的宽松门槛漏掉稀疏采样条带。
- 模糊缓存只保存可替换的 GPU 临时资源；整个 blur pyramid 和两个 Gaussian 输出按最多两张全帧纹理计入 256 MiB 预算，移除阴影时释放，稳定尺寸复用。资源回归覆盖模糊半径往返变化、窗口放大/缩小、保留 isolation 时移除阴影、空帧清理。
- Renderer 的 841 项原有/阴影测试通过，另加 1 项缓存生命周期回归；Native app 274 项测试通过。最终 Demo E2E 使用仓库指定的 pnpm 11.11.0 入口运行：67 条对白、stealth 分支、settings/gallery、返回 title，199 commands / 4 passes，1920×1080 PNG，纹理/字体/清理错误为 0。`presented=false` / `OccludedAfterRetry`，仍只证明完整流程及真实 GPU 离屏渲染。

截图与测量输出：`packages/native/target/render-audit/background/{review.html,measurements.json}`；最终日志：`shadow-final-e2e.log`、`shadow-lifecycle-tests.log`。此次不包含 MP4/WebM 解码验证，也未替换源图 blur 的既有采样实现。

## 2026-09-07 resolved sprite layer 合成修正

人物基础图与附加图层进入同一 stacking context，先按局部 z-index 合成，再乘人物 opacity × presenceOpacity。此前逐层乘父透明度导致交叠区颜色改变，局部大 z-index 还会越过相邻人物。Rust `Default` 与 serde 默认值统一，避免 DTO 直接构建时 visible=false、opacity/scale=0 导致图层消失；JSON 在准备资源前校验图层资源引用、offset、opacity、正 scale、rotation 和 z-index，直接 Rust 投影跳过非法图层。

- **10/10 Metal/Chrome 截图对照通过**，两端读取同一 Quack characters QPK，Web 使用实际 `spriteLayerStyle`；只验证已解析图层的透明度/层级合成。覆盖 0/0.25/0.5/1 人物透明度、presence fade、隐藏层、负局部层级、相邻人物层级、同层人物插入顺序和黑边窗口。检查了透明底图在黑色背景上的并排截图。
- 先用修复前二进制运行同一用例，7 项失败；修复后半透明重叠 MAE 从 4.369 降至 0.028，负层级从 18.422 降至 0.006，相邻人物从 4.045 降至 0.110。全部用例的差异超过 16 的像素比例为 0。指标按 Web 有色像素数归一化，黑边不能稀释误差；阈值 MAE ≤ 0.4，超 16 比例 ≤ 0.1%。纹理上传/字体/清理错误均为 0，已上传纹理数与退出释放数一致。
- Renderer **846** 项测试通过；Native app **266** 项单元测试与 **14** 项 CLI 集成测试通过。测试包含 Rust/serde 默认值对齐、人物内局部层级、人物间顺序、非法图层在资源准备前被拒绝及 provenance 保留。
- 最终 `native:e2e` 完整流程通过：128 条对白投影、stealth 分支、settings/gallery、返回 title，199 commands / 4 passes，1920×1080 GPU PNG；纹理/字体/清理错误为 0，退出时音频轨道为 0。日志 `packages/native/target/render-audit/sprite-final-e2e.log`。窗口仍为 `presented=false` / `OccludedAfterRetry`，不算可见窗口呈现的证明。

重现：`node scripts/native-render-audit/sprite.mjs`；输出 `packages/native/target/render-audit/sprite/{review.html,measurements.json}`。本批次不新增 manifest/expression loader，未宣称 atlas、mask/blend、父级变换或 UI skin 已完成。
