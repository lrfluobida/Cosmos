# COS134 Ordinary Design Review Revision Implementation Plan

状态：独立 `ordinary_design_revision_reviewer` APPROVED_PLAN，两项P1/P2已闭合、无remaining；Root批准最终工程设计与免费源码实施。源码已最终独审并集成，仅source-scoped完成，本文件不授权付费运行。

任务：[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)，原生父COS18/#19、父[x]；原生依赖[COS132 / #133](https://github.com/lrfluobida/Cosmos/issues/133)及[COS133 / #134](https://github.com/lrfluobida/Cosmos/issues/134)，无反向依赖。实现者 `ordinary_design_revision_implementer`、独立源码reviewer `ordinary_design_revision_reviewer`、唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`8fb15b4c083734640ef6b9e6f2c83be1fd05b78379d616d19d9045626d2629ea`
- 批准计划输入 SHA256：`c9ba2def9250403c2bfd64c4e66acd83facd4a1943bbe30e4e8e96a6e10e5f67`

实际实施基线：隔离组合 `5a17b5671da33282ad9a1a117621fea7189107bc`，分支 `codex/budget-media-revision-integration`；三卡源码已按最终审批与必要组合统一发布，结果见下述记录。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. One dedicated implementer owns the card; an independent reviewer inspects its actual diff; only the batch merger integrates approved commits.

**Goal:** 将有效普通设计独审拒绝送入一次有界新作者修订，只有新固定输出通过独审后才首次派发下游。

**Architecture:** 新ordinary execution marker选择固定两路执行。原planner结果保持，先仅注册design；一次revision及之后的下游selection由host写定，沿用TaskJournal、registerTasks、registry和独立review。codingrepair仍保留自己的唯一plan、原池10%和DEFAULT_REPAIR_POLICY。

**Tech Stack:** TypeScript / Node22.22.2、Pi0.99.2、现文件工具/RunController/native预算钩子、node:test。

设计依据：[正式规格](../specs/cos134-ordinary-design-review-revision.md)。状态：Root已选择预算方向②，固定spec/plan已独立APPROVED_PLAN并获Root免费源码实施批准；此计划不执行付费验证。整批COS132/133/134在必要adaptive和组合检查完成前不向main发布新默认。

