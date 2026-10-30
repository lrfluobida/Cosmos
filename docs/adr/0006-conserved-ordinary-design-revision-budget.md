---
status: accepted
---
# 同一普通运行只将初始设计未用额度转入唯一修订

Root已接受此v2设计决定；accepted不代表SOURCE完成或预算增额。SOURCE仍pending，后续实际差异审查及代码状态由[任务卡](../specs/cos160-conserved-design-revision-budget.md)记录。

经现有生产资金来源正向认证的新 public-funded ordinary 子运行，在首次付费规划前固定主机预算策略。初始设计获得有效独立否定审查且原角色与账务全部结束后，主机在同一次 snapshot 提交中关闭旧设计额度并注册唯一 fresh revision。原 task、grant、费用、总额和截止时间不变；新 grant 等于既有修订基础额加该初始任务未用分配额，ledger6 激活回执认证唯一来源和守恒关系。非 funded ordinary 继续原 ledger1 与正式续窗能力。

选择在修订边界才升级 ledger1，保留 intake、已有规划费用及旧恢复解释。正式 ledger2 续窗需要真实人工确认，validation ledger3–5 属于不同权限；复用它们会混淆预算授权。提前改变 intake profile 会扩大本卡范围。新的 host profile 没有新增总额授权，审查建议只是既定唯一修订的触发事实。

新策略的窄 tracker 从实际会话创建开始跟踪到 close/operationDone 成功；不确定创建或关闭保留 owner lock，干净关闭和确证旧 owner 退出须有具体来源回执。stage-idle 能力绑定当前 live OwnedWork operation、controller、source/intent 和会话 epoch；不能凭新 host 空计数或无锁状态恢复权限。已提交 exact retry 经专用无 expire 队列只读返回，首次激活仍执行原截止检查。

旧缺省运行不迁移，原始 allocation 和已结算费用永不重写；后续分配按关闭记录算净额。半激活状态拒绝，运行中的 revision 不能加 grant。funded 运行已有的禁续窗边界保持；本卡不扩成跨 profile 续窗，也不撤销非 funded 的 R15 能力。完整评审材料与验收约束保持，守恒额度不保证模型纠错或游戏通过。
