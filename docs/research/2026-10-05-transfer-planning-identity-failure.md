# 原生迁移 C3：规划任务身份不匹配

记录日期：2026-10-05（Asia/Shanghai）。运行和closure的UTC事实发生于2026-10-04。本记录只使用Root提供的安全元数据及精确公共回执；未读取实际私有 `.cosmos` ledger/session/case/key、重跑模型/浏览器或源码测试。保存的原回复和实际案例没有修改。

## 实际运行

| 项目 | 记录 |
| --- | --- |
| caseId | `cos20-transfer-validation-3` |
| source | `e8f4d4d91a186b8e774f0d986e50021bc67d767d` |
| fresh quote | `vq2-d0950a8a9c296841638fdb476ce40dfb312f97d130a2bc465698839ac66e6400` |
| fixed input SHA-256 | `f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c` |
| source approvals | 38 |
| start UTC | `2026-10-04T16:16:36.151Z` |
| 原 deadline UTC | `2026-10-04T17:01:36.151Z` |
| ended UTC | `2026-10-04T16:17:09.564Z` |
| elapsed | 33413ms / 33.413秒 |
| 实际 SDK 请求 | planning1，共1 |
| 新增保守估算 | 14780 micro-CNY / ¥0.014780 |
| 当前共享保守估算 | 7199033 micro-CNY / ¥7.199033 |
| 结束时 snapshot / ledger | revision1494 / ledger4 |
| result SHA-256 | `dbc844e5de5d2e2660eac1e357e53656a089745dc6b3c4230a7f5ebcd34d3776` |

Root fresh只读preflight为READY，旧snapshot字节/mtime与目录不变、新root/marker/owner absent、模型0；免费账户余额覆盖case¥5、路由通过。实际运行保持source-main冻结，未触¥5/45分钟/80请求上限。Root确认Node56308/exit1、credentialsCleared、unknown/reserved0及owners released后明确解冻；C3 manual consumed，不重开。

## 身份拒绝与正确的字段

原模型六字段proposal的policyIds `game-design` / `game-art` / `game-code`、roles、acceptance IDs与dependencies正确，但taskIds写为局部短别名 `cos20-design` / `cos20-art` / `cos20-coding`，不是当前已预声明的authoritative grant task IDs。原strict planner因此拒绝，未登记task；design/art/coding没有开始，没有game、accepted candidate或codingrepair。

Root只读解析原native保存回应，未修改实际文件或将别名手改为长ID重放。失败是规划任务身份契约，不是policyId缺失、SDK费用或browser故障。Source44原六字段/policy修复不能保证模型准确复制声明中的长ID。Source47的 `TRANSFER_CASE_THREE_SOURCE_READY` / reviewed `d178b09b18f959acf912a228040568f05342c977` / merge `7bff7128b91ab706f50326ebe4d053358ee0ad74` / offline-verified-awaiting-live/open保留，实际失败另列。

Source46只读输出自检源码及合成组合证据并未被本次真实C3使用：流程在planning阶段已结束，没有设计自检或新Native通过。原C2 semantic map check通过而generic identifier失败的事实、C1规划缺policyId失败及原C8 accepted v2/G3组件完成均保持原日期与范围。

## 免费 closure9

Root在相同source e8，于 UTC `2026-10-04T16:34:48.907Z`（本地2026-10-05）应用真实coordinator / `operator_validation_allocation_closure`：

