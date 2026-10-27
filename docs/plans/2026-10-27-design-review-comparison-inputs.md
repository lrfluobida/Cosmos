# COS138 实施计划

状态：Root已批准固定设计、计划及免费SOURCE实施；独立design_candidate_review_reviewer已确认比较引用契约，源码审查仍pending。

任务：[COS138 / #139](https://github.com/lrfluobida/Cosmos/issues/139)，父COS18/#19未勾，依赖[COS137 / #138](https://github.com/lrfluobida/Cosmos/issues/138)。作者ordinary_design_revision_implementer，独审design_candidate_review_reviewer，唯一merger public_agent_batch_merger。

批准私有输入SHA256：spec `e32f801d98db33157296b5fadbba14256f25e740750297a1535e8612371c4a16`；plan `2d6f99421b6597771e993c5eb6f2b8d5ed2ca78747a24c0c6111ff0dedc2a0cc`。

1. 专属 implementer 在 managed cos-02-contracts worktree 建 codex/design-review-comparison-inputs，从已发布 b287e812 开始；保持此前证据，绝不改真实 run/账本。
2. 先用原 raw response 建免费只读纯 parser RED，保留准确错误。检查当前文件 UTF-8，声明改动文件，最小补丁。
3. captured_output 允许精确 task.artifacts + task.inputs，并显式要求当前 capture；保留接口/过期/外部/only-input拒绝。初始和纠正提示同步同一规则。
4. 跑受影响 proof 回归与原 response GREEN。独立准备必要的 TEMP native四轮轨迹验证，不手改原 response 来通过；修复前后的唯一变量是已批契约。
5. 固定可审 SOURCE SHA 后直接 followup 独立 reviewer；Root确认 reviewer 实际启动。证据绑定该提交，未影响的既有检查复用。
6. reviewer 先检查规格，再读实际 diff 和失败/通过证据。发现问题交 implementer 同分支修正，复审受影响 delta。
7. 唯一 public_agent_batch_merger 核批准SHA，做最短受影响集成、更新 PROGRESS/issue/映射并推送。所有已结案 run 永久关闭。记录真实结果与源码结果的区别。

不以 GitHub 登记的网络延迟阻塞已批隔离源码实现；登记结果必须查回，未知 POST 不盲目重发。无新用户需求问题，无新费用授权申请。
