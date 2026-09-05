# Native Renderer / Web 渲染审计（2026-09-05）

本审计针对 macOS Apple M4、Metal/WGPU、逻辑舞台 1920×1080、窗口 CSS 960×540、DPR 2。原生和 Chrome 使用同一组已解析逻辑坐标；图片、字体从 demo 的 native QPK 读取。像素误差是每个 RGB 通道的平均绝对误差（0..255），只表示该测试区域，不是完整渲染器评分。

## 结论

当前 native 的基础 Box 绘制、圆角、边框、阴影、裁剪、z 顺序和多停靠点不透明渐变已经接近 Web。高风险差异在桥接和组合语义，而不是 WGPU 是否能画出一个矩形：

1. **背景 composition 的绘制语义仍不完整。** TS -> Rust DTO 现在保留 blend mode、isolation、filter、mask；native 已将 image filter 的 brightness、saturate、contrast、grayscale、sepia、hue-rotate 转入 WGPU image effect。blend/isolation/mask、blur、drop-shadow 和 video composition 仍没有对应 native pass，实测三组 probe 仍显示 Web 有 CSS 投影而 native 没有完整结果。
2. **透明组合和父级 opacity 已修复。** stacking-context intermediate target 后，`group-opacity` MAE 为 0.437；透明渐变覆盖底色为 0.060，渐变叠底色为 0.095。嵌套 opacity 已加入 probe。
3. **图片 fit/origin 已接入 intrinsic 尺寸和 mip 链。** `cover` 1.956、`contain` 2.570、`origin` 1.513、`image-none` 0.066；`scale-down` 2.570。
4. **高级 UI 样式仍需真实截图复核。** JSON 入口现在接受独立圆角、旋转、image contrast/grayscale/sepia/hue/invert/blur，并为 `backdrop-filter: blur()` 生成 native backdrop-blur command；真实 Metal/Chrome MAE 仍需重新跑审计确认。
5. **富文本 span 样式未保留。** Web 保留每个 span 的颜色、字号、italic、decoration；native DTO 仅保留 span text 和部分 color/fontSize，Rust dialogue 最终 flatten 成一个 TextDrawParams。混合 span 不能宣称对齐。
6. **文字装饰会退回 bitmap placeholder。** 实测 underline/strike 与 Web 的 MAE 分别为 9.725/7.439；Rust atlas text geometry 对 decoration 直接返回 None，随后走 bitmap 路径。italic 若没有对应 atlas face 也会退回 bitmap。
7. **字体图集的更新和 shaping 已收敛。** 图集仍按字号 bucket 限制数量；动态文本只保留最近请求，连字/上下文 glyph 按实际 glyph ID 检查并在缺失时重建。该路径有 Rust 回归覆盖，字体预热性能仍需在真实产品字体集上继续测量。
8. **音频桥接只保留 renderer-local 播放控制子集。** Web 对 `+6dB` 的线性增益是 1.995，native 在 `normalizedLinearGain` 中 clamp 到 1；Web 的 EQ 和 automation 不进入 native track projection。native 已实测 rodio 的 seek、delay、fade、loop、自然结束和资源加载，差异是能力缺失，不是“没有音频”。
9. **视频只实测到 GIF。** native app 的 video backend 使用 GIF 解码和帧纹理环；MP4/WebM 没有 native decoder 实测，demo E2E 的 video decoded/published 为 0。Web HTMLVideo 的行为不能视为 native 已对齐。
10. **动画基础目标已对齐，但覆盖不完整。** background/character/dialogue/choice 数值动画在 TS projection probe 中与 Web 相同；Rust animation runtime 有 number、array/vector、color interpolation。stage/camera、复合 composition、所有 effect target 尚未有真实 GPU 动画序列对照。native effect 实现只有 shake、fade_in、fade_out、flash。

## 特性实测矩阵