源码结果：获批源码 `a773623293412b75c06a7a0455c55577bf37d2bb` 已独立APPROVED_SOURCE_SCOPED，无剩余finding；三卡统一合入main `06709f34e11512f62fc83d2b1ef4591f9c467f32`。[精确批准](https://github.com/lrfluobida/Cosmos/issues/135#issuecomment-6428892920)、[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/135#issuecomment-6428898881)及父[x]已GET核证。 最终typecheck/build exit0，art留槽1/1及公开复用→设计v2→真实编译/Edge10步/clean delivery1/1分别通过、均0skip；独立APPROVED_INTEGRATION_SCOPED。完整native及171步/四故障有效证据复用；真实模型与人工体验仍未验证，paidAuthorized=false，父COS18仍open/partial。

## 0. 实施前锁定输入

- [ ] 核对AGENTS.md/CONTEXT.md/本规格和COS132、COS133最终批准SHA；只读复用现有native probe，不重跑全仓。
- [ ] 独立managed worktree；所有目标文件先严格UTF-8解码，保留中文、CRLF和周围格式，写前声明文件列表；修改后重新读取。
- [ ] 从已审组合基线 `5a17b5671da33282ad9a1a117621fea7189107bc` 实施（cos-01-reference/Cosmos）；设计早期调查4578d83、预算e2df1148、实测媒体084543仅保留来源。main bf59366f仅metadata，runtime未发布。
- [ ] 将SOURCE RED探针转成仓库中一个focused测试，保留原probe/result路径；确认失败原因是作者1次而应2、下游0，而非setup错误。

Run: `node --experimental-strip-types --test --test-name-pattern="independent rejection reaches one revision" tests/runtime/ordinary-design-review-revision.test.ts`

Expected RED: original capture/host passed/review rejected已建立；revision author未启动。不能让fake host直接返回批准，也不能从author summary构造review。

## 1. 固定分支与来源认证

Files:

- Create `src/runtime/entrypoint-design-revision.ts`
- Modify `src/runtime/entrypoint.ts`
- Test `tests/runtime/ordinary-design-review-revision.test.ts`

- [ ] 写来源负例：empty/blank findings、同author/context、stale input、缺失或无效evidence引用/来源、篡改review/raw report/requirement、无review-started、错correction身份。不要要求模型枚举所有host事实；完整verified evidence与signatures由可信host独立认证。所有无效情况revision calls=0，原原文保留。
- [ ] 实现只接受 `ordinaryDesignRevisionPolicy:"independent-review/1"` 的窄验证；要求budget policy和普通三角色scope；old undefined不升级。
- [ ] 从原TaskJournal读取author/capture/verified/review-started/review，核对spec列出的identity/signature/完整确认。复用现registry、recoverCapture与requireCorrectionIdentity；不要复制一套弱化校验。
- [ ] 生成write-once `ordinary-design-review-feedback/1`，authority固定`independent_model_review`。只保存审查建议与来源；原failure.json仍为insufficient_evidence，不建HostFailure/knownFailures。
- [ ] 固定唯一revision plan。新task继承原objective/acceptance/需求/工具/write scope，只加独立artifactId的feedback到inputs；旧design@v1以原registry引用放context.interfaces，新输出design@v2。禁止把旧design同时加入inputs或创建registry alias。对inputs+artifacts/evidence/review逐项跑真实合同验证，确保artifactId唯一；对同一原design source只能有一个plan，不接受自选counter或新ID绕过。
- [ ] feedback绑定原source capture、review signature和receipt来源；新signature直接签feedback，旧capture间接由它绑定。seed/capture前后/review前后/selection/resume均回原TaskJournal+registry复验实际源字节；作者及review只读mirror再与认证源逐文件比较。测试缺源、源篡改、只改mirror均阻断，不能只签feedback自身就通过。
- [ ] first approved选择v1；first合法rejected选择唯一revision；first其他失败保留并停止。未选中前下游没有task/allocation/origin/请求。
- [ ] 跑新测试中认证和marker范围组，确认真实源字节没有被改写。

实现结构保持具体：helper接收root/controller、原execution、source task和host capture认证函数，返回`approved-original | revision-ready | blocked`三种固定结果。不要导出任意节点/动作注册API。

## 2. 新作者工作副本、capture与新独审

Files:

- Modify `src/runtime/entrypoint-host.ts`
- Modify `src/runtime/entrypoint.ts`
- Modify `tests/runtime/ordinary-design.fixture.ts`（只增可选测试钩子；保留旧fixture默认行为）
- Test `tests/runtime/ordinary-design-review-revision.test.ts`

- [ ] 新测试让第一reviewer读固定旧plan后指出原要求中的确定缺项；revision作者必须通过真实read工具读取feedback，断言其原input refs/身份/文本，再实际edit/write。
- [ ] host将revision task绑定 `continuations/<revisionTaskId>/workspace`。现materializeTaskInputs会复制inputs和context.interfaces，先复验原signature/registry，再materialize并从认证旧capture seed设计与计划；保留原author目录和capture字节。review用现host.verify的copyRefs复制interface，再核对独审mirror。
- [ ] 复用免费probe的真实scoped read/seed/capture/host evidence/review代表，断言新review输入只有designv2、旧v1仅interfaces，旧registry身份/拒绝/字节保持，新signature含feedback不直接含旧capture。将probe的root-workspace限制补成正式exact isolated workspace绑定测试，不能把先前probe称为完整功能完成。
- [ ] 新workspace和task绑定进入现role/taskOutput/sourceRoot/design自检路径；只有exact plan声明的task可读写。不要将普通所有task都开放任意workspace。
- [ ] revision uses现orchestrator独立任务，保留原任务终态、原attempt和receipt；不reopen原session，不覆盖v1。
- [ ] 在capture后比较两份主设计/plan文件；完全相同则固定`no_output_change`，停止且没有第二paid review。非相同仍必须新结构检查与独审。
- [ ] 新reviewer按完整原要求读取v2与feedback，独立actor/context；拒绝即到一次上限，approved只进入selection。
- [ ] 越权fixture实际尝试写confirmation，被文件scope拒绝；原需求hash保持。模型自然语言无法自动分类的限制写入测试名称与报告，不模拟万能语义host。

Run: `node --experimental-strip-types --test --test-name-pattern="revision|unchanged|scope|rejection" tests/runtime/ordinary-design-review-revision.test.ts`

Expected GREEN: 2 design author sessions、2 independent design reviews；第一次拒绝及v1不变；第二次拒绝/无变化均无第三作者、无art/code。

## 3. 明确预算分支及最低输出准入

Files:

- Modify `src/runtime/entrypoint-host.ts`
- Modify `src/roles/factory.ts`：必要runtime cap guard、同一新policy marker条件及类型。
- Reuse `src/roles/author-output-budget.ts` / `provider-budget.ts`，不新增预算接口或改变reserve/selector算法。
- Test现有author budget测试的相邻文件；只添加本policy受影响断言。

- [ ] RED：旧successor125000µ无法容纳已固定完整输入；若每笔都按最高预留结算，900000 / 原1/3 reserve不能容纳本4author+2review路径；450000 codingrepair不能按65536输出准入。
- [ ] 固定Root已选择的②：首轮25/25/40/10，修订25/20/20/25/10（initial/revision/art/code/repair）。①仅为已比较替代方案。原budget pool和ledger不变；取整尾差归repair，证明总额不增加，不混用两方案。
- [ ] revision900000完全复用COS132的8192..32768与1/3reserve，不增加比例参数或新压缩机制。作者最多使用600000，至少保留300000；reviewer按该任务全部实际剩余额度逐笔准入，300000不是独审独立bucket或上限。不能要求它承担每次最高费用结算的完整链。
- [ ] 证明既有只读quote和coordinateAccounting reserve前检查均有效，unknown/reserved/settled按现规则计入，不另建预算算法。
- [ ] 保存真实constructor RED：在5a17b567上art/coding floor8192/cap65536均抛`floor <= cap <= 32768`，见受影响TEMP probe。不是只补类型；factory接收同一个已持久化ordinaryDesignRevisionPolicy，constructor严格认证marker和COS132配套，才允许art/coding固定8192..65536且同时配置两角色。
- [ ] 写真实constructor矩阵：新marker合法art/coding通过；旧undefined有floor的65536继续拒绝；未知marker、cap65537、design/cosmos65536、缺配套budget/compaction拒绝。原design32768与旧无floor固定65536配置保留。
- [ ] host从认证execution/selection/repair-plan选新marker，仅普通三角色；modular/validation/preparation/human/inherited不升级，误传validation在创建session/provider前拒绝。用真实role构造与requestOutputLimit记录验证art/code/repair各自最高cap和8192floor，planning/reviewer原输出保持；不可mock绕过constructor或仅靠taskId后缀判repair。
- [ ] 仅新policy下art/coding及一次codingrepair配置现authorBudgetOutputLimit，floor8192、cap65536。floor不足须明确资源失败、请求不发；不可补额度、不可降到4096写文件。
- [ ] 每session32和原纠正槽不变；原逻辑设计最多原作者+一次新作者。修订任务换ID、resume、重复plan均不能重置次数。
- [ ] 用真实factory/Pi/SDK synthetic transport测最终字段和规则的read→edit→check→handoff→review两请求。完整SOURCE显式采用合成settlement假设author16000/64000/64000/64000、review16000/64000µ；断言作者累计208000后两次review可用余额692000/676000µ、两次8192均可付，最后任务余额612000µ。记录每笔准入、真实工具和结算，不声称是实际模型费用，也不额外扣除作者保留额。加入最终feedback字节，fetch guard禁止网络。
- [ ] 另将实际settlement调成每笔最高预留，证明900000在途中明确资源停止且没有下游/超额；保留缺583218µ的报价总和，不能将它称为实际费用最低。
- [ ] 同时测真实art/code/codingrepair第一请求native报价，证明所选方案的grant与adaptive floor可准入；②空repair450000的8192 floor允许B≤192232，仅作为算术上界，必须实报实际B。任一floor仍不足则报告差额，修设计后继续，不改原总额。

报价对照：主probe `C:/Users/26557/AppData/Local/Temp/cos134-revision-quote-20261027-b19c7e/sequential/quote.json`。作者四floor总1140684，review floor总342534；实际source测试必须明确这是合成路径保守容量，不是模型成功保证。

Run: affected author-budget测试＋上面的新focused文件；避免重新执行未变COS132全部矩阵。

## 4. 固定下游版本与保留codingrepair

Files:

- Modify `src/runtime/entrypoint-design-revision.ts`
- Modify `src/runtime/entrypoint.ts`
- Modify `src/runtime/entrypoint-successors.ts`
- Test `tests/runtime/ordinary-design-review-revision.test.ts`

- [ ] 新RED让v2approved后art/code仍读取v1则失败；校验task.inputs、dependsOn、media capture依赖、coding candidate内acceptance-plan实际字节和ordinary binding。
- [ ] write-once selection绑定原execution/native plan、approved task/capture和完整derived graph。只改尚未注册下游的design引用/dependency与固定branch预算；first-approved branch保持原草稿。
- [ ] selection发布后首次创建下游origins并注册，调用现executeTaskDag。用ordinary.approved验证依赖，再把确切批准capture加入availableArtifacts；禁止用mutable author文件作为available输入。
- [ ] resume完整effective图仍通过现TaskJournal和recoverCapture复验passed祖先，避免只信selection。首次下游可走`executeTaskDag`，已创建origin/已注册阶段走经固定plan认证的resume；不得把缺origin直接当作可重发任务。
- [ ] 扩展successors原图读取：当execution有本marker时，只允许认证selection所返回的effective原图和其plan引用。原execution/native proposal仍作为根来源保留；旧无marker必须走原校验，不接受任意替代plan。
- [ ] 真实host build失败触发现codingrepair，保留DEFAULT_REPAIR_POLICY和唯一repair-plan.json；正例验证新gamev2、原repair450000 allocation、一次修复上限。模型review拒绝不能冒充hostcode_defect。

Expected: effective任务只有一个approved design、原art、原coding；snapshot仍保留rejected design。codingrepair不会回到design或再次派发art；重复coding失败有限停止。

## 5. 崩溃恢复、资源停止与报告

Files:

- Modify上述helper/entrypoint（不另建通用recovery框架）
- Test `tests/runtime/ordinary-design-review-revision.test.ts`

- [ ] 精确覆盖plan已写未register、register后未attempt、author-started无receipt、capture已完成、review-started无verdict、review已写未selection、selection已写未下游、codingrepair已开始八个边界。
- [ ] 仅无attempt/请求/未知输出的准备阶段可补缺origin/registration；任何paid开始且无完成证据不重发。已完成receipt恢复重用，不增加作者或review calls。
- [ ] tamper selection/revision feedback/源review/confirmed requirement都阻断。unknown/reserved、取消、deadline不足185秒和每rolefloor不足都在实际工具/provider前停止。
- [ ] 自动报告同时显示原review建议来源、revision是否尝试/批准、当前资源或来源blocked reason和下游未执行状态；不吞原差距，不只给generic insufficient_evidence，不输出raw provider异常或密钥。
- [ ] old undefined案例复用旧ordinary拒绝证据；新增一项policy恢复断言即可，不重跑transfer COS41或全仓浏览器。

## 6. 交付、独审、集成

- [ ] 重新严格UTF-8读取已改文件，检查中文；`git diff --check`，确认没有无关格式与编码变化。
- [ ] `npm run typecheck`、`npm run build`；新focused测试、受影响budget tests，以及最短ordinary first-approved / codingrepair / resume代表。每个测试只在新delta影响时重跑。
- [ ] implementer提交自己的SHA，报告SOURCE真实链、native报价文件、预算差额、未验证的真实模型能力。不得称目标游戏成功。
- [ ] 独立reviewer先核规格与权限/预算，再看实现与负例；必要修复在同implementer分支，复审affected diff。唯一merger合入 approved SHA，做最终组合native报价及受影响集成检查。
- [ ] source ready仅说明控制链完成；后续actual由root根据原授权另行安排新窗口。旧room12/reuse-1、真实ledger、费用、已关闭状态不改。

## 停止范围

不修改已确认需求，不从测试fixture抽取手写目标游戏，不增加API调用预算、不新建通用工作流/任务注册器/自然语言解析器、不绕过独审。若最终组合native floor报价仍不足，保留明确来源和资源失败；修订分支不能承诺一定产出游戏。
