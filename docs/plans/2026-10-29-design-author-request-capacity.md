# COS142 实施计划

状态：`source-integrated / source-scoped-complete`；最终 `456df3960a22a9edf162c15231d463e742d76cc5` 已独审APPROVED_SOURCE_SCOPED、无finding，经Root批准合入发布 `f7ef059cac5022c0834dc6e0a0d14eb32dbf0fa6`。[完成关闭](https://github.com/lrfluobida/Cosmos/issues/143#issuecomment-6478303414)及父[x]已GET核证；main typecheck/build0、代表5/5、0skip，核心10/10、funded2/2、角色2/2、strict及native按字节一致性复用。下列步骤保留为原批准计划；无新付费运行，phase guard不变。

任务：[COS142 / #143](https://github.com/lrfluobida/Cosmos/issues/143)，id6085456542，原生父COS18/#19已勾，依赖[COS141 / #142](https://github.com/lrfluobida/Cosmos/issues/142)。作者planning_context_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `5d64cd3c40ed8222513bf7198f9bee3e6d80c015dd3c1618edae0dc725a90e08`；plan `8ca61d1afab78b121435324afcc9fbc89f1b72a9a6bd44508311ebe058bf885e`。

1. 专属planning_context_implementer复用clean managedcos02，从最新已发布主线（source af50b075）建codex/design-author-request-64，保留ignored证据。
2. 核对真实request_limit及当前结构RED，检测UTF8/先声明目标文件，建立新限制/来源兼容RED。
3. 只改可信64选择与32|64来源约束/实际max记录；保证原counter/summaries/预算/时钟/原收尾槽不变。
4. 固定最小SOURCE SHA，Root明确followup独立planning_context_reviewer并确认active。native辅助可在私有文件并行，禁止同文件同时编辑。
5. 完成真实计数/原轨迹及必要source/cap负例，准确区分旧记录、TEMP合成与真实模型结果；如新摘要造成容量差异立即报告。
6. reviewer先规格后质量，修复finding后仅复审受影响delta；唯一planning_budget_merger登记/集成/发布并记录PROGRESS。
7. 所有旧run永久闭账。源代码通过不自动授权越过30阶段guard；不准备或启动下一付费run，直到阶段范围及资金readiness解决。
