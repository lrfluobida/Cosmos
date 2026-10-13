# COS-78 准备输出额度修复后的固定迁移 C9

状态：SOURCE_NOT_READY / PLAN_PENDING / open。稳定任务ID：COS-78。Issue [#79](https://github.com/lrfluobida/Cosmos/issues/79)，id5834810242；原生父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。

专属 implementer `cos76_implementer` acting COS78；独立 reviewer `cos77_implementer`；唯一 merger `batch75_76_merger`。计划：[2026-10-14-cos78-transfer-case9.md](../plans/2026-10-14-cos78-transfer-case9.md)。基线为已推main `352c129f121646f3b359a48d7f6cf6371db25e26`。

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
