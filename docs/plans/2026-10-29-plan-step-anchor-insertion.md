# COS151 实施计划

状态：Root按R17实证和接口可行性直接批准最小兼容扩展，不追加独立plan审批；SOURCE pending。作者plan_step_insertion_implementer已开始，独立源码reviewer plan_step_insertion_reviewer将在候选固定后审actualdiff，唯一merger planning_budget_merger。仅append可选afterStepId，不改原冻结规则/权限/预算/strict，不证明模型采纳或语义成功。

任务：[COS151 / #152](https://github.com/lrfluobida/Cosmos/issues/152)，id6099354043；原生父COS18/#19未勾，依赖[COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148)。runtime基线 `5619429c8882bd381140211f701740474e44a1f6`。

Root批准输入SHA256：spec `829cdf7801c9105a29ff5b11ffc4df5d708523a817971bdc1ef1e531da075857`；plan `fb02fbd6c6bf4b7b4bd3b586d678b2ea7d424f4a49433c631b90dbc774168e30`。

1. 独立implementer在clean managed worktree创建codex/plan-step-anchor-insertion，读取已核spec/当前工具并先做行为RED。Root已批准实施，无额外计划审批。
2. 最小append可选anchor逻辑、严格拒绝不写、原nullable规范化与顺序语义；不改冻结规则和其他行为。
3. unit/host/native最短证据，原R17 prefix例仅明确synthetic TEMP。source完整固定SHA立即交独审，报告可后补。
4. 唯一planning_budget_merger登记并在批准后merge/有限主线检查/push，先发布source停写以供真实验证。
5. 原需求/phase40/5M30min保持；旧1–17永久closed不重开/重结。下一actual必须新source和必要证据就绪，不盲重跑旧矩阵或重复问确认。
