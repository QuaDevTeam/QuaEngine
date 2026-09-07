# Native QuickJS 执行优化（2026-09-07）

这轮减少 Rust/rquickjs 执行编译后 QuaScript GameStep 的固定桥接成本，并让完整 QuaEngine 会话在没有待执行任务时休眠。

## 改动

- StepContext install、wait/translation/pipeline/helper resume 和 namespace release 的固定 JavaScript 函数每个 evaluator 编译一次，保存为 persistent function。每步命令和 continuation 仍独立创建，卸载仍释放 package-owned handles。
- pipeline payload 在 emit 时序列化一次以保留事件发生时的快照；drain 直接遍历 JS Array，移除外层 JSON 数组的二次转义、编码和 Rust 解析。
- resident QuickJS worker 根据最近 timer deadline 或 Promise jobs 唤醒；没有任务时阻塞等待 pipeline renderer intent，替代固定 16 ms 轮询。JS 仍运行在 engine worker，Rust renderer 保留瞬时绘制时钟。

## 可复现测量

macOS Apple M4，同一 dev build profile，同一 rquickjs 版本；基线为 `551921c3` 的执行实现。基准使用真实 async GameStep（`ctx.engine.showDialogue`）和 32 KiB 对话投影，每组分别执行 2,000 / 1,000 次，共五组；GameStep 预热 100 次。包含 Rust 请求/返回值桥接，不包含整个 QuaEngine、存储、QS 编译器、文件 I/O 或 GPU。

| 每次操作耗时，五组中位数 | 优化前 | 优化后 | 降幅 |
|---|---:|---:|---:|
| async GameStep bridge | 219.785 µs | 29.827 µs | 86.4% |
| 32 KiB projection emit + drain | 178.680 µs | 88.682 µs | 50.4% |

```sh
cargo run --locked --manifest-path packages/native/Cargo.toml \
  -p quajs_native_runtime --features quickjs-rquickjs \
  --example quickjs_performance
```

原始五组记录位于 `packages/native/target/quickjs-performance-before.jsonl` 和 `quickjs-performance-after.jsonl`。这些数字是桥接微基准，不能解读为整个游戏提速 86%、release 性能或 FPS 增幅。线程空闲休眠通过 timer/job/intent 行为测试验证，未测量电池功耗。

## 验证

真实 rquickjs 测试覆盖 StepContext、异步续跑、helper/pipeline 调用、namespace/package 释放、事件快照与队列顺序，以及 idle/timer cancellation/Promise→timer 调度。

完整 `pnpm native:e2e` 已通过 title → story → choice/stealth → game menu → title → settings → gallery → title，并执行原生音频清理和 1920×1080 Metal PNG 回读。该次记录 61 条对白投影、199 commands / 4 passes、67 个 shaped text draws，纹理/字体/清理错误为 0，退出后活动音轨为 0。窗口报告 `OccludedAfterRetry` / `presented=false`；验证的是实际 GPU 离屏绘制和完整逻辑流程，不是可见 OS 窗口呈现。日志：`packages/native/target/parity-demo-e2e.log`。
