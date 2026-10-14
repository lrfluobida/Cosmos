# COS86 固定迁移 C12 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans / test-driven-development 逐项实施。作者 `cos86_implementer` 接续 COS86；独立 reviewer `cos86_reviewer`；唯一 merger `batch85_86_merger`。独立 PLAN_APPROVED 后才修改生产代码。

**Goal:** 准备固定 `cos20-transfer-validation-12`，在 COS85 最终源码批准后验证摘要截断恢复后的完整交接链。

**Architecture:** 窄扩现有 ten/eleven 固定后继 helper、六个 twelve 薄 wrapper 和必要字面量。继续使用原 entry/task/driver、当前执行绑定与 partial 恢复公式，不新增预算框架或重写运行编排。

**Tech Stack:** TypeScript、Node 原生测试、现有 RunController 与 SOURCE/TEMP 合成夹具；无付费调用。

**基线：** 初始 main `ecd8d8e0c3f28e6d8f4cd34ea6219342900b9328`；分支 `codex/cos86-transfer-case12`；managed worktree `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos`。Issue [#87](https://github.com/lrfluobida/Cosmos/issues/87)，id5850243246；父 #1，依赖 COS84 #85、COS85 #86。COS85 `b5e879472b9c1a585a9bde6cb9f1823c044c26fa` 由 `cos85_reviewer` 最终 APPROVED、无 finding；测试前实际并入的已推主线及后续文档同步见实现证据。

## 固定契约

- 新 C12 保留 19 stopped / 11 delegations / 95 closed grants / 17 closure audits。C11 原声明必须对应 41 笔 admitted/settled coding author 请求，同 window、无 repair/unknown/reserved，费用与证据完整；closure17 每项释放额等于原 grant 减实际费用，并核实际来源字节。C11 身份已消费，不能重开。
- 新 grants 固定 planning/design/art 各 1µ、coding 2400000µ、repair 599997µ，合计 3000000µ；45min / 80 requests / 一次合格 repair、两次 logical attempts。原 COS16 group 10000000µ、phase 30000000µ、shared 150000000µ 和输出/请求时限不变。准入按 `availableAllocationMicroCny`，partial 保留 `window.quote.budgetGroup.allocatedMicroCny + sum(current grants)`。
- Root 报告实际 C11 费用 1336555µ、共享累计 12802875µ、closure17 释放 1663445µ、组可分配 4205748µ；仅为规格背景，生产重新核对真实历史与 quote，不硬编码旧费用或将新向量当成旧角色余额。作者不读取真实 revision2555 台账。
- C5 两个 passed 阶段、七个 capture 只读复用；零 planner/design/art SDK。新作者为空，不预置 C11 六个文件。C12 独立 root、manifest、任务/plan/candidate、quote 和 operator receipt。
- 保留所有旧历史来源、当前输入/候选、clean pushed exact-main、source/compiled 闭包、owner、请求和工具守卫。新增 COS84 `TRANSFER_CASE_ELEVEN_SOURCE_READY`、COS85 `OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY` 及各自 reviewed/merge 祖先；缺少最终批准必须拒绝准入。

## 文件范围

- 新增 `probes/transfer/validation-case-twelve-{declaration,entry,run,driver,task,source}.ts`。declaration 的 history 在 C11 history 后追加实际派生 C11；固定 twelve selector 绑定 C11 / 41 笔 / 11 members。旧 ten→C9/31/9、eleven→C10/40/10 行为保持。
- 仅修改 `probes/transfer/validation-case-ten-declaration.ts` 的固定 selector；`validation-case-six-entry.ts`、`validation-case-seven-entry.ts`、`validation-case-seven-source.ts` 增加 C12 manifest/admission/闭包与 19/17 类型字面量。
- 新增 `tests/transfer/validation-case-twelve{,-runtime,-compiled}.test.ts`、`validation-case-twelve.fixture.ts`；`tests/transfer/validation-case-ten.fixture.ts` 窄扩第三个固定 SOURCE 视图。`probes/transfer/README.md` 只追加 C12。自有 plan/card 之外的共享 tracking 由 merger 处理。

## SOURCE 复用与恢复

已只读核对 `C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C11-proof-78dbfb2d-c819-4830-8f0c-294b8d94d49c`：history-1/2 均 18 stopped / 10 delegations / 90 closed / 16 audits，0 个 C11 请求；result 有 19 cases，却仅 1 笔 C11 mock，仍 90/16，不能代替 41 笔或 closure17。

从 history-1 经原 prepare/claim/RunController reserve/admit/settle/stop/closure API，以新 SOURCE 身份合成 41 笔 C11 费用及 closure17；不跑 C11 作者或重建长 seed。保存两组费用视图验证新向量独立于旧成本。TEMP mapping 只提供明确标为 SOURCE 的测试审批，并验证缺 marker/非祖先拒绝，不冒充真实审批。finally 关闭 owner，恢复原 snapshot 字节/mtime、mapping 字节/mtime、原缺失目录状态；新 history/result/case12/marker 单独归档，旧 proof 与 C5 字节不改。源失配时报告精确差异，不自动重建。

## 实施步骤与免费验收

- [x] 将本计划和任务卡 exact SHA 交独立计划审查；取得 PLAN_APPROVED，生产测试前并入 Root 指定 COS85 最终主线。
- [x] RED：新增 C12 unit，验证两组 C11 成本均得固定 3m、available 随真实成本变化；拒绝 41 笔数量/role/purpose/window/admission/settled/evidence/repair/closure/grant 漂移、unknown/reserved、容量不足和旧 quote。记录缺 API 的真实失败。
- [x] GREEN：只实施固定 helper、six/seven 字面量和六个 wrapper；原 ten/eleven unit 同跑，确认 31/40 笔语义及所有历史前缀保持。
- [x] SOURCE：一次 C12 准入与当前 host/factory/Pi fake，检查 19 案/95 closures/17 audits 完整前缀、空作者、C5 七 capture、当前 plan/quote、COS84/85 marker 与 reviewed/merge 双祖先。关闭 owner 后同窗口/截止时间/requirement 冷恢复，partial 公式及伪造 quote 拒绝。
- [x] compiled：核 C12 JS 入口、JS worker 路径、import 闭包；source receipt 与 compiled bytes 漂移须在派发前拒绝。synthetic worker transport 明确标注，不能声称实际 worker spawn/build。
- [x] 执行 affected strict、typecheck/build、UTF-8/中文回读和完整 base diff check；保存原始 TAP、失败与修正、恢复证据及限制，提交实现 exact SHA 供独立规格→质量审查。

命令（runtime 单独串行使用共享 SOURCE）：

```text
node --experimental-strip-types --test tests/transfer/validation-case-twelve.test.ts tests/transfer/validation-case-eleven.test.ts tests/transfer/validation-case-ten.test.ts
node --experimental-strip-types --test tests/transfer/validation-case-twelve-runtime.test.ts
node --experimental-strip-types --test tests/transfer/validation-case-twelve-compiled.test.ts
npm run typecheck
npm run build
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions --allowJs --checkJs false probes/transfer/validation-case-twelve-run.ts tests/transfer/validation-case-twelve.test.ts tests/transfer/validation-case-twelve-runtime.test.ts tests/transfer/validation-case-twelve-compiled.test.ts tests/transfer/validation-case-eleven-runtime.test.ts tests/transfer/validation-case-ten-runtime.test.ts
git diff --check ecd8d8e0c3f28e6d8f4cd34ea6219342900b9328...HEAD
```

GREEN 预期上述命令退出 0；记录实际 count/skip，不用 SOURCE 证明正式游戏通过。复用未改 C10/C11 partial、旧 repair/v2 和 COS85 最终矩阵，不重复长 seed、作者生成或相同验证。真实免费预检、付费启动及真实账本只能由 Root 执行；不接触 launcher/session/key，不 push/merge main。

状态：计划 `fc2a06e8b4668145133b393533d91d2dc8987d96` 已由 `cos86_reviewer` 独立 PLAN_APPROVED，无 finding；实现完成待 exact 源码独审 / SOURCE_NOT_READY。目标 `TRANSFER_CASE_TWELVE_SOURCE_READY` 只在最终 exact 实现批准后由 merger 登记；实际 C12、完整经典与 human 均未通过。

## 实现证据

测试前并入已推主线 `5b2f16387ea0cfee79eaecba632cd06924c60ee8`，本分支 merge `929229182f66df8a93d8f3ea65db9b6ae1f56a60`，继承 COS85 approved `b5e879472b9c1a585a9bde6cb9f1823c044c26fa`、merge `f63399fa77bd725e379eb8d119b7160a04180f32`；执行闭包包含当前 `pi.ts`。测试期间生产/测试文件保持稳定；runtime finally 完成后并入仅六文档状态同步 `d1064fdcb7532d1c565b8048b0a2922338dcb7d4`，本分支 merge `ecb69f57f7c31ede9ce55f1d375befa2aa9203ff`，前者作为最终 review base。

下列原始输出均位于 `C:/Users/26557/AppData/Local/Temp/`，命令为上文；RED仅运行新 C12 unit。SOURCE/compiled 都是免费合成证据。

| 检查 | 实际结果 | 原始文件 |
| --- | --- | --- |
| C12 unit RED | 0/6，全部缺 C12 API；退出1，TAP4826.6853ms | `cos86-unit-red.tap` |
| C10/C11/C12 unit GREEN | 18/18、0skip；退出0，TAP6740.9991ms | `cos86-unit-green.tap` |
| compiled C12 闭包/JS worker/字节漂移 | 1/1、0skip；退出0，test18801.5634ms / TAP24755.4615ms | `cos86-compiled.tap` |
| SOURCE 历史/准入/host/Pi/冷恢复 | 1/1、0skip；退出0，test475976.2448ms / TAP480667.6478ms | `cos86-runtime.tap` |
| typecheck / build / affected strict | 均退出0；strict 无诊断 | `cos86-typecheck.log` / `cos86-build.log` / `cos86-strict.log` |
| docs-only 差异、审批祖先与 SOURCE 恢复 | 退出0；六文档，COS84/85 marker/双祖先保持，旧 snapshot/目录/owner 已恢复 | `cos86-final-metadata.log` |

运行归档：`C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C12-proof-75afa07b-c73d-4916-b84b-4de8e5372fa0`。history-1/2 经原 API 新身份生成各 41 笔 C11 synthetic admitted/settled author 请求，费用分别 1336555/1100000µ，均 19 stopped / 11 delegations / 95 closed / 17 audits；available 差 236555µ，新向量均 3m，旧 quote 拒绝。result 保留 41 笔前案与全部历史前缀，另有本次 C12 单笔 fake provider 请求；不是实际游戏记录。

实际当前 host/factory/Pi 对 405672-byte 合成输入保留 65536 输出 cap，预留 1335632µ；只有 coding SDK，空作者、C5 两 passed 阶段七 capture、当前 plan/quote 与同窗口/截止时间/requirement 冷恢复通过。缺 COS84/85 marker、两者各自 reviewed/merge 非祖先、未知费用、closure 来源、历史 grant/delegation、owner、manifest 和伪造 partial quote 均拒绝。finally 关闭全部 owner，恢复原 snapshot/mapping 字节及 mtime、原缺失目录状态，旧 proof/C5 字节保持。

compiled 的 JS worker 路径与变更后 JS task 的派发前拒绝已验证；worker job transport 为 synthetic，不声称真实 worker spawn/game build。未执行 C12 build/browser/repair/accepted/human；复用未改 C10/C11 partial、旧 repair/v2 与 COS85 已审 30 项 compaction/source、6 项 dist 及主线定向证据，见 [COS85任务卡](../specs/cos85-optional-compaction-truncation.md)。最终文档同步只改变 COS85 关闭状态/URL（`source-integrated`→`complete` 均被原门禁接受），源码/依赖/固定输入/夹具未变，复用上述通过证据，没有重复长 SOURCE。
