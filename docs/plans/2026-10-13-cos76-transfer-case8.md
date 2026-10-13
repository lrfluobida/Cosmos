# COS76 transfer case eight implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. The dedicated implementer owns this branch; an independent reviewer approves this plan and the actual implementation diff; only Root's sole merger integrates approved commits. Source implementation waits for `PLAN_APPROVED`.

**Goal:** 准备固定 `cos20-transfer-validation-8` 的免费准入、编码运行与冷恢复入口。

**Architecture:** 沿 C7 已审 coding-only factories 增加少量可信内部参数和固定 C8 wrappers；由真实 C1–7 settled 历史推导原 COS16 各角色剩余额度。C8 独占身份、root、marker、manifest、admission quote 和 operator receipts；C6/C7 的公开默认行为保持。

**Tech Stack:** TypeScript、Node 22 test runner、既有 RunController / historical-stage verifier / transfer host / native role factory。

Base: `4ba794efdd5647b9546ad3a5b90507505109a524`。Branch: `codex/cos76-transfer-case8`。Issue: [COS76 #77](https://github.com/lrfluobida/Cosmos/issues/77)，id5832425117，父 #1。规格见 `CONTEXT.md`、`docs/specs/cosmos-spec.md`、COS60 task card 和本分支 `docs/specs/cos76-transfer-case8.md`。COS75 的源码门禁固定为 `VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY`；reviewed/merge SHA 等 Root 提供，不编造。

## 已固定边界

- Root 当前实际记录：15 stopped（8 native、7 transfer）、7 原 COS16 delegations、75 closed grants、13 closure audits、revision2023、unknown/reserved0、shared settled8932365µ。C7 的18次 coding author SDK 结算58415µ、无 game/repair，已消费身份不得重开。上述数值是事实，不作为新 grant 常量。
- 原 COS16 ¥10 角色容量 planning400000 / design1200000 / art2800000 / coding2800000 / repair2800000µ 不变；逐角色减去 C1–7 实际 settled 费用，不借角色或其他组预算。C6 final reconciliation 与 C7 settlements 均须有原实际证据、原 closure source bytes，清 unknown 标记不替代费用核实。
- 单案 ¥5 / 45min / 80requests / 一次合格 coding repair；原 output caps、coding request source cap600000ms、每请求 deadline 减5000ms裁剪、maxRetries0保持。planner/design/art SDK 为零；只复用 C5 的两个 passed 阶段与七个 captures。
- 每次准入/恢复要求当前 clean pushed exact main、源/compiled 执行闭包及依赖/lock/toolchain、原 C5 来源、当前任务/候选计划/输入绑定、实际 manifest 和冻结历史 accounting prefix、全部历史与共享 owner idle。新开前固定15/7/75/13；已开 C8 只能恢复自己的原 window/deadline/grants。
- 本作者不读写真实 ledger/session/key/game/参考安装，不付费、不合并或推 main。仅 source/TEMP；旧重型运行证据复用，不再运行旧26分钟 fixture或整套浏览器矩阵。

## 文件及最小接口

新增 `probes/transfer/validation-case-eight-{declaration,entry,run,driver,task,source}.ts`。固定 parser 仅接受原 preflight/case 命令，不加 case/root/clock/budget CLI。

按必要范围修改：

- `validation-case-six-entry.ts`：可信配置接受固定 C8 manifest、附加 source markers、closureAuditCount；C7 默认12、C6默认11。C8绑定13，并新增 COS60 `TRANSFER_CASE_SEVEN_SOURCE_READY`、COS74 `FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY`、COS75 上述 marker 及各 reviewed/merge ancestry 检查。
- `validation-case-seven-{entry,driver,task,source}.ts`：抽出既有 admission/hash/source recheck、driver/task binding 与源码闭包的可信 factory；原 C7 exports 仍绑定14/6/70/12、原格式与入口。C8绑定15/7/75/13及自己的格式/模块；不复制整条执行链，不改 runtime/provider/预算 schema。
- `probes/transfer/README.md`：只追加 C8固定入口、source-only状态和准入条件。
- 新 `tests/transfer/validation-case-eight{,.fixture,-runtime,-compiled}.test.ts`（fixture 使用 `.fixture.ts`），必要时重用已有测试 builder 的小型内部 seam。只修改自己的计划/独立卡，不改共享 PROGRESS/spec/issues/mapping；sole merger接入这些记录。

## 执行步骤

### 1. 已结算历史派生与固定身份

- [ ] 写 RED：两组不同实际 C6/C7 settled 金额得到正确 C8各角色余额；原18个 C7 author费用与其动态 D7声明吻合。unknown/reserved、缺费用证据、错 window/member/grant、重复费用、非正剩余额度拒绝。
- [ ] 最小实现：先复用 C7 派生得到 C7原声明，再验证并扣除 stopped C7 的18个 coding author settled 请求，核对七个原 delegation / closed net / ¥10总额。C8历史列表含该动态 D7；当前 C8费用不进入历史派生。
- [ ] 验证固定ID/parser、同原 inputs/limits/output caps、old quote因费用变化失效；不修改历史成本或声明。

### 2. 固定准入与执行闭包

- [ ] 写 RED：未 closure13、旧14-case prefix、错历史来源/manifest/grant、缺/错 COS60/74/75 marker或非祖先SHA、active/recovery owner均拒绝；快照bytes/mtime/filelist不变，host与SDK0。
- [ ] 按上述最小接口绑定独立 C8 envelope，覆盖实际 quote/grants/manifest/source approvals/execution/accounting digest；claim前及执行/恢复再次验证，保持原 operator receipt与quote2原子claim链。
- [ ] 复用严格 source/compiled闭包验证；默认 C7 seeds不变，C8捕获自己的固定run/driver/task及原provider/host/workers/依赖。实际源码或compiled字节、锁文件/依赖漂移拒绝。

### 3. 当前任务、一次修复与冷恢复

- [ ] 用一个合法 SOURCE/TEMP 15-case seed，复用既有真实 C5 lineage 与原费用/closure builders；其历史需通过实际 validateSnapshot/receipt/manifest验证，不用虚假history callback替代。合成fixture身份不冒充实际历史。
- [ ] 验证一次合法 claim只新增自己的 C8，历史 accounting prefix与七个C5 captures不变；当前coding task/plan/input/receipts重派生且同 window/deadline。
- [ ] 跑一个当前组合代表：真实 production role factory/driver及假SDK/免费build/browser transports，coding缺陷→唯一linked repair→关闭/冷开 owner→原任务恢复；零 planner/design/art SDK，第二次repair拒绝。复用已审 C7 重型 capture/promotion证据，仅核对本次固定绑定变化。
- [ ] compiled入口短代表验证固定身份/manifest、错误历史拒绝、源码字节漂移拒绝；不启动真实浏览器、不等长请求。

## 验证与交接

- [ ] RED/GREEN: `node --experimental-strip-types --test tests/transfer/validation-case-eight.test.ts`。
- [ ] 新组合及 compiled短代表：`node --experimental-strip-types --test tests/transfer/validation-case-eight-runtime.test.ts tests/transfer/validation-case-eight-compiled.test.ts`；记录原始TAP/时长与fixture边界。
- [ ] 仅受影响 C6/C7短回归：固定声明/parser/task/receipt/source factory与旧默认值；不跑现有runtime长fixture。按实际测试名选择并记录命令。
- [ ] 受影响 probes/tests standalone `tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions`，及 `npm run typecheck`、`git diff --check`。
- [ ] 编辑前 strict UTF-8检测，保持原 LF/无BOM与中文；编辑后回读。提交 exact SHA、通过证据和已知不足给 Root/专属 reviewer；修review findings后只重受影响检查。

状态：PLAN_PENDING，SOURCE_NOT_READY。实际 C8/new paid/human NONE；原 C7 failure与全部费用保持。COS75批准与合入是实际运行前置条件。
