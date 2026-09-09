# 人物透明边缘与原生抗锯齿

## 先区分问题

| 画面问题 | 原因与处理 |
| --- | --- |
| 人物缩放后出现一圈白／黑光晕 | 完全透明像素仍保存底色，直通RGB插值把底色带进可见边缘。本轮修正native采样链。 |
| 半透明头发本身发白、衣服旁有背景碎片 | 已写进可见RGB或alpha的抠图错误，MSAA不能判断它是不是头发。需要回到源图做局部颜色去污染或重新抠图，并在深浅底色上审核。 |
| 斜线、旋转卡片与几何轮廓呈阶梯状 | 可选4× MSAA改善几何覆盖。本轮已实现。 |
| 立绘大幅缩小时细线闪烁 | 使用正确的预乘alpha mipmap和三线性采样。native原有mipmap保留，本轮修正每层的透明表示。 |

Web的DOM图片交给浏览器采样、合成，已有浏览器的预乘透明处理。本轮没有再给Web全屏叠加模糊、FXAA或CSS锐化，也没有改变上一轮环境光的透明度。原生采样修正不会改写PNG或QS。

不使用统一alpha阈值、轮廓侵蚀或按白色删除像素：这会损伤发丝、白衣、蕾丝及皮肤高光。真正污染的图需要具体到素材和边缘的修复；本轮不宣称所有抠图错误已自动清除。

## native采样修正

公开的图片解码／上传接口仍接收普通straight RGBA。上传GPU前，在已有解码缓冲内做一次RGB乘alpha；完全透明像素的RGB归零，半透明像素保留颜色贡献。mipmap对预乘后的四通道直接做面积平均，包含奇数尺寸的完整边缘；GPU放大、缩小和层间插值全部发生在预乘空间。

图片着色器采样后恢复straight RGB，再进入现有颜色滤镜和straight-alpha混合管线，避免二次乘alpha。中间合成目标仍是预乘表示，截图导出仍转换成普通PNG alpha。字体图集只读取alpha，不增加mipmap层级。

亮度蒙版相应改为读取预乘RGB的亮度；这时亮度中已经包含alpha，不能再乘一次。alpha蒙版本身保持直接读取alpha。

没有新增着色图片缓存、额外全尺寸纹理或逐帧CPU抠图。mipmap显存约增加原尺寸纹理的三分之一，是原有行为；本轮预乘不再增加纹理数量。

## 可选MSAA

原生窗口启动时可以使用：

```sh
QUA_NATIVE_MSAA=4 pnpm --filter demo dev:native
```

省略变量或设置为1，使用原有1×路径。底层Rust API提供`RealWgpuSurfaceTargetBootstrapRequest.msaa_samples`和`RealWgpuNativeRenderRuntimeTarget::with_msaa_samples(4)`。仅支持1×／4×；启动检查实际adapter格式能力和device允许的格式能力，必须同时支持4×采样及resolve，否则回退到1×。日志报告requested/active，`frame_target_snapshot().sample_count`可检查实际帧目标。

所有绘制管线与合成管线使用相同采样数。每个绘制目标拥有可选4×附件和单采样resolve图；每次pass结束都resolve，后续背景抓取、模糊、蒙版、嵌套合成、PNG读回与窗口呈现只访问单采样图。跨pass保留多采样内容，不能把未resolve图直接交给后处理。窗口resize重建尺寸匹配的附件，销毁与原帧目标一起释放。没有把MSAA放进QS、存档或QPK运行时状态，也没有开启alpha-to-coverage。

MSAA不会让矩形内部的每一根PNG发丝自动获得几何超采样；那仍依赖源图alpha和纹理采样。SSAA会使整个场景与文字都重复采样，2倍宽高约需要4倍像素；FXAA/TAA则可能模糊中文、赛璐璐线条或产生拖影。本轮均未启用。

4× MSAA的额外RGBA8附件，在1920×1080物理像素下约31.64MiB／目标，在3840×2160下约126.56MiB／目标；原有单采样resolve图另计。嵌套合成目标也需要附件，这不是整页显存上限。为此默认保留1×，也不默认开8×、SSAA或全屏后处理。应按实际物理分辨率、DPR和合成层数决定是否启用4×。

## 验证记录

- `cargo test --locked --manifest-path packages/native/Cargo.toml -p quajs_wgpu_renderer --features real-wgpu-noop,image-decode --lib`：880项通过。新增覆盖隐藏底色、奇数尺寸mipmap、设备能力回退、4×实际绘制校验、resolve和resize；原有资源释放测试保持通过。
- `node scripts/native-render-audit/edges.mjs --skip-build`使用Quack打包的确定性素材，经真实Metal窗口捕获，不使用测试专用松散资源通道。分别检查放大与缩小、黑／白透明底色、父级透明度、倾斜图形、alpha／亮度蒙版。每次捕获都核对资源上传和退出释放数量。
- 本轮12张主要捕获和4张追加蒙版捕获通过。隐藏底色不同的PNG最终RGB逐像素差为0；父级0.5透明度中心为128；半透明灰蒙版的alpha／luminance结果分别为128／64。倾斜白色方块在1×下没有部分覆盖像素，4×下有462个部分覆盖像素，已经人工查看放大对比。
- 结果：`packages/native/target/render-audit/edges/results.json`、`mask-results.json`；对比图：同目录`msaa-comparison.png`。这些是限定fixture验证，不是整个renderer与Web的画质一致性评分，也不是性能帧率或进程显存实测。
- 完整demo原生E2E未通过：4×和1×均能加载当前QPK、显示标题并进入实际剧情，随后在`AdvanceToChoice`无进展30秒而退出。检查发现旧E2E仍绑定`choice:stealth`（脚本与JS结果校验均如此），并在打开仅已读快进后停止手动推进，与当前稿件及默认设置不符。本轮不删改这些断言来制造通过，也不把专项截图当作完整剧情回归。日志在`demo/.generated/qa/native-edges-e2e-direct.log`与`native-edges-e2e-1x.log`；两次分别报告actual MSAA4／1。
- 标准入口还暴露独立版pnpm的启动问题：旧脚本把`npm_execpath`指向的原生二进制交给Node解释。已修正为只对JS入口使用Node，其他入口直接执行；后续标准`pnpm native:e2e`已能完成构建并进入窗口与剧情，阻塞点是上述旧测试脚本。
- 原生app的`native-window`构建、当前demo QuickJS模块与QPK构建通过；移除测试生成的`demo/assets/scripts/native-app.mjs`，避免污染后续Web素材打包。没有修改当前美术源图、剧本或旧E2E剧情目标。
