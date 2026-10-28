# COS143：显式公共验证阶段扩展

状态：`source-integrated / source-scoped-complete`；最终 `830256110dcd441c5ff1baa86cb441630e2873fa` 经validation_phase_design独立APPROVED_SOURCE_SCOPED、全部10文件无P1/P2及Root批准，已发布 `20fa9dae13471580c5f69d4cd8293172cbd8b233`。[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/144#issuecomment-6479877216)、closed(completed)及父[x]已GET核证。真实阶段仍30000000µ，尚无30→40预算决定，部署源码不等于预算批准。

任务：[COS143 / #144](https://github.com/lrfluobida/Cosmos/issues/144)，id6086446699，原生父COS18/#19已勾；依赖[COS109 / #110](https://github.com/lrfluobida/Cosmos/issues/110)及[COS142 / #143](https://github.com/lrfluobida/Cosmos/issues/143)。作者validation_phase_implementer，独审validation_phase_design，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `359b036ea0527b66dcb233aa85098fe9c9db47dd5c8fba0686271a8fb9aa8abf`；plan `8dbe8d2e33fe6f572c7594515250552fd52b7fb9c2ae261075a0bbd2e19b7560`。

基线：85782fab382d10d2ae1b9a7c93944b788a4f10c2（runtime f7ef059）；依赖COS109/#110公共拨款与COS142/#143当前验证能力。GitHub身份与SOURCE关闭已核证，真实阶段未扩展。

SOURCE结果：10个批准文件精确、无冲突集成；main typecheck/build0，最短TEMP代表4/4、0skip、TAP5972.2789ms，覆盖default30/显式跨30、写后丢响应幂等、phase引用/新run限制及stopped-case running兼容。作者phase9/9、追加ledger5 1/1、旧funding11/11、CLI3/3与独审后续拨款/结算后再试幂等1/1按批准源码等价复用。所有本次phase测试仅使用新TEMP ledger/repository和合成决定；真实prepare/apply、sharedRoot/账本、newfund/provider调用均0。

真实snapshot3380、已结25384044µ、held/reserved/unknown0及阶段30Mµ保持，尚无真实phase决定，未准备付费运行；原cosmos spec首批30历史未改。父COS18仍open/partial，37/37仅指源码子项。下列规格是已实现的支持边界，不能替代真实预算决定。

## 实际阻塞与目标

用户能力验证总硬上限150元，cosmos-spec原首批阶段上限30元。共享revision3380已结25384044µ、held/reserved/unknown0，所有真实运行闭账；下一完整5M预留将30384044，超现阶段384044。本卡提供**显式、一次性、仅公共验证**的30M→40M扩展支持，lifetime150M及新公共单次≤5M/1800000ms保持。

40M是同一共享账的累计阶段上限，不是再发40M，不是新账本。没有真实预算决定时，无extension仍严格按30M。不得为启动新run直接换常量、改旧声明、复制空账或清除旧stop。

## 最小表示与API

1. 原RunSnapshot仅加可选单个publicValidationPhaseExtension及对应事件；缺省30M。不改BudgetLedger版本、confirmed requirements来源、公共authorization v1/v2或binding v1，不泛化COS16 supplement。
2. preparePublicValidationPhaseExtension只读，不持锁/写文件/拨款/arm clock/调用模型；返回固定协议与scope=public_validation_funding、原root/run/ledger身份、30→40/lifetime150/每次5与30min、quoteId、basis revision/raw snapshot SHA、当时committed/held/allocated和旧历史前缀计数/hash。并发变化必须拒绝陈旧quote。
3. apply接收该quote及独立真实operator budget decision来源，source/sourceRefs/hash、decisionId/actorId/decidedAt明确绑定quote。模型输出、源码批准、剩余150额度都不能替代缺失的阶段决定。真正应用必须在Root获得明确预算答复后进行；本卡绝不调用真实apply。
4. apply在原共享SnapshotStore锁内重验准确身份/lifetime150/旧30、basis原字节和revision、所有旧operator/closure/supplement/public funding授权与settlement来源；实际新决定文件逐字节核验。只追加extension回执和唯一事件、递增revision；金额、allocations、费用、旧来源、旧stop/时钟/任务字段不变。
5. 回执含原quote、真实决定与sourceSha、appliedAt及activationAllowed:false；它不创建run、预留、时钟或模型请求。可复用现write-once/hash/source检查与幂等模式，避免自引用hash。
6. 相同quote/decision/来源的写后响应丢失重试返回原回执；同ID异内容、决定复用、stale quote、不同第二次扩展、未知值/不完整来源拒绝。

## 前置与历史兼容

- 原run和每个旧case均合法永久stopped，无overrun；旧public funding全正常closed，held=0、reserved/unknown=0，无未解决owner/registry writer。原来源缺失或变化拒绝。
- 是否还可派发由原run/window authority判定，不以task.state单独判断。真实历史cos20-transfer-validation-16-repair仍running，但所属case已在2026-10-17 deadline停止，shared原run也已停止；保留该task/attempt所有原值。未知/含糊归属或可派发旧工作拒绝。
- 冻结旧cases/tasks/entries/requests/allocations/closures/fundings/events历史前缀及既有delegation/supplement，精确相等保护；新增公共活动按既有结构追加，不能回写旧状态或把旧running补成failed。
- extension存在后禁止旧fixed validation新case/claim；旧30M declarations及run.ts原dispatch ceiling保持。有效旧费用和来源仍可读、结算路径兼容；扩展不会重开旧窗口。

## 公共拨款与总账校验

- 协调reservePublicValidationFunding的C+H+L、funding纯校验的C+H以及validation profile全账累计检查三个入口。无extension为30；合法extension下共享历史可容纳新公共结算至40。不能把40接到旧case authority。
- 原授权v1/v2 sourceRefs必须显式引用精确扩展决定来源，决定时间不得早于阶段决定；新shared funding record记phaseDecisionId。旧前缀记录保持无该字段，不迁移binding。
- extension后的新funding须关联当前phase，仍要求全新funding/run/root/ledger/decision身份；phase决定ID不能再次当作单次run决定消费。每次reserve/admit读最新shared并核来源，不因SOURCE/quote而放行。
- C+H+L<=40M及原150M未分配capacity双重检查；包含全部held，保留unknown、overrun、整笔占额、一次settle、cleanup及禁止continuation等保护。新phase每次≤5M/30min。

## 必要免费测试

1. 无extension旧30M拒绝不变；有效合成extension可跨30新预留及走生产settlement，40M边界含held，并发不超额；新run超5M/30min拒绝。
2. prepare零写/锁；apply不改历史前缀/金额/分配/clock；响应丢失幂等，stale/conflict/tamper/missing/reused decision拒绝。
3. 用合法TEMP保留stopped case的task/attempt running/null endedAt：quote/apply后公共路径可用，旧case正常打开/claim/reserve/admit仍拒且transport0；移除case.stop或加入unknown必须拒绝。
4. 新funding缺/错phase引用、决定或旧来源变化，在首/后续transport前拒绝；改旧声明30→40仍拒，旧账务读路径可用。
5. unknown、cleanup缺失、超预留等原限制复用或仅挑受影响代表；真实共享root永不用于apply测试。不得把TEMP合成approval当真实批准。
6. typecheck/build、变更测试、独立实际diff审查及唯一merger短集成。支持代码可以发布，真实阶段仍保持30直到另行明确批准和独立readiness。

## 预期文件面

新增窄phase API与pure/source validation；修改public-validation-funding-types、run-types/run-validation、funding核心/validation、validation-validation，尽量不动run.ts、旧declarations、contracts/ledger schema、COS16 supplement及公共CLI。必要小型helper只为避免循环依赖，不建新预算服务。

当前真实快照3380 SHA8c411706deca3253f6b13c4428101a2590a6a8ade868ed6dda51a4762196acde须保持；任何真实phase extension/新拨款/付费均未获本卡授权。
