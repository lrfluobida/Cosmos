# COS141：普通设计审查的输出上限

状态：`source-integrated / source-scoped-complete`；最终 `e9950eb6c7cbbd0deb49423950ef4a0b238df50e` 经planning_context_reviewer独立APPROVED_SOURCE_SCOPED、无剩余finding及Root批准，已发布 `af50b0754e2248074b3bc2414ed31ee6824887d4`。[完成关闭](https://github.com/lrfluobida/Cosmos/issues/142#issuecomment-6475599514)、closed(completed)及父[x]已GET核证。

任务：[COS141 / #142](https://github.com/lrfluobida/Cosmos/issues/142)，id6083423627，原生父COS18/#19已勾，依赖[COS140 / #141](https://github.com/lrfluobida/Cosmos/issues/141)。作者planning_context_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `55c6c38054be404538f63434688804874a2da3f1693680554856a5314449a5a6`；plan `d5c95b9affcd5b431fe844ebfb6f4494aaee941f1346c350d0ebe0d7d07c502e`。

基线：e3043858efad2e4d0c1025fc47f5f8fd7a990ae9（runtime7cffc467）；依赖COS140/#141。

源码结果：5个批准文件精确、无冲突集成；main typecheck/build0，最短代表5/5、0skip、TAP5302.2947ms。完整10/10、恢复3/3、strict、三模式native和两项full-quote按源码/fixture指纹一致性复用；full-quote的GREEN只指第二请求前预算拒绝且无review/correction的正确断言。TEMP末轮128048B/16384/387168µ可由余额530014µ承担；synthetic output12288、费用118500µ形成changes_requested，该用量是假设而非tokenizer实测。旧未开始首次ordinary review可用当前host16K，valid/started/closed门禁保持。父COS18仍open/partial，35/35仅指源码子项。

[reuse-8实际结果](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6477727894)已永久PASS_CLOSED：作者第33次尝试因request_limit拒绝，当前计划仍有31项主stage结构错误；无作者完成/capture/review，COS141的16K路径未到达。当前累计25384044µ再加完整5000000µ窗口将超过30000000µ阶段guard，未准备新付费窗口；源码工作不调整该guard。

## 实际问题

reuse7已永久PASS_CLOSED。规划正常通过；设计capture与host验证后，独立review第4响应rawStopReason=length，output8191（reasoning统计6700包含在输出用量中），已结85724µ。Pi随后清空不完整content并停止；没有可解析review JSON、schema失败、纠正或第5请求。原部分文本未持久化，不得拼造或推断结论。

review入口原余额573285µ（grant1125000，作者已结551715）。四轮input29487/66635/88320/128050B，cap均8192，费用14884/17532/10855/85724。末轮前余额530014，原报价321636可负担；五个read按2+2+1完整完成，无重复或截断。因此失败是响应上限，不是输入预算不足。

同末轮输入，16384报价387172µ，可留142842µ；32768报价518244，仅留11770µ。选择16K是增加完整回复空间的工程取舍，不保证模型完成或结论正确。诊断见 `.cosmos/planning/planning-output-budget/reuse7-review-diagnosis.json`。

## 目标与范围

1. factory新增独立可信选项，例如ordinaryDesignReviewMaxOutputTokens?:16384；省略保持8192。配置须依赖已有ordinaryDesignReviewBudget选择器，在factory创建时验证并快照；未知值、null、无选择器等非法组合拒绝。
2. 仅选择器实际命中的design reviewer使用16K，并将同一上限同时传给Pi和authorBudgetOutputLimit。通用maxOutputTokens8192保持，planner及作者、art/coding reviewer、默认低层caller不受影响。
3. host在现ordinary且非validation/preparation/human/binding/inherited的可信门槛选择16384，包含合法模块化设计review。原floor4096、最大可负担搜索、thinking、grant/总额、16次数、timeout/deadline、输入、权限、严格parser和独审身份保持。
4. 原recordRequest已存在，实际cap/inputBytes/quote必须继续与HTTP和准入一致；预算不足仍可选择较低cap，连floor也不可承担则不发送。不得为16K追加预算或移动其他任务分配。
5. 不添加compaction、协议纠正次数、finalization、会话或重试。新上限下length仍先结算再incomplete，无有效verdict或自动下一请求。
6. 沿COS124/127既有宿主运行参数约定，不新增execution字段/持久policy版本或RecoveryOrigin迁移。默认及legacy caller省略选项仍8192。恢复旧ordinary运行时，若评审从未启动，可使用当前host的16K参数，但仍受原grant/clock/权限限制；不得声称所有旧resume均固定8192。有效verdict直接复用，review-started无有效verdict仍阻断，任何已停止/过期/闭账run均不得恢复。

## 必要免费验证

- 配置合法/非法及快照；默认8192、角色隔离、三/五槽host接线。16384可负担则保持最大，紧预算仍降至最大可负担值，4096不足拒绝；回执/HTTP/selector一致。
- 新TEMP真实factory/Pi/锁定SDK，仅fetch假SSE，完整重放原R7前三轮响应、五个read及原usage；作者已花551715仅用新TEMP合成账本/合法当前来源构造，不导入旧运行权限或写回旧账本。
- 保留真实旧length及结算链证据，不伪造不存在的旧部分文本。新第4响应明确为synthetic完整review，其声明输出用量需求超过8192且不超过实际选定cap；通过原完整parser及host绑定。它只证明接线/容量，不证明真实模型会完成或语义正确。
- 原cap与新cap的请求大小、quote、actual synthetic用量/费用分别列出；前3轮原实际用量保持。所有原输入、工具结果、concern原文、thinking设置、来源与当前TEMP回执完整，允许必要的新TEMP身份/根/时钟映射并列清，不mock旧时钟。
- 新cap下length负例：结算后失败、无有效review/纠正/重试。恢复短代表核有效verdict复用、started无verdict拒绝；现有相同守卫证据按无变化范围复用。
- typecheck/build、受影响测试与独立实际diff审查；不重跑旧Edge/media/全部历史矩阵。唯一merger短集成后source范围发布，新真实验证另经既有预算/身份readiness。

## 预期改动

主要roles/factory.ts的独立选项/验证/两个cap接线及entrypoint-host.ts的选择，另有定向测试。复用原helper/Pi/ledger/协议，不改变语义验证或放行残缺结果。所有旧运行永久关闭，用户确认需求不变。
