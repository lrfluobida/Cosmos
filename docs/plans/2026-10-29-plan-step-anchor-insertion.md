# COS151 实施计划

状态：SOURCE范围完成。plan_step_insertion_reviewer已对 `7ebc6032164875b2389d24973ac755115b237249` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `3da616849839b7f7756d0ab248a58ed5110f1239`；[批准](https://github.com/lrfluobida/Cosmos/issues/152#issuecomment-6497712350)、[关闭](https://github.com/lrfluobida/Cosmos/issues/152#issuecomment-6497713266)及父[x]已GET。Root直接批准最小实施及wire事实修正，无额外plan审批。main typecheck/build0、有限3/3、0skip；作者writer14/native1/旧host3/strict、独审anchor5/native1及R17 TEMP证据复用。

任务：[COS151 / #152](https://github.com/lrfluobida/Cosmos/issues/152)，id6099354043；原生父COS18/#19已勾（仅SOURCE，父仍open/partial），依赖[COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148)。runtime基线 `5619429c8882bd381140211f701740474e44a1f6`。

[R18结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6497722597)：真实使用3次锚点插入，初稿self-check、有效handoff与host/capture通过。评审正常stop完整JSON的顶层5项inputVersions正确，但concern basis/reference不一致导致strict拒绝；9findings/3unresolved未形成有效verdict。唯一纠正实际发送并返回toolUse，重读已完整计划/设计后，第6个review请求206674B/floor4096报价446116µ>余443739µ，差2377µ，发送前正确拒绝；不是首次纠正未发送或length。7次null/null读均完整，末两读与此前文本相同。无revision/game，不把结构通过扩大为完整生成成功。

R18 planning2/42682µ、author40/564713µ、review5/116548µ，共47笔723943µ、释放4276057µ。12:34:04.716Z→12:43:35.596Z的570880ms仅清理；12:48:08.205Z永久stop、12:48:13.184Z一次settle。独立PASS_CLOSED：child203 SHA `e79beffc23894b778c6fa2c68938022bc615c6c35beb4504a4e4981289ca90c3`；shared3401 SHA `92a83737e8c8e4cb2c6c481716f4677d898375aaf54c89a972c5a6b92a351506`，C32165993µ/H0。phase40/ref、room12v2、5M/30min保持；证据 `.cosmos/public-validation/room-20261029-reuse-18/{generation-closure.json,generation-execution.json}`，只读诊断 `.cosmos/planning/review-floor-reuse18/diagnosis.md`。旧run永久closed，无新paid准备。

Root批准输入SHA256：spec `8daab994d8a2053b9c0f4dbf85bc96b098d61dd79bc23c69cdc9ce3689ad21cd`；plan `e80d54de332af5d4aa5a46fd101596ff7ce656a71418146d3513e1986b1b3c58`。

1. 独立implementer在clean managed worktree创建codex/plan-step-anchor-insertion，读取已核spec/当前工具并先做行为RED。Root已批准实施，无额外计划审批。
2. 最小append可选anchor逻辑、严格拒绝不写、原可选null规范化与顺序语义；不改冻结规则和其他行为。
3. unit/host/native最短证据，原R17 prefix例仅明确synthetic TEMP。source完整固定SHA立即交独审，报告可后补。
4. 唯一planning_budget_merger登记并在批准后merge/有限主线检查/push，先发布source停写以供真实验证。
5. 原需求/phase40/5M30min保持；旧1–18永久closed不重开/重结。下一actual必须新source和必要证据就绪，不盲重跑旧矩阵或重复问确认。
