# Native 内存泄漏复核（2026-09-10）

范围：Rust renderer/host、字体与GIF视频后端、音频driver、QuickJS桥接、native插件诊断、工作线程、切场景和关闭清理。保留本次之前的UI、人物比例与MSAA改动；本记录不替代长篇全路线压测。

## 已发现并修复

1. **待上传资源释放后复活。** 字体图集和视频帧各有待上传队列，而host同步先处理release再处理upload。旧逻辑释放资源时没有取消待上传数据，因此同一轮创建/淘汰或开始/停止可重新上传已经无owner的纹理。现在释放取消对应队列项，同一纹理只保留最新待上传图像，并合并重复release。
2. **诊断历史无上限。** NativeHostPlugin长期保存每次namespace卸载记录、渲染intent错误和QuickJS清理错误。现在每组保留最近64条；所有清理调用和错误pipeline事件仍执行，不通过截断业务事件控制内存。

回归覆盖32种字体桶连续重建/淘汰、128次视频开始/停止（每轮16次未drain的发布），以及256次插件卸载/错误；既有字体fallback测试改为检查最终合并图集，同时保留两份字体的provenance断言。

## 尚未闭合的句柄生命周期

**动态QuickJS GameStep factory反复调用会累计run handle。** `rquickjs_backend.rs::call_game_step_factory`每次创建新的Persistent函数句柄；目前只在`release_module_namespace`时统一移除。TS代理每次调用factory都会转发，engine运行动态脚本也会重新解析steps。若namespace长期驻留、反复进入动态脚本，句柄数量可增长，即使旧steps已不再使用。

这是仍需完善的动态脚本生命周期问题，不是已修复的renderer纹理问题。当前demo将主引擎与QS打包到resident QuickJS app中，面板循环不覆盖这条跨Rust GameStep factory路径。不能用面板RSS稳定证明该路径无泄漏，也不能按LRU或运行一次就删除handle，否则会破坏仍有效的steps、回放或并发调用。后续需在engine拥有的steps/factory实例生命周期上增加显式释放，并贯通TS/native契约与Rust；namespace卸载清理已有回归。

## 已核对的释放链

- 普通图片：frame资源同步移除旧资源，host cleanup释放解码纹理并使相关bind group失效；GPU buffer/pipeline/bind group计划有对应release操作。
- 字体：face释放移除原始字节、解析字体、shaping与各字号记录；历史字形、字号桶与诊断计划已有上限。当前帧必要字形可超过历史缓存预算。
- 音频：ReleaseHandle停止/释放driver并移除资源字节；自然结束通过pipeline回到engine，再产生释放投影。demo当前无音频素材，不能由demo循环验证真实音频播放。
- 视频：stream释放移除压缩资源和解码帧，纹理环释放同步到GPU。GIF当前一次性解码所有帧，长/大GIF仍有显著峰值风险，不能误称为固定内存的视频流式解码器。
- 工作线程：QuickJS/projection线程通过Shutdown与join退出；projection保留最新发布结果。事件通道依赖消费者持续drain，过载队列堆积与永久泄漏应分开诊断。
- 合成目标：中间纹理复用、无合成时清空，MSAA及嵌套目标有预算；驱动/分配器高水位不必立即反映为RSS下降。

## 验证记录

详见同目录的`native-memory-and-proportions.md`及忽略目录`../.generated/qa/native-sync/leak-review-*`。本轮新增测试、运行采样和系统工具结果在收尾时更新。

系统`leaks`对当前进程提示debug检查受限；早期/中段均报告408项、19,744 bytes，可读对象图指向AppIntents/NSXPC连接循环。该结果既不能直接归为QuaEngine泄漏，也不能当作零泄漏通过。
