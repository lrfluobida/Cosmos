# COS85 可选摘要截断实施计划

> 使用 writing-plans；批准后按 executing-plans、TDD、verification-before-completion逐项执行。作者 `cos76_implementer`，原计划独审 `cos77_implementer`；接续源码独审 `cos85_reviewer`，本批唯一 merger `batch85_86_merger`。

**目标：** 已结算但截断的可选自动摘要不保存、不重试；保留原上下文，让同一作者attempt的下一普通请求继续经过原准入。

**基线：** 初始 `2a7a291389b58bbd7dd4e4a4f34a61f7237e0141`；计划 `c108e9a797e708167f289d8b05227900be765a80` 已由cos77独立PLAN_APPROVED、无finding。测试前合入docs-only main，最终review base为 `ecd8d8e0c3f28e6d8f4cd34ea6219342900b9328`。managed `cos76-transfer-case8/Cosmos`，分支 `codex/cos85-compaction-truncation`。COS85 [#86](https://github.com/lrfluobida/Cosmos/issues/86)，id5849778421，父#1，依赖COS79/84。C11结果文档另支 `22762c566cb84f7ca0477520f970465983b7f5ed` 已独审整合，本卡不改共享tracking。

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
- [x] 独立PLAN_APPROVED后，先补单摘要和split第二摘要截断的真实路径RED；增加合成可负担后续与下一普通拒绝两类fixture。检查原projection/entries、无checkpoint/部分工具执行、同task/attempt、费用、settings及自动摘要不再尝试。
- [x] 只实施上述Pi局部状态；运行新RED对应GREEN。SDK按原长度校验拒绝、原projection与entries保持，没有扩大可恢复错误。
- [x] 定向保留length伴unknown/model/accounting、取消/关闭/截止、普通author/manual length、后续预算拒绝与source拒绝；补原历史leaf变动拒绝，运行现有no-op/no-benefit/readonly与split正常代表。
- [x] `node --experimental-strip-types --test tests/providers/coding-compaction.test.mjs`；Pi受影响代表按`--test-name-pattern`选择，复用已通过项。
- [x] `npm run typecheck`、`npm run build`；`COSMOS_COMPACTION_COMPILED=1`下只运行新截断/后续拒绝代表。TS测试按原NodeNext/ES2022/allowImportingTsExtensions/noEmit strict命令检查。
- [x] UTF-8/LF/中文回读、完整base diffcheck。
- [x] 提交exact SHA，独立规格→质量审查后交唯一merger。仅source/free fixture，不声明游戏或human通过。

## 实现证据

生产仅`pi.ts`：操作对象绑定当前摘要请求，在已结算length时移除部分内容、保持length交由SDK拒绝；只识别该操作的threshold失败事件，检查原leaf/projection及无成功checkpoint后停止本session后续auto。原全局failure从未清除，普通/manual错误及原所有请求准入保持。源码与测试没有复制原生压缩实现或改SDK。

以下原始输出位于 `C:/Users/26557/AppData/Local/Temp/`。所有provider均fake/network0；使用真实factory/controller/Pi/native，原会话为新建合成fixture。

| 文件 | 命令与结果 |
| --- | --- |
| `cos85-summary-red.tap` | `node --experimental-strip-types --test --test-name-pattern='settled optional length-' tests/providers/coding-compaction.test.mjs`；2 FAIL/0skip，4047.5612ms，单摘要及split第二摘要均精确命中旧incomplete锁 |
| `cos85-summary-green.tap` | 同命令，2/2、4895.4179ms |
| `cos85-compaction-source.tap` | `node --experimental-strip-types --test tests/providers/coding-compaction.test.mjs`；30/30、0skip、17334.32ms，含新截断恢复与8种fatal/后续拒绝组合、旧真实native代表 |
| `cos85-exact-fees.tap` | 将两成功代表的摘要费用断言收紧为每笔恰好10µ后，仅重跑`settled optional length-`；2/2、4101.4818ms；生产及其他测试不变 |
| `cos85-pi-regression.tap` | `node --experimental-strip-types --test --test-name-pattern='length\|manual SDK compaction\|settlement failure\|network errors\|returned model mismatch\|cancellation waits\|request deadline' tests/providers/pi.test.ts`；7/8，2946.8863ms。新增manual断言误要求本次SDK异常具有code；实际本次抛原生错误，下一prompt才抛已锁定incomplete。这是测试断言错误，不是生产RED |
| `cos85-manual-green.tap` | 仅修manual当次断言为原错误文字，仍验证下次prompt的incomplete及零新增请求；`node --experimental-strip-types --test --test-name-pattern='manual summary length stays fatal' tests/providers/pi.test.ts`；1/1、2775.0599ms，复用其余7项 |
| `cos85-compiled.tap` | 设置`COSMOS_COMPACTION_COMPILED=1`，运行`node --experimental-strip-types --test --test-name-pattern='settled optional length-\|discarded optional length\|optional length cannot hide (unknown\|accounting\|source)' tests/providers/coding-compaction.test.mjs`后移除env；dist Pi/factory 6/6、0skip、5795.2168ms |
| `cos85-typecheck.log`、`cos85-build.log` | `npm run typecheck`、`npm run build`均退出0 |

表中pattern的`\|`是Markdown表格转义，实际命令传给Node的是`|`。最终 `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --skipLibCheck tests/providers/pi.test.ts` 当次工具退出0、无stdout，未生成独立日志文件。

单摘要及split第二摘要代表分别保留1/2笔已结算费用，每笔10µ，原projection与entries逐字节相等、0checkpoint、0部分工具执行；同attempt后续普通请求真实派发并通过原registry capture。后续超过32768字节的工具回合没有再触发摘要。另一代表实际进入下一普通请求，但随后余额不足仍为admission_rejected且再次prompt零新增请求；未知费用、错误model、结算完成异常、取消、关闭、下一请求截止/source拒绝及意外历史entry均不被吞掉。registry捕获的是合成文本，不是游戏/build/browser/human证据；旧C11、预算和历史未改。

最终 `b5e879472b9c1a585a9bde6cb9f1823c044c26fa` 经接续 `cos85_reviewer` 实际6路径规格→质量APPROVED，无finding；唯一 `batch85_86_merger` 合入 `f63399fa77bd725e379eb8d119b7160a04180f32`。当前 **OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY / source scoped complete / closed**；[公开批准](https://github.com/lrfluobida/Cosmos/issues/86#issuecomment-6172184717)、closed(completed)及父勾选已由Root精确读回。原¥150验证总额、COS16组¥10、正式¥200/12h及现有请求/窗口上限保持，不新建paid案例或读取真实ledger/session/key。

主线集成验证：`npm run typecheck`、`npm run build`退出0；`node --experimental-strip-types --test .cosmos/reconciliation/2026-10-13-c6-provider-usage/cos85-reproduce.mjs` 1/1、0skip、TAP6126.7789ms，原作者进入下一普通请求后仍受预算准入约束；设置`COSMOS_COMPACTION_COMPILED=1`后运行`node --experimental-strip-types --test --test-name-pattern='settled optional length-split|optional length cannot hide accounting' tests/providers/coding-compaction.test.mjs`，dist代表2/2、0skip、TAP4719.856ms，随后移除env。raw为TEMP下`cos85-merge-typecheck.log`、`cos85-merge-build.log`、`cos85-merge-root-reproduce.tap`、`cos85-merge-compiled.tap`。已核作者上表9份原始输出并复用通过证据，未重source矩阵或旧长链。