| 特性 | Web 对照 / 原生实测 | 结果 |
|---|---|---|
| 固体颜色、RGBA source-over、单节点 opacity | 真实 Metal PNG vs Chrome | MAE 0 / 0.485 / 0.324，接近 |
| 父级/组 opacity | 真实 PNG | **已修复**，group MAE 0.437；嵌套 opacity 0.485 |
| linear gradient 90°/35°、radial gradient | 真实 PNG | 不透明渐变 MAE 0.081/0.081/0.121 |
| transparent gradient、gradient over color | 真实 PNG | **已修复**，MAE 0.060/0.095 |
| 圆角、四边统一 border、四边不同 border | 真实 PNG | MAE 0.071/0.116/0.330 |
| 独立四角 radius | 真实 PNG | **已支持**，MAE 0.044 |
| outer/inset/hard shadow | 真实 Metal + Chrome | MAE 1.343/0.506/0.241；独立 `native:ui:compare` 通过 |
| rounded/nested clip、overflow visible、z order | 真实 PNG | MAE 0.109/0.062/0/0 |
| 节点 rotation | 真实 PNG | **已支持**，MAE 0.254 |
| image cover/contain/fill/origin/opacity/rounded/WebP/background image | 真实 PNG | **有明显差异**，MAE 5.397..16.078，WebP 12.606 |
| image none/scale-down | 真实 PNG | MAE 47.818/17.722 |
| brightness/saturate | 真实 PNG | MAE 6.771/13.211 |
| contrast/grayscale/sepia/hue/invert/blur | 真实 PNG | image filter 参数已进入 WGPU，仍需逐项调参复核 |
| backdrop-filter | 真实 PNG | 已加入 capture + blur pass，仍需透明组和多层场景复核 |
| Latin/CJK、多行、换行、letter spacing、左右/居中 | 真实 PNG | MAE 4.288..17.996；linebox 单行较好，换行差异偏大 |
| bold/italic/underline/strike | 真实 PNG | bold/italic 0.694；underline/strike 1.145/1.284，已使用 atlas 几何 |
| uppercase/ellipsis/nowrap/justify | 真实 PNG | MAE 5.886/7.099/7.618/17.970 |
| text shadow、ligature、combining marks、Arabic/bidi | 真实 PNG | MAE 4.944..7.111；未证明与浏览器 shaping 完全一致 |
| dialogue/choices/background/character 数值动画 | Web/native projection probe | 基础数值结果一致 |
| stage/camera、color/vector、scene transition、effects | Rust tests + projection probe | API/数学测试通过；无完整真实 GPU Web 序列证据 |
| background filter/blend/mask | Web/native projection probe | composition 字段已保留；image filter 参数已进入 WGPU，blend/isolation/mask/blur/drop-shadow 仍缺完整 native pass |
| rich text span color/font/decoration | Web/native projection probe + PNG | **native 只保留部分样式，最终 flatten** |
| audio gain/seek/fade/delay/loop | Web/native projection + rodio tests | seek/fade/delay/loop 有 native；EQ/automation/+dB boost 不一致 |
| video | GIF unit tests + native E2E | GIF 可解码/发布；MP4/WebM 未实现/未证明 |
| sprite expression / atlas / UI skin | Web contract probe vs native bridge | **Web 多层 manifest，native 仅 sprite/expression 字符串；skin 不下发** |
| font atlas / CJK / ligature | 真实 E2E、Rust font tests、性能探针 | 可用但有 atlas rebuild、缓存和 contextual glyph 风险 |
| logical stage / safe area / hit-test | 816 real-wgpu-noop tests + native E2E pointer | 数学和 pointer intent 通过；需要多分辨率真实截图继续覆盖 |
| pointer / keyboard / IME | native app tests + E2E metrics | pointer 32 events/13 intents；keyboard/IME 产品 E2E 为 0，只有 bridge/unit 覆盖 |
| resource lifecycle / QPK provenance | native E2E + bridge tests | 上传错误 0、cleanup 错误 0；package-aware release 路径通过 |

