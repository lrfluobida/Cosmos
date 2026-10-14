# COS-82 准备 ¥3 上限的固定迁移 C10

状态：TRANSFER_CASE_TEN_SOURCE_READY / PLAN_APPROVED / source scoped complete / closed。Issue [#83](https://github.com/lrfluobida/Cosmos/issues/83)，id5846224228；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。

专属 implementer `cos76_implementer` acting COS82；独立 reviewer `cos77_implementer`；唯一 merger `batch75_76_merger`。计划：[2026-10-14-cos82-transfer-case10.md](../plans/2026-10-14-cos82-transfer-case10.md)。基线 main `007cd1042d73abeed2d8d1384aee2400a6f3dc8a`。

最终16个文件已通过独立规格与质量审查，没有剩余finding；唯一merger已集成。[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/83#issuecomment-6167055060)、closed及父勾选已由Root核实。

| 记录 | 提交 |
| --- | --- |
| 批准版本 | `66c09807bc83651c2c62bd5ac891c9c336c7f085` |
| 合并提交 | `82c50dd183bd5af6b0cfcc9b851f668e7a09c5c9` |

## 实际C10结果

C10在冻结版本 `a464b0f` 上运行约44分56秒，被`deadline - 5000ms`清理定时器取消。40次请求均已准入和结算，新增 **¥1.086265**，共享累计 **¥11.466320**。第一次作者自检报TS2352，作者自主修改后第二次两项退出码均为0；这仍不是正式候选验收通过。

作者留下6个文件、30,046字节，与成功自检的`check-Z1sPsZ`临时副本原始源码逐字节一致。journal仅origin，候选目录为空；没有host-result、handoff、capture或正式build/browser/review/repair/accepted，体验未确认。取消后的`Historical source changed`文字并不证明来源文件改变。

[实际结果](https://github.com/lrfluobida/Cosmos/issues/83#issuecomment-6168010789)已由Root精确读回。closure16释放 **¥1.913735**，18个案例全部停止，未知费用和预留为零；原窗口不重开，费用与历史保持。完整时间、工具统计和日志解释见[研究记录](../research/2026-10-14-transfer-c10-deadline-stop.md)。Root已解除main冻结；下文SOURCE/TEMP和未准入状态为源码准备时历史，本卡源码完成不等于C10游戏通过。

## 授权与契约

用户在明确原 ¥150 内最多 ¥3/45min 的下一轮提案后授权继续。实现者只准备 source/free fixture，真实免费准入和 paid 仍由 Root 操作。

1. 固定新 ID `cos20-transfer-validation-10`，独立 root/manifest/quote/operator receipts。保留 C1–C9、17stopped/9delegations/85closed/15audits；验证 C9原声明、31笔已settled coding author费用及来源、closure15、无repair和unknown/reserved。旧费用不能硬编码或重算写回。
2. 新 grants 为 planning1/design1/art1/coding2400000/repair599997µ，合计3m，incremental hard3m/45min/80requests/一次合格repair；这是新授权向量，不是原角色剩额。原shared150m/phase30m/COS16 parent10m及请求/输出策略不变，不改旧allocation或schema。
3. 以原组 availableAllocation核准；新C10恢复按本案quote的COS16 prior allocated加五grants总额验证。旧C6–9默认10m条件保持，不引入通用重分配、预算CLI或模型参数。
4. C5 design/art通过阶段及七capture复用，零planner/design/art SDK；新作者目录为空，C9失败文件不预置。当前输入/task/候选plan/provenance/source+compiled闭包、owner idle与双SHA祖先门禁完整保留，并要求已审COS78/79/80/81。
5. 免费短RED/GREEN覆盖新quote/余额不足/unknown/旧prefix漂移、真实host+fake Pi/partial冷恢复及compiled闭包；复用未改旧修复/晋升证据，不重长矩阵、不读取真实ledger/session/key、不手改游戏或开新实际窗口。

## 完成条件

独立exact规格与质量审查已完成，标记为 `TRANSFER_CASE_TEN_SOURCE_READY`。Root随后已完成实际准入与C10运行，结果见前节；本卡source完成不代表游戏或human通过。共享tracking由sole merger整合。

## 免费实现证据

计划 `371ef1d9e641c331cfca1812ec9ab94a815d422c` 已独审批准。新6项有效RED→新旧11/11 GREEN；SOURCE runtime1/1证明新固定向量、原17-case前缀、空作者、真实host/factory/Pi与partial同窗口冷恢复；compiled1/1核新JS闭包、worker路径及变更字节拒绝。typecheck/build/affected strict均退出0；原始TAP、首次strict类型问题及归档/恢复证据见计划。

C10实际repair/build/browser未跑。599997 repair额度与原524488门槛只作源契约核对，复用已审未变repair/v2证据；compiled worker仅验证路径选择，transport为synthetic，没有实际worker spawn/build。全部SOURCE seed恢复完成，无新paid或真实案例操作；最终版本现已独审批准并集成。

合并后typecheck/build通过，新的¥3向量、可分配容量边界和固定报价三项检查，加上原C9五项短回归，共8/8通过。原始输出：`C:/Users/26557/AppData/Local/Temp/cos82-merge-integration.tap`。merger已读四份作者TAP及类型/构建日志，复用重型runtime和compiled证据；strict为作者当次工具退出0，无独立日志。上述为源码准备时检查；实际运行和closure16结束后，Root已明确解冻，本次仅补录公开状态与结果。
