# COS156：结构化游戏设计草稿写入

状态：Root已读固定完整spec/plan并直接批准实施，无额外独立plan审批；SOURCE pending。作者structured_design_implementer，独立源码reviewer structured_design_reviewer待候选审actualdiff，尚无SOURCE批准，唯一merger planning_budget_merger。下方原计划的准备/等待follow-up措辞保留原批准快照语境，当前实施授权以本状态为准；不授权付费或恢复旧run。

任务：[COS156 / #157](https://github.com/lrfluobida/Cosmos/issues/157)，id6111163694；原生父COS18/#19未勾，依赖[COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148)结构化writer基础。runtime基线 `0341094c8cc12179f0de3a303318227681f907d3`。遵循既有ADR0005，无新ADR/CONTEXT。

Root批准输入SHA256：spec `ae4371a241d995f17d4b8e9b407ca0f71d9702d3781adcc4a9e09c0873b2bb1f`；plan `efe434cd020b71e1d29839805df750bc8dd57d9d516f33a316886bb7c5e88774`；原批准快照保留。phase40/C35395421µ/H0不变，下一完整5M exposure40395421µ超395421µ，当前禁止新fullpaid，增额未批准。

运行时代码基线 `0341094c8cc12179f0de3a303318227681f907d3`。作者工作副本 `E:/CodexData/.codex/worktrees/cos-02-contracts/Cosmos`，分支 `codex/structured-design-authoring`。唯一 merger 为 `planning_budget_merger`；独立 reviewer 由 Root 指派。

## 问题与范围

R22 的工具参数 JSON 合法，但首次 raw write 把 `implementationNotes` 内的 HTML `class="item item-crystal"` 引号直接写进另一层 JSON 字符串，导致 design.json 无效。现有写后反馈、显式自检和最终 capture 都正确拒绝；不能把它称为验证器或预算缺陷。依据为 `E:/develop/Cosmos/.cosmos/planning/initial-design-reuse22/diagnosis.md`。

本项仅开发通用 Cosmos 作者能力：让作者提交结构化设计对象，宿主完成 JSON 序列化。保留 R22 原坏文件及失败事实，不恢复 R22，不生成手写目标游戏，不调用真实模型/provider，不修改真实账本、运行文件或预算。当前 phase40 累计实际 35395421µ/H0；新的完整 5M 窗口须另获批准。本项不作新预算决策。

## 接口与数据

新增一个 host 工具 `write-game-design`，唯一目标为 `authors/design/design.json`，`readOnly:false`，SDK `executionMode:'sequential'`。

- `save({operation:'save',design:{...}})`：完整替换设计对象。作者须提供结构化 JSON object；遗漏字段不保留。允许不完整草稿和待修正的 schema 内容。
- `set({operation:'set',section,value})`：读取当前完整 JSON object，只替换一个指定顶层 section；该 section 内旧值全部丢弃，其余解析值保持。不是深合并、数组追加或 JSON Patch。

普通 `game-design/2` 的六个 section 及原完整类型如下：

| section | 原设计 schema 类型 | set 最小形状 |
| --- | --- | --- |
| summary | string | string |
| implementationNotes | string[] | array |
| acceptanceMapping | Record<string,string> | plain object |
| experienceMapping | Record<string,string> | plain object |
| characters | {id:string,purpose:string,states:string[]}[] | array |
| audio | {id:string,trigger:string,loop:boolean}[] | array |

`set` 只校验所选字段的最外层容器；内容、ID、非空、数量、覆盖和语义仍由原 `validateDesign` 决定。`save` 只要求设计为 JSON object，保留作者记录无效草稿并接收既有反馈的能力；它不自动过滤未知字段。`set` 也保留其他字段（包括尚待作者纠正的无效字段），不借保存清洗内容。

参数 schema 使用一个 provider 兼容 object，`operation` 判别、可选 `design/section/value`，顶层 `additionalProperties:false`。执行时拒绝未知或当前操作不适用的参数。`section` 只允许六个字面值；不接受 path、requirement、authority、URL、脚本或任意属性路径。未提供 value 与显式 null 区分；null 不是任何已知 section 的合法最外层形状。

复用原 plan writer 的 JSON-only 检查，拒绝 cycles、undefined、function、bigint、非有限数、symbol、getter/setter、非枚举属性、稀疏数组、非普通 prototype、自定义 serialization。只抽取该已有检查为小 helper，调用时保留 plan 原错误文字和行为；不抽象整个 writer、不引入依赖。合法字符串中的嵌套引号、反斜杠、换行和中文由 `JSON.stringify` 原样表达其值，不进行手工转义或内容修复。

## 文件、安全与反馈

完整读取使用 `regularFile` 和 fatal UTF-8 解码，固定范围写入复用 `createWorkspaceTools`。保留 UTF-8 BOM 与已有 CRLF/LF 风格。非 UTF-8 文件无论 save/set 均拒绝，不能自动转换。set 遇到缺文件、坏 JSON、非 object 顶层或非 JSON 数据时拒绝且不改文件；错误提示明确要求作者显式 save。save 可以明确替换坏 JSON 的 UTF-8 文件，但不会读取后尝试修复其内容。

沿用 `designHostTools` 的真实 task/workspace/attempt/requirement source/authority/deadline guard；操作前和写入前都检查，保留 signal、controller、work 的取消行为。新工具须在原 design ownership 内，其他角色/reviewer 不获得工具；只读收尾沿原 SDK 路径无活动写工具。一次 SDK 回复中的多次 set 按顺序执行，避免 read-modify-write 丢更新；不承诺外部并发 writer 或自动重放幂等。

保存成功显式调用同一个 `check.afterFileWrite`，返回“已保存草稿”及现有 advisory 反馈。原 factory hook 只处理 raw write/edit，不能假设它覆盖新工具。无新 approval、capture、acceptedCandidate 或费用状态写入。完整设计 schema、执行计划结构/覆盖/checkpoint、捕获与独立 review 均不变；部分草稿可保存但仍必须被拒绝接受。R22 的 checkpoint selector-string 错误也不会因此变成有效对象。

## 持久化选择与兼容

采用现有 `ordinaryPlanAuthoringPolicy` 字段的新显式值 `structured-design-plan/1`，与 `structured-plan/1` 并存。新普通、未模块化且非 preparation/fixed validation/continuation/inherited 的运行在付费 planning 前的 `planning-started.json` 与之后 `execution.json` 保存该新值。

| 冻结值 | 设计作者工具与规则 |
| --- | --- |
| 无字段 | 完全保持原 legacy 工具、原规则与恢复 |
| structured-plan/1 | 原 write-game-plan；`ORDINARY_PLAN_AUTHORING_RULE` 字节不变；没有新设计工具/规则 |
| structured-design-plan/1 | 原 plan 工具与规则，再加一次 write-game-design 和一次新的明确设计作者规则 |

新设计规则说明优先结构化 save/set、set 的整字段替换、保留其他字段、partial draft 不等于批准；保留 raw read/write/edit。保留旧 plan 规则可避免重复整段计划提示与改变旧 canonical marker。新工具只由已验证持久化选择决定，不从 brief、普通提示子串、工具名称出现、task ID 后缀或 revision 文案推断。

扩展现有 policy/task 验证，按上述三态精确核对各专用工具与规则出现次数、角色和匹配关系。planning/execution 不一致、未知值、字段被删除却有新工具/规则残留、从新值降级为旧值但残留设计表面、工具/规则缺失或重复都拒绝。两份标记同时删除仍须由冻结 task 的专用表面检测。无 execution 的恢复保持拒绝，不重新付费 planning、不迁移或回填历史任务。

修订任务从原设计任务继承冻结选择和工具规则；仅原已绑定 revision workspace 才显示 seeded-revision 提示。旧值的初稿和修订均不升级，新值的初稿和修订均受相同 guard。原 requirement binding、资金、截止、grants、request/output caps、finalization、capture 布局与历史会计保持。

## 取舍与验收

选择扩展现有字段值：复用冻结与恢复边界，改动小且旧证据含义明确。直接修改旧 canonical 规则会破坏历史绑定；新建第二 policy 字段会引入重复组合状态，均不采用。本设计遵循 ADR0005 已接受的宿主序列化、草稿语义及旧任务不回填边界，没有新架构决策，不另写 ADR。

验收为 SOURCE/TEMP/fake transport 范围：真实 scoped writer 的字符串往返和整字段替换；恶意参数、非 JSON、路径/编码/取消/lease/read-only 拒绝；现有 schema/checkpoint/独审仍拒绝；三态新旧规划、恢复与 revision 选择；实际 factory + Pi SDK fake fetch 的 R22 形状 payload 及同回复多个 set 无丢失。通过只能说明工具边界和兼容性，不证明模型会选择工具或完成设计，不计为游戏通过。
