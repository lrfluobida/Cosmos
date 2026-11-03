# COS171 · 记录当前交付的具体试玩意见

[COS171 / #172](https://github.com/lrfluobida/Cosmos/issues/172) 已登记。最终源码经独审及 Root 批准，待离线集成。玩家可在 `experience` 输入 `changes`，选择当前交付已确认的一项主观体验要求，或输入 0 表示整体体验。输入一条有长度限制、非空的单行实际表现后，先显示将记录的意见，只有再明确输入 `reject` 才保存。

意见按原始 criterionId 或整体体验绑定到同一报告和候选，之后可在 status、resume 和 experience 中读回。取消、EOF、中断、非法输入及版本漂移都不能产生决定。原有 approve/reject 和无附注历史回执继续按原契约处理，精确重试幂等，不同意见不能覆盖已经保存的决定。反馈作为原文数据展示，不触发自动修复。

用 TEMP 目录和模拟 stdin 检验提交、取消、冲突、篡改与状态回读。测试使用合成决定，实际用户体验另行确认。 原生父任务为 COS18/#19，直接依赖 [COS-34 / #35](https://github.com/lrfluobida/Cosmos/issues/35)、[COS-111 / #112](https://github.com/lrfluobida/Cosmos/issues/112)。实现者 `playtest_observation_implementer`，独审 `playtest_observation_reviewer`，唯一 merger `planning_budget_merger` 集成到 `codex/gameplay-offline`。

批准规格原稿 SHA256 为 `ef68c2fe7e6dbba94810fcfdb4b94a556b1da25edba81d8a99b156ff5d9c5a8e`。

基线 codex/gameplay-offline @ 4a544076947468661b38efc7f254144cd145c5bd。现有 experience 能显示已确认的主观体验要求，玩家只能通过或拒绝。目标是让玩家说明哪项体验出现何种具体表现，并让开发者在 status、恢复结果和下次查看体验时读到同一版本的反馈。

在现有 experience stdin 中支持可选 changes 流程。选择当前版本体验清单的一个编号，也可选 0 表示整体体验。填写有界、非空的单行实际表现，显示将记录的反馈后，必须再明确输入 reject 才写入。编号对应原确认来源，记录相应 criterionId 或整体；取消、EOF、中断、非法输入及版本漂移不得产生新决定。保留现有 approve/reject 行为，不从模型文本、报告或试玩描述推断通过。反馈作为原文数据，不进入自动派发。

沿用原报告、候选、范围、身份与不可变单次决定的验证及既有双锁。普通历史回执、无附注决定兼容；有附注的拒绝按严格形状和原绑定验证，新的不同附注不能覆盖，精确重试幂等。新增展示和恢复信息不改自动报告或运行快照。离线使用临时目录与模拟 stdin 验证完整提交、取消、冲突、篡改和状态回读；不在真实用户运行上记录模拟决定。
