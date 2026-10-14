# COS89 可负担编码请求保留上下文实施计划

> 使用 writing-plans；独立 PLAN_APPROVED 后由专属 implementer 按 executing-plans、TDD 和 verification-before-completion 执行。独立 reviewer 审查实际 diff；唯一 merger 由 Root 指定。当前仅提交短计划，不执行源码或夹具。

**目标：** 只要现有普通输出裁减仍能安全准入编码请求，就保留原上下文；不能负担现有输出下限时才允许原预算摘要尝试。

**架构：** 仅替换 `src/roles/factory.ts` 的预算压缩谓词，复用 `validationReservation` 和当前 validation authority。Pi 原生 hook、摘要生命周期与实际 reserve/admit/settle 保持原实现。

**技术：** TypeScript、Pi 0.99.2、现有 node:test、真实 factory/controller/Pi 与 fake provider，network0。

**基线与权限：** 冻结 main `388defc543ab4445b5446be6618215a61785168c`；managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`，分支 `codex/cos89-affordable-compaction`。COS89 [#90](https://github.com/lrfluobida/Cosmos/issues/90)，id5854211592，父#1，依赖 COS79/COS85/COS88。C13 使用冻结源码继续运行，结束并由 Root 解除冻结前不整合 main；不执行真实入口或 SOURCE 夹具，不读取真实 ledger/session/key，不注入运行时提示，不新增付费运行。

## 问题与固定策略

原谓词是 `inputBytes >= 131072 && validationReservation(request) > remainingMicroCny / 2`。无图片时 B=131072、cap=65536 预留786432µ，在余额1067661µ下完全可付却会选择摘要。Pi 被选中后以 `reserveTokens=model.contextWindow` 强制原生阈值；这不能作为窗口已满的证据。

改为：

```ts
return request.inputBytes >= 131072
  && validationReservation({ ...request, maxOutputTokens: Math.min(4096, request.maxOutputTokens) }) > current.remainingMicroCny;
```

下限与普通输出裁减严格一致；如需共享4096，仅在同一 factory 文件内提取局部常量，不重构其它逻辑。等额可付使用 `>`，不用 `>=`。不改变输出下限、二分最大可付 cap、请求次数、窗口、预算、权限或价格。

先执行现有 case/window/deadline/max-output/admission/abort 校验；选中只允许尝试摘要，每笔实际摘要仍经原输出裁减与原子准入。不足或 stale authority 仍停止，不吞异常、不重试。Pi keepRecent16000、8192摘要 cap、增长/去重/no-benefit、length恢复、manual/overflow均保持。

C13元数据中的重复计划读取与31k–44k tokens摘要只是观察，不能证明模型动机或因果；本卡不承诺实际生成改善。93578-byte计划及其56997-byte单行minify不在本卡变更范围。

## 文件与步骤

- 生产：`src/roles/factory.ts`，仅上述谓词及必要本地常量。
- 定向策略：`tests/roles/validation-output-limit.test.ts`，替换旧半额触发断言并增加边界。
- 实际链：`tests/providers/coding-compaction.fixture.mjs`、`tests/providers/coding-compaction.test.mjs`，新增可负担场景与必要合成压力调整，保留真实 factory/controller/Pi/native，不复制生产策略或摘要逻辑。
- 文档：本计划及 `docs/specs/cos89-affordable-compaction.md`。不改共享 tracking、C13源码/样本游戏或历史结果。

- [ ] 独立审查此短计划；记录不能保持的契约并修订，禁止扩大实现。
- [ ] 在旧 factory 上先运行真实链 RED：满足旧半额条件而普通输出下限可付，预期0摘要/0checkpoint、原上下文保留且普通派发 cap合法可付；确认失败来自旧摘要选择。
- [ ] 策略边界覆盖 full-cap可付、仅缩减cap可付、下限恰好可付、低1µ、128KiB低1byte、图片预留、请求cap小于4096、stale authority和取消。复用既有非目标role/repair/output bisection证据；新策略不得削弱原guards。
- [ ] 最小替换谓词，运行对应 GREEN；普通实际派发元数据、预留和 sent cap相等，并证明 cap+1不可付（仅缩减场景）。
- [ ] 下限不可付场景通过真实 factory选择后仍走原摘要准入，定向证明实际摘要自身不足时0派发且失败锁保持；可负担摘要至少一个真实 native代表。
- [ ] 处理旧测试输入契约：原 native夹具在普通下限可付时预期摘要，已与新策略冲突。仅调整合成压力/时点与金额期望，使生命周期代表真正达到下限不可付；不强制新策略返回true、不修改生命周期断言。若现有场景不能以此最小调整维持，先向 Root/reviewer 报具体证据并修订计划。
- [ ] 仅重跑受该夹具输入变化影响的 native代表；未变 COS85 length恢复、SDK流程、manual/overflow和已过输出策略证据复用。变更造成的旧断言失败必须解释并修正，不能仅跳过。
- [ ] 在 worktree 运行下列免费验证，记录真实输出和环境问题；不在冻结 main运行测试。

```powershell
node --experimental-strip-types --test tests/roles/validation-output-limit.test.ts
node --experimental-strip-types --test tests/providers/coding-compaction.test.mjs
npm run typecheck
npm run build
$env:COSMOS_COMPACTION_COMPILED='1'
node --experimental-strip-types --test --test-name-pattern='affordable coding|minimum coding|summary input admission' tests/providers/coding-compaction.test.mjs
Remove-Item Env:COSMOS_COMPACTION_COMPILED
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --skipLibCheck tests/roles/validation-output-limit.test.ts
git diff --check
```

新测试名称将包含上述三个定向pattern之一；运行前核对匹配项数，0匹配不是通过。源码测试应全通过；compiled只覆盖本卡实际链增量。受影响旧fixture需要重跑，未变证据不重复。

- [ ] 检查既有目标文件严格UTF-8及行尾后最小patch；回读中文与diff。提交精确SHA、RED/GREEN及检查证据和已知缺口，交独立规格→质量审查。只有批准SHA才交唯一merger；批准前保持SOURCE_NOT_READY，目标 `AFFORDABLE_CODING_COMPACTION_SOURCE_READY`。

## 契约审查结论与待决项

该谓词缩窄可选预算摘要的选择范围，原实际请求准入与费用守卫仍是最终权威；投影观察与下一实际请求可能不同，仍由原实际 metadata重新估价。不能据策略true推断摘要可付，也不能据false保证后来预算不变。已知测试输入契约需要调整，生产范围目前没有必须扩大的证据。

当前计划待独立批准；无实现、测试结果、实际游戏或费用新增。
