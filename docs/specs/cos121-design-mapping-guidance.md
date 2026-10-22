# COS-121 · 明确设计映射结构与校验反馈

状态：设计与计划已独立审查批准；源码实现待独立评审。任务 [COS121 / #122](https://github.com/lrfluobida/Cosmos/issues/122)，id5974242973；父 COS18 / #19。基线 `ffd7ad735c0b51003feb8c78e5b82e757f009ac1`，runtime `b1b168fb13f67f229e94fc4cd825bdbea754a3f0`。用户已授权持续开发可复用 Cosmos，本卡只做免费源码工作。memory、room1–5 均永久关闭。

## 问题证据

room5 的实际 v2 经真实用户确认后启动。规划用两次请求生成有效计划并登记三项任务；design 用完 16 次请求后，原 native 最后一条为零 usage 的 `Session request limit reached`。最终被记录为 author_handoff / insufficient_evidence，无设计 capture/review，美术和编码未开始。

最终 design.json 的 acceptanceMapping 仅有字面键 `gameplayId`，experienceMapping 仅有 `criterionId`，值均为 ID 数组。`entrypoint-host.ts` 的现有提示恰使用 `{gameplayId:string}` 与 `{criterionId:string}` 伪类型；`entrypoint-media.ts` 把 mapping 与 summary/notes/媒体清单合并报错，缺少具体字段信息。只读内存隔离已证实：原设计报通用错误，仅将 acceptance mapping 换为实际 ID→字符串后报 experience 错误，再仅换 experience mapping 后结构校验通过。这不证明设计语义或游戏通过。

两次显式自检分别报不完整 JSON、通用覆盖/媒体清单错误；后续成功 write/edit 的自动反馈持续报告后者。实际 acceptance-plan 只有 10 个初始状态断言，无 reopen，另 8 个缺失验收 ID 已能由现有计划 validator 具体报告，本卡不改计划 validator。

本次 79.755 秒后 incomplete；22 笔累计 228462µ，已按原 API 停止结算并释放 4771538µ。独立 PASS_CLOSED：child117/shared3346，held/reserved/unknown=0。证据在 `.cosmos/public-validation/room-20261022-5/generation-execution.json` 和 `generation-closure.json`。不得重开该运行或回填作者文件。

## 设计

### 1. 让 mapping 的含义明确

只修改 `src/runtime/entrypoint-host.ts` 中设计角色的契约提示：

- 去掉会被当作真实键名的 mapping 伪类型；明确两个 mapping 都是 JSON 对象，键逐一对应可信输入中的实际 ID，值是说明具体设计的非空字符串，不是 ID 数组或嵌套对象。
- 用当前完整 gameplayIds 和 ordinary experience criterionIds 动态构造一个合法 JSON 映射示例，使用 JSON.stringify。例值明确标为待作者填写的说明，不能称作已经完成的设计或验收证据。
- 示例保留实际 ID，包括中文、引号等；不写死小屋、PvZ 或任何一个测试案例。ordinary 的空体验清单生成 `{}`；非 ordinary 不附加 experienceMapping。若真实 ID 恰与元标签同名，仍按真实 ID 集合处理，不新增保留词。
- 不代写玩法、媒体设计或实际 mapping 说明。保留原要求来源、输出路径、host IDs、角色工具、预算、16 次上限、时钟和后继政策。既有其他字段及 modular 规则不扩展。

### 2. 给同一 validator 提供具体诊断

只修改 `src/runtime/entrypoint-media.ts` 中原 validateDesign：

- 将两个 mapping 的判定从混合条件中分离，使用本文件内的小函数。继续使用原 text 谓词（非空、最多 16000 字符）与精确 ID 集合；不做自动转换、补键、删键或修复输出。
- 对错误容器指出字段需要对象；不接受数组、null、字符串等错误容器。
- 对对象的错误指出字段名、缺失 ID、额外键、非字符串值所在键，以及空白/超长字符串所在键；显示适用的诊断，不仅输出笼统的“覆盖错误”。诊断可同时列出一个 mapping 的多个问题。
- 诊断必须有界。仅列有限数量的键、截短异常长键并说明剩余数量；最终消息设置固定上限，正常短 ID 应可见。不得把完整值/文件内容塞入错误。
- 保持 summary/notes、modulePurposes、媒体数量/命名/状态和其他 schema 检查；legacy 仍拒绝不属于其契约的 experienceMapping。完整 capture、独立评审和可执行验收继续是通过条件。

复用 `entrypoint-design-check.ts` 的显式自检与普通 write/edit 自动反馈，不新增工具、回调、validator 或诊断框架。现有最多 8 条/4096 字符和只读 advisory 语义保持。

实现边界：每类问题最多列出 3 个键并注明其余数量。JSON 转义后超过 96 字符的键只显示前 12 个字符并标记截短；整个 mapping 错误固定最多 2048 字符。仅输出键名和问题类型，不输出 mapping 值。仍按原顺序检查主设计、模块、体验和媒体；修正 acceptanceMapping 后，原调用会继续报告 experienceMapping 的问题。

## 验收

1. 从真实 host 角色规则提取动态 JSON 示例并 JSON.parse；至少两套不同实际 ID，包含需要转义的 ID，验证完整键集合、字符串占位值、空体验和非 ordinary 分支，原 16 次及工具/预算约束不变。
2. 原 `gameplayId:[...]` / `criterionId:[...]` 错误形状获得字段和具体缺失/额外/非法值信息；正确键但数组、空白/超长值、错误容器均拒绝；正确中文字符串映射通过，原其他严格门禁保留。
3. 原显式自检与真实 write/edit 自动反馈都能传递同源详细诊断；诊断仍有界、只读，不改变捕获或评审结论。
4. 仅运行受影响测试、typecheck/build、变更测试 strict 及 UTF-8/中文/diff 检查，复用未变证据。独立 reviewer 先规格再质量，唯一 merger 合并并发布记录。

## 范围限制

不提高调用/费用/时限、不新增实际恢复或付费运行、不修改 provider/模型、不追逐全部偶发工具错误、不手写目标游戏。清晰提示和反馈能消除已确认歧义，不能保证模型完成设计或生成游戏。
