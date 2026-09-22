# Native 主菜单 hover 闪烁：原因与防复发

## 本次确认的根因

鼠标进入按钮后，背景与文字会在过渡期间消失，过渡结束后恢复。不是叙事状态变化，也不是字体还没加载。

`renderer/interaction_feedback.rs::blend_color` 把颜色插值序列化为 `rgba(R,G,B,{alpha:.4})`。两个不透明颜色之间的插值因此生成 `rgba(...,1.0000)`。但 `renderer/backend/wgpu/mesh/color.rs` 的 alpha 语法检查只接受 `1`，拒绝 `1.0` / `1.0000`；`projection/safety.rs` 还复制了一份相同规则。中间帧进入 GPU mesh 构建后被当成 `InvalidColor`，按钮背景和 `text_overlay` 都无法绘制。终点重新使用原始十六进制颜色，按钮又出现。

复现时先固定鼠标在每个按钮内部，再录制移入与移出后的连续 WGPU 截图。旧菜单的 49 张采样图里，移入第一张可见相应按钮标签消失，后续恢复。确定性回归在 **8ms** 的中间帧报告 `invalid_paint_count = 1`；修复前该测试失败。这直接连接了可见症状与绘制链路中的失效点。

## 为什么之前修过还会出现

同样的“闪烁”描述包含不同故障，之前的修复不能替代本次检查：

| 故障层 | 必须保留的约束 |
| --- | --- |
| 命中测试 | 使用未被 hover 变换的投影几何；不能让静止指针反复进入/离开变化后的边界。 |
| 过渡中断 | 从屏幕当前插值开始反向过渡，不能跳到前一状态的完成值。 |
| 绘制顺序 | 通用反馈合入控件自身 paint，不能增加盖住文字的高亮层。 |
| 控件文字更新 | 相同值不重复重写标签；这是幂等优化，不足以证明文字不闪烁。 |
| **本次：颜色生产者与消费者不一致** | 插值生成的合法颜色必须能通过投影验证、再次插值与 GPU paint 解析。 |

此前 UI 回归等待 hover 完成才截图，验证了终点，却绕过了失败的中间帧。仅断言插值字符串是 `rgba(...)` 也不会发现 GPU 拒绝它。

## 修复和治理

- 提取唯一 `projection::safety::parse_native_color_alpha`，供投影验证、交互颜色解析、GPU mesh 颜色解析共同使用。接受 `[0,1]` 内有限的十进制数，包括 `1.0000`；继续拒绝负数、越界、NaN、无穷、指数及残缺小数。
- 新增 `projection_and_gpu_agree_on_generated_alpha_literals`，同时检查投影与 GPU 的合法/非法 alpha 样例。
- 新增 `every_hover_transition_frame_keeps_button_and_label_drawable`：不透明、半透明、透明背景，移入、移出、快速反向，每 8ms 把真实插值帧提交到 WGPU backend 的 mesh 构建路径，检查无非法 paint、按钮可见、标签存在。它使用内存 executor，不冒充真实 GPU 验收。
- 新增 `demo/scripts/title-hover-smoke.mjs`：实际 Native CDP 指针输入和 WGPU 截图；首次移入不等待过渡完成，同时覆盖微小抖动、移出和快速扫过；对每个可用菜单项检查文字像素没有丢失，保存逐帧结果。脚本也校验 Web/Native 菜单尺寸、顺序和等距排列。
- 将排查方法与禁用过渡不能代替修复的约束写入 `.codex/skills/qua-native-renderer/SKILL.md`。之后遇到同类问题，必须先定位命中、状态、插值、paint、文字或实际窗口呈现中的失败层，再补覆盖该层的反例。

## 菜单整理

Web 和 Native 继续消费同一个 `demo/src/game/ui/screens/title.tsx` / `app.scss`。六个菜单项保持单列等宽、等高、等间距，固定为从头开始、继续阅读、读取存档、章节选择、设置、退出游戏；无进度时继续阅读禁用，其他项目不换位。移除英文装饰、海边广播站介绍和操作提示。保留颜色过渡，因此验证仍实际经过本次修复的链路。

## 验证与复查命令

从仓库根目录运行（项目环境使用 `rtk proxy` 前缀）：

```sh
cargo test --manifest-path packages/native/Cargo.toml -p quajs_wgpu_renderer --features real-wgpu-noop
QUA_PARITY_WEB_URL=http://127.0.0.1:4188 node demo/scripts/title-hover-smoke.mjs
```

截图脚本要求 Native 位于标题页、视口 960×540 / DPR 2。结果位于 `demo/.generated/qa/title-hover/`；旧问题采样位于本机 `demo/.generated/qa/hover-before/`，生成物不作为源码提交。

本次通过：Native renderer **890 项测试**；Demo 的导航与 UI skin 测试；Demo TypeScript；Web 生产构建；Web/Native 标题菜单几何对照。**45 张实际 Native 采样图**中，所有可用菜单项均保留标签文字像素。详细结果记录在 `title-hover/checks.json`。

截图是实际 WGPU readback；CDP 采样无法覆盖每一个显示帧，也不能替代独立的 OS 窗口呈现门禁。本轮不声称整部故事或所有窗口环境都已验收。

完整 Native E2E 本轮已重新执行：成功进入剧情，在 `story-street` 检查点因 `OccludedAfterRetry` 未通过 OS 窗口呈现检查。失败 PNG 保留于 `demo/dist/native/dev/e2e-checkpoints/story-street.png`。该门禁仍未通过，不能把上面的 hover/WGPU 检查结果表述为完整窗口验收。
