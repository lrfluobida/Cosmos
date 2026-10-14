# COS88 固定迁移 C13 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans / test-driven-development 逐项实施。作者 `cos88_implementer`，独立 reviewer 由 Root 指定，唯一 merger `batch_c12_reference_merger`。先取得独立 PLAN_APPROVED，再修改生产代码。

**Goal:** 在原 COS16 预算组内准备固定 `cos20-transfer-validation-13`，验证 COS87 并行 Git 身份读取后的原编码交接链。

**Architecture:** 新增独立 C13 固定声明与六个薄 wrapper，复用原 entry/task/driver、当前绑定和 partial 恢复。旧 `deriveFixedThreeYuanTransferSuccessor` 保持只支持 ten/eleven/twelve；C13 不传入旧三元 helper，不引入预算或案例配置接口。

**Tech Stack:** TypeScript、Node 原生测试、既有 RunController 和 SOURCE/TEMP 夹具；本任务作者只做免费源码及合成验证。

**状态与基线：** SOURCE_NOT_READY，目标 `TRANSFER_CASE_THIRTEEN_SOURCE_READY`。Issue [#89](https://github.com/lrfluobida/Cosmos/issues/89)，id5852981194，父 #1，依赖 COS86 #87 / COS87 #88。分支 `codex/cos88-transfer-case13`，managed worktree `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos`，起点 main `49e892992749e5511f2bb4135ec67be4459fa30b`。

## 固定契约与依赖

- C12 已失败并消费，不能重开或延长。保留 20 stopped / 12 delegations / 100 closed grants / 18 closure audits；逐项核对 C12 的 52 笔 admitted/settled coding author 请求、原 window、证据、无 repair/unknown/reserved。closure18 每个释放额由原 grant 减实际费用派生，并核对原声明与来源字节；全部历史声明、费用和审计前缀保持。
- 新 grants 固定 planning/design/art 各 1µ、coding 1900000µ、repair 599997µ，总额 2500000µ；45min / 80 requests / 一次合格 repair、两次 logical attempts。原 group 10000000µ / phase 30000000µ / shared 150000000µ，C10/C11/C12 各 3000000µ 的历史声明不变。准入按 `availableAllocationMicroCny`，partial 沿用 `window.quote.budgetGroup.allocatedMicroCny + sum(current grants)`。
- Root 已报告真实 C12 费用 1664926µ、closure18 释放 1335074µ、组可分配 2540822µ；这里只记录事实来源，不用报告代替生产重新核账，也不把这笔余额当新 role grant。新额度仍沿原 ¥150 持续验证授权，低于既有 ¥3/45min 边界，没有新增 C13 专属人工确认。
- C5 两 passed 阶段及七 capture 只读复用，零 planner/design/art SDK。新作者为空，不预载 C12 失败源码或首次自检通过副本。root、task/plan/candidate、manifest、quote、operator receipt 均准确绑定 C13。
- 保留 clean pushed exact-main、当前输入/候选、source/compiled 闭包、owner、请求/工具及截止守卫。追加 COS86 `TRANSFER_CASE_TWELVE_SOURCE_READY` 和 COS87 `PARALLEL_GIT_IDENTITY_SOURCE_READY`，同时核各自 reviewed/merge 精确祖先。
- COS86 reviewed `08012122685cb66e104f85c1da00bbe7915cebee`、merge `c8f5ecb117e7a68715aa7d8ce0c31f5562ec86ee` 已在 mapping；Root 提供 COS87 approved `ac91cff85ddbdd08720623fd600161f2e61bd6b6`，起点已含 merge `49e892992749e5511f2bb4135ec67be4459fa30b`，但当前 mapping 仍 SOURCE_NOT_READY、无最终 reviewed/merge。准备可先行，生产准入须等待唯一 merger 推送最终 marker/metadata，不能用计划批准替代。

## 最小文件范围

| 路径 | 改动 |
| --- | --- |
| `probes/transfer/validation-case-thirteen-{declaration,entry,run,driver,task,source}.ts` | 六个 C13 文件。declaration 在 `transferCaseTwelveHistory` 后追加原 C12；独立固定函数校验 12 个 delegation、52 笔 C12 请求和实际 closure，再生成 2500000µ 声明。其他文件复用原工厂。 |
| `probes/transfer/validation-case-six-entry.ts` | 只扩 C13 manifest 与 closure18 类型字面量，原 partial 公式保持。 |
| `probes/transfer/validation-case-seven-entry.ts` | 只扩 20 cases / 18 audits、C13 admission 格式及 closure18 类型。 |
| `probes/transfer/validation-case-seven-source.ts` | 只扩固定 thirteen source/compiled seed。 |
| `tests/transfer/validation-case-thirteen{,-runtime,-compiled}.test.ts`、`validation-case-thirteen.fixture.ts` | 固定声明、历史/准入、原 host/factory/Pi、partial、compiled 四文件；纯算术数据与经原 API 认证的 SOURCE 历史明确区分。 |
| `tests/transfer/validation-case-ten.fixture.ts` | 将共享夹具核心改为中性名 `withFixedTransferSuccessorFixture`，只加第四个固定 C13 分支；保留原 `withFixedThreeYuanTransferFixture` 的 ten/eleven/twelve 签名转调，旧调用不改。 |
| `probes/transfer/README.md`、本计划、`docs/specs/cos88-transfer-case13.md` | 追加固定入口、来源与证据边界。共享 tracking 仅由 merger/Root 更新。 |

选择独立 C13 声明可保留旧 helper 的 ¥3 语义；扩旧 helper 或做通用预算框架会扩大范围。本轮计划提交只新增 plan/card 两文件，不写生产文件。

## SOURCE 复用与恢复

只读核对过 `C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C12-proof-75afa07b-c73d-4916-b84b-4de8e5372fa0`：history-1/2 为 19/11/95/17、0 个 C12 请求；result 为 20/12/95/17、仅 1 个 mock C12 请求。不能把 result 当成 52 笔历史或 closure18。

从 history-1 使用原 prepare/claim、RunController reserve/admit/settle/stop、allocation closure API，以新 SOURCE 身份追加 52 笔 C12 合成请求和 closure18，得到 20/12/100/18；不重放旧长 seed 或旧作者。两组独立合成费用验证 C13 固定向量不随历史费用改变，available 随实际合成费用变化；任何合成记录都不称为真实 C12。

TEMP mapping 仅提供明确标为 SOURCE 的测试审批，并测试缺 marker、reviewed 或 merge 非祖先拒绝。finally 关闭全部 owner/locks，恢复原 snapshot/mapping 字节与 mtime，恢复原缺失目录状态，归档新 history/result/case13/marker。原 C5 和旧 proof 字节不改；来源不符时报告差异，不自动重建，不读写真实 ledger/session/key。

## 实施步骤与免费验收

- [ ] 提交两份短文档 exact SHA，取得独立 PLAN_APPROVED；在运行集成夹具前同步 Root 指定的 COS87 最终主线 metadata。
- [ ] RED：C13 unit 验证固定向量、原 3000000µ 历史不变、两组费用/available、52 笔数量/role/purpose/window/admission/settled/evidence/repair/closure/grant 漂移拒绝、unknown/reserved、组容量不足及 stale quote。记录缺 C13 API 的实际失败。
- [ ] GREEN：只实现上表固定声明、必要字面量和 wrapper；验证旧 C12 五项短回归，保持旧 C10/C11/C12 声明推导。
- [ ] SOURCE：一次新 C13 准入与原 host/factory/Pi fake，核 20/12/100/18 前缀、空作者、C5 两阶段七 capture、当前身份/计划/quote、两个新增 marker 和 reviewed/merge 双祖先拒绝。关闭 owner 后同窗口、原截止和 requirement 冷恢复，验证 partial 公式及伪造当前绑定拒绝；不跑游戏 build/browser/repair。
- [ ] compiled：编译 C13 入口闭包，验证全 JS source、JS worker 选择、准入拒绝零写入，修改 compiled task 后零派发；worker transport 明确 synthetic。
- [ ] typecheck/build/affected strict、UTF-8/中文回读、base diff check；保存原始命令/TAP、RED→GREEN、恢复证据和限制，提交 exact SHA 供独立规格→质量审查。通过证据不因文档调整重复执行。

```powershell
node --experimental-strip-types --test tests/transfer/validation-case-thirteen.test.ts
node --experimental-strip-types --test --test-name-pattern='C12 (fixes|rejects|uses|fixed parser|unknown admission)' tests/transfer/validation-case-twelve.test.ts
node --experimental-strip-types --test tests/transfer/validation-case-thirteen-runtime.test.ts
node --experimental-strip-types --test tests/transfer/validation-case-thirteen-compiled.test.ts
npm run typecheck
npm run build
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions --allowJs --checkJs false probes/transfer/validation-case-thirteen-run.ts tests/transfer/validation-case-thirteen.test.ts tests/transfer/validation-case-thirteen-runtime.test.ts tests/transfer/validation-case-thirteen-compiled.test.ts tests/transfer/validation-case-twelve-runtime.test.ts
git diff --check
```

预期新项全部通过、命令退出 0；旧 C12 pattern 命中五项。运行时间和实际测试数按原始输出记录。只有实际变更、依赖或失败影响既有结果时才补验，不重跑 C12 长 SOURCE 或 COS87 性能基准。

## 完成与实际运行边界

独审 exact SHA 通过、唯一 merger 集成推送并记录后才可标 SOURCE_READY。Root 随后负责真实免费预检、独立审查的一次性操作脚本及一次 C13 有界运行；实际运行结果另列时间、费用、自检、handoff/capture、正式 build/browser/review/repair/accepted。作者不执行付费/新窗口/operator 脚本，不访问参考安装或修改生成游戏。源码、编译或 COS87 短基准不代表实际 C13 通过；COS16/COS18、完整经典与 human 仍未完成。
