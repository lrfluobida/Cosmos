# COS148：独立评审单次纠正的固定输入诊断

状态：Root已依据唯一字段实证批准最小实施，不增加额外计划审批。登记期间，review_input_correction_reviewer已对固定 `6c175bc6aafc72a9e680e795542d29286250fdad` 给出APPROVED_SOURCE_SCOPED、无finding，Root批准随后唯一集成；当前尚未集成或发布。只增强原唯一correction的可信有界诊断，strict/预算/record/0|1上限保持。

任务：[COS148 / #149](https://github.com/lrfluobida/Cosmos/issues/149)，id6094791306，原生父COS18/#19未勾；依赖[COS138 / #139](https://github.com/lrfluobida/Cosmos/issues/139)及[COS141 / #142](https://github.com/lrfluobida/Cosmos/issues/142)。作者review_input_correction_implementer，native辅助review_input_correction_replay，独立源码reviewer review_input_correction_reviewer，唯一merger planning_budget_merger。

Root批准输入SHA256：spec `ac99996c9aafa7911f9ecd1baccdfdc5020db9026f30efcea0e0f5bca031d936`；plan `34c6fd463726a020efe1a5b83abdfb0e652c216683041f8acb8c286117958a64`。

基线runtime6d92bbe1cf2bbc0de26f8c80abba21f81a638513。GitHub身份已登记，SOURCE pending。父COS18/#19；依赖COS138/#139(id6055871918)及COS141/#142(id6083423627)。

## 固定实证

R14永久PASS_CLOSED，source6d92。原始review native：.cosmos/public-validation/room-20261029-reuse-14/run/sessions/849a2864-8630-43d7-9e12-068fa228dc0d/review/2026-10-29T06-00-40-232Z_01a1863f-0828-7031-a058-0c2d53ad72cf.jsonl。
第16/24行均完整JSON、stop而非length；两份唯一最早错误是$.inputVersions[5]额外加入design-game-host-report。前5refs精确匹配固定task.inputs+artifacts；host证据在evidenceIds另行引用。原纯parser都拒绝；仅内存删该第6项后都通过parseDesignConcernReview/parseReview，仍changes_requested、7findings、空concernResolutions。没有写回或接受旧review。
唯一correction已实际使用：第17行重发协议，不告知错误字段/预期列表；后3请求仍重复错误。protocol.ts catch丢弃parse error，orchestrator提供静态专用协议。该反馈缺口是修复对象；strict门槛正确。
诊断与纯复现：.cosmos/planning/review-reply-reuse14/{diagnosis.md,replay.mjs}。planning41818+author354335+review223073=619226µ；review correction子集50761µ。shared3393/C28948131/H0，phase40、每次5M/30min、总验证150M保持。新paid未准备。

## 最小行为

1. 保留parseReview原exact inputVersions判定（含顺序/数量），不得接纳额外host-ref、自动删除/填充引用、改原verdict/findings、替换旧输出或放宽任何schema。
2. 当这一特定检查失败时，产生窄、可信、可区分的诊断：字段路径（数组第一个不一致处，R14为$.inputVersions[5]；非数组等用$.inputVersions）、原解析失败原因、完整精确expected inputVersions及可用host evidence ID通道提示。所有预期值来自冻结task/packet；不硬编码design-game或某个游戏。
3. requestReview只将该已知诊断带入既有唯一correction，保留原通用/专用协议、原独立判断与真实缺陷要求。补充明确inputVersions恰等于packet.inputs，不能因为读过host evidence就追加其source ref；host证据另用记录的evidence IDs。若host-report本来就是固定packet.inputs的一项，照原expected列表保留，不按命名猜类型。
4. 诊断补充有界（建议最多4096 UTF-8 bytes），不复制整个模型回复或thinking，不把任意异常文本、stack或未知对象回显成可信指令。expected列表放不下时明确省略数量并指回原packet.inputs，不截成假完整JSON。字段/index/count须安全处理坏值；只输出可信expected数据及有限位置/数量。
5. 默认及其他parse错误保持既有行为；若共享同一个inputVersions检查的通用review路径可复用该诊断，其schema/权限和纠正上限仍不变。兼容已提供的correctionPrompt专用协议，不丢失它或新增模型操作。
6. 不增加新的工具、协议版本、retry、record、model配置或预算；maxCorrections仍0|1、同一个reviewer actor/context/native session、原review-correction.json格式/用量/持久化前置不变。provider/timeout/admission异常仍在parse catch之外，不变成可纠正错误。第二份仍非法则原样失败，不再调模型。
7. 原解析拒绝和有效返回结果保持；可用窄typed error或等价内部数据传递，避免为了取诊断再写一套review parser。不得改真实R14、原字段或账本。原始完整reply与失败证据保留。

## 必要验证

- 使用实际parser/R14两原文的RED证据：现有correction缺路径/expected；新correction出现正确路径及5个exact refs，host evidence引用通道清楚；两份原文仍被原strict拒绝，不能因诊断而通过。
- 单次成功与二次失败、0纠正、已有/部分correction record、inactive authority/deadline/unknown/provider error代表；只复用或跑受影响最短测试，不扩完整旧矩阵。
- missing/extra/reorder/nonarray inputVersions定位、超长expected列表明确省略、未知异常内容不回显、专用协议不丢失；其他拒绝/接受行为不变。
- 原R14 native最短两分支：原响应全部不变仍invalid且只有一次correction；另保留原前7响应/读取/用量与原grant，用明确synthetic最后回复只改为正确fixed inputVersions，其7 findings/verdict不变。实际factory/Pi/SDK、只fake fetch，记录新增诊断对inputBytes/cap/quote的影响。末次usage如重放原数值需明示fixture用途，不称新真实用量；不得调grant/usage来掩盖容量问题，原budget guard真实运行。若完整原轨迹的复用需要已存在fixture适配，保持依赖最小并先报范围。
- 输出仍changes_requested才算该正分支通过；不得转成approved或称7findings已经语义核实。可接受结果是协议纠正机制成功，不是游戏完成。
- typecheck/build、相关新测试严格类型、独立actualdiff审查，唯一merger有限集成与发布；旧有效source证据复用。

预计文件：runtime/repair/protocol.ts与runtime/orchestrator.ts的窄异常/反馈接线，必要小helper及聚焦tests。原design/coding concern协议和资金/角色provider原则上不改。无新ADR：这是现有纠正消息的有界改进，不改变领域边界。
