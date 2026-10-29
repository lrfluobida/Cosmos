# COS147：结构化执行验收计划草稿写入

状态：`source-integrated / source-scoped-complete`；最终 `ef09163da2a83645774da1b07fc14a55e4cc732c` 经structured_plan_reviewer独立APPROVED_SOURCE_SCOPED、无剩余finding及Root批准，已发布 `6d92bbe1cf2bbc0de26f8c80abba21f81a638513`。[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/148#issuecomment-6489822351)、closed(completed)及父[x]已GET核证。新能力不把R12/R13包装成strict bug；[ADR0005](../adr/0005-structured-plan-authoring.md)接受时SOURCE实施中的历史表述保持，当前源码完成另由本次审批与发布记录证明。

任务：[COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148)，id6093554669，原生父COS18/#19已勾；依赖[COS145 / #146](https://github.com/lrfluobida/Cosmos/issues/146)及[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)。作者structured_plan_implementer，独审structured_plan_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `efc2f9c3a691d12bfd93dbd6b0f628282f30bced3d23fecf4c52a7f6126788e0`；plan `fff207dfd24e48e7d77afe1a8db307dafc8ee7ffe88ddc3a705c60157d27d1b6`；ADR草稿 `f29071a915bf694deff79c62953aa63e65a0926284fd837c169582813a9dc834`。

运行时代码基线3ceadde07d19d94cc89a1ff9699da4dd7dab1928。GitHub身份与SOURCE完成已核证。父COS18/#19；直接依赖COS145/#146(id6091618219)与COS134/#135(id6048570589)。

SOURCE结果：5个批准文件精确集成；main typecheck/build0、有限4/4、0skip、TAP7548.9691ms，8unit、其余6host、同reply native1、compat4及新测试严格tsc0按有效范围复用。P2真实SDK同reply并行丢批经executionMode sequential修正，4条toolResult按序成功、capture保留双批，原独审仍changes_requested且未accepted。Array.toJSON拒绝已复核；R12/R13原稿TEMP机械save/append仍被strict拒绝，原字节不变，不称语义修复。

[R14永久结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6489905622)：planning-started/execution均structured-plan/1，2save+8append/0toolErrors，初稿hostcheck和capture通过。两份独审JSON final均正常stop，却都在inputVersions[5]额外列入host-report；唯一correction只重发协议后仍重复，strict拒绝，无有效review/revision/game。7findings保留原模型建议，不删除引用替换实际verdict或转approved。34笔619226µ、释放4380774µ，shared3393/C28948131/H0，phase40/ref不变；374249ms仅清理计时。父COS18仍open/partial，41/41仅指源码子项。

## 依据及边界

R12、R13均永久PASS_CLOSED。R12的裸文本追加破坏JSON，5次exact edit锚点失败，最后124步仍无3项AC及reopen；准确反馈已到达。R13合法骨架曾被PLACEHOLDER替换，再恢复合法追加；最后reopen写在顶层而非scenario内，通用envelope错误未能帮助作者定位，最终没有修正。R13的18519 output tokens与小工具参数不能用于推断缺失provider流或解析器bug。两次都是作者机械写入错误，不是strict规则错误。R13是预先限定的唯一same-source重试，现停止不变源码的连续付费抽样。
阶段账本shared3391/C28328905/H0，phase40保持；未来单次上限仍5M/30min、总验证150M。游戏需求仍原room12v2，没有新用户确认。COS146 selected reviewer/revision live路径在这两轮未达到，不据此宣称该源码成功或失败。

领域用语：执行验收计划草稿是作者正在编写或修正的操作、观测与判定过程。保存只说明草稿内容已记录，不是结构通过、捕获、独立批准或实际验收。CONTEXT只记该语义，不含实现。

## 单个专用工具

新增一个普通设计作者专用host工具（建议write-game-plan），唯一输出authors/design/acceptance-plan.json，不接受path、formatVersion、requirement、URL、authority或脚本参数。仅两类操作：
- save({scenario})：作者提供JSON对象scenario数据，host构造既有ordinary-acceptance-plan/1外层和原真实requirement capture引用并保存。
- append({stage:main|reopen,steps,checkpoint?})：读取当前完整草稿，仅向指定步骤数组追加且保持顺序。首次建立reopen必须由作者提供结构化checkpoint；已有checkpoint若另传不同值，拒绝并要求明确save/局部修正，不能默默覆盖。main不得带checkpoint。

具体参数用一个provider兼容的JSON Schema对象和明确operation判别，拒绝操作不适用/未知字段。只检查JSON容器及操作形状，不复制整套Step schema。JSON值不能悄丢undefined/function/非有限数等非JSON数据；模型数据合法时不自动改写步骤、补AC、生成checkpoint或猜测玩法。save可保存尚未完整覆盖AC的草稿；append需要现存UTF8、可解析的合法固定外层/正确source引用以及数组容器。文件缺失、坏JSON、错envelope/source不自动重建或丢弃已有数据，明确要求save。空追加可作为草稿操作，但不能带来验收声明。

序列化只作用作者工作副本，固定外层始终由host管理，所有game-specific值来自作者。不存在自动补覆盖、修复游戏语义、改预算或接受候选。合法JSON字符串中的中文、引号、换行应可靠保存；append保留现有解析数据及数组顺序。原文件UTF8编码/BOM/换行风格尽量保持，非UTF8沿既有writer拒绝。这是显式结构化写入，允许必要的JSON格式化，不变更需求/捕获源文件。

## 授权、反馈和兼容

- 沿用designHostTools真实task/workspace/attempt/source/authority/deadline guard，操作前及落盘前检查。工具readOnly:false；reviewer/其他角色不得获得。工作路径恒定且在原ownership内，不扩大read/write范围。
- 完整内部读取不能消费SDK截断展示：使用现有固定路径安全读取（例如regularFile）及fatal UTF8；写入可复用createWorkspaceTools的固定范围writer，以保留路径、symlink、编码及取消行为。不创建一般JSON编辑器、JSON Pointer、shell或新依赖。
- 新工具保存成功后显式调用现有check.afterFileWrite并返回“已保存草稿＋原诊断”。factory自动hook只识别write/edit，不能假定它覆盖新工具。strict、coverage、checkpoint、capture、independent review仍是原权威判定；工具成功不产生approval/accepted。
- 原read/write/edit保留，提示优先专用工具建立/追加计划，局部值纠正仍可edit或save。这是兼容与最小接口的取舍；只有经此工具的操作保证JSON外层/序列化，不宣称raw编辑不再可能出错。工具不是幂等append承诺，不增加原会话的自动重放、重试或attempt。
- 新工具与新提示只进入新普通未模块化、非fixed-validation/preparation/continuation/inherited的任务政策，覆盖该新运行的design与design revision作者；其他profile维持选择。
- 窄选择固定为ordinaryPlanAuthoringPolicy: structured-plan/1，同写现有planning-started.json与execution.json；planning-started的write-once在付费plan之前，execution在planned之后。resume从execution读取原选择并与host核对；无execution继续原有拒绝，不增加付费重规划。只有既无选择、又无新工具/专用规则残留的已冻结任务才按legacy；planning-started已选择structured或冻结task含新工具/专用规则而execution字段消失时必须拒绝，反向选择存在但tools/rules不匹配也拒绝。不回填、不猜测、不新建资金协议。专用规则按明确的规范规则标记核对，不从用户brief/普通文字的子串推断政策。
- 现有计划schema、capture布局、批准来源链、资金/时限/模型/role grants/输出cap及其他收尾政策不变；dispatch:false历史会计不依赖新写入工具，不改旧run或旧费用。

## 必要验证与证据限定

1. 新工具通过实际scoped writer保存含中文、引号、换行的数据并保持可解析；分批main/reopen追加顺序和已有值不变，host固定reference/envelope不能由caller替换。
2. 缺文件/坏JSON或UTF8/source mismatch/错误stage/checkpoint和容器/未知参数不写；缺AC、坏step、缺少checkpoint观察等仍由原校验拒绝，已保存不等于accepted。
3. wrong role/workspace/attempt/authority/source/deadline/symlink/取消仍挡写；工具不获得原所有权以外路径。新hook确实返回COS145诊断；原raw write/edit兼容且不能绕过最终capture/review。
4. 新旧政策、初稿和revision、规划中断/恢复、历史已冻结tools/rules不变，默认其他角色无工具。用最短真实factory/native fakefetch代表确认模型看到schema并调用新工具，且严格handoff/capture/independent gate保持。不要新建整场预算回放矩阵。
5. 用R12/R13原稿数据在TEMP进行明确synthetic save/append演示（可复用已经合法的scenario/step对象，不修改真实文件）。尤其reopen自动落在scenario内、每批都是可解析JSON；不能声称模型已经完成原缺项或真实游戏生成。未知provider流不得补造。
6. typecheck/build、聚焦回归、独立actual diff审查、唯一merger有限集成；复用未受影响证据。source固定SHA后立即交审，私有报告可并行整理。

预计：新增专用tool模块、entrypoint-host注册/提示，以及既有entrypoint/execution policy选择所必要的小范围接线与测试。原validator/provider原则上不改；若为共享安全读写/版本边界确需少量调整先向Root说明，不能扩大成通用编辑框架。
