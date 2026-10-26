# 普通设计未选定分支与历史初轮失败资金收尾 Implementation Plan

状态：独立 `reuse2_recovery_plan_reviewer` APPROVED_PLAN、无remaining，Root已批准固定工程设计、免费源码实施及登记；本卡已最终独审并集成，仅source-scoped完成。下文待审/未授权源码字样属于批准前原文，当前状态以本段为准；未授权真实模型、结算或旧run恢复。

任务：[COS-135 / #136](https://github.com/lrfluobida/Cosmos/issues/136)，原生父COS18/#19、父[x]。实现者 `ordinary_design_revision_implementer`，独立源码reviewer `reuse2_recovery_plan_reviewer`，计划reviewer `reuse2_recovery_plan_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`d1e5b9504de3c383f49d73d1ca998013ba0f13cd7f0cfae75a73747b7116360d`
- 批准计划输入 SHA256：`1c18d37f6c46597200d9158951751ea32298fa157c72a5022d53bfe89b87f85c`

工程基线：`50f4633b1e682ccadf4844bf8414994a866813a5`。[配套规格](../specs/cos135-ordinary-incomplete-funding-recovery.md)。两卡并行且不互阻；本卡生命周期源码已优先发布，真实会计仍由Root原API收尾，新付费须两卡与必要组合通过。reuse-2 child112永久stop、原5Mµ仍held，未settle/释放，旧receipt保持；本卡merger/implementer不操作真实controller/ledger/coordinator。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 让未来所有未选定普通设计分支的报告仅绑定真实有效任务，并严格核验本次已签名初轮失败的历史资源清理事实，以便 Root 最终通过原 API 收账。

**Architecture:** A 在 entrypoint 的所有未选定普通设计分支（初轮或修订失败）区分计划范围与实际有效任务证明。B 在既有 funding cleanup reader 内仅识别本次初轮失败的严格受限历史形状；签名、原快照、报告、费用和原 API 的所有会计保护保持。两项属于同一生命周期修复，不创建通用恢复机制。

**Tech Stack:** Node.js 22.22.2、TypeScript、node:test、现有 RunController/OwnedWork、Ed25519 completion receipts、public-validation funding API。

状态：私有草案，待独立审查。对应 `spec.md` 为完整约束；此计划未授权现在编码或实际结算。

源码结果：COS135 / #136已源码范围完成；[精确批准](https://github.com/lrfluobida/Cosmos/issues/136#issuecomment-6430077591)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/136#issuecomment-6430084943)及父[x]已GET核证。独立reuse2_recovery_plan_reviewer批准 `0946205af133b13db3e42b05ce309c378aa1a857`，无P1/P2；5来源文件精确合入发布 `e231434d2a41ba78e36643f1d0fb1db6aa3552c5`。

main typecheck/build exit0；初轮失败证明、修订失败证明、真实签名历史资金收尾正例及原失败清理拒绝4/4、0skip、TAP13195.8368ms。原A2/2与B34项范围有效证据复用（原33/34后候选夹具查找修正、定向1/1，不累加重叠）。附加strict测试仍有6个与50f精确基线一致的旧nullable诊断，无新诊断；未记为strict全通过。 此为SOURCE/TEMP生命周期与会计边界验证；真实reuse-2仍永久stop、游戏incomplete/timing unconfirmed，原5Mµ hold尚未由本次发布释放，原failed closed-binding回执与费用保持。真实收尾仅由Root随后沿原API办理。COS136/#137仍open/source-pending，新付费仍等两卡及必要组合；总136/root100/父30中29源码完成，父COS18仍open/partial。

## 文件职责与工作边界

- Modify: `src/runtime/entrypoint.ts`，仅 A 的报告证明选择。
- Modify: `src/runtime/completion-timing.ts`，仅 B 的会计读取限定分支及内部纯校验 helper。
- Test: `tests/runtime/ordinary-design-review-revision.test.ts`，A 的真实控制链回归。
- Test: `tests/runtime/public-validation-funding.test.ts`，B 的签名历史夹具、结算正例和拒绝反例。
- Fixture only if necessary: `tests/runtime/public-validation-funding.fixture.ts`，补一个有界 ordinary 夹具入口；复用现有合成费用、授权、确认和 planner/executor，无真实 run 输入。
- Reference only: `src/runtime/experience.ts`、`src/runtime/run.ts`、`src/runtime/public-validation-funding.ts`、现有 completion 测试。默认不改它们；确需扩大生产文件范围时先报告具体依赖。

所有路径相对独立 managed worktree 根。任何源码写入前检测 UTF-8，最小 patch，保持中文及原行尾，写后重新读取。实现者不得操作 main 或真实 `.cosmos/public-validation/room-20261027-reuse-2/run`、共享 ledger、controller/store 锁；不得调用模型、恢复 CLI 或改变游戏。

## Task 1：建立 A 的精准 RED

- [ ] 在独立 `codex/` 分支和 managed worktree 上确认冻结基线及仓库规则，复用仍有效的依赖/测试证据。
- [ ] 添加测试 `initial ordinary design failure reports only persisted task proofs`：启用 revisionPolicy，首轮 design 作者抛出受控失败；真实计划、design-only executor、报告发布与 completion 均执行。
- [ ] 断言设计仅一次派发，无 reviewer/art/coding 派发，无 design revision/selection；snapshot 仅原 design，art/code 无注册/grant/journal。
- [ ] 断言 report.effectiveTasks 等于 snapshot 中实际 design 的 deliveryTaskProofs；gaps 仍包含 art/coding 待完成要求，outcome incomplete、automaticAcceptance not_passed、无 candidate。
- [ ] 断言完成回执不存在 closed-binding failure，真实清理项 closed；不得把 cleanup timing eligible 与游戏通过混为一谈。
- [ ] 扩展现有 `revision rejection stops without a third author or downstream` 一个修订失败代表：effectiveTasks 只含实际有效修订任务证明，revisionAttempted=true、selectedVersion=null、sourceTaskId 为原 design，taskHistory 保留两个真实设计任务；下游 gap/零派发保持，真实清理 closed。复用该夹具，不新增修订矩阵。
- [ ] 执行以下命令，分别保存初轮与修订失败代表的新增证明断言 RED，确认基线均多出 art/coding 两个 proof：

```powershell
node --experimental-strip-types --test --test-name-pattern="initial ordinary design failure reports only persisted task proofs|revision rejection stops without a third author or downstream" tests/runtime/ordinary-design-review-revision.test.ts
```

## Task 2：完成 A 的最小修改

- [ ] 在 `designBranch && !designBranch.selection` 的全部未选定普通设计分支，从报告对应 snapshot 选择已经注册的当前有效任务证明；保留计划列表用于现有 gaps/blocked/success checks。初轮有效任务为原 design，进入修订后的有效任务为修订 design；全部真实历史仍由 taskHistory 保留。
- [ ] 保留 `entrypoint.ts:267-269` 的 sourceTaskId、selectedVersion 和 revisionAttempted 计算；初轮失败仍 false，修订失败仍 true，不固定或重算这些字段。
- [ ] 不提前注册下游，不修改 execution/native plan，不为缺失任务补造 attempt/artifact/review。正常分支仍执行原缺失任务拒绝规则。
- [ ] 运行 Task 1 精确测试并保存 GREEN；重新读取改动中文与编码。
- [ ] 再选既有 `independent rejection reaches one revision with frozen feedback and isolated source` 作一次设计修订代表；若本 SHA 无相关行为变化且已有可复用证据，记录证据而不重复整矩阵。
- [ ] 提交 A 与其回归，报告精确 SHA、RED/GREEN 和仍待 B 的缺口；该提交不代表本次真实 hold 可释放。

## Task 3：建立 B 的原签名历史夹具与 RED

- [ ] 在临时 funding fixture 中按原授权/intake/确认 API 建立 ordinary 原运行；使用合成 session 与费用，固定三角色 native plan，真实 executor 仅注册并失败 design。
- [ ] 通过现有 publisher 发布旧缺口形状的三项 effectiveTasks。测试必须调用真实 finishCompletion，让它产生真实 nonce、owner anchor、fundingSnapshot 与 Ed25519 签名；不得自行制造有效签名结果、改签名后内容或抄入真实运行证据。
- [ ] 给夹具设置真实的 warnings/control 清理回调；保留确实由 stable 的缺下游 proof 比对产生的唯一 closed-binding failure。所有资源 callback 及 owner-drain 必须完成。
- [ ] 通过原 RunController stop/close 追加永久 manual stop；记录前后原回执、报告、任务、ledger/request 字节或结构作只读对照。仅 stopped 事件可新增。
- [ ] 添加测试 `signed ordinary initial failure settles only missing downstream proofs`：调用原 settlePublicValidationFunding，预期 closed、实际合成账项导入一次、释放 cap 减真实合成 settled 费用；原游戏 timing 仍 unconfirmed/eligible false。
- [ ] 在未改 B 的源码上执行，必须精确 RED 于 `Funding cleanup remains failed or unconfirmed.`，而非夹具缺确认、费用或签名无效：

```powershell
node --experimental-strip-types --test --test-name-pattern="signed ordinary initial failure settles only missing downstream proofs" tests/runtime/public-validation-funding.test.ts
```

夹具需要验证 actual design proof 精确匹配，missing 仅 art/coding；marker/report/binding/receipt/snapshot 签名链全部通过。任何前置不完整都先修夹具，不能放宽生产检查来消除错误。

## Task 4：完成 B 的严格会计识别

- [ ] 保留 `readFundingCleanup` 现有全 closed 路径；在原签名、snapshot、binding、anchor、时序校验后增加一个模块内部 helper，仅判断 spec 第 4 节全部条件。
- [ ] helper 必须从真实原 snapshot 和签名 report 比对 task proofs；未知 task/proof 变化不得依赖字符串分类蒙混通过。读取 execution/native/确认只能使用纯读取路径，不打开 controller/store，不写文件。
- [ ] 此历史分支要求当前永久 manual stop、ledger/requests 完全未变、唯一后缀 stopped；不沿用正常分支对后续费用核清事件的较宽允许集合。
- [ ] resources 与 owner-drain 逐项精确、唯一 closed；唯一额外失败为已核实的 closed-binding proof 缺口，其他重复/未知/fallback 项均拒绝。返回原 cleanup，包括失败行，不创建新时间或签名。
- [ ] 运行 Task 3 得到 GREEN；只经原 settlement API 验证完整会计链，不直接调用测试内 ledger 写入代替结算。
- [ ] 断言 report/completion/digest 原字节不变、原 current/original 仍 unconfirmed、eligible false；settlement 没有改变原任务或创建设计/美术/编码产物。

## Task 5：必要反例与组合验证

- [ ] 添加参数化测试前缀 `ordinary incomplete funding rejects`。每个反例是独立临时夹具，每次仅改变一个前提；调用 settlement 后共享 ledger settlement/释放额不得产生。
- [ ] 至少覆盖：既有 design proof 不同；缺失下游 proof 带 attempt/artifact/review；下游已注册或有费用；候选/报告/marker不同；signature/nonce/anchor不符；cleanup资源失败/owner失败/fallback/重复/未知行；无stop；新增执行；ledger/requests变化；revision/selection存在。
- [ ] 对需要“有效签名但语义错误”的反例，在首次真实 finishCompletion 之前构造输入并让原函数签名；不得改签名后文件来冒充语义负例。另保留独立签名破坏负例。
- [ ] 执行受影响精准矩阵：

```powershell
node --experimental-strip-types --test --test-name-pattern="signed ordinary initial failure|ordinary incomplete funding rejects|formal failed cleanup keeps|formal stop and released owner|an unreported formal failure" tests/runtime/public-validation-funding.test.ts
node --experimental-strip-types --test --test-name-pattern="initial ordinary design failure|revision rejection stops without a third author or downstream|independent rejection reaches one revision" tests/runtime/ordinary-design-review-revision.test.ts
npm run typecheck
npm run build
```

- [ ] 复用旧范围有效的成功 completion/legacy/modular 证据；若实际改动触及它们，再选相关代表补测。禁止用全仓重跑代替明确影响判断。
- [ ] 重新读取所有改动文本确认 UTF-8 与中文正确，检查 diff 只覆盖本范围，提交最终精确 SHA 和 SOURCE 结果；不报告实际游戏成功。

## Task 6：独审、唯一合入与 Root 最终会计动作

- [ ] Root 指派独立 reviewer，用独立上下文查看 spec、plan 和实际 diff，先查规格/负例，再查实现质量；作者修复 finding 后 reviewer 复审受影响变更。
- [ ] 唯一 merger 仅集成已批准 SHA，检查组合结果并发布；其他 agent 不修改 main、不 push 批次、不碰实际资金。
- [ ] Root 在独审发布后重新只读确认真实运行仍永久停止、原签名回执与账项未变、没有残留 owner/registry writer、原 funding 授权和逐笔 receipt 完整。
- [ ] 只有 Root 最终通过原 `settlePublicValidationFunding` 调用一次。预期本次 25 笔/540200µ、释放 4459800µ；实际值必须以原 API 验证后的返回结果为准，若失败则继续保留占额。
- [ ] Root 记录真实结算结果和证据位置，并明确原 generation incomplete、timing unconfirmed、无候选/独审/人工体验仍成立。不得恢复旧 run、重签旧 receipt 或运行第二次游戏来完成本项。

本计划完成的 SOURCE 交付是两个生产位置的有界修复、针对性 RED/GREEN、独立批准 SHA 与必要组合证据。真实账务动作保持独立，直到 Root 最终执行才有实际结算结论。
