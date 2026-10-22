# COS-119 · 规划请求的 JSON 输出约束

任务 [COS119 / #120](https://github.com/lrfluobida/Cosmos/issues/120)，id5971087208；父任务 COS18 / #19；基线 `bfbf69173cf63ad1530ba1ddf1f610d811df7cce`，运行源码与已发布 `48cffe0f0e9a195bf77b601a6e3c928ffa0b993b` 一致。仅免费源码工作，所有已关闭 memory/room1–4 运行保持关闭。

## 已确认的问题

第四次小屋验证真实确认了v2。唯一规划响应正常stop，但objective中出现未转义的ASCII引号 `含"小屋寻物"`，整个任务列表不是合法JSON。原文直接JSON.parse在position290失败，实际decodeModelJson报 `Model response requires one complete JSON object.`。planner在后续policy、角色、覆盖、依赖环和预算校验之前退出，保存failed handoff；没有plan.json/execution.json或开发任务。不能推断仅修改引号后整份计划就会通过。

原运行于2026-10-22T00:35:57.173Z启动，6.045秒后incomplete；规划费用19232µ，加访谈共85909µ。已按原API停止结算，释放4914091µ；独立PASS_CLOSED，原记录不得回填、恢复或再次结算。证据见 `.cosmos/public-validation/room-20261021-4/generation-execution.json` 与 `generation-closure.json`。

## 依据与决策

- [DeepSeek官方JSON Output](https://api-docs.deepseek.com/guides/json_mode/) 明确支持deepseek-flash使用 `response_format: {"type":"json_object"}`，提示中需包含JSON并给出示例；仍可能为空或截断。
- [官方请求参数](https://api-docs.deepseek.com/api/create-chat-completion/) 声明text/json_object，本卡不假定JSON Schema响应支持。
- 锁定pi-ai/pi-coding-agent 0.99.2的DeepSeek经openai-completions发送；simple-options及ModelRuntime保留onPayload，openai-completions发送前应用其返回值。当前Cosmos尚未设置response_format。
- 选择API输出约束，暂不新增格式纠正或重试。现有readonlyPrompt只限制每次调用一次请求，不是整个规划的一次性槽；author-protocol依赖作者attempt与journal，不能直接套在规划器上。

## 必须满足

1. PiSessionOptions提供一个窄、可信的JSON对象输出选择；RoleFactory只在 `purpose === 'planning'` 时启用，覆盖现有普通及验证规划入口。不增加CLI或模型可设置的权限入口。
2. 通过锁定SDK已有的onPayload hook，在当前Pi adapter的originalStream options中新增接入，设置固定 `response_format: {type:'json_object'}`。如原options已有hook，按SDK现有返回语义保留并组合该hook，只覆盖规划模式的固定response_format字段；不得丢掉其他原payload内容。不接受任意provider参数、schema或用户提供的response_format对象。其余author/reviewer/interview/direct-default请求保持原payload行为。
3. 保持原模型、thinking、tools、token上限、maxRequests、requestTimeout/window、maxRetries:0、input identity、计费与reserve/admit。不得多发请求、改grant或时间上限，也不因返回JSON就跳过任何计划验证。
4. 规划system/user提示中的示例改为可JSON.parse的合法JSON，policyId与无policyId两种形状均覆盖。可用JSON.stringify生成小型通用示例，明确示例标识是占位说明，实际值必须来自原host policies/confirmed acceptance。示例不是宿主预写的实际游戏计划，不引入固定小屋或PvZ内容。
5. 现有decodeModelJson和完整计划校验保持权威。空响应、无效JSON、截断、未知policy/role、覆盖缺失、重复任务、依赖环或预算错误仍拒绝；原native与失败handoff保留，不自动修补字符串、追加第二次规划或注册部分任务。
6. 不升级SDK、不改历史费用/运行来源、不绕过缺execution的公共resume门禁。本卡不增加历史规划恢复机会。

## 免费验收

- 真实RoleFactory/Pi/锁定SDK配合fake fetch，证明planning实际payload带固定json_object；原模型/工具/thinking/cap/预算钩子保持且只有原请求数。不能只检查配置对象。
- nonplanning author/reviewer/interview或直接默认Pi代表不带新增response_format。
- 合法JSON包含引号、反斜线、换行与中文时经原解码/绑定得到相同内容；policyId和无policyId提示示例都能独立JSON.parse，仍由原数据决定实际plan。
- 服务端即使返回无效/空/截断结果也沿原失败路径终止，零有效计划和开发任务，无纠正调用。保留原错误而非手改模型输出。
- 复用或定向执行现有policy/role、覆盖、cycle、预算、validation identity校验代表；typecheck/build/changed-test strict、UTF-8与中文回读通过。

源码通过只证明请求接线与门禁保持；真实模型效果需后续有界验证，JSON对象输出不保证游戏计划语义正确。

## 源码实施与离线证据

- RoleFactory 仅对可信 planning purpose 传入 jsonOutput；Pi adapter 在既有 originalStream options 合并原 onPayload，严格以 undefined 判断是否采用原 payload，随后设置固定 json_object。
- system/user 提示共用 planningJsonExample，包含 policyId 与无 policyId 两种合法 JSON 占位示例。原 decodeModelJson、policy/role、覆盖、身份、依赖环、预算及任务绑定校验保持。
- 受影响测试 45/45：新增真实 RoleFactory/Pi/SDK + fake fetch 13 项，以及合法示例/host 绑定 7 项和 validation identity 25 项。普通与 validation 规划都检查实际 HTTP body、原 model/thinking/tools/cap/timeout/maxRetries、TEMP reserve/admit/settlement；同步原地与异步替换 hook 都保留额外字段。
- 预算/容量兼容 6/6。npm run typecheck、npm run build、三个变更测试的 strict noEmit 均退出 0。
- RED 原日志保留：初次 10 pass / 10 fail，其中 validation fixture 的验收分配过宽被原门禁拒绝；修正 fixture 后 validation 单项因缺少 response_format 得到预期 RED 0/1。随后 GREEN 45/45，未修改真实失败回复。
- 原始命令、日志与复用说明位于实施 worktree 的忽略目录 .cosmos/cos119-evidence/verification-index.json。独立审查与主线合并由 reviewer 和唯一 merger 完成。
- 本卡只证明源码接线与离线门禁，未运行真实 provider/browser，未打开或改写历史运行账本。真实模型格式改善和游戏计划语义正确性仍需后续另行获准的有界验证。

## 独立审查修正

审查发现原实现对 hook 返回的冻结 replacement 原地写 response_format 会抛错，使请求未发送且费用状态 unknown。定向 RED 0/1 复现后，改为保留所选 payload 字段并返回带固定格式的新对象。新增冻结 replacement 代表验证实际 fetch、json_object、额外 seed 字段、原冻结对象保持 text 格式及正常 settled；与默认、原地修改、异步 replacement 共 4/4 通过。此前 45/45、6/6 中未受影响部分复用，不叠加计数。

原 changed-tests-strict 命令曾退出 0，但空输出未生成索引所指日志；保留该证据缺口。本次重新 strict 检查退出 0，显式保存命令、退出码和空 stdout/stderr 到 review-changed-tests-strict.log，不补造旧日志。
