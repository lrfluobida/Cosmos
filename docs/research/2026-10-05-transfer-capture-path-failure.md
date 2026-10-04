# 原生迁移 C4：独立设计评审的 capture 路径差距

记录日期：2026-10-05（Asia/Shanghai）。本文依据Root安全运行数据和精确公共回执，记录UTC2026-10-04的C4实际结果；未读取私有ledger/session/case、恢复回执、key或预览，未重跑模型/浏览器/源码测试。

## 已确认的实际结果

- source：`e609a16d948d566268b81078bc205f2f0517f3dd`。
- UTC2026-10-04：start18:03:20.961Z、原deadline18:48:20.961Z、end18:26:18.115Z（本地Oct5）。
- elapsed1377154ms / 22分57.154秒，24实际SDK请求。
- 新增保守估算214694 micro-CNY，shared7413727；planning14294/design200400，art/coding/repair0，unknown/reserved0。
- Native planning的局部别名实际绑定成功；generic design和transfer map的host capture通过。
- 独立design review为changes_requested；没有game/build/browser，art/coding未开始，不是迁移通过。
- Fresh preflight为READY/source approvals40，input仍`f52b3846140b9b46733238ec5dc2a8d243c0145326f8c4f799bffc23d4bdc78c`，quote为`vq2-82ed085aa9d3578723ea4cd7f1109239ab2c3e1ea691fb658dbcc1aede9baa35`；Root免费资金/路由通过后原生执行，source-main保持冻结直至结束和owner解决。
- 实际`validate-game-design`1次passed/errors[]，`validate-transfer-design`1次passed/rewritesRemaining0/mapVersioncos16-map-v1；这是宿主阶段证据，不替代独立评审。

## 评审读取路径与实际不可变文件

Root确认review查找 `capture/.../files/authors/design/*.json`；实际immutable capture中的设计文件为：

- `_cosmos/design.json`
- `_cosmos/transfer-design.json`

独立reviewer使用65次只读toolcalls，仍按作者workspace路径假设读取capture，最终changes_requested。这些是Root提供的路径/记录事实，作者未重新读取原件。Host capture成功不替代独立review，原C4保留失败，不手改生成内容或重开案例。

## Root安全SHA-256索引

| 证据 | SHA-256 |
| --- | --- |
| result | `69254b47c911c0f2c62d68cf47f482d9bc3ab98f45a176fc742fb5501cc33c88` |
| host-result | `fe8afdf5700d10440a8062296d4828183c829b7a642136dd34ee9b01a61e8253` |
| review | `c642c4909266102d70edd2e011a9df513396849e6d6cf83d1f876d699d9b3e34` |
| host report | `ce634ba943f4c51a3311cbadb8ff452caadaa14de9265cf26473ef7261bec9d5` |
| design | `43fd34570b8934b3c76ee95b3abd0582b2820181efcc0a027dbd3f2c90b6a2af` |
| map | `e2f2ba6b924501cb24285081b207eea280a03b0e9931261a8dba367ca3ad0658` |
| identity binding | `3380ab9ea9be56b6ad488ab206b6c008bd2855e21ec51a2dbbc830dfaac38c28` |
| map check | `4584367e03301d4b9d6d55ac588da113d4baa27361a4938a1245bf11cc590e8c` |
| plan | `4f18335008642a2615887212ef434b749eb6a1304a2ae5d9ada97eb2f1300a2e` |
| owner recovery receipt | `486881b746d03972f386dde0b55aa2d0ed6bc1befffe0bdf56b623b96422151f` |

## owner收敛与免费closure10

Paid parent24440/key cleared/native exit1。原owner close曾对已登记launcher30020返回non-ESRCH；随后两个PID均ESRCH、CIM无存活，原SnapshotStore.recover成功且snapshot bytes不变。Root已确认owner解决并解除main冻结；这是恢复事实，不是记录作者执行新的恢复或读取私有回执。

Root免费closure10已完成：

- applied UTC2026-10-04T18:50:22.312Z（本地Oct5）；after revision1602/ledger4/12cases/60closed/十audits。
- quote：`vacq2-34fabd6e8f5a8363e10315978986909a2fedc790a9b7715400e8470c1c43db2f`
- decision：`operator-allocation-closure-eaed21d2-be36-4f53-8c2b-215dc370eb3f`
- snapshot SHA-256：`17666aa75d4f136b9e469aaed520e4068cfef0c92911c662b3e31d11f049fe14`
- groupnet405104/remaining9594896，原parent10m不变、shared effectiveallocated90488261保持；shared费用7413727不被closure清除。四transfer案例role累计planning59382/design345722/others0，余量340618/854278/2800000×3合9594896。

旧C1/C2/C3失败、closure9及C8接受/G3组件事实保持，unknown/reserved0。归还未用group capacity不删除已结算费用；Scope/原grant、时钟和parent10m不被重设。

## 公共结果与 COS50

[COS16 C4结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5983277445)和[COS49 C4结果](https://github.com/lrfluobida/Cosmos/issues/50#issuecomment-5983277683)均由Root POST+GET精确读回。Source49保留TRANSFER_CASE_FOUR_SOURCE_READY/原双SHA/offline-verified-awaiting-live/open，实际changes_requested单列；COS16仍partial/open，未有完整迁移、game或human通过。

Root已正式发布[COS50/#51](https://github.com/lrfluobida/Cosmos/issues/51)，id5702273122，标题“明确作者输出与捕获产物的角色读取路径”；parent50原生children #2–#51/新checkbox及旧49前缀已核。专属作者cos49_implementer在basee609/branch`codex/cos50-capture-layout`仅实施free source，in-progress/open/SOURCE_NOT_READY，无批准SHA。Source07/09/36/38/41对应已审集成component，不require完整失败任务closed。

任务只明确reviewer/art/coding读取作者workspace输出与immutable capture的契约，使用实际文件清单/引用，修复此次COS49失败；不改变factory/schema/layout/permission/retry，不复制移动产物、不补game或降低验收。后继实际case须另声明与准入，本task不重开C4。

原group¥10/shared¥150/首批¥30、case¥5/45分钟/80calls/design原semantic1/唯一codingrepair、formal¥200/12h/优化目标¥100/6h保持；human NONE、fullclassic/95%未验，Root旧private数据和read-only预览未触。
