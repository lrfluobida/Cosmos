# COS76 · 准备第八迁移案例固定入口

状态：TRANSFER_CASE_EIGHT_SOURCE_READY / PLAN_APPROVED / scoped complete / closed。稳定任务 ID：COS-76。

Issue：[#77](https://github.com/lrfluobida/Cosmos/issues/77)，id5832425117；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。专属 implementer `cos76_implementer`、独立 reviewer `cos76_reviewer`、唯一 merger `batch75_76_merger`。计划提交 `594286e63b94c6798bdf675e776ca067dfe20ff9` 已获独立 `PLAN_APPROVED`；exact `ff6b3015081403d2ba5b186c059eb1905ddb8083` 已经实际 diff 规格→质量 APPROVED、无 findings，合入 `f54d2bbe96055d5c10f82243889f7577422e127a`。实施计划：[2026-10-13-cos76-transfer-case8.md](../plans/2026-10-13-cos76-transfer-case8.md)。

## 实际 C8 结果与 closure14

- [公开源码批准](https://github.com/lrfluobida/Cosmos/issues/77#issuecomment-6149728758)、本卡scoped closed及父勾选已由Root核实；源码审批与双SHA保持。
- source `00eb698fa39a48ba8c4a0f1eaf33c522587d2281`，UTC2026-10-13 15:59:41.066→16:19:11.866（本地跨10月14日），1170800ms / 14SDK / 新增487528µ / 共享9419893µ。`cos16_acceptance_review` 独立核对任务结果为 insufficient_evidence。
- 作者仅有 `index.html`（4921 UTF-8 bytes / 4586 chars），引用 `src/main.ts` 但无src；journal仅origin，无author.json、capture-started、candidate/build/browser/coding review/repair/accepted。原C5 design/art仍passed/approved。两次私有scope timeout之后多次读取与write成功，COS75的恢复属性获得实际证据。
- 第15次调用预算拒绝且未发送。免费精确Pi重现input405672，固定output cap65536预留1335632µ > coding剩1233190µ；可负担cap52730预留1233184µ。后继 [COS77 #78](https://github.com/lrfluobida/Cosmos/issues/78) 已登记待实现，不重开本案例。
- `reconciliation_review` 独审closure14脚本，Root已执行至revision2086 / 16stopped / 8delegations / 80closed / 14audits / unknown与reserved0 / 共享9419893µ。全部历史费用与失败案例保留；COS16/COS18 partial/open、完整classic/human仍未通过。

以下为源码准入与免费验证记录；C8执行前15/7/75/13、revision2023和actual NONE均为当时历史，不代表当前运行状态。

## 目标与范围

增加固定 `cos20-transfer-validation-8` 准入、coding-only运行和冷恢复，区别于历史原生 Case8。通过少量可信内部 factory 参数复用已审 C7链，保持 C6/C7默认行为；不增加任意 case/root/clock/budget CLI。

Root实际历史为15stopped / 7原COS16 delegations / 75closed grants / 13closure audits / revision2023 / unknown和reserved0 / shared settled8932365µ。C7已因insufficient_evidence结束；18次coding author请求结算58415µ，无game或repair，旧身份不得重开。原失败、费用、回执和所有旧窗口保持。

新案例有独立ID/root/marker/reuse manifest/admission quote/operator receipts。原COS16 ¥10固定各role容量减去C1–7真实settled费用推导新grants；当前coding1720718µ、总8076258µ仅为历史费用下的事实，准入重新计算，不借角色或其他组预算。原shared¥150/prior721771µ与正式¥200/12h、优化¥100/6h保持。

单案¥5/45min/80requests/一次合格coding repair；原output caps、coding request600000ms及deadline减5000ms裁剪、maxRetries0保持。零planner/design/artSDK；仅复用C5原design/art两个passed阶段和七capture。C8当前任务、输入、候选计划和执行回执重新绑定。

## 准入与源码前置

要求当前clean pushed exact main、实际source/compiled执行闭包、原实际历史manifest与费用prefix、15/7/75/13及全部owner idle。unknown/reserved、未closure、错source/grant/deps/manifest或非祖先审批均在任何发布/claim/SDK前拒绝。

复用COS56/57/59既有守卫，并增加COS60 `TRANSFER_CASE_SEVEN_SOURCE_READY`、COS74 `FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY` 和COS75 `VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY` 的独审状态及reviewed/merge祖先校验。Root提供COS75 approved `e6a3eac510bafe105a5dfc182b515156e7b356c0` / merge `005b4ae9557f1e735a3d255f9ccb3e5950163ac6`；实际准入重新核对当前main的审批映射和祖先，不以本卡文字代替门禁。

## 免费验收与交付

1. 两组不同实际settled费用正确派生各role容量；old quote失效；未知/未closure/错历史source/grant/deps拒绝且bytes/mtime/filelist不变、SDK0。
2. 合法SOURCE/TEMP一次claim保持历史prefix；真实current task/factory与固定driver组合，coding/冷恢复/一次repair代表；C5通过阶段不新派发。
3. source与compiled源码漂移拒绝；旧C6/C7短回归通过。复用旧重型证据，不重跑旧26分钟fixture或无delta矩阵。
4. 作者提交exact SHA/原证据/不足；独立reviewer先规格后质量审实际diff。sole merger集成已批准提交并接入共享任务文档/mapping。

本卡仅source/free-fixture工作；实际C8、付费、human NONE。完整经典100%/95%、PERFORMANCE、真实完整12h、用户体验与COS16/COS18 partial/open状态不提升。作者不接触真实ledger/keys/sessions/游戏/参考安装。

## 作者免费验证结果（已独审复用）

基础声明/费用/quote/source与旧C6/C7短回归16/16，另C8当前任务/候选计划/receipt漂移1/1；C7 bootstrap和stage代表通过。post-COS75 compiled C8/JS worker/修改compiled字节拒绝1/1；affected standalone tsc及项目typecheck exit0。

一次重建SOURCE/TEMP15-case seed花1205572ms；真实准入/未知、closure、source、owner、grants负例与两个settled费用变体及oldquote拒绝38152.4706ms。新C8真实host.prepareValidationRepair和cold driver到当前repair factory代表990267.0133ms；runtime2/2、0skip。原coding一次fake SDK、build故障synthetic；第二repair申请拒绝、coldCapture0，无browser/v2promotion。全部旧历史prefix保持；复用已审C7完整promotion证据，不提升为实际游戏验收。

原始TAP、唯一合成seed路径、环境EPERM及修复说明见计划。COS60 integrationStatus由Root按独审结论单字段规范回source-integrated；实际C7失败/费用/双SHA保持，源码不新增状态特例。最终exact SHA已获专属reviewer规格→质量批准并由sole merger集成。

主线集成 typecheck/build退出0；C8两组费用派生与当前task/候选plan恢复及漂移拒绝代表2/2、0skip，TAP5194.7154ms，原始输出 `C:/Users/26557/AppData/Local/Temp/cos76-merge-integration.tap`。已审重型与compiled证据复用，source/tests与批准SHA字节一致；实际C8/paid/human NONE。
