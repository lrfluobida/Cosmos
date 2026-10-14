# COS-83 减少作者工具中的重复来源校验

状态：AUTHOR_TOOL_SCOPE_SOURCE_READY / PRODUCTION_PLAN_APPROVED / source-integrated / open。Issue [#84](https://github.com/lrfluobida/Cosmos/issues/84)，id5847590995；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，依赖 COS55/75/82。

作者 `cos76_implementer` acting COS83；独立 reviewer `cos77_implementer`；唯一 merger `batch75_76_merger`。计划：[2026-10-14-cos83-tool-scope.md](../plans/2026-10-14-cos83-tool-scope.md)。生产基线 `a464b0fb523ce29f6e688a92a08ccd156b6502a7`。

最终五个文件已通过独立规格与质量审查，没有finding；唯一merger已集成，待Root公开关闭。

| 记录 | 提交 |
| --- | --- |
| 批准版本 | `c8afd7643ae4c19d8035206ebf8530fb055a8531` |
| 合并提交 | `32af0aa4c101bd03ccfd759d64a482231aefd970` |

## 目标与硬边界

Root的C10工具总时长与Vite执行时长显示需要区分来源校验和compiler开销；静态调用次数仅是调查线索。先沿真实host/factory/checker建立可执行SOURCE基线，实测完整工具操作的scope次数和受控延迟，随后独审选择最小改动。

1. 每次工具、worker和付费执行仍检查当前window/deadline/owner、scope、实际receipt与输入/输出字节。不得缓存跨请求授权，或把跨可变await的前后检查机械合并。
2. 生产仅删除transfer guard先行的 `ctx.requireScope`；每次`origin.verify`仍完整读取当前scope，并保留listener/receipt校验、abort及COS75私有局部timeout行为。
3. coding guard中requireDispatch与后preparation.requireCurrent之间有可变读取，当前方案保留后检查。原120秒phase时限、清理和费用策略不变，不加新框架、schema或CLI。
4. 基线复用现有prepared transfer夹具、真实tool/owned worker路径，compiler和上游会话为合成、无外部provider；统计次数作确定性验证，墙钟仅记录。不能以此宣称实际C10提速或节费。
5. 定向回归覆盖输入/源码漂移、phase间变更、取消/截止/owner、receipt、局部timeout与后续重新校验；复用未变重型证据，不重付费或6分钟C10seed。

仅免费source/TEMP工作；不读取真实ledger/session/key或C10生成产物，不启动新案例。阶段一计划批准只允许基线诊断；生产选择及最终exact分别独审。最终marker `AUTHOR_TOOL_SCOPE_SOURCE_READY`。

## 阶段一结果与已审生产选择

计划 `a7b420a2c70249e0ae025c96601bce518a1063a6` 已独审批准。有效SOURCE基线1/1/0skip：包含实际factory beforeTool→checker→owned worker，同一作者两次完整check均实测160 scope；0ms与每次5ms请求延迟时分别11544.607/13847.8701ms，后者实际累计延迟2067.3611ms。两compiler退出0、所有子进程退出、snapshot/registry/author保持、network0；原始脚本/JSON/TAP及首轮reader接线失败保留在计划。不是C10 inherited或实际游戏编译基准。

阶段二方案 `7d5ed7102d9a5ad00c70a888b3001861b4fd61ec` 已独审批准。生产仅删除transfer guard的先行ctx.requireScope，保留origin.verify内完整当前scope/listener/receipt及原异常处理；origin在guard使用前初始化。所有跨可变await后的preparation、worker前后、原签名与费用检查保持。

## 实现验证

仓内真实factory工具回归有效RED→GREEN：两个独立调用均从160次scope降到83次，减少77次（仅该SOURCE夹具读取次数减少48.125%）。两次仍fresh读取、原任务/费用/registry/作者字节保持、两worker/compiler正常退出、工具阶段network0。不把次数降幅或合成wallclock外推为真实C10提速或节费。

COS55/COS75定向边界18/18，compiled真实guard局部timeout1/1，typecheck/build/受影响strict通过；首次strict的三个既有回调类型问题只补测试注解。原始TAP、具体时间、命令及证据限制见计划。最终版本已独审批准并集成，仍无新付费或真实案例操作。

合并后typecheck/build通过，真实transfer guard局部超时代表1/1通过；原始输出 `C:/Users/26557/AppData/Local/Temp/cos83-merge-integration.tap`。merger已读取原基线、RED/GREEN、边界和compiled证据，没有重跑基线或C10长矩阵。首轮0次计数仍仅属于reader接线失败；实际C10 inherited路径的速度和费用尚无本卡新实测。
