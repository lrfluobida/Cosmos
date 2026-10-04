# 原生迁移 C2：设计标识符 schema 失败

日期：2026-10-04。本文登记 Root 提供的实际运行、只读诊断和免费 closure8 安全元数据；记录作者未读取私有 ledger/session/case、执行实际模型/浏览器或重跑源码测试。实际 raw response、文件和已消费案例保留。

## 实际运行与输入

| 项目 | 记录 |
| --- | --- |
| caseId | `cos20-transfer-validation-2` |
| source | `c6a9d7068bafa75a7cc34b8e1cdd68275449d60d` |
| fresh quote | `vq2-91d6b2910b0977635fa5df52c4f80ee28e19c70d9bf894de1edc0283c2d9753d` |
| fixed input SHA-256 | `f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c` |
| source approvals | 36 |
| start UTC | `2026-10-04T14:18:16.191Z` |
| 原 deadline UTC | `2026-10-04T15:03:16.191Z` |
| ended UTC | `2026-10-04T14:22:58.753Z` |
| elapsed | 282562ms / 4分42.562秒 |
| 实际 SDK 请求 | 15 |
| 新增保守估算 | 161528 micro-CNY / ¥0.161528 |
| 当前共享保守估算 | 7184253 micro-CNY / ¥7.184253 |
| 结束时 snapshot / ledger | revision1487 / ledger4 |
| result SHA-256 | `bd1a5dc404d5fadee2a94cb7521532b37fd7ec3798157ba468f8d118033921cc` |

Root fresh免费preflight为READY，snapshot字节/mtime与ledger目录不变、新root/marker/owner absent、模型0；免费账户余额/路由只记录bool通过。实际运行期间保持source-main冻结，费用和请求按原窗口结算。本次未触¥5/45分钟/80请求上限。

| 角色 | 实际新增估算 micro-CNY |
| --- | ---: |
| planning | 16206 |
| design | 145322 |
| art | 0 |
| coding | 0 |
| repair | 0 |
| 合计 | 161528 |

Native planning policy契约通过、登记三task；design attempt `8776311e-ac8a-4506-8ffa-6ee36d850051` 在原genericDesign identifier schema失败/code_defect。Art/coding未开始、没有game或accepted candidate；原C2 manual consumed。Root确认Node19451/exit1、credentialsCleared、owners released、unknown/reserved0后解除main冻结。

## 两种设计检查的区别

原native semantic tool check1实际passed:true，rewritesRemaining:0，mapVersion `cos16-map-v1`；receipt SHA-256：

`16b2ec00399f216ff29bdb6a3c351708704101b80a6f1bc5596e1f7b809c7ad3`

但实际generic设计文件的box state标识符为 `onTarget`，不符合原identifier约束。Root只读核对原generic shape，唯一非法ID为该值；仅在内存副本替换为 `on-target` 后，原generic validator通过，其余字段保持。实际文件、原回复没有修改，不是一次真实作者修复或重放。Generic文件 SHA-256：

`42d25a11186f392c9722706652482d91b69e670d3c4925e92c88c450169f6621`

Native semantic检查成功不替代generic schema或strict capture；C2未publishFrozen/capture，不能写成design通过或Source41整组件livepassed。Source44 planning契约实际通过三task只作为组件范围观察，state仍open，独立component acceptance另行处理。Source45 `TRANSFER_CASE_TWO_SOURCE_READY` / reviewed3bb0172 / merged5c059a / offline-verified-awaiting-live/open保持，actual failure另列为 `native-transfer-design-schema-failed`。

## 免费 closure8 与原组容量

Root在相同source c6a9，于 UTC `2026-10-04T14:41:20.289Z` 应用真实coordinator / `operator_validation_allocation_closure`：

- quote：`vacq2-de5024019afaab4b09cf273d0a7f7649d232bc87a277edcb560c546f8135a3d8`
- decision：`operator-allocation-closure-c5f0125c-e36b-4638-a529-6c106b6f23c1`
- revision1487→1488 / ledger4；累计10cases，current transfer2/manual，groupdelegations2。
- 只新关闭C2五derived grants，released9824370回原组；总50closed grants / 八audits。
- 原parent10,000,000/sourcefirstref1414不变；groupnet/committed175630，remaining9824370。
- role剩余planning369692/design1054678/art2800000/coding2800000/repair2800000，合9824370。
- shared effectiveallocated90488261前后不变，unallocated59511739；shared费用7184253不变，unknown/reserved0。
- closure付费0/模型0，owner released；不刷新截止、不增加预算或删除已结算费用。
- closure后snapshot SHA-256：`d470881009a49715580e88e5b6c7de8243d79a5024a0e77952fe3b8a5aa96b8f`。

Root deepassert旧run/tasks/requests/stop/validation/entries/allocations/delegations及七receipt、45closure/event前缀全部原样；原allocation amount与费用不变。C1规划失败/closure7及原C8接受v2、七个早期失败/C6 free111保持各自日期和财务记录。Source42 actual group flags继续true，预算claim/closure成功不等于迁移或游戏通过。

## 公共记录与 COS46

[COS16 C2结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5981247311)、[Source45实际失败](https://github.com/lrfluobida/Cosmos/issues/46#issuecomment-5981248016)及[Source44 native planning观察](https://github.com/lrfluobida/Cosmos/issues/45#issuecomment-5981248897)均由Root POST+GET精确读回。

Root发布 [COS46 / #47](https://github.com/lrfluobida/Cosmos/issues/47)，id5700347789，“为设计作者提供标识符约束与输出自检”；原生GET transport EOF后恢复同body并idempotent关联，最终native46children #2–#47/checkbox精确读回，无duplicate。Cos46专属作者从c6a9正式实施，in-progress/open/`SOURCE_NOT_READY`，未来marker `DESIGN_OUTPUT_SELF_CHECK_SOURCE_READY`，没有批准SHA。Source07、18 partial、41、44、45对应已审stage，outputs16/18，不require失败任务closed。

范围：host design/art明确 `^[a-z][a-z0-9-]{0,47}$` / DOS reserved标识符约束；names在planning前与原semantic tool组合。只读 `validate-game-design` 空args固定designauthor workspace currentfile，复用原validateDesign/identifier/gameplay IDs校验，返回精确字段诊断并核source/window/task/signal。沿同一SDK session/原attempt/grant/calls/fees/clock，不写文件/registry/ledger/audit、不猜改invalidID、不扩semantic rewrite、readonly格式纠正或codingrepair；strict capture仍须重新校验。

本项仅免费源码修复准备，未登记或claim实际C3、未准备C3声明，human adapter仍未登记。COS16未迁移通过，Source41未整组件livepassed，Source44/45维持源码审批与open状态；G3三个组件complete、human NONE及完整classic/95%未知保持。原group¥10/shared¥150/首批¥30、case¥5/45分钟/80calls/一次codingrepair与formal¥200/12h/优化目标¥100/6h不变，没有Root游戏种子或实际文件手改。
