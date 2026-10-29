# COS145：设计诊断聚合反馈

状态：planning_context_reviewer已APPROVED_PLAN、无阻塞，Root已批准固定短规格/计划的实施与登记；仅免费SOURCE，源码待实际diff独审。只增强普通设计advisory诊断，strict/source检查仍唯一决定passed，phase40原决定与实际运行门禁保持。

任务：[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)，id6091618219，原生父COS18/#19未勾；依赖[COS114 / #115](https://github.com/lrfluobida/Cosmos/issues/115)及[COS118 / #119](https://github.com/lrfluobida/Cosmos/issues/119)。作者design_diagnostics_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `0f872ff3bee00e65f3c21d84935538fd2c84fd873b315274034da5963f785fca`；plan `621aa643382212c3b86d35b1bbf299d78392252002438f1c202bf17035e98633`。

基线：d97b0a69da6194df3c64a0aa0a05095acacd4a14。父COS18/#19；直接依赖COS114/#115(id5956993439)、COS118/#119(id5962948976)。

## 实证与问题

reuse10已永久PASS_CLOSED。规划3笔64138µ通过，设计作者22次普通409250µ、4次摘要111592µ、1次只读收尾42921µ，设计合计563763µ。总627901µ、未用4372099µ已一次释放；shared3385累计26046010µ，phase40不变。

author_feedback_assessment仅在内存精确重放native所有write/edit，最终两文件与真实产物bytes一致。原会话：`.cosmos/public-validation/room-20261029-reuse-10/run/sessions/6562a05a-4b24-4ad8-b3a1-b94cd88129c4/author/2026-10-29T02-15-01-865Z_01a18570-73e9-7211-9483-e77183d461ba.jsonl`。
- L23：首26步已有appears、disabled非法observation；实际反馈仅checkpoint.expected为空。
- L25：已含14项局部错误（含6个selector+像素坐标步骤）；后续L24/26/28/31/33仍只暴露checkpoint。
- L42–43：main60项、reopen8项诊断，实际自动反馈仅main前8项。
- L46–47：作者按反馈修改appears和3个坐标步骤，main降至53、reopen仍8；后续才收到下一批。

严格校验先在checkpoint抛错，随后又在首个失败stage抛错；自动反馈再截前8项。这不证明模型必然能改对，但已证明可用的独立局部错误没有同时到达作者。
预算跟进因author_review_reserve触发：剩229158，8192报价242208差13050；4096收尾报价212640可支付并返回严格JSON。最终已有author和capture-started；capture被计划schema阻止，不是handoff失败或64请求耗尽。

## 修复边界

1. 仅增强普通设计advisory诊断。原validateOrdinaryAcceptancePlan及来源相等检查继续唯一决定passed；capture、独立review、预算、需求、模型、工具权限和严格validator不变。
2. 对已成功解析的普通plan，在严格检查失败后保留原错误，并复用现有validatePlan分别收集scenario.steps与scenario.reopen.steps的局部格式错误。仅对可安全检查的结构调用；缺文件、UTF8/JSON错误、非对象/坏stage等需原样报错而不抛新诊断异常。不得用诊断推导或改写游戏数据。
3. 局部检查上下文应与现有校验语义相同：相同viewport、正确stage路径、原完整需求中的合法acceptance IDs及现有stage归属方式。不得为了反馈引入第二份schema、伪造passed或把局部收集称作完整语义验收。
4. 保留原envelope/checkpoint/来源错误；即使此类错误先发生，也能显示主流程和reopen的独立局部问题。只添加可由现有validator确定的事实，去重。
5. 显式validate-game-design工具返回实际收集的完整结构化诊断。自动write/edit反馈保持最多8项诊断、总4096字符：同类错误合并精确位置（允许有明确数量的省略），同一次反馈覆盖两stage已知错误，不再只截main前8。原严格错误保持可见；如行数、位置或字符预算截断，明确显示还有省略及可用显式检查工具，不能静默切掉该提示。
6. 一切只读：不写作者文件、不补字段、不改schema、不触发付费或重试。其他design/modular/classic行为保持；用受影响代表证实。

## 必要证据与完成条件

- 先RED：坏checkpoint同时存在main和reopen多个局部错误，旧反馈遮蔽；新反馈一次可见原错误及两stage，显式工具含全部收集项。
- 重复类别的位置聚合、去重、超过8组和4096字符的明确省略；非对象/坏JSON/缺文件/空或非数组stage/陌生字段只读安全；部分修复只消除对应项、原严格passed仍false；合法plan仍通过。
- 原来源不一致、capture invalid/changed/missing及独立review仍严格；不增加模型调用或放宽宿主。
- 将本轮L23/L25和L42实际初稿在TEMP重放：保持原文件内容，比较旧/新反馈，记录提前暴露的具体项。最终真实文件仍不合格且被原strict拒绝。此为本地反馈验证，不称真实生成、节费或语义成功。
- 复用已过native/Pi/资金/计时测试，只有新反馈工具边界必要时做最短原生集成；不重跑旧全矩阵。typecheck/build与受影响短回归，实际diff独审，唯一merger发布。

## 预计文件

`src/runtime/entrypoint-design-check.ts`，必要的同目录窄辅助，以及`tests/runtime/ordinary-design-write-feedback.test.ts`或一个聚焦测试文件。若必须修改strict validator/预算/模型/公开契约，先报告偏离，不自行扩展。
