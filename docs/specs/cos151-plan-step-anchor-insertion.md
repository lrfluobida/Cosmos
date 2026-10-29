# COS151：按现有步骤锚点插入计划步骤

状态：Root按R17实证和接口可行性直接批准最小兼容扩展，不追加独立plan审批；SOURCE pending。作者plan_step_insertion_implementer已开始，独立源码reviewer plan_step_insertion_reviewer将在候选固定后审actualdiff，唯一merger planning_budget_merger。仅append可选afterStepId，不改原冻结规则/权限/预算/strict，不证明模型采纳或语义成功。

任务：[COS151 / #152](https://github.com/lrfluobida/Cosmos/issues/152)，id6099354043；原生父COS18/#19未勾，依赖[COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148)。runtime基线 `5619429c8882bd381140211f701740474e44a1f6`。

Root批准输入SHA256：spec `829cdf7801c9105a29ff5b11ffc4df5d708523a817971bdc1ef1e531da075857`；plan `fb02fbd6c6bf4b7b4bd3b586d678b2ea7d424f4a49433c631b90dbc774168e30`。

## 依据

R17永久PASS_CLOSED：模型曾用原工具建立main190/reopen76，准确反馈只剩reopen的一处checkpoint可见断言；随后raw write清空重建，最终85/0，无passed/handoff/review。没有SDK丢edit/预算回收bug，守卫正确。当前工具只有整份save和尾部append，局部插入依赖exact-text编辑；本卡提供保留已有数据的局部插入路径，不声称能阻止模型仍选择合法raw重写。
证据 .cosmos/planning/author-handoff-reuse17/diagnosis.json。共享3399/C31442050/H0，phase40/单次5M30min/总150M及原room12v2不变。所有旧runs1–17关闭，当前无paid或下一运行准备。

## 兼容扩展

- 仍只有save/append两种operation。给append新增可选afterStepId（本地Type.Optional(Type.String)，非空字符串）；无该字段仍按旧尾追加行为。
- 有anchor时，只在stage指定的main或reopen步骤数组中查找唯一现有step.id，立即在其后插入作者给的整个steps数组，保留该批顺序以及所有未涉及数据、另一阶段、checkpoint、viewport、固定envelope/ref。另一阶段的同名ID不造成歧义；绝不把anchor当路径/JSON Pointer/脚本或生成新断言。
- 缺失/重复anchor、目标阶段未存在/无法定位、错误类型或空anchor在写入前拒绝，文件不变。reopen尚未建立时有anchor就拒绝，不因checkpoint参数而创建新阶段。原source/envelope/container检查和已有checkpoint相等性要求保持；不允许借anchor默默换checkpoint。
- save不接受非null afterStepId。SDK现有strict wire将可选字段编码为required+nullable，原normalizeOptionalNulls会去掉原local schema不接收的可选null；因此save或旧append的wire null等同未指定。不能把本地schema改成String|null，不手工改模型参数或SDK转换。直接本地API仍遵原可选字符串类型。
- executionMode sequential保持。连续两次用同一anchor：先插B再插C，结果A,C,B；若要顺接，后一调用锚定上一批最后一步。描述需清楚，不增加隐式游标、状态或排序。
- 固定唯一输出authors/design/acceptance-plan.json、host绑定的ref/envelope、两段guard、完整安全读/scoped writer/UTF8+BOM/EOL、JSON-only、原strict afterFileWrite反馈和independent review均保持。原save/raw write/edit权限和语义不改，不禁止合法完整替换，不回填旧稿。
- 工具名、ORDINARY_PLAN_AUTHORING_RULE、冻结task.context.tools/rules及structured-plan/1不改。当前冻结鉴别不含description/params；新增可选参数是旧参数语义不变的兼容便利操作，不加policy/budget/nonce/retry/新文件。若实际代码存在反证先报Root。

## 验证

1. 真实writer新anchor插入的RED→GREEN；main/reopen各插入、数据/顺序/中文/checkpoint/另一阶段不变；无anchor仍尾追加、save仍全替换且未自动accepted。
2. 缺/重/跨阶段only anchor、未创建reopen、空/非法anchor、save带非null anchor、错误source和guard拒绝均不写；其他stage同名id可正向定位当前stage。原checkpoint不同仍拒绝。
3. 真factory/Pi/SDK fakefetch同reply连续调用：后一anchor可引用刚插入ID；同anchor明确顺序。验证实际wire nullable及SDK原null规范化，原schema其余字段/legacy保存与未指定anchor不变，无手工参数偷换。
4. 需要原稿例时，仅在TEMP重放R17近完整190/76并由测试明确synthetic提供缺失断言，插入前/后跑原pure strict，所有其余数据、原件字节/hash保留。这个对照只证明接口能表达一次局部修正，不是旧run被修复、模型真实生成或游戏语义通过。禁止修改原稿/旧账本/真实provider。
5. typecheck/build、聚焦测试strict、必要旧writer/guard/sequential/policy短代表；其余有效矩阵复用。实际diff独审，唯一merger有限集成；候选冻结先交审，私有原稿例可并行补。

预计仅entrypoint-plan-authoring.ts与聚焦tests。只加可选anchor、描述和数组插入，不做通用编辑器/replace/delete/configure框架，不新增依赖/资金协议，也不改原validator标准。无新ADR/CONTEXT。
