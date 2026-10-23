# COS124 · 普通设计作者的预算内输出容量

[COS124 / #125](https://github.com/lrfluobida/Cosmos/issues/125)，id5990331802，父 COS18/#19。

状态：设计与计划已由 design_output_plan_reviewer 独审批准；实现待独立源码审查。基线 `56fb0c1c6c34e25d3cc9dfe8ccbd33c2ef1b3428`，runtime `ba5dca0df72846bac3b2c40cc326f0f888d5bac5`，父 COS18/#19。用户已授权持续开发；本卡仅免费 SOURCE/TEMP。room1–8 及旧 memory 均已永久关闭。

## 实际问题与容量依据

room8 通过原 CLI 确认 actual v1，规划通过并创建三任务。实际 proposal 的三组 AC 原本就与可信绑定一致，本例不是错误 proposal 被覆盖的实测。设计第八个响应 output=8192、reasoning=0、rawStopReason=length，被 Pi 判为不完整且不执行 partial tool calls；最终 native content=[]，不能据此断言被截断的具体工具或整文件重写。

前序反馈依次为缺验收计划、Invalid visible save checkpoint、scenario.steps[13] Unknown field expectAfter。design.json 17240 bytes 的纯结构检查通过，acceptance-plan.json 8494 bytes（37 普通步骤、0 重开步骤）仍复现该错误；语义、capture、review 未通过。90.339 秒 incomplete，art/code 未开始。12 笔共235270µ（访谈37945、规划33157、设计164168）已停止并结算，释放4764730µ；独立 PASS_CLOSED child69/shared3352，无未决费用或残留。未触及设计32次请求上限。

独立评估以原 requestInputBytes、价格公式 inputBytes*2+outputCap*8 和 reserveEntry 纯内存重建历史。room8 第八请求 inputBytes95730，前七笔已用97374µ，设计675000µ原分配余577626µ；8K/16K/32K quote分别256996/322532/453604µ均可准入，64K quote715748µ拒绝。固定64K沿实际轨迹第五次就会拒绝。

固定32K也会恶化已见room6轨迹：原8K全部16次均准入，32K从第12次起拒绝。第12次 inputBytes121633、已用170761µ、余额504239µ，32K quote505410µ拒绝；8K308802µ、16K374338µ可行，最大可负担cap32621对应504234µ，而32622对应504242µ越界。第16次余额492772µ、inputBytes130073，最大cap29078。上述核算不更改旧会话，也不授予继续执行资格。

因此本卡同时提高设计可选最大输出和按预算下降的能力。32K是工程选择，不证明真实所需长度；选择不保证语义正确、按时完成或给review留下足够余额。原设计分配仍由作者与review共同使用。

## 设计

1. 在现有 RoleFactoryOptions 增加可信可选 `authorBudgetOutputFloor?: Partial<Record<AuthorRole, number>>`。该字段显式启用按请求预算选择；上限仍来自同一已有 authorMaxOutputTokens/maxOutputTokens，避免重复最大值配置。复制配置并固定启用角色的resolved cap（包括回退的基础maxOutputTokens），校验有效角色键、正安全整数、floor不高于对应配置上限；启用选择的配置上限不得超过32768，保证搜索有界。提示/选择/实际Pi配置使用同一固定值，调用方后改options不能绕过边界。未配置维持原行为。
2. 仅 purpose=author、非fixed validation且该作者角色显式配置floor时接入 Pi 既有 requestOutputLimit。规划复用作者角色时不能获得该策略，reviewer不能获得。原 fixed validation coding output/compaction 回调保持原样且优先隔离，不合并重构。
3. 普通 browser 产品（含shared-funded及已有modular）仅design设 maxOutputTokens=32768、floor=8192。仅 ordinary&&!validation&&!preparation&&!human&&!binding&&!inherited 的新产品路径启用。planning/reviewer仍8192；art/coding仍各自原65536；legacy、preparation、fixed validation、continuation/inherited保持原设置。既有design thinking off、maxRequests32及120s请求时限保持。
4. 复用原 requestOutputLimit 的真实归一化 inputBytes、modelId、requestId和configured cap；不重估未发送工具或另算原始prompt字节。每次先读取当前原controller状态和execution authority，核原run/ledger/task分配与原window/deadline一致、未停止、有效权限。仅比较run的稳定身份字段，不比较随结算改变的整个run/fees；连续两次已结算请求仍须正常选择。最终真正reserve/admit仍是唯一派发授权。
5. 从当前configured cap向floor逐候选递减，使用原estimatedMaxCostMicroCny及每次新的ledger副本调用原reserveEntry。不能假设注入估价函数单调；不另造allocator或修改真实账本。返回首个可负担cap，保持不大于配置上限、不小于floor；正安全整数估价之外立即拒绝。没有候选时在provider发送前拒绝，不偷偷降低到8K以下。每固定候选批次（建议64）让出事件循环，批次前后检查请求及controller取消信号、原deadline与既有5000ms cleanup余量；即使候选本来立即可行，返回前也核取消和期限。搜索有界不等于可取消，不能用同步循环阻塞timer。
   - 必要的窄Pi接口增量：既有requestOutputLimit增加可选第二参数，传入该次已有SDK请求取消信号；旧单参数callback保持类型兼容。新helper合并此信号与controller.signal，不新增factory busy状态、操作生命周期或私有取消机制。Pi在callback返回后、估价及预算预留前再次核原failure/closed/请求signal，避免caller在搜索期间取消后仍预留费用。
6. 读取当前状态后的并发费用变化仍可能使真实reserve/admit拒绝，这是正确行为。保留Pi原输入不可变检查、window/deadline前后复核、maxRequests、输出截断失败及partial-tool零执行。策略不产生新grant、attempt、窗口、retry、successor或旧failed恢复，不清理旧失败native内容。
7. 仅启用该策略的作者，通过现有 createRoleBudget 的recordRequest能力保存实际已选的六个安全请求元数据字段，绑定sent cap/inputBytes/quote/requestId/modelId/hasImages。不得保存prompt、工具参数、凭据或新增账本格式。复用已有billing记录与reconcile路径；其它角色和历史回执不补写。
8. 原文件工具、具体设计校验、capture与独审不改；较大输出不是自检通过或游戏成功。继续原分块写入提示，不增加新JSON工具、强制终结或多余提示层。不得把本次尚未通过的旧计划手工修好当新实际结果。

## 验收

- 原ordinary设计8K边界产生length失败的有效RED；提高配置后真实SDK+fake transport能传入选定cap，允许完整大于8K输出继续原工具/交接流程。只证明受控传输行为。
- room6第12次实际输入与余额的免费复现：固定32K拒，选择32621可行且32622越界；保留原预算、原输入及原run事实。room8第八次可选择32768。不得实际重新派发旧请求。
- 覆盖最大可负担选择、精确floor、无候选、非单调估价、非法报价、配置非法、配置复制及基础cap防漂移，所有报价试探不改变原ledger。连续两次请求与中间结算不得因run.fees变化被误拒。
- actual sent cap、原estimate/真实reserve及安全billing.request字段一致；报价后并发消费、authority失效、deadline、unknown/closed grant等仍阻断发送。搜索中异步caller abort、owner abort和deadline/cleanup到期均停止报价且零发送/零新预留，保留原旧callback兼容。复用原未变守卫测试，选择必要新增代表。
- purpose/角色/模式矩阵包含ordinary3/5槽、funded、legacy/preparation/fixed validation/binding/inherited；原fixed validation coding机制与无策略模式保持。
- length仍明确失败、partial tool零执行、不自动retry；旧失败和停止运行仍不可恢复为新尝试。原capture/review门禁仍必经。
- typecheck/build、变更测试strict、UTF-8中文/行尾/diff；独立implementer/reviewer，唯一merger合并精确批准SHA并发布issue与PROGRESS。

本卡完成只证明源码预算选择及隔离守卫；实际完成率和最终游戏目标仍待后续原公开入口验证。
