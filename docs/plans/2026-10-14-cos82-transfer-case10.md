# COS82 固定迁移 C10 实施计划

> 使用 writing-plans / executing-plans / TDD；独立 PLAN_APPROVED 后实施。专属 implementer `cos76_implementer` acting COS82；独立 reviewer `cos77_implementer`；唯一 merger `batch75_76_merger`。

**目标：** 准备独立 `cos20-transfer-validation-10`，在新授权的 ¥3/45min 窗口内复用 C5 已通过阶段，保留 C1–C9 完整历史。

**设计：** 复用现有固定 coding-only factories；新声明核历史后使用新的五项分配向量。仅 C10 的恢复校验改为 quote 中 COS16 原 allocated 加本案 grants 总额，旧入口默认仍要求完整 ¥10 分配。

**基线：** main `007cd1042d73abeed2d8d1384aee2400a6f3dc8a`，managed `cos76-transfer-case8/Cosmos`，分支 `codex/cos82-transfer-case10`。Issue [#83](https://github.com/lrfluobida/Cosmos/issues/83)，id5846224228，标题「准备 ¥3 上限的固定迁移 C10」。用户已在明确上限提案后授权继续；Root 独占真实准入与付费操作。

## 固定契约

- 新 grants：planning1/design1/art1/coding2400000/repair599997 micro-CNY，合计3000000；incremental hard3000000、45min、80requests、一次合格 coding repair/两 logical attempts。原 shared150m/phase30m/COS16 parent10m、output caps、floor4096、600000ms 请求时限及 deadline 裁剪不变。
- 这是新的授权向量，不称原角色剩余额度，不改 parent/旧 allocations/ledger schema，不借外组费用。准入使用 `prepareValidationBudgetGroup` 的 `availableAllocationMicroCny`，保留 quote 与实际 operator source 的原子复核。
- 先验证原 C1–8 派生声明，再核 C9 已停止、原声明、31个实际 settled coding author costs/request/window/evidence、无 unknown/reserved、无 repair，以及五项 closure15 的释放额等于各原 grant 减实际费用。完整前缀17stopped/9delegations/85closed/15audits、旧 source/receipt 字节及 owner idle 保持；生产不硬编码 Root 的历史费用总额。
- 独立 ID/root/marker/reuse manifest/admission quote/operator receipts。只读复用 C5 design/art 两阶段七 captures，零 planner/design/art SDK；新 author 目录为空，不预置 C9 文件。当前 requirement/task/plan/source/compiled worker/provenance 继续固定绑定。
- 增加 COS78 `TRANSFER_CASE_NINE_SOURCE_READY`、COS79 `VALIDATION_CODING_COMPACTION_SOURCE_READY`、COS80 `TRANSFER_CURRENT_PLAN_READING_SOURCE_READY`、COS81 `ADMISSION_FAILURE_FEEDBACK_SOURCE_READY` 已审及 reviewed/merge 双祖先门禁，保留旧门禁与 clean pushed exactmain 要求。

## 最小文件范围

- 新增 `probes/transfer/validation-case-ten-{declaration,entry,run,driver,task,source}.ts`；声明只新增 C9 历史验证与固定新向量，不复用会强制逐角色剩余额度的旧 successor 公式。
- 窄改 `validation-case-six-entry.ts`、`validation-case-seven-entry.ts`：新增 C10 固定字面量/17与15计数及仅内部可信配置启用的恢复分配校验；`validation-case-seven-source.ts` 增加固定 ten 闭包种子。C6–9 默认与 driver/repair 编排保持。
- 新增 `tests/transfer/validation-case-ten{,-runtime,-compiled}.test.ts` 及 `.fixture.ts`，复用既有 SOURCE seed/helper；transfer README 只追加 C10 使用说明。本计划和 own card 自有，共享 tracking 仅 merger 修改。

恢复公式明确为 `window.quote.budgetGroup.allocatedMicroCny + sum(window.quote.declaration.grants)`；前者是原 COS16 组 allocated，不能误用 `quote.basis.allocatedMicroCny` 的全局 allocated，也不能用当前 committed 加 grants。quote 已由原 snapshot/operator source 认证；所有旧闭包、前缀与新 declaration 仍须一致。新开关无 CLI/model 入口。

## 步骤与免费证据

- [x] 短计划/卡 exact 提交独审；批准前不改生产代码。
- [x] RED：两组不同 C9 settled 合成金额保持新向量固定，同时准确改变 group available；拒绝31条数量/role/window/费用证据/closure/grant/旧 prefix漂移、unknown/reserved、余额不足及旧 quote。余额不足在现有真实预算 helper/quote 路径验证，不伪称真实历史余额已不足。
- [x] GREEN：最小声明、固定 wrapper 与恢复 seam；旧入口默认10m回归保持。新 quote完整写入3m向量与上限，claim只追加一次并保留全部旧前缀。
- [x] 一个真实 SOURCE host/factory/Pi fake 代表：空新作者目录、C5复用与当前映射/绑定，原守卫下请求/费用；关闭 owner 后同窗口/deadline/task/quote冷恢复通过，证明 group allocated未满10m仍是合法本案。伪造 partial净额或quote基数拒绝。旧 repair/v2编排未改，复用 COS76真实host repair/cold分支与 COS80 v2 packet证据，另核599997 repair grant沿原524488预估门槛与资格门禁。
- [x] compiled 固定入口/JS worker路径与新闭包代表，source/compiled mutation拒绝；准确区分 synthetic worker transport 与实际 build/spawn。
- [x] affected unit/旧 C9短回归、typecheck/build及 probes/tests strict；UTF-8/LF/中文回读与 diff check。保存原始 TAP/命令/退出码，提交 exact SHA 独审；最终批准与 sole merger整合待完成。

拟定命令：`node --experimental-strip-types --test tests/transfer/validation-case-ten.test.ts tests/transfer/validation-case-nine.test.ts`；runtime与compiled分别执行，避免并行占用同一 SOURCE seed；`npm run typecheck`、`npm run build`，显式 strict 编译同 C9 命令仅替换新 runner/tests。先RED后GREEN，不重旧长矩阵。

## SOURCE seed 复用

优先读取已保存的 `C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C9-proof-d40980df-e6ec-490f-902b-a592ef4c86ac/history-1.json`（16-case临时历史），已核文件存在；沿原固定清单重新验证此合成视图与 C5资料。通过底层 prepare/claim/RunController reserve/admit/settle/stop/closure API 只补31笔合成 C9 author 费用和 closure15，不跑 C9 作者或旧20分钟 seed/17分钟 repair链。

新 SOURCE 决策/费用/closure 文件使用新身份；不改已归档 C8/C9 proof。finally先关全部 owner，再将原 snapshot 字节/mtime、被临时更换的 SOURCE mapping恢复；新视图/结果单独归档。若保存视图不再自洽，先报告精确失配，不自动重建长链。不得读取真实 ledger/session/thinking/key、真实 C9作者文件或参考游戏；Root另行执行实际准入/paid。

状态：计划 exact `371ef1d9e641c331cfca1812ec9ab94a815d422c` 已由 `cos77_implementer` 独立 PLAN_APPROVED。实现完成待 exact 独审，仍为 SOURCE_NOT_READY。目标 marker `TRANSFER_CASE_TEN_SOURCE_READY`；源码准备不代表实际 C10已启动、生成完成或人工通过。

## 实现证据

| 检查 | 实际结果 | 原始证据 |
| --- | --- | --- |
| 新 C10 unit RED | 0/6，均因固定 API 缺失失败；退出1，TAP4818.8761ms | `C:/Users/26557/AppData/Local/Temp/cos82-unit-red.tap` |
| C10六项与原C9五项 GREEN | 11/11，0skip；退出0，TAP5301.3911ms | `C:/Users/26557/AppData/Local/Temp/cos82-unit-green.tap` |
| compiled 新闭包/JS worker路径/unknown及字节变更拒绝 | 1/1，0skip；退出0，test10842.2561ms/TAP14292.1935ms | `C:/Users/26557/AppData/Local/Temp/cos82-compiled.tap` |
| SOURCE 当前host/Pi/partial冷恢复 | 1/1，0skip；退出0，test398125.6724ms/TAP401597.7236ms | `C:/Users/26557/AppData/Local/Temp/cos82-runtime.tap` |
| `npm run typecheck` / `npm run build` | 均退出0 | `C:/Users/26557/AppData/Local/Temp/cos82-typecheck.log` / `cos82-build.log` |
| 新 runner/probes/tests strict | 退出0，无stdout/诊断 | 当次工具原输出，无独立日志 |

命令：unit按上文两文件；compiled/runtime分别为 `node --experimental-strip-types --test tests/transfer/validation-case-ten-compiled.test.ts` 与 `validation-case-ten-runtime.test.ts`。strict为 `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions --allowJs --checkJs false probes/transfer/validation-case-ten-run.ts tests/transfer/validation-case-ten.test.ts tests/transfer/validation-case-ten-runtime.test.ts tests/transfer/validation-case-ten-compiled.test.ts`。首次strict仅新fixture九处可选字段类型检查失败，按已验证快照形状补非空标记后通过，生产源码未因此变化。

runtime直接复用保存的16-case视图，经真实预算/claim/settlement/closure API构造两组31笔C9合成费用（960162与800000µ）。新向量两次均为3m，available差额正确、旧quote失效；unknown/closure/grant/delegation/owner/manifest/实际closure source及COS80/81审批/双祖先拒绝保持零host派发。当前C10仅一个coding任务，作者目录为空；真实host/factory/Pi guarded stream对合成405672-byte输入保留65536cap，预留1335632µ，fake provider1/network0。关闭owner后用同window/deadline/requirement冷恢复，group allocated=quote.budgetGroup prior allocated+3m且小于10m；伪造quote基数拒绝。旧17-case/费用/closure/audit前缀保持。旧入口默认10m条件仅由窄diff确认并复用旧冷恢复证据，没有重跑旧冷启动长链。

归档：`C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C10-proof-f99d7222-2af2-48df-97c7-89c0ae61c0c2`，包含original snapshot、两个history视图、result snapshot、case10和marker、合成C9历史目录。finally先关闭owner再恢复原snapshot字节/mtime、原SOURCE mapping字节，旧C8 proof各固定文件字节/mtime和已归档C9 proof保持。未重建seed，也未修改真实历史。

source代表核固定新wrapper与原closure依赖并拒绝篡改source receipt；compiled代表实际拒绝改过的JS task字节。JS worker路径选择已验证，worker job transport是synthetic，并非实际worker spawn/build。C10 repair/build/browser/完整生成未跑；599997>524488仅为新grant与未改host预估门槛的源契约核对，原COS76 repair/cold与COS80 v2 packet证据复用，不能写成C10修复实测。

16paths严格UTF-8/LF/noBOM；三个既有源码文件非ASCII序列保持，README原字节前缀保持，中文回读与diff check通过。全部生产源码在compiled/runtime期间稳定；无真实ledger/session/key读取、实际新窗口或付费操作。