- quote：`vacq2-2618dd5d160eceb3b3ff761f9ad4a74155c77c5472db6a39887f2f3151a37c69`
- decision：`operator-allocation-closure-833d70a5-feec-40a2-8d90-15acc8e0d6ee`
- revision1494→1495 / ledger4；累计11cases，currentC3/manual，groupdelegations3。
- 只关闭C3五derived grants，released9809590回原组；总55closed grants / 九audits。
- 原parent10,000,000/sourcefirstref1414与授权members3不变；groupnet/committed190410，remaining9809590。
- role历史planning45088/design145322/art0/coding0/repair0，合190410；role剩余354912/1054678/2800000/2800000/2800000，合9809590。
- shared effectiveallocated90488261前后不变，unallocated59511739；shared费用7199033不变，unknown/reserved0。
- closure费用0/模型0，owner released；不清除已结算14780、不刷新原截止或再领新¥10。
- closure后snapshot SHA-256：`c75b86181d989dbfbbb259ec635924b2db29586ded1f431123389a42c4cb72a8`。

Root deepassert旧run/tasks/requests/stop/validation/cases/entries/allocations/delegations及八audit、50closure/event前缀全部原样；原allocation amounts和已结算费用不改。原closure7/8记录和C1/C2回复仍保留，归还未花的capacity不作为运行或游戏通过。

## 公共结果与 COS48

[COS16 C3/closure9](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5982184956)与[Source47规划身份失败](https://github.com/lrfluobida/Cosmos/issues/48#issuecomment-5982185433)均由Root POST+GET精确读回。

Root正式发布 [COS48 / #49](https://github.com/lrfluobida/Cosmos/issues/49)，id5701294644，标题“由主机将规划局部别名绑定到预声明任务身份”；exact body/native48children #2–#49/新checkbox及旧47前缀已核对。注册时历史：Cos48专属作者从e8 source-only实施、branch/worktree由其选择，当时in-progress/open/`SOURCE_NOT_READY`，未来marker `PLANNING_HOST_IDENTITY_BINDING_SOURCE_READY`，没有批准SHA。Source07、20、44、47对应已审component，outputs16/18，不require失败任务closed。

批准设计仅由可信PlanOptions显式 `proposalIdentity:'validation-policy-aliases/1'` 启用，仅strict validation/taskPolicies/三个unique design/art/code槽；unknownmode/human/roles错槽在session0拒绝。六字段proposal先检查strict keys/policy-role/acceptance/unique aliases与slots/known dependencies，再由host验证policy→current declared grant ID双射、绑定ID与deps，继续原grant/coverage/cycle/budgetTaskContract/requireValidationTask。不得猜缺失policy或未验证role。

新mode的plan.json记录identityBinding（protocol/policy/localAlias/actualTaskId）和bound outputs；默认legacy五/六字段prompt/IDs/旧JSON caches以及C1C2C3行为不改。实现仅planner.ts、tests/roles/planning-identity.test.ts和plan，不helper/pipeline/art/vector或预算/SDK/provider改动，不增加SDK调用、格式retry、session、attempt、grant、价格、账本或C4执行。

Source48当前已独审：`PLANNING_HOST_IDENTITY_BINDING_SOURCE_READY` 批准 `86460cc8aa5ba4e9ab9ec623a2710c6d99029156`，合入 `8db56b88e6067e5216eb9ecb85e080225a25ced1` / offline-verified-awaiting-live/open；[公共审批](https://github.com/lrfluobida/Cosmos/issues/49#issuecomment-5982411570)由Root POST+GET精确读回。三source paths字节/UTF8/LF/中文/diff通过，作者25new/2focus/8default/strict6.928秒、独审10new+2default+1foreign-alias/snapshot不变/零API费用browser及merger正例1/1（110.763ms）证据复用，未重跑矩阵。新mode未native模型实测，C1C2C3未显式opt-in/default行为与已保存raw/失败/费用/closure9不变，没有C4 caller或声明。

当前只修免费平台source，C4 caller opt-in/声明须另task，未预登记或启动新case，human adapter仍未登记。原余量354912/1054678/2800000×3合9809590只是原group capacity记录；group¥10/shared¥150/首批¥30、case¥5/45分钟/80calls/design一次semantic/coding一次repair、formal¥200/12h与优化目标¥100/6h不变。COS16迁移未通过，human NONE/fullclassic/95%未知，未blind paid repeat或手改游戏。
