# COS139 实施计划

状态：`source-integrated / source-scoped-complete`；最终 `92f6da18f423562b5fda229d30f60a0266b65d54` 已独审APPROVED_SOURCE_SCOPED、无P1/P2，经Root批准合入发布 `457c90c8e212ff2a4fe0c64584104d6eb1aa34fa`。[完成关闭](https://github.com/lrfluobida/Cosmos/issues/140#issuecomment-6472336109)及父[x]已GET核证；main typecheck/build0、新增4/4、0skip，完整35/35、strict及native证据按源码一致性复用。下列实施步骤保留为原批准计划。

任务：[COS139 / #140](https://github.com/lrfluobida/Cosmos/issues/140)，id6081020291，原生父COS18/#19已勾，依赖[COS138 / #139](https://github.com/lrfluobida/Cosmos/issues/139)。作者planning_context_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `1b34f947b785bf143d41ff5748fbea731674aeef4654dabfce78b38aeffc6a6e`；plan `0143f55b3754360b9809326f35f8ea8e8e981ce2ef92c5481dadf6a1fac41cd3`。

1. 专属planning_context_implementer复用已附managed cos-02-contracts worktree；确认clean后从当前已发布主线建codex/planning-context-index，保留ignored证据。
2. 先用原reuse5轨迹/纯guard建立准确RED；正式实现之前核对UTF-8并说明改动文件。
3. 在可信普通新host核验完整来源及roleInput requirement，factory仅对获准planning显示索引。保留默认/排除路径全文、所有原合同及8192。
4. 跑来源拒绝和显示不变短回归，形成可审固定SHA并通知Root；专属辅助可在私有probe并行做完整native回放，文件所有权分开。
5. Root明确followup独立planning_context_reviewer并确认active；reviewer先规格后质量，实际读diff，最后复核当前native证据。只重测受修订影响的部分。
6. 唯一planning_budget_merger登记GitHub任务/依赖，收到最终源码批准后做最短集成、source范围发布、更新PROGRESS和映射。GitHub登记延迟不阻塞已批隔离SOURCE。
7. 仅在源码及集成完成、预算/原确认与新身份readiness通过后再安排新的有界真实验证。全部历史运行永久关闭，真实共享账本只由Root原API操作。
