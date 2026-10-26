# 普通需求意图与设计后验收计划

状态：设计 `c4dcb56fc625322232733f44e4a63e0a34b3b406` 经 `ordinary_intake_spec_reviewer` 独审 `APPROVED_DESIGN`、无剩余P1/P2，Root已批准 [COS111 / #112](https://github.com/lrfluobida/Cosmos/issues/112#issuecomment-6298548379) 与 [COS112 / #113](https://github.com/lrfluobida/Cosmos/issues/113#issuecomment-6298549546)。文档合入 `b58ae7c44328a0aae8392f982e2ea164b9b6d3af`；基线 `1a99b265e9e10e96ae473d6156553de98e1ae771`，父 COS18。本次仅集成设计，源码由Root分阶段派发；两卡仍open。见 [ADR0004](../adr/0004-ordinary-design-acceptance.md) 与 [实施计划](../plans/2026-10-21-ordinary-design-intake.md)。

## 目标与边界

普通访谈确认游戏要求和验收依据，运行时设计再确定可执行计划。当前 `interview.ts` 要求访谈阶段选择 selector/坐标，`requirements.ts` 又要求全部非 host 条目有可见自动断言，混合了需求、设计和体验职责。真实普通 draft 的两次 length 结果只证明失败，不能证明此耦合导致模型截断。

本次复用原三任务或五任务 DAG、独立角色上下文、capture、review、正常 browser 输入、persistent consumer、媒体与渲染采样、原修复机会。不增加 provider、游戏专属实现、通用执行语言、动态随机决策或时间区间验收。已关闭的 `public-memory-20261021-1` 不得恢复；本次只有免费源码及受控测试授权。

## A：输入契约与体验要求（COS111）

### 版本及来源

新增 `OrdinaryProfile = 'ordinary-design/1'`，由可信 `ProductHost.ordinaryProfile` 仅在新建普通运行时选择；它不是 CLI 参数或模型输出字段。准备模式不得同时选择此值。`undefined` 保留原普通契约。

将同一 `ordinaryProfile` 保存于 intake snapshot、`intake-origin.json`、回答记录、interview intent、草稿和 confirmation receipt。`IntakeController.create` 提供对应可信选项。每次请求、确认、激活和恢复核对原来源；恢复只读原选择，不采用当前 host 的新默认。缺失或不一致的新版来源拒绝，不能退回旧版。旧文件无此字段时沿原解释，不重写或补造字段。

COS111 存储实现：`intake-ordinary-profile.json` 是只含 runId/createdAt/ordinaryProfile 的 write-once 来源，防止同时删除可选字段后降级；`readOrdinaryProfile` 位于 `src/runtime/ordinary-profile-source.ts`。新 confirmation 的 `ordinaryDraftSha256` 绑定实际验证过的完整草稿字节，覆盖不进入自动 acceptance 的体验内容；不增加预算事件或签名。最终报告的 ordinaryConfirmation 固定该来源和摘要，experienceCriteria 单列，完整确认仍由下述统一 reader 核验。

跨卡读取接口沿用并扩展 `readConfirmedGeneration(root, snapshot)`：实际读取原 origin/draft/confirmation，核对原 human decision、profile 和完整草稿后返回 `{ draft, requirement, renderFrames? }`。B 的 host 和 A 的体验绑定消费此已验证结果，不能只取得 acceptance 数组或信任调用方自报清单。

新增 `OrdinaryGameDraft`，保留原 brief/questions/answers/acceptance/unsupported、可选 codeProfile/benchmark 及主机选择的 classicEntry；包含主机注入的 ordinaryProfile 和必填 experienceCriteria，禁止 scenario/preparation。旧 BrowserGameDraft、PreparationGameDraft wire 保持。新模型 draft 的允许字段为 acceptance、experienceCriteria、unsupported、benchmark、codeProfile；禁止模型提供 profile、paths、确认或运行身份。

```ts
interface ExperienceCriterion {
  criterionId: string; description: string; steps: string[]; expected: string;
}
// 草稿：acceptance 为客观自动条目；experienceCriteria 为 0..100 个体验要求。
// 沿原非空文本/长度边界；criterionId 非空唯一，与 acceptanceId 不重叠。
```

仍至少有一项客观玩法 AC。host stages 和 modular stages 由原主机加入并同版展示。客观自动条目沿 `RequirementContract.acceptance` 和原 planner 全覆盖规则；不改变 TaskContract 通过语义。完整已确认 draft source 保存原问答、两类要求和 unsupported。不能仅靠 schema 证明分类正确：访谈必须保留每项请求，后续独立 design review 检查完整来源，禁止将客观要求放入体验列表逃避自动检查。

### 确认、模型配置和体验

展示客观条目、体验条目、未支持项、原预算/时限/模块与采样选择；说明执行步骤由运行时设计确定。真实 stdin 仍只能确认当前完整 revision，unsupported 非空仍阻止确认与生成。不得用占位 scenario 通过旧校验。

仅新 profile 的 draft 使用 `thinkingLevel: 'off'`，模型仍为 deepseek-flash，普通 draft 16K、questions 4K、原请求次数/费用/超时守卫保持；questions、旧普通及 preparation 不改配置。新 intent 固定 profile 与该 draft 请求配置；缓存与恢复不得混用旧 low 请求。新 profile 直接复用 COS110 原唯一已结算 length 后继：同输入、同配置、原账单/来源核验和原准入守卫均成立时允许一次后继，成功缓存复用；后继再次失败、unknown 或来源/配置漂移不再派发。不另建恢复机制，不增加机会或额度。受控 transport 检查真实请求包含 `thinking.type=disabled` 且不含 reasoning_effort；这不证明模型输出质量。

`publishGenerationReport` 从已核对的完整确认来源获得 experienceCriteria，加入新版 acceptanceScope；CLI experience 显示清单并说明 approve/reject 覆盖当前完整清单。报告及已有 ExperienceBinding 同时固定确认来源、清单、报告版本和当前 candidate；`loadExperienceBinding` 核对实际原 draft/confirmation 文件，不能只信报告自报。清单更改、缺失、错源或 candidate 改变时拒绝沿用决定。自动通过后体验项仍等待真实 stdin；旧报告/决定不补造清单。完成运行的只读恢复同样核对该绑定。

### 原预算内的普通草稿与历史未派发恢复（COS116）

仅 `ordinary-design/1` draft 使用既有 `requestOutputLimit`，根据Pi实际归一化输入、原估算器及每次新账本副本上的 `reserveEntry` 从配置上限向下选最大可负担值，下限为 `min(8192, configuredCap)`。固定普通区间有界遍历，不假设注入估算器单调；无候选或非法报价在transport前拒绝。原intent中的模型/off/16K/超时、输入、profile、capabilities保持；真实reserve/admit仍独立执行，后续并发费用或funding变化可拒绝。六个安全请求元数据字段附在普通draft既有billing记录中，保存实际cap及最大报价；原账务身份与对账规则保持。questions、legacy和preparation配置不变。

历史准入前失败仅在原funded intake未停止、未确认、未激活、无未决费用或遗留interview工作时可考虑。核对原CLI回答与intent、独立普通UTF-8 native文件、六条精确SDK记录形状/parent链/cwd/model/off/system/context/user，以及唯一末尾空content/全零usage的host预算错误。原完整request/event/已结算billing必须闭合，native须唯一落在原相邻interview起止事件内，其间无reserve/admit或计费；错误文本或零usage本身不能授权。发布marker前再次核对来源字节及native清单。

仍只使用 `draft-N-successor-1`：旧settled-length predecessor格式与核验兼容，新增 `kind: pre_admission_denied` 绑定原round/native字节摘要/原work身份及来源。proof仅供host使用，模型接收原prompt/context。successor成功缓存先核原来源；任何失败都消耗同一槽，不叠加length与denial机会。successor work先于原子marker发布记录，发布/创建失败亦结束work并保留历史；关闭已有session失败保留pending清理。删除marker或整个round不能删除后续interview/request历史的拒绝依据。缺失、漂移、歧义、reserve后admit失败、provider错误和unknown均拒绝；不补造历史billing/request或未派发回执，不提高grant/总额/次数或重置时钟。实际room-3须经合入后的原字节只读资格核验，源码通过不构成实际恢复或用户确认。

## B：设计产物、独审和实际消费（COS112，依赖 A）

### 固定产物接口

普通新 profile 的 design 仍占原 task/grant，会话内生成 `authors/design/design.json` 和 `authors/design/acceptance-plan.json`。新版主设计增加 `experienceMapping: Record<criterionId,string>`（空清单为 `{}`），逐项说明设计如何满足体验要求；原 acceptanceMapping 继续覆盖全部客观玩法。主设计捕获使用 `game-design/2`，旧路径仍用 `game-design/1`。

```ts
interface OrdinaryAcceptancePlan {
  formatVersion: 'ordinary-acceptance-plan/1';
  requirement: ArtifactReference; // 主机供应的完整需求 capture
  scenario: BrowserScenario;      // 原 viewport/steps/可选 reopen 数据词汇
}
```

作者不能提供 URL、run/task/report/candidate 身份、脚本、权威时间或额外权限。两个文件进入同一不可变 design capture 的 `_cosmos/design.json` 和 `_cosmos/acceptance-plan.json`；modular interfaces 仍在原 capture。无需新增全局任务、动态插件或单独 plan grant。

新增小模块 `src/runtime/entrypoint-acceptance-plan.ts`：校验 envelope/确认来源/全部 AC/现有能力、读取 capture 内固定计划、组装实际候选的执行绑定。复用 `BrowserInputPreparation` 的捕获与检查职责，不将普通运行切换成 `cos16-input/1`，不放宽 preparation 与 modular 的原隔离。

### 时序与权限

1. 原真实确认及 readiness 通过后，按原规则激活唯一生成时钟；设计专属内容在时钟内产生。
2. design 作者可在原会话用现有 design check 获得本地 schema/覆盖反馈；不增加重试、语义重写授权或游戏通过结论。
3. host capture 前检查计划形状、requirement 引用、全部自动 AC、正常输入后可见断言、reopen checkpoint 及 benchmark 必需条件；冻结实际文件字节。缺输出、合法 UTF-8 的无效 JSON、确定性 schema/覆盖错误，复用原 `readDeclaredOutput` 的 missing_output/invalid_json/invalid_schema → `code_defect` 诊断及原限额、返工政策；满足原前置时保留原 design successor，不能改成 collect_evidence 丢失修复机会。实际能力缺口、无法确认的语义或可信来源、未知编码/IO 才保留为 `insufficient_evidence`。两类均保留原诊断并阻止未通过产物进入下游。
4. 原独立 design reviewer 读取完整已确认 draft、设计和计划 capture，检查规则/体验映射、断言充分性和可实现性。capture 固定字节；独审通过才允许 art、模块作者和最终 coding 使用该版本。
5. 下游 role packet、capture layout 和 source/dependency closure 包含同一 design capture。coding 不得修改计划；所有观测必须来自实际游戏状态，不能填入 expected 常量。
6. 原可信 browser host 从批准 capture 取得 scenario，绑定实际 candidate/URL/报告身份，交既有普通或 persistent consumer；不构造冒充用户确认的新 draft。媒体观察、渲染采样和 classic entry 继续在原可信路径组合。
7. coding reviewer 读取固定源码、计划及实际 trace/截图/报告。只有原自动验收和独审都通过才晋级；体验批准仍独立等待。

候选 v2 返工继续消费同一已批准计划。恢复核验原 task/attempt、固定 capture、host evidence 和独审记录；缺来源、缺批准或内容变化不能现场重建计划。旧已确认运行始终使用原 draft.scenario、旧 capture 和原 repair policy，不升级权限或重置费用/截止时间。普通已支持的 continuation、save/reopen、modular 和 renderFrames 必须保留；本卡不新增原本不支持的组合。

普通 design 的 recoverCapture/已批准输入门禁必须核对原 `review-started`、`review`、`verified` 记录、task verdict 与既有 journal signatures，参考现模块输入核验；不能只依赖 orchestrator 的 host verified 复用。art/任意 coding 派发前与最终晋级前验证固定来源和批准仍成立，不改全局复用语义。

## 能力失败与发布边界

- 新 capability 文本明确：静态 mouse/locator 输入及固定可见相等断言可用；依赖运行中观察后选择动作、隐藏随机状态、数值区间或持续时间测量的要求当前未支持。
- 访谈模型依据能力声明判断原需求并填写 unsupported；该语义判断不是可信自然语言检测器。主机能够确定性拒绝 unsupported 非空、伪造字段、未知计划操作、缺覆盖或错误绑定，不能声称仅凭任意 brief 就可靠识别随机/计时需求。测试应分别证明这些结构门禁和模型提示中完整保留原问答，不把提示词要求计为语义检测通过。
- 被声明的缺口在确认前阻止生成。若模型漏报或直到设计才发现，独立 design reviewer 必须比对完整 brief/questions/answers 与两类要求、设计和计划，记录遗漏或证据不足并阻止下游；无法确认覆盖也不能批准。不增加分类角色或通用自然语言框架。禁止将洗牌改为固定牌序、窥读背面、设置状态、缩小玩法或转为体验要求；原正常输入证明不降低。
- 当前 `wait-for.timeoutMs` 不是持续时间断言；“最终翻回”不能证明“800ms 翻回”。后续动态能力需玩家可见观察、已观察值记录、有界动作选择与实际 trace；时间能力需可信单调时间、区间/保持检查及分辨率记录。本轮均不实现。
- A 的生产 `createProductHost` 不声明 ordinaryProfile；若遇新版来源，未接通 consumer 的 host 返回 executionReady=false，并在直接执行入口拒绝。A 内部测试可注入具备相应能力的 host。
- B 完成纵向接线后才让生产 host 声明新默认；`runProductSession` 继续在 questions 前和 activation 前检查完整 readiness，不发布只能确认却无法执行的半流程。恢复旧 origin 不看新默认。

## 验收和交付

### 引用已确认需求的新生成尝试（COS129）

`cosmos new <new-dir> --requirements-from <source-run-dir> --requirements-revision <N>` 直接引用原 `ordinary-design/1` 完整确认版本。来源可以是已停止或已完成的原正式运行，也可以是已确认但尚未激活的 intake；必须持有原 CLI `local-user` 决定。来源目录与新目录彼此分离，不接受引用型尝试作为下一层来源。

来源模式与 `--brief`、`--adapter` 互斥。brief、问答、客观条目、体验条目、profile 和原选项均原样保留，修改要求仍使用原访谈流程。`--render-frames` 省略时保留来源选择，显式值必须相同。新尝试显示来源运行、revision、原确认人和时间及本次限额，不再要求 `confirm N`。

新 `intake-origin.json`、intake 和正式快照保存 `confirmed-requirements-source/1`，包含原 root/runId/revision 与 draft/confirmation 的 SHA256。两个本地需求文件是独立的原字节副本，保留原确认身份；intake.confirmation 为 null，正式运行不生成新的 requirements humanDecision。新账本、任务、创建时间及生成时钟各自独立，不继承旧执行或体验批准。

创建、激活、执行、恢复和体验报告均重新核对原完整来源及本地副本。源丢失、漂移、未确认、缺完整摘要或 revision 错误会拒绝；不补造旧字段。未就绪的 intake 可按同一来源 resume，已绑定副本丢失后不能现场重建。该模式当前仅支持 new/resume，continue 明确拒绝；最终体验仍须针对本次 candidate 真实试玩。

A：受控 SDK/CLI 验证新 schema、完整中文展示和真实当前版确认；unsupported、伪造字段、ID 冲突、错来源/版本、体验清单漂移均拒绝；payload off 正反例；旧普通/preparation/确认/已完成报告兼容。B：免费三任务与五任务纵向夹具使用不同 AC/selector；验证独审门禁、capture 及实际 consumer 一致、persistent、模块/采样必要代表、v2/恢复不改计划和原时钟。漏 AC、debug-only 主证明、未知操作、错候选/来源、篡改、缺批准均拒绝。

只对实际改动运行必要免费测试，复用未变证据；typecheck/build 通过后由各卡独立 reviewer 检查真实 diff。唯一 `public_agent_batch_merger` 集成 A→B、执行短组合检查、记录 SHA/证据并更新 issue/PROGRESS。source 通过不等于真实模型生成或用户体验通过；后续实际验证另行安排。
