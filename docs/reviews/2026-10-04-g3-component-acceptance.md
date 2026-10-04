# G3 组件验收：COS10 / COS11 / COS13

日期：2026-10-04。独立 `g3_component_reviewer` 已核对 C8 白名单报告、构建、原 gameplay AC、v1/v2 计划、评审与 repair dispatch，并复用 batch05/06 已审模拟边界证据，批准三项原组件条件。Root 另提供实际账本只读完整性核验；本文按这些安全元数据登记，不重新访问私有 ledger/case/session，不重跑测试、模型或浏览器。

## 完成决定

| 组件 | 原条件及证据 | 当前状态 / Root 精确读回 |
| --- | --- | --- |
| COS10 | Cosmos 原生生成有界单关；原 8 gameplay AC、正常输入胜负/资源/冷却/重开、构建、独立评审与可启动产物齐备 | complete/closed；[完成评论](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5979967185) |
| COS11 | 真实 v1 code_defect 转给正确 coding 角色；唯一 linked repair 的 v2 保持原验收，独立复核后接受；既有无进展/限额停止边界证据复用 | complete/closed；[完成评论](https://github.com/lrfluobida/Cosmos/issues/12#issuecomment-5979968242) |
| COS13 | 原并行预留、压缩、截止/收敛和恢复模拟边界已审；实际 C8 长链路的请求/结算完整，无失联付费工作 | complete/closed；[完成评论](https://github.com/lrfluobida/Cosmos/issues/14#issuecomment-5979969151) |

Root 已完成三个 comment POST、PATCH closed/state_reason completed 与 GET 精确读回；父 #1 仅对应 #11/#12/#14 三个 checkbox 改为 `[x]`，仍有 43 个原生子任务 #2–#44。原源码 reviewed/merge SHA、早期失败和评论链接保留；当前 integrationStatus 为 complete，旧 live-failed/offline 状态另保留为历史。

## C8 固定证据索引

以下 SHA-256 来自独立 reviewer 和 Root 的安全索引。Reviewer 检查严格 UTF-8、哈希、计划与版本绑定；记录作者没有再次读取原私有文件。

| 证据 | SHA-256 |
| --- | --- |
| C8 result | `70f51ab71fee13f82843e354b971e16d8fbfa63f396df68f3c22c6b0546fd7dd` |
| origin | `2aadf17a66a35c44599ddc08baeaf731f9da6f422b424c409ba7a6063dfe2f44` |
| repair dispatch | `fa4ad6c76c92d43c5dfb94e6d6121f8346bd3356551896b1fae59b4de41a4e93` |
| v2 host | `7133f766c48dd7d15cdd28c4ee20286c35d96367e559b59bb11060482f68be4a` |
| v2 build | `23dc54ce001149767183445a60963fae33151e96983cce901878a80cc8f2eb5c` |
| v1 browser | `bfc0b02c44b177c4ac74a0ef54b479c8b4f181542d1a31c9ef31732e36ad426c` |
| v2 browser | `33e36159dc0cf11c9a111e2b76e8d9b947eaf40bb97648f840ca9499e3fa7c88` |
| Root 只读验证的 snapshot | `7e4808de6f54644bba35f96997cfa4be9a5f76885c596a60de8a93817cafca15` |

原 8 gameplay AC、plan steps 和 task acceptance 在 v1/v2 完全相同。v1 仍保留 browser090 `media.audioStarted-defeat:false` 的 code_defect 失败；既有一次自动修复创建 linked v2，没有删除用例、降低容差、人工修改生成游戏或增加 repair 权限。

v2 构建通过；原 Edge 正常鼠标计划 111/111、0 failed、0 skipped、errors `[]`，PID464 正常退出，forced:false。当前版本接受绑定：

- attempt：`0e2233ce-af05-4653-9e2e-bfd19db5bcec`
- reviewer：`reviewer-d8fa2e7c-384e-4c69-a374-b92b6ca556fb`
- context：`review-57ebec92-2203-4f5d-8113-bddb8e2e4924`
- verdict：approved，同 v2；acceptedAt `2026-10-03T18:56:49.570Z`
- 产物：`registry/candidates/cos20-native-validation-8-game/v2/project`

原始实际结果见 [COS10 C8](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5972584874) 与 [COS33 C8](https://github.com/lrfluobida/Cosmos/issues/34#issuecomment-5972585087)。旧七案例和 v1 失败不被组件完成覆盖。

## 请求、费用与实际执行层次

C8 source `ef4b2ea2bdd9b867cac6fe9797a56257569d663a`，UTC `2026-10-03T18:41:12.207Z` 开始，原截止 `19:26:12.207Z`，`18:56:49.704Z` 结束：937497ms / 15分37.497秒。实际 native 执行为 **serial、无 compaction**，不是一次真实并行、压缩或 12h 运行。

| 角色 | 实际 SDK 请求 | 新增保守峰值估算 micro-CNY |
| --- | ---: | ---: |
| planning | 1 | 13588 |
| design | 9 | 112966 |
| art | 19 | 338470 |
| coding | 22 | 635051 |
| repair | 25 | 449517 |
| 合计 | 76 | 1549592 |

按 purpose 分列为 planning1 / author56 / reviewer19，共 76。Root 只读 core validation 确认 76 unique requests = 76 settled entries，全部历史 unknown/reserved 为零、owners absent。Closure6 后 revision1414 / ledger3，共享保守估算 7008623 micro-CNY / ¥7.008623；40 closed grants / 六 audits 只归还未用任务 capacity，没有清除费用或改原 grant amount/clock。本文不将估算写成账户实际发票。

COS13 证据另列：

- 已独审 batch06 source `cf7d5f63a7df5de45a0fa187b5ed727304bf5344`，实际 merge `d3aab995c8b29a384c389192323c6dfa47cc4f98`；[原集成记录](batch-06.md)和旧评论保留。
- parallel peak2 来自注入的并行 fixture。
- 原生 SDK compaction 使用 mock HTTP；12h 硬截止使用模拟时钟。
- C8 的 76 请求串行真实执行提供少量实际长链路测量及结算完整性证据，不替代或冒称上述模拟为真实模型并发/压缩/12h。

人工介入仅运行授权启动和已披露的平台处理；生成游戏未被手改。独立 reviewer 已逐项判断上述实际与模拟证据满足三个组件的原条件，本轮没有额外付费、测试或浏览器运行。

## G3 和剩余范围

三项外部 closed 状态使原 G3 closed-only 条件自然满足；没有修改 gate 或降低验收。组件完成不代表完整经典基准/95% 目标、真实迁移、公开 human CLI、最终用户体验或 G4 通过。参考分母、正式 ¥200/12h 硬上限/¥100与6h优化目标、共享 ¥150/首批 ¥30、旧八案例/六 closures 及 human NONE 保持。

Source41/42/43 已独审集成，Source43 为 `TRANSFER_NATIVE_ENTRY_SOURCE_READY` / offline-verified-awaiting-live/open；实际迁移入口仍待 Root 对最终批准 main 进行 fresh 免费准入、资金/路由和真实 operator 决定。实际 ledger3→4 升级、组 delegation、claim 与 paid 均未发生，内部 operator 不作为 human CLI 或用户体验证据。
