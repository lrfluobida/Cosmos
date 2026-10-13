# COS-78 准备输出额度修复后的固定迁移 C9

状态：TRANSFER_CASE_NINE_SOURCE_READY / PLAN_APPROVED / scoped complete / closed。稳定任务ID：COS-78。Issue [#79](https://github.com/lrfluobida/Cosmos/issues/79)，id5834810242；原生父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。

专属 implementer `cos76_implementer` acting COS78；独立 reviewer `cos77_implementer`；唯一 merger `batch75_76_merger`。计划：[2026-10-14-cos78-transfer-case9.md](../plans/2026-10-14-cos78-transfer-case9.md)。基线为已推main `352c129f121646f3b359a48d7f6cf6371db25e26`。

计划 exact `6bff761e3bcbc093497ddafeef174582e8439647` 已独立 PLAN_APPROVED，无finding；实施前合入docs-only main9698a54，生产基线不变。源码 exact `870fa22a447178e04f2ee345e111328362cb385a` 经 `cos77_implementer` 实际17paths规格→质量独审 APPROVED、无findings，由唯一 `batch75_76_merger` 合入 `06045cafa532d7edcd5399ceb6381acc9af69a3f`。[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/79#issuecomment-6152204919)、closed(completed)及父勾选已由Root精确读回，本卡source/free-fixture scoped complete。此入口准备不意味着后续完整请求轨迹可承担；实际C9仍待COS79压缩修复与免费实验及Root准入，新的上下文/compaction策略不属于本卡。

## 目标与固定契约

新增固定 `cos20-transfer-validation-9`，通过少量可信内部参数复用C8/C7 factories。独立ID/root/marker/reuse manifest/admission quote/operator receipts；当前task/input/候选plan/执行receipt重新绑定，旧窗口不得重开。C6–8默认保持，无case/root/clock/budget任意CLI。

C1–8实际settled与闭合原grants决定C9剩余容量；必须保持原COS16 ¥10各role分配，不转角色或借其它组预算。当前真实C8的14笔coding author费用487528µ、原coding grant1720718µ、余1233190µ是Root事实，不作生产硬编码。C8无repair且已停止；准入要求16stopped/8delegations/80closed/14audits、unknown与reserved0及全部owner idle。共享9419893µ/revision2086为当前事实，原失败、费用、回执与窗口保持。

原shared¥150/phase¥30、单案¥5/45min/80requests/一次合格coding repair、原输出声明上限、coding600000ms及deadline减5000ms裁剪保持。零planner/design/art SDK，C5已审design/art两个passed阶段与七capture只读复用。COS77只按当前真实请求与角色余额收紧cap，不加额度、重试、压缩或新窗口。

## 准入与源码前置

保留原COS56/57/59/60/74/75准确marker与reviewed/merge祖先门禁，新增COS76 `TRANSFER_CASE_EIGHT_SOURCE_READY`、COS77 `VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY`。COS77 approved `9d0efc6b362193d81c7fd5c96829a85e399eb5a3` / merge `b22120bc5d1012da2ac9df5fc06491b10f6a03e7`；每次重核当前clean pushed exactmain、实际source/compiled执行闭包、manifest/费用prefix和当前任务绑定。

## 免费验收与证据复用

1. 两组C8 settled费用正确派生；未知/未closure/错历史source、grant、角色或manifest/旧quote/未审或非祖先77/owner占用零写入拒绝。
2. 基于已保存SOURCE/TEMP before15备份，以真实controller/closure API只追加14个合成C8 author成本和closure14，不将原免费C8repair证明冒充真实历史。保留旧prefix/C5文件与原proof，finally恢复原snapshot；不重建20分钟旧seed。
3. C9合法claim、当前task/plan/receipt/冷读及真实factory接入COS77的合成请求代表；compiled入口、JS worker、新源码闭包与字节漂移拒绝。复用原repair/v2promotion与COS77完整策略矩阵，不重17分钟长链。
4. 作者提交exact SHA/测试原证据/不足，reviewer先规格后质量审实际diff；只有sole merger集成main并更新共享tracking。

本卡仅source/free fixture；不读写真实ledger、keys、sessions或参考安装，不付费或启动实际C9。COS16/COS18 partial/open、完整classic、PERFORMANCE、实际完整12h与human未通过状态不提升。

## 作者验证结果（已独审复用）

新增5项API缺失RED已转GREEN，连C8受影响短回归11/11；compiled C9/JSworker/字节漂移代表1/1；affected tsc、typecheck/build退出0。唯一复用seed的准入/费用/current task+factory+Pi/同窗口冷读代表1/1、291100.9278ms，完整原证据在计划。合成405672-byte请求cap52730/预留1233184一致、fake provider1/network0。

临时账务视图只追加合成C8成本与closure14，原snapshot逐字节恢复revision390，原proof固定文件字节/mtime保持，新结果单独归档；未重建旧20分钟seed或17分钟修复链。独审核对两组费用487528µ/600000µ均16/8/80/14，合成C9结果17/9/80/14且旧prefix一致，唯一fake请求input405672bytes/cap52730，owner均关闭。只证明固定C9来源、绑定与已审策略接线，完整后续轨迹是否可承担另由Root判断，不新增compaction。`TRANSFER_CASE_NINE_SOURCE_READY` 已获exact源码独审批准并集成。

主线typecheck/build退出0；两组费用派生、固定parser/quote和当前费用前缀代表2/2、0skip，TAP4464.7717ms，原始输出 `C:/Users/26557/AppData/Local/Temp/cos78-merge-integration.tap`。merger已读四份作者原始TAP并复用runtime/compiled证据；source/tests/plan/README与批准提交字节一致。实际C9/paid/window/human/game NONE，真实账务及C8/closure14事实保持。
