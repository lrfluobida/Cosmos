# 原生迁移 case1：规划 policyId 契约失败

日期：2026-10-04。本文只登记 Root 提供的实际运行、只读诊断和免费 closure 安全元数据。未重新读取私有账本、SDK session 或 case 文件，未执行模型、浏览器或源码测试；原回复、案例和结果保留。

## 实际运行

| 项目 | 记录 |
| --- | --- |
| caseId | `cos20-transfer-validation-1` |
| source | `71729bd3ea0a9f293c1393418a7e6896830116f1` |
| quote | `vq2-b2df6159aa51e49a208c3f2444960a0a6af233e9ccff478d4d7f26594bca95f9` |
| input SHA-256 | `f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c` |
| 免费准入 source approvals | 34，原基础组件与 COS20..42 |
| start UTC | `2026-10-04T12:53:44.110Z` |
| 原 deadline UTC | `2026-10-04T13:38:44.110Z` |
| ended UTC | `2026-10-04T12:54:18.308Z` |
| elapsed | 34198ms / 34.198秒 |
| 实际 SDK 请求 | planning1，共1 |
| 新增保守估算 | 14102 micro-CNY / ¥0.014102 |
| 当前共享保守估算 | 7022725 micro-CNY / ¥7.022725 |
| 结束时 snapshot / ledger | revision1420 / ledger4 |
| result SHA-256 | `2cc2d4afebcc8f23500742bb39f1dc5975a8afc2155e1864a15c89483df34301` |

真实 claim 将 ledger3→4、group delegation1 和新案例原子提交，使用原 COS16 parent10,000,000 micro-CNY。累计九案例，current 为 transfer1/manual consumed；case task list `[]`，没有生成游戏、设计/美术/编码任务、accepted candidate 或 semantic repair。金额 ¥5、45分钟和80请求上限未触及。

Root 确认 Node18880/exit1、credentialsCleared、controller/registry owners released，unknown/reserved均零后解除 main 冻结。原八案例、C8接受v2与v1失败、C6免费111诊断和所有旧费用/时钟仍保留；没有恢复或重开此次失败案例。

## 原回复与主机拒绝

Root 只读解析实际 SDK response：三个 task 的 role IDs、acceptance IDs 和 dependencies 正确，但三个都没有 `policyId`。初始 system prompt 的 JSON shape 省略该字段，后面的条件句才要求 policyId。Strict host validator 对 `policyFor(undefined)` 拒绝；不是设计/美术/编码或八段 consumer 已通过。

诊断为静态只读核对，没有额外模型调用，没有修改 model proposal、case 文件或将失败改为通过。原严格 validator 仍应拒绝缺失字段；修复范围应使 prompt 示例与已存在的 policy 契约一致。

## 免费 closure7

Root 在相同 source71729 于 UTC `2026-10-04T13:04:45.241Z` 应用一次真实 coordinator / `operator_validation_allocation_closure`：

- quote：`vacq2-d9129d6a44e97c0faaae19495a7443375fd28a994e7813c76322bc6f16ac7bb7`
- decision：`operator-allocation-closure-9ff8f00b-c33e-4952-8f46-68023d863e23`
- revision1420→1421，ledger4保持；只新关闭 transfer1 五个 derived grants。
- released9985898 micro-CNY只恢复原group容量；总45 closed grants / 七 audits。
- parent10,000,000不变；closure后groupnet/committed14102，remaining9985898。
- shared effectiveallocated90488261前后不变，unallocated59511739；shared费用7022725不变，unknown/reserved0。
- closure实际模型请求0、owner released；没有新增费用、刷新原截止或再领完整父¥10。
- closure后 snapshot SHA-256：`5c703b5d218400b392081e667391f2903334ba6b5d4f8b43b14091f3c02c9c3e`。

Root deepassert核对closure前后的run/tasks/requests/stop/validation/allocations/entries/delegations及原六receipt、40closure和event前缀全部原样。此操作归还未花的group grant capacity，不删除已结算14102费用，不改旧allocation amount、原案例或原六笔closure。

## 公共记录与后续源码任务

[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5980291265)、[Source43实际失败](https://github.com/lrfluobida/Cosmos/issues/44#issuecomment-5980291983)和[Source42 group claim/settlement/closure](https://github.com/lrfluobida/Cosmos/issues/43#issuecomment-5980292477)均由Root POST+GET精确读回。Source42两项actual upgrade/delegation为true，source marker/双SHA/offline/open保持；claim和closure验证不等于整个迁移组件或游戏完成。Source43保持 `TRANSFER_NATIVE_ENTRY_SOURCE_READY`、reviewed04b4e62/merge97182ce和offline/open，实际失败单列为 `native-transfer-planning-contract-failed`。

Root已发布并精确读回 [COS44 / #45](https://github.com/lrfluobida/Cosmos/issues/45)，id5699591283，标题“明确原生规划输出中的 policyId 契约”；parent #1共44children #2–#45/新checkbox已核对，原COS10/11/13三个closed checkbox保持。注册时历史：专属作者从71729的managed branch `codex/cos44-planning-policy-schema`实施，当时in-progress/open/`SOURCE_NOT_READY`，未来marker `PLANNING_POLICY_SCHEMA_SOURCE_READY`；没有批准SHA。

任务仅覆盖 `src/roles/planner.ts`、`factory.ts` 两prompt及roles tests/plan：policy分支显式六字段 `taskId, policyId, role, objective, acceptanceIds, dependsOn`，legacy分支保留五字段。Source前置COS07、COS18 partial、COS43已审源码，outputs16/18，不require任务closed。不放宽validator、不guess role/fallback，不授权付费纠错、预算、新case、游戏或human adapter改动。

Source44修复当前已独审：`PLANNING_POLICY_SCHEMA_SOURCE_READY` 批准 `4c3b785f71cf22456f107e47115edd3dea91667f`，合入 `33e58df84e30361dd375aa8613605c94dba3614a`，offline-verified-awaiting-live/open；[公共审批](https://github.com/lrfluobida/Cosmos/issues/45#issuecomment-5980481610)由Root POST+GET精确读回。四approved paths字节/UTF8/LF/中文/diff通过；作者7new/5old slots/6default/strict7.039秒，独审4/4（267.6ms）/零登记费用/session closed，联合policy模式1/1（41.0945ms）/0skip证据复用，未新增实际模型或编译/浏览器验证。修复只澄清prompt，原case1失败、raw reply、14102费用及closure7不改，当前没有新case或paid。

COS16仍partial/open、固定契约保持，迁移六T16/八段consumer尚未验收；COS18 actual human NONE。G3三个组件closed条件不变，完整经典/95%目标、公开human CLI和用户体验未通过。原COS16 ¥10、case¥5/45分钟/80calls/一次codingrepair、共享¥150/首批¥30、formal¥200/12h与优化目标¥100/6h均保持。当前没有新付费、case2登记或未审源码集成。
