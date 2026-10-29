# COS146：在SDK截断前提供有界完整JSON展示

状态：revision_json_read_reviewer已APPROVED_PLAN、无必要修正，Root已批准固定短规格/计划的源码实施与登记；SOURCE待实际diff独审。仅选中角色的有界JSON展示，原SDK限额/raw分页/权限/预算/strict保持。

任务：[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)，id6092397335，原生父COS18/#19未勾；依赖[COS127 / #128](https://github.com/lrfluobida/Cosmos/issues/128)及[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)。作者revision_json_read_implementer，独审revision_json_read_reviewer，唯一merger planning_budget_merger。作者分支起点 `9b844186acfa2138bb2922745b88b5a4bd0cf08b`，与原runtime源码等价。

批准私有输入SHA256：spec `aa49d10c3fa75f142be6f77352edf117d4c1c4e9ee96975455556ee3da35b207`；plan `10a7d2c46ed00656a91864fc505e2ad4a5bde491aa430237f1fee1159697a53f`。

源码基线f6019c4a6fd05b3857e9725dc1d61112b50b6f22。GitHub身份已登记，SOURCE pending。父COS18/#19；直接依赖COS127/#128(id6031812917)、COS134/#135(id6048570589)。

## 实证

reuse11已永久PASS_CLOSED：初稿通过host check和独立changes_requested审查，修订作者28笔382430µ（22个ordinary read回复257116µ、6摘要125314µ），read工具24次、write/edit/selfcheck为0；工作副本与旧capture相同。整轮67笔1082813µ，释放3917187µ；shared3387/C27128823/H0，phase40不变。
诊断文件 `.cosmos/planning/revision-json-read/diagnosis.json` SHA256 f4ab8bf99f50783b82643eb7609f2f02714ff08a230a7a5f68dc289665eaab57。revision原grant900000µ、review reserve300000µ；作者余217570µ。收尾政策/原槽/64请求均正常，真实只读98412B/4096报价229592µ，短12022µ；未发请求没有费用，不能称漏接线。
最早可修断点：58907B/1960行计划整文件读取被SDK 51200B展示上限截断，随后分页并重读需求/反馈，没有修改。现有compactFullJsonReads在SDK返回后执行，见truncation便退出；即使开启仍显示51196B/1710行。只去JSON字符串外空白后39414B，经同一SDK可完整展示。不能由此声称模型一定开始编辑或完成修订。

## 固定范围

1. 修复src/providers/workspace-tools.ts及json-read-display.ts的既有选中读取路径：原check/access等授权成功后，在该次SDK读取执行内通过其ReadOperations.readFile支持提供仅供展示的Buffer，先压缩后走原SDK截断逻辑。不得先读取未经授权的路径，或绕过scope/symlink/cancel/其他read行为。
2. 复用现有去字符串外JSON空白算法；JSON.parse可用于合法性检查，不能parse/stringify重序列化数据。原字符串内容/空白/转义、数字lexeme（大整数/指数/-0）、重复键、Unicode必须逐token保留；不改原文件/哈希/权限/capture。
3. 预压缩只选默认整文件读取（未显式给offset或limit）和有效UTF8 JSON内容，且完整压缩后能在原SDK 51200B/2000行限内返回。显式offset/limit一律使用原SDK原始文本/分页；无效UTF8/JSON、非JSON、压缩仍超限都回原SDK读取/截断。不得从已截断内容拼造完整JSON，不得提高限额。对既有reviewer完整显式窗口的post压缩行为，新的选择统一为上述原SDK分页边界；数据语义和原源不变，定向验证该展示差异。
4. 给被选中工具加简短说明：整文件JSON可能是紧凑展示，源格式未改；exact-text edit前用显式分页获取原始文字。不向纯JSON正文混入解释性字段，不让新增提示突破展示限额。展示去空白不构成摘要、删字段或删除镜像。
5. 角色选择：保持已有可信普通design reviewer选择启用此修复；另仅给经宿主真实revision plan绑定的普通design修订作者开启。初始design作者、art/coding/cosmos、默认factory、fixed validation/preparation/human continuation保持原选择。不得按taskId后缀/模型描述/自报role判定revision；可在host.bindPreparedTasks验证实际revision plan后保留其taskId，再用窄可信callback与既有boundTask/requireDispatch核对。选项不能扩大任何文件权限。
6. 不改预算/模型/请求数/输出floor、review reserve、author finalization、确认/执行policy版本或strict/capture/review判定，不修改旧run。新行为是工具展示；既有付费历史/已保存response不用重做。

## 必要验证

- 使用原58907B计划和真正createWorkspaceTools+已安装SDK：baseline整读截断RED，新整读完整39414B GREEN，所有token/字符串保留，原文件字节/hash不变。两类选中role走真实factory/native工具链最短代表，不需要整场模型回放。
- 超50KiB但可压缩到限内、压缩仍超限、超过2000原行但可压缩、普通小JSON、非JSON、坏JSON/UTF8、显式offset/limit分页；byte/line边界坚持原SDK。检查默认工具选择未变。
- 引号/反斜线/中文/字符串内空白、大整数/指数/-0、重复键保持；不得只用JSON.parse深比较来证明token保真。
- 路径escape/symlink/未授权/取消与SDK原行为仍受guard。请求并发不能共享易竞态的参数状态；采用每次调用局部状态。只选中revision作者，初始同名suffix不能误选，非匹配宿主task拒绝。
- 在TEMP证明紧凑整读后可显式分页取得原始片段，再由原edit工具成功按exact-text修改一个小测试JSON；这不是手工修复真实游戏。
- 复用既有lexical helper/权限/原role证据，仅跑受影响短代表、typecheck/build及独立actual diff审查。实际R11文件只读，不能重开/重结/调用真实provider。最终完成结论限于完整有界显示及选择正确；真实生成需后续新运行。

预计文件：providers workspace-tools/json-read-display、roles factory的窄选项/选择、runtime entrypoint-host的已验证revision绑定，以及必要聚焦测试。若需要新框架、改SDK依赖/预算/其他执行契约，先告Root，不自行扩展。
