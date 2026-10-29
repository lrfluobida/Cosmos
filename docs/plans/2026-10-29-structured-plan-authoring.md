# COS147 实施计划

状态：structured_plan_reviewer已APPROVED_PLAN，Root已批准最终兼容边界的源码实施与登记；SOURCE待实际diff独审。新能力不把R12/R13包装成strict bug。[ADR0005](../adr/0005-structured-plan-authoring.md)决策已accepted，接受时SOURCE实施中，不表示代码已完成。

任务：[COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148)，id6093554669，原生父COS18/#19未勾；依赖[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)及[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)。作者structured_plan_implementer，独审structured_plan_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `efc2f9c3a691d12bfd93dbd6b0f628282f30bced3d23fecf4c52a7f6126788e0`；plan `fff207dfd24e48e7d77afe1a8db307dafc8ee7ffe88ddc3a705c60157d27d1b6`；ADR草稿 `f29071a915bf694deff79c62953aa63e65a0926284fd837c169582813a9dc834`。

1. 独立reviewer已批准：ordinaryPlanAuthoringPolicy: structured-plan/1同写既有planning-started/execution，缺execution维持原阻断，legacy无标记与选择消失不混同；不重复用户访谈或预算确认。
2. dedicated implementer在clean managed worktree新codex/structured-plan-authoring分支，先明确UTF8/目标文件，再建立真实writer+原稿机械错误相关RED。
3. 实现save/append、固定envelope和原guard/反馈；再接新任务的窄policy与工具/提示，保留旧任务、原raw工具和所有strict标准。
4. 固定SOURCE SHA，Root马上唤醒独立actualdiff审查；只修finding并复核delta。明确synthetic证据，不制作人工游戏或修改旧验证产物。
5. 唯一planning_budget_merger登记spec/plan/ADR并集成审过SHA，有限主线检查后先发布source。公共进度可在真实验证关闭后补，不阻塞已就绪运行。
6. 已闭R1–R13均不恢复/重结；新真实尝试只在源码与必要证据就绪后由Root以原预算/需求启动，当前没有准备下一paid run。
