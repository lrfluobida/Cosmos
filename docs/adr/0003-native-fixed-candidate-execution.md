---
status: accepted
---

# 原生验证执行固定候选，并为异步加载和清理保留有界时间

批准记录：设计 `1c8610e9fd4b20880fb1cafa016ca9f901e71d81` 经 `native_readiness_design_reviewer` 独立规格/可实施性→质量 APPROVED，无finding；Root批准工程设计及后续源码实施。唯一merger `batch_c14_cos92_merger` 合入 `9940c130ce8de32136b579d79c1dded99db17dda`。 任务 A 为 [COS98 / #99](https://github.com/lrfluobida/Cosmos/issues/99)，依赖COS93/97；任务 B 为 [COS99 / #100](https://github.com/lrfluobida/Cosmos/issues/100)，依赖COS93及COS98已审接口；任务 C 为 [COS100 / #101](https://github.com/lrfluobida/Cosmos/issues/101)，依赖COS97及COS98已审接口。完整 `native-validation-waits/2` 仅在A/B/C均独审并组合验证后发布，不提前发布半契约；当前actual/paid均未授权。

COS93 navigation-v1 已通过权限准备、PID 登记与 CDP，但 DOM load 后单次读取 player idle 即失败；HTTP 响应前后的完整来源链各约 47–49 秒。继续扩大每个资源的等待不能消除重复成本。建议在可信 host 的 validation transfer 路径选择 `native-validation-waits/2`，保留阶段入场及发布前的完整来源核验，HTTP 改查当前 controller authority、owner/generation、origin receipt、取消/截止和实际 payload 与私有固定快照的相等性。实现位置及验收见[设计](../specs/native-game-readiness.md)。

此决定显式修订 ADR0002 的每 HTTP 完整 fresh 契约。固定候选可在两个 full guard 之间继续执行；外部 source/history/ledger 来源持久变化在下一 guard 拒绝发布，瞬时变化又恢复不保证检测。当前 controller 的停止、任务和额度变化仍实时检查；实际响应变化仍在发送前拒绝。它不是 metadata cache，也不声称与旧 source fresh 等价。保留全量 fresh 加长等待是可行备选，但现有导航余量无法给全部异步素材提供可信容量依据。

同一新版本的另一项独立决定：ready 使用原 300 秒导航预算余额，保留真实只读条件；native cleanup 从原 3 秒 reserve、每项 1 秒，改为共享 30 秒，其中 5 秒留给强制退出。工作终点改为 D-35000，另留外层 5 秒；原绝对 D 不变。现有 FFmpeg 在首因后约 10.3 秒退出，支持修正 1 秒上限，却不能说明具体慢因或保证新上限通过。HTTP 与 cleanup 可独立实现/测试，按同一新契约集成。

仅指定新 native 路径采用以上改变；旧 `/1`、generic、human、non-clean 行为与历史报告含义保留。产品内容、实际玩法/媒体/FPS/体验标准和 ¥150 验证、正式 ¥200/12h 预算不变。本 ADR 已独立设计评审并accepted，Root已授权后续源码实施；一次实际导航仍须另行授权。
