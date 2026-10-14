# COS-90 同账本的固定验证预算组补充分配

状态：plan awaiting independent review / source-only。Issue [#91](https://github.com/lrfluobida/Cosmos/issues/91)，id5854823746，父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，原生第90个子任务；Root 已发布并精确读回。

作者 `cos90_implementer`，独立 reviewer 与唯一 merger 由 Root 指派。分支 `codex/cos90-validation-group-supplement`，起点 main `3b2002ddd1541e20580e123ded819137dcc23e4c`；[实施计划](../plans/2026-10-15-cos90-validation-group-supplement.md)。先独审计划提交，收到批准后实施。

## 问题与范围

C13已failed并消费，closure19结束；21stopped/13delegations/105closed/19audits，共享settled16108937µ、unknown/reserved0。原COS16组的10m内部allocation已committed/allocated9100314µ，仅899686µ可分配，低于下一固定C14的2500000µ向量。所缺1600314µ来自既有共享预算真正未分配容量；¥150 shared、¥30 phase、正式¥200/12h均保持。

Root只读核对revision2965确认sharedallocated90488261µ、unallocated59511739µ；本任务作者不读取真实账本，生产quote/apply仍须鲜读核对。同账本内部补充分配沿原持续验证授权记录真实operator决定；不增加人类预算批准，不创建需求确认，不自动追加或重开历史案例。

## 完成条件

1. 新ledger5精确一次supplement记录和snapshot receipt/event，绑定revision/SHA、原COS16父allocation+首个授权、下一 `cos20-transfer-validation-14`、固定1600314µ、完整planning/design/art各1µ、coding1900000µ、repair599997µ向量、operator源与可信identity。
2. 原parent10m行、费用、allocations/delegations/closures、旧身份/时钟/决定保持；新共享allocated恰增1600314µ，limit保持。按actualunallocated拒绝不足，不用unspent；无累计角色寿命上限或旧grant重用。
3. prepare只读；apply经SnapshotStore排他原子一次写。全部案例停止、任务/attempt非running、全部grant已关闭、owner/writer已清、unknown/reserved0、无overrun。stale、来源漂移、容量不足、冲突/第二笔拒绝；同决定同quote/source重试不重复分配。
4. 旧ledger1..4与旧quote/closure1/2维持10m语义，按历史revision投影。新casequote3只准固定C14/vector使用补充容量，ledger5 closurequote3、coldrestore及provider/tool/child实际来源核对成立。
5. TEMP原controller/store与fakeprovider零网络完成RED→GREEN、容量计一次、完整向量负例、历史/冷恢复、旧版本及受影响集成检查。先plan独审，再实际diff独立规格→质量审查；唯一merger集成后才标 `VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY`。

## 交付边界

COS90仅源级固定补充分配能力，不执行真实补充分配/付费/新窗口，不修改真实台账或GitHub。COS91负责C14固定wrappers与当前sourcebinding；本任务不预置生成游戏或重跑C13。Root/merger维护共享tracking与公开证据；源码准备不能表示实际生成、COS16/18、完整经典或human通过。
