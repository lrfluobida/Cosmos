# COS143 实施计划

状态：`source-integrated / source-scoped-complete`；最终 `830256110dcd441c5ff1baa86cb441630e2873fa` 已经validation_phase_design独立APPROVED_SOURCE_SCOPED、无P1/P2与Root批准，发布 `20fa9dae13471580c5f69d4cd8293172cbd8b233`。[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/144#issuecomment-6479877216)及父[x]已GET核证；main typecheck/build0、最短TEMP代表4/4、0skip，既有证据按源码一致性复用。随后独立用户预算决定已由Root单次[应用phase40](https://github.com/lrfluobida/Cosmos/issues/144#issuecomment-6484789381)，reuse9已正常预留并[永久结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6485574791)。下列步骤保留为原批准计划；SOURCE实施批次未操作真实阶段，当前metadata批次也不重做apply或资金动作。

任务：[COS143 / #144](https://github.com/lrfluobida/Cosmos/issues/144)，id6086446699，原生父COS18/#19已勾；依赖[COS109 / #110](https://github.com/lrfluobida/Cosmos/issues/110)及[COS142 / #143](https://github.com/lrfluobida/Cosmos/issues/143)。作者validation_phase_implementer，独审validation_phase_design，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `359b036ea0527b66dcb233aa85098fe9c9db47dd5c8fba0686271a8fb9aa8abf`；plan `8dbe8d2e33fe6f572c7594515250552fd52b7fb9c2ae261075a0bbd2e19b7560`。

1. validation_phase_implementer在已附clean cos-05-cli worktree从85782fab建codex/public-validation-phase-extension；只源码和TEMP。
2. 先读现funding/sharedSources/group-supplement及validator，固定小型TEMP合法历史；保留default30 RED/跨30扩展正例及旧case隔离用例。
3. 实现单个可选extension、read-only prepare、幂等apply和来源校验；现业务硬限不受模型输入控制。严禁对真实sharedRoot调用apply或写snapshot。
4. 接通三个累计检查和新funding phase来源；旧fixed声明/dispatch30保持，真实stale-running状态只读理解不修史。
5. 固定可审SOURCE SHA后由Root唤醒独立validation_phase_design reviewer，实际diff先规格后质量；测试/证据绑定确切版本，修finding后只复审受影响delta。
6. 唯一planning_budget_merger登记任务，合并最终批准源码并做有限集成/进度发布。源码默认30，不能自动启动新预算阶段。
7. 支持代码完成后，Root可只读prepare真实当前quote，向预算授权人展示30→40、总150/每次5与30min及当前账本。只有获得该quote对应的明确预算决定，才另行发布决定来源、apply、独立审计，并授权新的具体运行。本卡不执行这些付费前操作。