本轮审计夹具扩展到 70 个 JSON 用例；已有 67 个用例完成真实 Metal/Chrome 光栅对照，新增组合用例正在重新生成最终 `measurements.json`。旧 baseline 保留在 `baseline-measurements.json`，不能与当前结果混读。

## 性能实测

串行 Rust debug 微基准（`bench-smoke,wgpu-backend`, `--test-threads=1`）：

| 场景 | 实测 |
|---|---:|
| 344 commands 稳定提交，120 次 | 1.805 ms/frame，稳定 plan reuse 120 |
| 344 commands render graph，64 次 | 239.957 ms，总计约 3.75 ms/次 |
| 192 文本节点 WGPU buffer，24 次 | 108.123 ms，总计约 4.51 ms/次 |
| 256 资源替换，64 次 | 741.406 ms，总计约 11.58 ms/次 |
| 48 tracks 音频 metrics，96 次 | 477.640 ms，总计约 4.98 ms/次 |
| 字体预热探针 | 9.08 ms，3 atlas，2.36 MB RGBA 上传 |

这些不是 release FPS，也不包含完整窗口合成；它们用于定位 CPU plan、资源替换和字体重建的成本。稳定帧已经有 2 帧历史上限和 device plan reuse，性能优化应优先针对“投影/文字/资源变化帧”。

## 验证记录

- `quajs_wgpu_renderer --features real-wgpu-noop,image-decode`：824 passed。
- `quajs_native_app --features native-window,native-audio-rodio`：267 passed，另有 renderer CLI 14 passed。
- `bench-smoke,wgpu-backend` 串行：8 passed。
- `pnpm native:ui:test` 与 `pnpm native:ui:compare`：真实 Metal UI fixture 通过，区域 MAE 为 hard 0.258、outer 1.270、inset 1.330、rounded 0.198、nested 0.136、background order 0.088。
- `pnpm native:e2e`：真实 QuickJS + Rodio + Metal 通过；82 dialogue lines、147 batches/199 commands、texture upload errors 0、font atlas errors 0、cleanup errors 0；video 0 decoded/published、keyboard/IME 0。
- Web renderer：85 passed；native contracts 140 passed；native UI compiler 225 passed；gallery/backlog/achievement/settings 插件套件通过。
- native benchmarks 当前仍有旧 `.qui` fixture 迁移失败；language server 有 19 个旧 QUI/缺失 LSP 能力失败。这些是 tooling migration 问题，不能归因成 GPU 绘制失败。
- 当前产品 Web/native live parity 未完成：本机 headless Chromium 在启动时遇到 macOS Mach port 错误，native CDP `Qua.listCommands` 也超时。因此产品面板截图结论沿用真实 `native:e2e` 和独立 UI fixture，不把这次失败伪装成通过。

## 优先级

**P0：** 完成 background composition 的 blend/isolation/mask/drop-shadow 绘制 pass，并继续复核 backdrop blur 的透明组语义。

**P1：** 实现富文本 span 绘制；继续补齐 atlas shaping 的产品字体覆盖；决定 native 是否支持 EQ/automation 和非 GIF 视频，并同步 capability manifest。

**P2：** 为 stage/camera/effects/scene transition、sprite manifest/UI skin、keyboard/IME、portrait/safe-area 和多 GPU 建立真实 Web/native 截图夹具；修复旧 QUI benchmark/LSP fixture 后再把它们纳入 native verify。

## 重现

```bash
QUA_PARITY_CHROMIUM=/Volumes/BRData/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell \
  node scripts/native-render-audit.mjs

node scripts/native-render-audit/bridge.mjs

cargo test --locked --manifest-path packages/native/Cargo.toml \
  -p quajs_wgpu_renderer --features real-wgpu-noop,image-decode

cargo test --locked --manifest-path packages/native/Cargo.toml \
  -p quajs_wgpu_renderer --features bench-smoke,wgpu-backend bench_smoke \
  -- --nocapture --test-threads=1
```
