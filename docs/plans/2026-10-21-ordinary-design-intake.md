# 普通需求意图与设计后验收实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 逐步实施；每卡由专职 implementer 和独立 reviewer 完成，唯一 merger 集成。勾选状态只记录已完成工作。

**Goal:** 普通新运行先确认完整需求，再由原设计任务固定可执行验收计划，并保留真实体验确认。

**Architecture:** COS111 提供主机选择的 ordinary-design/1 输入及体验来源契约；COS112 在原 design capture/review/browser consumer 上接通计划。两卡组合就绪后切新建普通运行默认，旧 origin 不迁移。

**Tech Stack:** TypeScript、现有 pi/DeepSeek transport、原 CLI/ArtifactRegistry/TaskJournal、现有 Playwright host；本轮测试使用受控 transport/browser，不调用真实服务。

依据：[共用 spec](../specs/ordinary-design-intake.md)、[ADR0004](../adr/0004-ordinary-design-acceptance.md)。基线 `1a99b265e9e10e96ae473d6156553de98e1ae771`。原 memory 验证已关闭，不恢复，不改真实账本。

设计 `c4dcb56fc625322232733f44e4a63e0a34b3b406` 已获 `ordinary_intake_spec_reviewer` 的 `APPROVED_DESIGN`，Root公开批准 [COS111](https://github.com/lrfluobida/Cosmos/issues/112#issuecomment-6298548379) / [COS112](https://github.com/lrfluobida/Cosmos/issues/113#issuecomment-6298549546)，唯一merger合入 `b58ae7c44328a0aae8392f982e2ea164b9b6d3af`。当前只完成设计文档集成，以下源码步骤仍待分阶段实施和独审。

## 设计与分工

- [x] 将双卡范围、明确接口和发布边界写入共用文档。
- [x] 修订初审 `2c51223` 两项 P2：复用原 settled-length 后继，保留可修复 design 输出的原失败分类；最终设计已独审通过。
- [x] 独立 spec reviewer 已检查需求完整性、A/B 接口、旧确认兼容和发布门禁；批准设计SHA为 `c4dcb56fc625322232733f44e4a63e0a34b3b406`，无剩余P1/P2。
- [ ] COS111 由 `ordinary_intake_design` 实施，COS112 由 `ordinary_plan_implementer` 实施；源码reviewer由Root分别分配。仅 `public_agent_batch_merger` 合入 main 并 push。

## COS111：内部草稿与体验来源契约

主要文件：

- 新增 `src/roles/ordinary-profile.ts`：profile/体验类型、版本选择与窄校验；`src/roles/requirements.ts` 增加新 draft 分支并复用原 AC/host standards。
- 修改 `src/roles/interview.ts`、必要的 `interview-recovery.ts`：新 prompt、固定 off 配置与 intent 绑定；新版直接复用 COS110 原唯一 settled-length 后继，不另建机制或增加机会。
- 修改 `src/runtime/intake.ts`、`src/cli/session.ts`：来源保存/校验、完整展示和确认；生产默认不切换。
- 修改 `src/runtime/experience.ts`、`src/cli/experience-session.ts`：报告与真实体验决定绑定原清单；旧报告不重写。
- `src/runtime/entrypoint-host.ts` / `entrypoint.ts` 仅补新 profile 未接通时拒绝及类型适配，禁止提前执行。
- 测试放在 `tests/roles/ordinary-requirements.test.ts`、`tests/roles/ordinary-interview.test.ts`、`tests/cli/ordinary-session.test.ts`、`tests/cli/ordinary-experience.test.ts`，必要时复用原 fixture。

实施步骤：

- [x] 写新草稿/来源测试：无 scenario 合法；中文问答及两类条目保持；未知字段/ID 冲突/unsupported/错误 revision 拒绝；先记录 RED。
- [x] 实现 profile 与 draft union、host stage 组合、原 origin/回答/intent/confirmation 的完整核对；不改全局 TaskContract 或 planner 覆盖规则。
- [x] 写受控实际 transport 测试：新版 draft disabled 且无 reasoning_effort；questions/legacy/preparation 仍原配置；同 profile/off 输入允许原唯一 settled-length 后继并缓存复用，profile/配置漂移及后继再次失败拒绝新增请求。复用 COS110 未变矩阵。
- [x] 实现新访谈 prompt、off 和缓存分支；运行上述测试，检查错误类别而非仅“抛错”。
- [x] 写 CLI 确认与恢复测试，覆盖 profile 缺失/篡改、真实 stdin、旧 origin、生产 host 未声明新默认/未接通拒绝；实现最小接线。
- [x] 写体验报告/清单/candidate 漂移负例及真实 approve/reject 正例；实现固定来源读取、显示与绑定，保持旧已完成只读恢复。
- [x] 运行定向测试、typecheck/build；重开编辑文件核对 UTF-8/中文。
- [ ] 提交固定源码 SHA 交独立 reviewer；修复 finding 后再由唯一 merger 集成。

COS111 作者证据：四组初始 RED 分别为 1/4、6/9、0/9、1/6，新增两个范围门禁 RED 0/2，经典提示 RED 0/1；修复后最终四文件组合 35/35、0skip、25366.4121ms。旧访谈/后继/preparation/时钟/体验/续跑短代表 8/8、0skip、26986.4987ms，不与新增或早期重叠结果相加。typecheck/build 均 exit0；新测试 strict 首次仅复用 legacy fixture 字面量类型推宽，实际 validateGameDraft 收窄后 strict0、受影响代表1/1。原始输出索引 `.cosmos/cos111/verification-index.json`。当前为作者完成待独审；生产默认与新版 execute 保持关闭，B 尚未实施，实际模型/浏览器/真实账本未调用。

命令（工作树内，Node 22.22.2）：

```powershell
node --experimental-strip-types --test --test-concurrency=1 tests/roles/ordinary-requirements.test.ts tests/roles/ordinary-interview.test.ts tests/cli/ordinary-session.test.ts tests/cli/ordinary-experience.test.ts
npm run typecheck
npm run build
```

按影响补原 `tests/roles/interview.test.ts`、`tests/roles/interview-recovery.test.ts`、`tests/runtime/intake.test.ts`、`tests/cli/preparation-session.test.ts`、`tests/cli/experience.test.ts` 的短代表。预期新增正负例均 PASS，旧来源无写入；不得把受控输出称为真实生成。

## COS112：设计 capture/review 到实际 consumer

依赖 COS111 批准接口；从 A 的批准 SHA 开独立分支，不让两位作者并行改同一工作树。

主要文件：

- 新增 `src/runtime/entrypoint-acceptance-plan.ts`：ordinary-acceptance-plan/1 的严格 envelope、capture 读取及候选执行绑定。
- 修改 `src/runtime/entrypoint-host.ts`、`entrypoint-design-check.ts`、`entrypoint-media.ts`：game-design/2、experienceMapping、计划写入范围/捕获/独审输入与原下游依赖。
- 按需修改 `entrypoint-persistent.ts`、`entrypoint-frames.ts`、`entrypoint-classic.ts`、`entrypoint-classic-entries.ts`：从批准 design 取得 scenario，保留旧函数输入及固定来源；不改 runner 词汇。
- 修改 `src/runtime/entrypoint.ts`、`src/cli/session.ts` 的必要版本/readiness 接线，最后才由生产 `createProductHost` 声明普通新默认。
- 测试 `tests/runtime/ordinary-acceptance-plan.test.ts`、`tests/runtime/ordinary-design-host.test.ts`、`tests/cli/ordinary-generation.test.ts`；复用原模块、persistent、frame/continuation fixture。

实施步骤：

- [ ] 写 plan envelope 和覆盖 RED：完整 AC/正常输入/可见断言/reopen 正例；未知字段、debug-only、错误 requirement、漏 AC、缺 checkpoint 负例。
- [ ] 实现小计划模块；作者内容不含 runtime/candidate/URL 身份，主机从捕获版本绑定实际执行参数。
- [ ] 写 design check/capture/review 门禁 RED，再接同一 design capture 下两文件及体验映射；证明 review 前 art/模块/coding 不执行。
- [ ] 补小型受控分类/返工测试：missing_output、合法 UTF-8 invalid_json、确定性 schema/漏 AC 产生原 code_defect 诊断，满足原前置时沿原 design successor；能力缺口或无法确认可信来源为 insufficient_evidence，不进入自动修复或下游。原 grant/deadline/修复上限保持。
- [ ] 接普通/persistent 实际 consumer，fake IO 记录收到的 plan，验证与批准 capture 一致；保留媒体/采样/classic 组合。
- [ ] 写 v2/冷恢复/篡改/缺批准负例；恢复拒绝现场重建，原费用、deadline、模块修复机会保持。
- [ ] 运行不同 AC/selector 的三任务和五任务免费纵向链，补 save/reopen、采样及旧来源恢复必要代表；不要新增固定游戏 benchmark。
- [ ] 确认全部纵向能力就绪后，切生产新建普通运行默认；问题前 readiness 仍同时要求 environmentReady/executionReady。旧 resume 不采纳新默认。
- [ ] typecheck/build、UTF-8/中文复核；提交并将精确 SHA 与证据交独立 reviewer，修复 finding 后重审受影响变更。

```powershell
node --experimental-strip-types --test --test-concurrency=1 tests/runtime/ordinary-acceptance-plan.test.ts tests/runtime/ordinary-design-host.test.ts tests/cli/ordinary-generation.test.ts
npm run typecheck
npm run build
```

预期真实 host 接受受控 design/角色输出并将固定 plan 传给 fake browser；缺批准或错来源时下游调用数为零。复用未变 runner/transfer/模块证据，只补本次连接点代表。

## 唯一 merger 的组合验收

- [ ] 核对 A/B 各自批准 SHA，按 A→B 集成，不发布仅 A 的新默认。
- [ ] typecheck/build，加新版三任务、五任务、persistent、体验绑定和旧来源恢复短代表；不重复无变化全矩阵。
- [ ] 更新本计划、PROGRESS、两张 issue 与 github-issues.json 的源码范围状态和证据；ADR 在设计批准后改 accepted。
- [ ] 明确保留随机观察决策/时间区间为 unsupported，源码通过与实际生成、最终用户体验分开记录。
