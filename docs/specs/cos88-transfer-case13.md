# COS-88 原预算组余量内的固定迁移 C13

状态：pending plan-review / SOURCE_NOT_READY；目标 `TRANSFER_CASE_THIRTEEN_SOURCE_READY`。Issue [#89](https://github.com/lrfluobida/Cosmos/issues/89)，id5852981194，已由 Root 精确读回并原生挂父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)；依赖 COS86 #87、COS87 #88。

作者 `cos88_implementer`，独立 reviewer 由 Root 指定，唯一 merger `batch_c12_reference_merger`。分支 `codex/cos88-transfer-case13`，起点 main `49e892992749e5511f2bb4135ec67be4459fa30b`；[实施计划](../plans/2026-10-15-cos88-transfer-case13.md)。本次只提交计划与任务卡，尚无实现或实际 C13 结果。

## 前提与目标

C12 已按原截止结束，failed / coding cancelled，末次自检失败，无正式交接或候选。52 笔请求全部 admitted/settled，费用 1664926µ；closure18 已释放 1335074µ，历史为 20 stopped / 12 delegations / 100 closed grants / 18 closure audits，unknown/reserved 为 0。原组可分配 2540822µ，C12 身份已消费；详见 [C12 结果](cos86-transfer-case12.md)。

COS87 已对四个独立只读 Git 查询完成并行实现，Root 提供 approved `ac91cff85ddbdd08720623fd600161f2e61bd6b6`，起点已含 merge `49e892992749e5511f2bb4135ec67be4459fa30b`；当前 mapping 最终 marker/祖先记录尚未发布。C13 准备可先行，实际准入必须等 COS86/COS87 最终 source-ready、精确 reviewed/merge 祖先及固定来源全部通过。短基准不能证明实际生成提速或游戏完成。

## 固定范围与完成条件

1. 新案例固定 `cos20-transfer-validation-13`，保留所有旧声明、费用和审计来源。核对原 C12 52 笔 coding author 请求及 closure18；不重开、延长或转移 C12。
2. 新额度 2500000µ / 45min / 80 requests / 一次合格 repair；planning/design/art 各 1µ、coding 1900000µ、repair 599997µ。group 10000000µ / phase 30000000µ / shared 150000000µ 保持，真实准入重算 availableAllocation 与 quote，partial 原公式保持。
3. 独立固定声明函数只服务 C13；旧 `deriveFixedThreeYuanTransferSuccessor` 仍仅支持 ten/eleven/twelve，三个历史 3000000µ 声明不变。只追加六个 wrapper、必要固定类型/闭包入口及测试，不提供 CLI/模型预算或 case 配置。
4. C5 两 passed 阶段、七 capture 只读复用，零 planner/design/art SDK；新作者为空，禁止预置 C12 任何版本源码。新 root、任务、计划、候选、manifest、quote、operator receipt 绑定 C13，原 owner、请求/工具/时限守卫保持。
5. 追加 COS86 `TRANSFER_CASE_TWELVE_SOURCE_READY` / COS87 `PARALLEL_GIT_IDENTITY_SOURCE_READY` 与 reviewed/merge 双祖先检查；只计划批准、未集成或非祖先均拒绝准入。
6. 先独审短计划，随后 RED→GREEN 验证 52 笔历史/closure18、固定额度/available/stale quote、source capture、原 host/factory/Pi、空作者和同窗口 partial 恢复、compiled 闭包、旧 C12 短回归。实际 diff 经独立规格→质量审查，唯一 merger 集成推送后才可标 SOURCE_READY。

## 证据复用与边界

既有 SOURCE-C12 存档的 history-1/2 为 19/11/95/17，result 只有 1 笔 mock C12，不能充当真实 52 笔历史。测试从 history-1 用原 API 新增 52 笔合成记录和 closure18，保存两组费用视图；finally 恢复原 snapshot/mapping 字节、mtime、缺失目录和 owner 状态。原 C5 和 proof 保持，不重建长 seed，不读写真实台账、会话或凭据。

Root 负责最终真实免费预检、独立审查的一次性操作脚本和后续一次有界 C13。沿原 ¥150 及持续推进授权，本轮低于既有 ¥3/45min 边界，没有新的 C13 专属人工确认；任何付费前置不足即停止新增调用。作者本轮不执行新窗口或付费操作，不修改生成游戏、不访问参考安装。

实际结果另记费用、时间、自检、handoff/capture、正式 build/browser/review/repair/accepted。SOURCE、compiled synthetic transport 或短性能基准不当作实际游戏验收；COS16/COS18、完整经典及 human 保持未完成。
