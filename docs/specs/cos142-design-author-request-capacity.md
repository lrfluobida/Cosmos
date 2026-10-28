# COS142：普通设计作者的有界修复调用

状态：Root已批准固定短规格/计划与免费SOURCE实施；独立planning_context_reviewer已批准64次最小方向，SOURCE待实际diff独审。

任务：[COS142 / #143](https://github.com/lrfluobida/Cosmos/issues/143)，id6085456542，原生父COS18/#19未勾，依赖[COS141 / #142](https://github.com/lrfluobida/Cosmos/issues/142)。作者planning_context_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `5d64cd3c40ed8222513bf7198f9bee3e6d80c015dd3c1618edae0dc725a90e08`；plan `8ca61d1afab78b121435324afcc9fbc89f1b72a9a6bd44508311ebe058bf885e`。

源码基线：af50b0754e2248074b3bc2414ed31ee6824887d4；依赖COS141/#142。

## 实际失败

reuse8已永久PASS_CLOSED。planning2笔27561µ；design-author共29次普通响应和3次native摘要，32笔465703µ；review0。第33次尝试在countRequest处拒绝，无新增计费。原design grant1125000尚余659297；扣375000独审保留后作者可用284297。当前B77862的8192报价221260可付，尚有约1598秒，所以限制来自次数。

但文件仍不合格：design.json结构通过，acceptance-plan主stage生产validator报31个输入动作带禁止field acceptanceId；值都是已知合法ID，错误是字段不属于该action。reopen另12个同类字段为静态观察，原外层在主stage先失败。最新该字段反馈只出现一次，之后两次read定位即用尽请求；不能称模型反复忽略这条具体错误。原提示和schema一致。诊断见 `.cosmos/planning/design-review-output-capacity/reuse8-diagnosis.json`。

## 目标与边界

1. 仅可信ordinary design作者使用64次原会话上限，沿既有新ordinary门槛（三/五槽）。默认、显式32 caller、validation/preparation/human/binding/inherited及其他角色保持原选择；核对host后置spread不能把64覆盖回32。
2. 64包括普通请求、native summaries与合法只读收尾，不是64次普通请求另加摘要。继续同一计数器，不重置、退款、跳过计数；第65次拒绝。请求上限错误不新增收尾机会。
3. 原任务grant、独审保留、输出选择、模型/thinking、工具权限、取消、deadline/5秒清理、一次共享format/budget纠正槽保持。只有原已支持预算拒绝且还有一个原请求槽时，才允许原4K收尾。
4. budget-followup/1 配置及来源类型明确支持32或64；不能放宽为任意正数。未发送来源必须写会话实际maxRequests，不能继续硬写32。reader核 requests < reason.maxRequests，以及原native错误/摘要/零usage/身份与字节绑定。
5. 旧32来源逐字节保留且仍按32校验，新64来源记录64；修改maxRequests、越界requests、native不一致或未知限制值均拒绝。requireBudgetFinalizationSource只验证历史，不恢复会话权限。
6. 不新增持久policy版本或execution字段。沿既有宿主运行参数约定，尚未启动的ordinary作者可使用当前64；已有持久作者响应复用，已开始但无响应仍禁止重复生成，所有已失败/停止/过期/闭账运行不得借此补次数。
7. 严格保留input action字段schema、完整需求和host验证。当前结构RED不能靠额外交接变完成；需要模型在新授权执行中实际修改并通过验证。此卡不自动删字段、不放宽acceptanceId、不新增JSON编辑或结构修复框架。
8. 此卡不改共享150上限、当前30阶段guard或单次5/30min。当前25.384044已结意味着不能完整预留下一5；新付费启动另待阶段范围及readiness处理，源码工作免费继续。

## 必要免费验证

- 当前旧32的原生失败作为RED依据；新TEMP真实factory/Pi/fake transport证明普通与摘要共用实际计数，不能直接把变量设32。尽量重放原29 ordinary+3 summaries；提高上限可能改变“剩余少于3槽不摘要”的分支，任何新增摘要必须实际记录、计数、结费并声明合成来源，不能强行隐藏。
- 原预算和时限允许时，新64不再因旧32阈值拒绝普通作者请求。若新增摘要引出更早预算阻塞须如实报告，不能用“摘要派发了”替代修复请求的可用性。
- 新TEMP根/身份/自有时钟允许明确映射，所有旧run/时钟保持只读；原固定需求、原响应/读写轨迹及费用保持的范围须准确记录。未保存的第33真实响应不存在，后续响应必须明确为synthetic。
- 32/64预算收尾来源分别通过，actual max与native/回执匹配；临近最后一槽、达到原上限、非法/篡改来源及第65次拒绝。旧预算/取消/时钟守卫证据按不变范围复用。
- 不修改的原错误计划仍被原validator拒绝。若演示synthetic结构修复，仅作为SOURCE，不能说真实目标游戏已经修好。
- 更新实际受影响的32硬编码fixture及其说明/容量假设；不重跑所有旧矩阵。source typecheck/build、必要短代表、独立实际diff复审；唯一merger集成。

## 预期源码

entrypoint-host的可信作者选择，factory及pi的budget-followup配置允许值，pi的来源类型/校验/actual max记录，以及定向测试。复用现counter/budget算法，不重构其他协议或改旧回执。反馈措辞优化不在本卡必要范围，保留原诊断以便固定轨迹对照。
