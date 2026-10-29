# COS145 实施计划

状态：planning_context_reviewer已APPROVED_PLAN、无阻塞，Root已批准固定短规格/计划的实施与登记；仅免费SOURCE，源码待实际diff独审。只增强普通设计advisory诊断，strict/source检查仍唯一决定passed，phase40原决定与实际运行门禁保持。

任务：[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)，id6091618219，原生父COS18/#19未勾；依赖[COS114 / #115](https://github.com/lrfluobida/Cosmos/issues/115)及[COS118 / #119](https://github.com/lrfluobida/Cosmos/issues/119)。作者design_diagnostics_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `0f872ff3bee00e65f3c21d84935538fd2c84fd873b315274034da5963f785fca`；plan `621aa643382212c3b86d35b1bbf299d78392252002438f1c202bf17035e98633`。

1. 独立reviewer核对短规格是否保留strict/局部诊断边界与预算；不重新访谈用户，不重跑原需求确认。
2. dedicated implementer在独立managed worktree从已发布main创建codex/design-diagnostic-aggregation，读取项目规则、检查UTF8、声明文件，先建立遮蔽问题RED。
3. 实现只读局部聚合和有界反馈，补定向语义/截断/来源/部分修复测试。与原write/edit链路复用，不能手工改任何游戏或旧真实运行。
4. 冻结完整SOURCE SHA并报告实际测试命令，Root立即唤醒独审；TEMP原始稿反馈对照可并行完成，最终成功结论限反馈缺口修复。
5. 仅修复实际review finding，唯一planning_budget_merger合入批准SHA、有限集成、发布源码后先让出真实运行路径。进度/issue如有耗时在运行关闭后补。
6. 真实phase40、原room12v2与每次5M/30min保持；旧reuse1–10永久关闭。新运行仅在源码/回放/审查/资金readiness完成后由Root创建一次，不重复预算或需求确认。
