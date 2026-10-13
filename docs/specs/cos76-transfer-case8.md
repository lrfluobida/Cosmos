# COS76 · 准备第八迁移案例固定入口

状态：SOURCE_NOT_READY / PLAN_PENDING / open。稳定任务 ID：COS-76。

Issue：[#77](https://github.com/lrfluobida/Cosmos/issues/77)，id5832425117；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。专属 implementer `cos76_implementer`；独立 reviewer 与唯一 merger 由 Root 分配。实施计划：[2026-10-13-cos76-transfer-case8.md](../plans/2026-10-13-cos76-transfer-case8.md)。

## 目标与范围

增加固定 `cos20-transfer-validation-8` 准入、coding-only运行和冷恢复，区别于历史原生 Case8。通过少量可信内部 factory 参数复用已审 C7链，保持 C6/C7默认行为；不增加任意 case/root/clock/budget CLI。

Root实际历史为15stopped / 7原COS16 delegations / 75closed grants / 13closure audits / revision2023 / unknown和reserved0 / shared settled8932365µ。C7已因insufficient_evidence结束；18次coding author请求结算58415µ，无game或repair，旧身份不得重开。原失败、费用、回执和所有旧窗口保持。

新案例有独立ID/root/marker/reuse manifest/admission quote/operator receipts。原COS16 ¥10固定各role容量减去C1–7真实settled费用推导新grants；当前coding1720718µ、总8076258µ仅为历史费用下的事实，准入重新计算，不借角色或其他组预算。原shared¥150/prior721771µ与正式¥200/12h、优化¥100/6h保持。

单案¥5/45min/80requests/一次合格coding repair；原output caps、coding request600000ms及deadline减5000ms裁剪、maxRetries0保持。零planner/design/artSDK；仅复用C5原design/art两个passed阶段和七capture。C8当前任务、输入、候选计划和执行回执重新绑定。

## 准入与源码前置

要求当前clean pushed exact main、实际source/compiled执行闭包、原实际历史manifest与费用prefix、15/7/75/13及全部owner idle。unknown/reserved、未closure、错source/grant/deps/manifest或非祖先审批均在任何发布/claim/SDK前拒绝。

复用COS56/57/59既有守卫，并增加COS60 `TRANSFER_CASE_SEVEN_SOURCE_READY`、COS74 `FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY` 和COS75 `VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY` 的独审状态及reviewed/merge祖先校验。COS75 exact SHA待Root提供；未批准/未合入不得实际运行。

## 免费验收与交付

1. 两组不同实际settled费用正确派生各role容量；old quote失效；未知/未closure/错历史source/grant/deps拒绝且bytes/mtime/filelist不变、SDK0。
2. 合法SOURCE/TEMP一次claim保持历史prefix；真实current task/factory与固定driver组合，coding/冷恢复/一次repair代表；C5通过阶段不新派发。
3. source与compiled源码漂移拒绝；旧C6/C7短回归通过。复用旧重型证据，不重跑旧26分钟fixture或无delta矩阵。
4. 作者提交exact SHA/原证据/不足；独立reviewer先规格后质量审实际diff。sole merger集成已批准提交并接入共享任务文档/mapping。

本卡仅source/free-fixture工作；实际C8、付费、human NONE。完整经典100%/95%、PERFORMANCE、真实完整12h、用户体验与COS16/COS18 partial/open状态不提升。作者不接触真实ledger/keys/sessions/游戏/参考安装。
