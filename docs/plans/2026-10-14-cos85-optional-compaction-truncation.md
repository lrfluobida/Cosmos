# COS85 可选摘要截断实施计划

> 使用 writing-plans；批准后按 executing-plans、TDD、verification-before-completion逐项执行。作者 `cos76_implementer`，独立 reviewer `cos77_implementer`，唯一 merger `batch75_76_merger`。

**目标：** 已结算但截断的可选自动摘要不保存、不重试；保留原上下文，让同一作者attempt的下一普通请求继续经过原准入。

**基线：** `2a7a291389b58bbd7dd4e4a4f34a61f7237e0141`；managed `cos76-transfer-case8/Cosmos`，分支 `codex/cos85-compaction-truncation`。COS85 [#86](https://github.com/lrfluobida/Cosmos/issues/86)，id5849778421，父#1，依赖COS79/84。C11结果文档另支 `22762c566cb84f7ca0477520f970465983b7f5ed` 交审，本卡不改共享tracking。

**实现方式：** 仅修改Pi adapter现有公开native hook和局部失败处理；不修改SDK、factory、预算或会话格式。技术为TypeScript、Pi 0.99.2与现有node:test真实factory/controller/native compaction夹具，provider为fake/network0。

## 已确认症状与证据

Root在原实现执行 `node --experimental-strip-types --test .cosmos/reconciliation/2026-10-13-c6-provider-usage/cos85-reproduce.mjs`。原始 `C:/Users/26557/AppData/Local/Temp/cos85-root-red.tap`：1 FAIL/0skip，TAP3306.8188ms、test617.2063ms；ordinary3/summary1、0checkpoint、lastLedger settled、settings已恢复、network0，断言“same author turn must reach the next ordinary request”失败，首因incomplete。已读脚本与TAP，复用该基线，不重复执行。它允许后续普通请求因独立余额不足拒绝，不将所有场景都要求最终成功。

C11末条实际length与8192上限已确认；它属于摘要是源码与时序推断，billing未直接标识kind。此任务修正的确定行为是Pi共享失败锁将已结算摘要length变成整个作者attempt失败；不依赖把实际C11归因为摘要的确定结论。

## 最小生产设计

1. 只在可信`requestCompaction`选中、调用原`prepareNextTurnWithContext`的try/finally范围内建立内存操作身份。stream调用同时绑定该身份与当时`session.isCompacting`，不能凭cap、错误文字或purpose识别；manual、overflow和普通请求不具备此身份。
2. 现有`report`先完成真实usage回执和结算。只有同一操作的length、正确response model、known usage、结算回调成功，且没有已有fatal、closed或abort，才记录本操作局部截断。不给全局failure赋值，也绝不清除已有failure；所有其它路径保留原失败规则、费用与请求计数。
3. 对该摘要保持length拒绝语义并去掉部分内容/工具调用，让SDK自身`getSummarizationFailure`拒绝且不append。`compaction_end`只有与当前局部截断身份对应、threshold/非aborted/无result的失败事件可作为预期失败；取消、其它错误和不一致事件仍锁失败。不依赖错误字符串相等。
4. 原hook返回后仍先`requireActive`。只有观察到预期失败、成功checkpoint计数未增且原序列化projection逐字节保持，才关闭本session后续自动摘要并返回原hook结果；任何不一致拒绝。finally恢复原settings并清理操作身份。原生返回的完整projection和固定包/工具由原next-turn继续，无新prompt/continue，无摘要重试。
5. 下一普通请求照常核原窗口、source、请求数、输出cap与原子reserve；不能负担则停止。split两笔摘要中已成功的第一笔和截断第二笔费用都保持；普通作者length、manual/overflow、unknown/model/accounting/timeout/cancel/source错误不获得恢复资格。已结束C11不恢复或改写。

## 文件与验证步骤

- 生产仅 `src/providers/pi.ts`。
- 测试复用 `tests/providers/coding-compaction.fixture.mjs`、`tests/providers/coding-compaction.test.mjs`；在 `tests/providers/pi.test.ts` 补最小manual length负例，原ordinary length与失败锁代表复用。不复制原生压缩策略到fixture。
- [ ] 独立PLAN_APPROVED后，先补单摘要和split第二摘要截断的真实路径RED；增加合成可负担后续与下一普通拒绝两类fixture。检查原projection/entries、无checkpoint/部分工具执行、同task/attempt、费用、settings及自动摘要不再尝试。
- [ ] 只实施上述Pi局部状态；运行新RED对应GREEN。若SDK行为或projection不符合计划，先记录具体失败并交独审，不扩大可恢复错误。
- [ ] 定向保留length伴unknown/model/accounting、取消/截止、普通author/manual length、后续预算拒绝与source拒绝；复用无delta长链，运行现有no-op/no-benefit/readonly与split正常代表。
- [ ] `node --experimental-strip-types --test tests/providers/coding-compaction.test.mjs`；Pi受影响代表按`--test-name-pattern`选择，必要时复用原文件通过证据。
- [ ] `npm run typecheck`、`npm run build`；`COSMOS_COMPACTION_COMPILED=1`下只运行新截断/后续拒绝代表。TS测试按原NodeNext/ES2022/allowImportingTsExtensions/noEmit strict命令检查；保存真实命令、原始TAP、退出码，不用缺失日志路径代替证据。
- [ ] UTF-8/LF/中文回读、完整base diffcheck；提交exact SHA，独立规格→质量审查后交唯一merger。仅source/free fixture，不声明游戏或human通过。

当前 **SOURCE_NOT_READY**，生产修改等待本计划独审；目标marker为 **OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY**。原¥150验证总额、COS16组¥10、正式¥200/12h及现有请求/窗口上限保持，不新建paid案例或读取真实ledger/session/key。
