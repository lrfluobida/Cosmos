# COS78 固定迁移 C9 实施计划

> 使用 writing-plans / executing-plans / TDD / verification-before-completion。专属 implementer `cos76_implementer` acting COS78；独立 reviewer `cos77_implementer`；唯一 merger `batch75_76_merger`。独立 `PLAN_APPROVED` 后实施。

**目标：** 准备固定 `cos20-transfer-validation-9`，复用已审 coding-only factories 与 C5 两个 passed 阶段，并要求 COS77 输出额度修复已审集成。

**设计：** 从 C1–8 原逐角色 settled/closure 证据动态派生 C9 grants；固定16stopped / 8delegations / 80closed / 14audits。独立ID/root/marker/manifest/admission quote/operator receipts/current task/候选plan。C6–8默认不变，无任意case/root/clock/budget CLI。

**技术与基线：** TypeScript / Node 22 / 既有RunController、historical verifier、Pi/factory。基于已推 `352c129f121646f3b359a48d7f6cf6371db25e26`，分支 `codex/cos78-transfer-case9`，复用 managed worktree `cos76-transfer-case8/Cosmos`。COS78 [#79](https://github.com/lrfluobida/Cosmos/issues/79)，id5834810242。

## 文件与边界

- 新增 `probes/transfer/validation-case-nine-{declaration,entry,run,driver,task,source}.ts`；必要小改 `validation-case-eight-declaration.ts` 提取已结算前案推导 helper，`validation-case-six-entry.ts` 与 `validation-case-seven-{entry,source}.ts` 扩展固定 C9 字面量/16与14计数。保持旧包装与默认，driver/repair编排不复制、不修改。
- 新增 `tests/transfer/validation-case-nine{,-runtime,-compiled}.test.ts` 与 `.fixture.ts`；README只追加C9。本计划与 `docs/specs/cos78-transfer-case9.md` 自有；共享tracking由sole merger写。
- 原COS16 ¥10逐角色、shared¥150/phase¥30、单案¥5/45min/80calls/一次合格repair、原output caps、600000ms与deadline裁剪保持。零planner/design/art SDK，C5两阶段七capture只读复用；COS77按请求选择有效cap，声明上限不改。实际C8不重开。

## 步骤与免费验证

- [ ] RED：两组不同C8实际settled总额动态推导C9；C8须原14个coding author请求、无repair、已停及closed net吻合。未知/保留额、错声明/role/window/grant/evidence/delegation、非正余额拒绝。金额不写进生产常量。
- [ ] 最小实现上述推导与固定包装；新增COS76 `TRANSFER_CASE_EIGHT_SOURCE_READY`、COS77 `VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY`，保留原56/57/59/60/74/75门禁、clean pushed exactmain、双SHA祖先、source/compiled闭包、idle owners及当前绑定。
- [ ] 免费真实准入代表：未知/未closure14/错历史或manifest/旧quote/未审或非祖先77/owner不空闲，均在host/SDK/发布前拒绝，snapshot bytes/mtime/filelist不变。合法一次claim后旧16-case prefix保持。
- [ ] 当前任务与plan/receipt漂移拒绝、同窗口冷读；通过当前C9 host/factory接入已审COS77策略，用合成405672-byte请求证明实际余额决定cap、预留与fake SDK相同，network0。复用COS77策略完整负例矩阵与COS76真实host repair/cold分支证据，不重17分钟修复链或v2promotion。
- [ ] compiled C9固定入口/JS worker/新闭包与修改字节拒绝短代表；受影响C8声明/任务/factory短回归、affected tsc、typecheck/build、diff check。UTF-8/LF/中文回读，提交exact SHA/原始TAP/不足独审，sole merger集成。

## 复用已保存的 SOURCE/TEMP seed

只用 `C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U`。已只读核实 `.cosmos/SOURCE-C8-before15.json` 与 `SOURCE-C8-fixture.json.snapshotSha256` 精确匹配、validateSnapshot通过、15stopped/7delegations/75closed/13audits；C5 lineage文件保留。现有revision390的C8合成repair证明不充当所需历史形状。

测试先保存当前完整snapshot，确认无owner；用before15建立临时账务视图，经既有prepare/claim/controller/accounting/closure API只追加新的SOURCE-C8费用身份、14个合成author费用和closure14，不运行C8作者、capture或repair。原C8免费proof的root/marker/receipts及原C1–7/C5文件不改，不借其repair task。新的C9拥有独立root/receipts；测试finally关闭owner并恢复原snapshot，独立保存新合成历史/结果。所有变体复用该视图，不重建20分钟seed，不读Root真实ledger/session/key/game或参考安装。

Root实际事实为C8 14SDK/487528µ、coding余1233190µ、shared9419893µ/revision2086/16stopped/80closed/14audits/unknown与reserved0，仅作规格背景；生产重新验证证据。SOURCE_NOT_READY / PLAN_PENDING；本卡实际C9/paid/human/game NONE。
