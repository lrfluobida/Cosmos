# 普通设计候选携带 concerns 独审 Implementation Plan

状态：独立 `design_candidate_review_reviewer` APPROVED_PLAN、无P1/P2，Root批准固定设计、免费源码实施与登记；source pending。原文待审/未授权源码或登记字样属于批准前记录，当前状态以本段为准；未授权真实模型、旧run恢复或费用操作。

任务：[COS137 / #138](https://github.com/lrfluobida/Cosmos/issues/138)，原生父COS18/#19、未勾；原生依赖COS134/135/136。作者 `ordinary_design_revision_implementer`，独立reviewer `design_candidate_review_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`5360db3938ca50b7ca9bb57bdc7b9d99669e2ddfc59d15c69386bd8ec61e87af`
- 批准计划输入 SHA256：`5fe65fa49422ae7616334331ab02a8b973b3920244e1422f32744f02e86e3340`

Root批准的计划Task3权限解释：先持久化完整review，再由system依据固定回执派生attempt/handoff；reviewer只保存review/state/evidence，不获得改写作者报告或直接清空handoff的权限。

工程基线 `14adda9a795de23111dc9e407b9219473306b75f`，源码组合 `aa50ecd1a18fc88fed5a27e8966cdcdddde34a38`。[reuse-3实际结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6434074975)保持：只读收尾实际成功但游戏仍incomplete，原run永久关闭，不resume或重复settle。本卡只改新策略评审准入与来源证明，不改原预算、次数、验收或旧execution。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新普通design在`independent-review/2`下，把冻结候选和原作者concerns交给现host检查与独审，并接通COS134唯一修订。

**Architecture:** 扩展现`ordinaryDesignRevisionPolicy`版本；新局部design-concerns模块认证原报告和逐项review结果。保留旧/1、原预算/计数/时钟与所有验收，原作者回执不改写，批准状态由完整review证明推导。

**Tech Stack:** TypeScript、Node22、现Node test、pinned Pi SDK0.99.2、既有write-once journal及TEMP fetch假SSE。

---

状态：私有计划草案v1，2026-10-27；配套[正式规格](../specs/cos137-ordinary-design-candidate-review.md)待Root和独立reviewer批准。下列checkbox是未来实施步骤，本次只写这两个文档，不实施、不建GitHub、不启动真实run。

## 0. 固定边界与文件职责

基线`14adda9a795de23111dc9e407b9219473306b75f`。实施者使用Root指定的独立managed worktree及`codex/`分支；独立reviewer读取真实diff，唯一merger负责最终main集成。各阶段提交后续补丁，避免多人改同一认证链。

| 文件 | 改动职责 |
| --- | --- |
| `src/runtime/repair/design-concerns.ts`（新） | 原作者/capture来源、稳定concern索引、精确resolution parser、回执重算 |
| `src/runtime/orchestrator.ts` | 仅/2普通design评审准入、当前host验证、review packet、回执后状态派生和恢复 |
| `src/roles/factory.ts` | 固定review数据和原文进入真实packet；专用schema提示；仍用原review预算和独立身份 |
| `src/runtime/entrypoint-design-revision.ts` | /1与/2认证、feedback/selection/唯一revision证明链 |
| `src/runtime/entrypoint.ts`、`entrypoint-host.ts` | 新入口选择/2，resume保留原值，绑定当前合法普通design |
| `src/runtime/recovery/task-journal.ts` | 只在/2 design的既有origin镜像同名policy；旧字节不变 |
| `src/runtime/entrypoint-successors.ts`、`continuation-plan.ts` | /2历史来源认证，不把新能力授予当前repair/window |
| `tests/runtime/ordinary-design-candidate-review.test.ts`（新） | 实际host/capture/独审/唯一revision/恢复的SOURCE代表 |
| `tests/roles/design-concern-proof.test.ts`（新） | 原文与resolution证明规则的定向负例 |
| `tests/providers/design-candidate-review-budget.test.mjs`及fixture（新） | 完整R3材料进入真实SDK、fake transport的容量测量 |
| 现ordinary-design/revision/budget fixtures及affected tests | 小范围追加/2选项，固定旧/1兼容代表，复用有效证据 |

类型只能为同一policy扩展/1|/2。必要时导出统一类型/判定函数，不新增平行feature flags。优先复用现公共函数，不改变coding-concerns的权限或通过规则。

实施前按UTF-8严格解码检测将改文件，保留BOM/换行与中文。非UTF-8先停并报Root；最小patch，改后重读。所有测试使用TEMP独立root；不得调用真实R3 controller、ledger、store、stop、settle或resume。

## Task 1: 锁定版本与来源的失败代表

**Files:** 新`tests/runtime/ordinary-design-candidate-review.test.ts`；现`tests/runtime/ordinary-design.fixture.ts`、`tests/runtime/ordinary-design-review-revision.test.ts`。

- [ ] 从既有ordinary fixture创建新/2小候选，合法proposal保留一项remaining与一项uncertainty；断言现在在review前停止，明确当前RED来自未支持/2或旧gate。
- [ ] 固定旧/1相同proposal仍失败，author/capture保留、review/art/code派发0；加缺省/null/unknown以及非design/validation/window范围负例。
- [ ] 建立R3只读材料清单：完整两capture文件、完整requirement draft/confirmation、author及correction来源。检查spec记录的两文件byte/hash及3+4条concerns，原文件不改。
- [ ] Run: `node --experimental-strip-types --test tests/runtime/ordinary-design-candidate-review.test.ts`。保存每个RED的原因；不得把未知版本异常冒充全部行为已测。
- [ ] 提交仅fixture/失败代表，报告SHA和未实现点。

## Task 2: 作者来源与逐项独审协议

**Files:** 新`src/runtime/repair/design-concerns.ts`、新`tests/roles/design-concern-proof.test.ts`；必要类型位于`src/roles/factory.ts`。

- [ ] 先写原文索引测试：remaining后uncertainty、重复和空文本不丢失；summary逐字保留；ID/field/index能确定性恢复3+4原文。
- [ ] 写来源负例：author/response reply变化、wrong task/attempt/actor/context、capture签名/时间不符、correction单边缺失、预算unsent native来源变化、record存在但重算不相等。
- [ ] 写resolution负例：少一条、重复ID、未知ID、改concernText、无依据、错误refs、旧/失败host evidence、pending future checks、approved但unresolved/非空findings；顶层原parser仍拒绝错版本或证据。
- [ ] 写正例：需求职责判断fixed_input、最终内容判断captured_output、实际结构结果host_evidence；全部resolved但其他真实finding仍须changes_requested；空concerns仍要求完整四字段review。
- [ ] 实现spec§4/§6局部类型、来源认证、write-once记录和parser；只复用现读取/签名工具，不创建模型classifier。
- [ ] 原报告只发送一次，concern以field/index索引避免重复文本；保留格式纠正前raw originalReply，预算收尾原身份与unsent认证。不要扩大任意journal读取权限。
- [ ] Run: `node --experimental-strip-types --test tests/roles/design-concern-proof.test.ts`。GREEN后回看所有实际证明refs；提交SHA。

## Task 3: 新policy、origin与真实host独审接线

**Files:** `entrypoint.ts`、`entrypoint-host.ts`、`orchestrator.ts`、`roles/factory.ts`、`recovery/task-journal.ts`；Task1测试。

- [ ] 先写resume保留/1、旧缺省不升级、/2 origin与execution单边改动拒绝、art/coding及window无豁免的RED。
- [ ] 将现ordinaryDesignRevisionPolicy扩展/1|/2；新可信入口选/2；resume按原实际枚举传递，禁止truthy后硬编码最新值。原finalization/budget policy不变。
- [ ] 只对/2初始或原唯一revision design生成同名origin镜像；缺省、/1和其他角色不新增字段。
- [ ] 在真实capture后建立design-concerns；仅该合法范围放行原remaining/uncertainty gate，其他路径不变。
- [ ] 真实host verify先行，verified绑定当前版本；failed/missing/tampered证据零review派发。
- [ ] factory将完整proposal、索引、必要原始自述送入真实review packet；采用spec逐项schema和全scope检查提示。reviewer仍使用当前原budget、16请求、4096..8192输出选择。
- [ ] 复用requestReview原唯一protocol correction，并为新schema传入专用correctionPrompt；不新建review session。
- [ ] 完整review先落回执，再在原reviewer写权限内推导task.handoff和state。测试中断后不能得到无review的空handoff/accepted状态；恢复不重跑已通过host检查。
- [ ] Run Task1与Task2测试。检查原proposal/捕获/需求字节仍等于输入；提交SHA。

## Task 4: 认证唯一次revision与历史读取

**Files:** `entrypoint-design-revision.ts`、`entrypoint-successors.ts`、`continuation-plan.ts`，必要只读consumer调用点；runtime测试。

- [ ] 先写当前authenticateDesign因非空作者数组/扩展verdict拒绝的RED，并用真实record链而非手填task.state。
- [ ] 实现/1旧分支、/2完整proof分支。/2核验原proposal、design-concerns、host evidence、逐项review和派生handoff；不能只删除空数组检查。
- [ ] 将concern及存在的author correction回执签名加入现receipts；feedback保留`independent_model_review`身份，完整携带真实findings和来源。
- [ ] revision-plan/selection/repair-plan写入实际policy原值，精确检查execution/native plan/refs/receipt bytes；不另建policy manifest。
- [ ] 小合成fixture走changes_requested→原唯一revision→真实文件变化→重新capture/host verify→fresh独立review→selection。新review必须读取原feedback和旧design接口并核对拒绝点；成功后art/code只读取选定v2。
- [ ] nochange在第二次review前停止；revision再次拒绝/invalid/host失败则无第三作者/设计review，也不消耗codingrepair槽替代设计修订。
- [ ] 为codingrepair与supported continuation认证历史/2 design来源；当前repair/window role配置不得获得design候选豁免。原/1链继续读取，completed delivery用同一认证入口。
- [ ] Run: `node --experimental-strip-types --test tests/runtime/ordinary-design-candidate-review.test.ts tests/runtime/ordinary-design-review-revision.test.ts`。提交SHA与affected证据。

## Task 5: 冷恢复和完整R3语义负例

**Files:** runtime候选测试及必要fixture；现recovery代表。

- [ ] 按spec§8注入：capture完成/concern未写、concern已写、verify-started、verified完成、review-started、correction-started、review完成task未更新、revision/selection完成。
- [ ] 完整回执只复用；不完整或被改签名阻断；缺concern仅在原capture完整且无review后继时确定性派生，不能修补原来源。核对每次恢复provider请求计数没有增加已完成/未知的操作。
- [ ] R3原字节在TEMP完整capture，7concerns逐字进入实际review packet，真实host结构检查通过；fake reviewer返回六项实际缺口及逐项resolution。该SOURCE只断言changes_requested和原一次revision准入，不批准、不修R3。
- [ ] 用独立小合成fixture完成revision正例；明确与R3负例分开。不得把目标游戏写好来声称Cosmos生成成功。
- [ ] 加原始/1记录、新代码不补字段、unknown/null、旧stopped/expired/unknown费用无新dispatch的代表。真实R3不调用任何恢复入口。
- [ ] Run新增runtime/proof测试及`tests/runtime/ordinary-design-budget-finalization.test.ts`中受影响的原single-slot与repair/continue代表；复用其余无变化证据。提交SHA。

## Task 6: 完整原生输入报价与计数验收

**Files:** 新`tests/providers/design-candidate-review-budget.test.mjs`及fixture；参考现`design-review-budget.fixture.mjs`、`ordinary-design-budget-finalization.fixture.mjs`和`tests/providers/pi.test.ts:25`的fetch假SSE，不改生产预算算法。

- [ ] 建立独立TEMP root和合成run/task/ledger/native身份；从R3只读复制完整需求、design23534B、plan44489B、原summary和3+4concerns。材料来源原hash单独记录，TEMP身份明确不是旧run的恢复。
- [ ] 用真实createRoleFactory/createPiSession/pinned SDK和生产read工具，**仅替换fetch返回假SSE**，保留原streamSimple与最终HTTP序列化；使用测试专用凭据及封闭fetch拦截，任何非fixture网络请求直接失败。实际生成host证据，保留生产compactFullJsonReads，不伪造read返回值或截断材料。
- [ ] 双层记录每轮生产requestInputBytes、cap、estimate、计数、usage/计费，以及实际SDK HTTP body字节和完整tool responses。首轮、读完整10个固定文件及host evidence后的verdict回合、一次原protocol correction回合都测量；body字节不代替报价inputBytes。
- [ ] 固定TEMP起点：grant1125000µ、已结544313µ、reserved/unknown0，可用580687µ；375000µ仅保留历史作者reserve语义，不能硬设成reviewercap。
- [ ] fake reviewer必须真实调用read工具读完全部10文件，保留direct与bundle等不同ref的重复内容；检查覆盖和内容重构完整，不能仅assert packet含文件名。只读准备值170142源字节/152817read文本字节只作核对基线，不冒充request大小。合法changes_requested保留六缺口与7resolution，不制造真实语义批准。
- [ ] 按原实际quote选4096..8192；每轮结算采用明确标注的非零合成usage，至少含较高输出/完整纠正分支；另单列此前各轮按完整quote结算的保守分支，如实报告是否完成和首个拒绝位置。不得沿用1 input/1 output假低费用给出可负担结论。检查每次报价适配当时剩余及原16请求；资金不足时零transport，并保留原已用计数。
- [ ] 验证未增加作者32、reviewer16、correction1、revision1、原deadline/cleanup，不通过不能裁剪concerns、降floor或加钱。
- [ ] Run: `node --experimental-strip-types --test tests/providers/design-candidate-review-budget.test.mjs`。保存单独JSON/text SOURCE报告，列完整材料hash/字节、每轮实际inputBytes、cap、quote、合成usage假设、settled与余量；不得声称已获真实模型批准。
- [ ] 若完整路径无法在580687µ下完成，报告最早失败回合和输入/报价，不自行变更spec。ROOT决定后续设计；旧run仍永久关闭。

## Task 7: 独立review与集成验证

- [ ] 重读所有改动文件确认中文/UTF-8/换行无损；检查diff仅限上述行为和必要来源认证。
- [ ] Run: `npm run typecheck`；Run: `npm run build`。期望exit0。
- [ ] 跑新增proof/runtime/native容量测试与受影响的旧/1、COS136和一次revision代表；优先复用仍有效的其余证据，不重跑全仓、浏览器或付费模型。
- [ ] 实施者提交精确SHA、测试输出、完整R3容量报告、旧政策/恢复证据与已知限制。独立reviewer先规格再质量，读实际diff和完整证据，不以作者summary替代。
- [ ] 有actionable finding时在原实施分支修复并只复查受影响点；不得在main直接修或由reviewer改实现。
- [ ] Root批准后唯一merger集成批准SHA，运行必要组合并记录结果。文档/任务登记及发布由Root另行安排；未经授权不建GitHub。

## 完成标准

源码范围完成需同时满足：/2普通design候选携带全部原concerns经过当前host和独审；严格拒绝假证据和漏答；真实缺口接通原一次revision，只有完整批准放下游；旧政策/历史认证/冷恢复不扩权；完整R3原生输入在规定原余额/计数下有可审报价证据。真实run3保持永久关闭，真实游戏与人类体验仍未完成。
