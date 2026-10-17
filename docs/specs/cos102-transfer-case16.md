# COS102：复用固定生命周期的第十六迁移案例

状态：设计`73aceb8918d49462f6339be599f7952ae74cfbfe`经`cos102_design_reviewer`最终`APPROVED_DESIGN`，无P1/P2，Root已批准设计；唯一merger `batch_c14_cos92_merger`合入`9c959575159ed0b8c2d3c052dc6db23f0caf2feb`。Root已[公开授权](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6212342953)免费SOURCE实施；Task A已[独审批准](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6213202409)，Task B已[独审批准](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6213578097)，Task C已独审，组合源码`d5a7a2cd94d928f9bccc78086508c5862f1954c5`经`cos102_pipeline_reviewer`审查、Root[批准](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6214075389)`APPROVED_SOURCE_SCOPED`，无finding；唯一merger合入`cfc7feffb176981f057b6bc7f2b66962039229e8`，`TRANSFER_CASE_SIXTEEN_SOURCE_READY` / `source-integrated`。后续获准单次actual已中断并消费，恢复与账务收口完成；issue保持open/incomplete。任务[COS102 / #103](https://github.com/lrfluobida/Cosmos/issues/103)，id5881517542，已原生挂父[COS16 / #17](https://github.com/lrfluobida/Cosmos/issues/17)、未勾选，Root已精确GET核证；新增恢复子项COS103/#104后，#103直接1、#17直接2、根#1直接100、总任务103。文档基线`2d9b0b5c6d088615010b41d6b6a9b5f5ade970a7`，其生产源码与`ea4876a62df70fcfaa95d795aa2b68c970f6ff67`相同。

源码组合验证：main typecheck/build均退出0，core/entry/共享源码闭包短代表3/3、0skip；完整SOURCE1/1与compiled等已审证据复用。SOURCE仅证明真实factory/Pi/build/promotion接fake provider/browser的8段176 checks/4媒体字段、223合成步骤记录，8张合法PNG独立review approved及精确C16 game v1，2次fake请求20µ、正常stop/owner close。SOURCE恢复及mtime限制见[实施记录](../plans/2026-10-16-cos102-transfer-case16.md#源码交付与主线集成记录)，不撤回原限定。

2026-10-17实际结果：生产715 preflight获批但保留源码mtime前值缺口；单次C16在冻结`2f84eb3`上v1正式build通过、start21步20通过/1失败，原repair的v2正式build通过但仅有plan、无report。v1缺board testid、v2补属性仅为静态证据。经[COS103](previous-boot-owner-recovery.md)两锁维护，原main API真实now记录`2026-10-17T08:38:18.674Z` deadline stop，原deadline保持；closure22后revision3334、120 closures/22 audits，C16 51请求/1265722µ、shared766请求/18166722µ、reserved/unknown0，释放未用分配19734278µ。最终独立后核PASS、Root解冻；C16仍consumed/incomplete，无220/62、DeepSeek review、promotion或原deadline内clean final通过，无新paid/重跑授权。见[研究记录](../research/2026-10-17-cos102-interrupted-actual.md)与[公开闭账结果](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6231925268)。下述成功条件和预算契约保持，COS16/COS18、fullclassic/human未提升。

2026-10-17独立补测结果：已审[计划](../plans/2026-10-17-c16-v2-independent-validation.md)与脚本经Root单次批准执行，封存v2的逐字节TEMP副本在47.602秒内八段220/220、62/62媒体字段通过，exit0；同profile/origin真实重开、8browser正常退出、静态服务关闭及独立无进程/端口后核通过。390保护文件+33harness/script和ledger保持，新增模型/费用0；独审`APPROVED_C16_V2_INDEPENDENT_VALIDATION_RESULT_SCOPED`无finding，Root已解冻，[公开结果](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6233582959)已精确读回，本次文档已审集成发布。见[研究记录](../research/2026-10-17-c16-v2-independent-validation.md)。这是另记的候选补测，不提升原C16 consumed/interrupted/incomplete、本卡open或原deadline/controller/modelreview/promotion/human/fullclassic状态。

## 目标与已有事实

固定新案例`cos20-transfer-validation-16`（C16）使用原共享验证账本，复用C5已批准design/art，由新的运行时coding作者生成代码，完成正式构建、真实八段输入、完整媒体检查、独立截图review、精确promotion和正常清理。C16是一次新的有界验证，C15原身份、时钟和失败结论永久保留。

[C15实际记录](../research/2026-10-16-cos101-c15-watchdog.md)及[公开闭账结果](https://github.com/lrfluobida/Cosmos/issues/102#issuecomment-6211338359)证明：C15在claim后约1.814秒被Root私有PowerShell监督器错误解析UTC而终止，新增模型请求、费用和游戏产物均为0。原API manual stop和closure21已完成，独立后核无残留，Root已解冻main。该失败没有否定尚未执行的coding/host/harness链；不能据此重开C15。

本次只读核对基线为revision3117、ledger5、23 stopped cases、715 requests、14 delegations、115 closures、21 audits；settled16901000µ，reserved/unknown0。snapshot SHA256为`8eb06b98e6b1ed989d2cf7580a4a01bd138fc90ae0f2b0d261beb964f8eb6ca2`。共享未分配57911425µ，原COS16组剩1707937µ。C15的task/request/费用行均为0、repair=null；根目录为空，runtime marker不存在，目录仅为closure补建的账务恢复根。实际启动时必须重新读取来源及报价；这些数字不是持续付费许可。

## 方案取舍

| 方案 | 结论 |
| --- | --- |
| 固定C16，C15/C16共享内部生命周期 | 采用。复用现有37,688字节入口中的认证、claim、执行和清理逻辑，增加精确历史尾项与当前身份。 |
| 为C16复制完整独立入口 | 可以实现，但会复制历史认证、source approval和清理逻辑，增加两份代码分叉风险。 |
| 直接使用公开`new`或`continue` | 不适用。`new`创建独立generation/¥200账本；`continue`拒绝validation。现有公共入口没有接续本shared¥150账本的能力。 |

`src/runtime/validation-window.ts::eligible`目前只允许ledger5上的grouped声明或完整固定C15；C15又要求前任为已停止且五grants关闭的C14。`validation-budget.ts`将grouped新准入固定为原supplement的C14目标；重复case拒绝。只修改launcher或换一个case名字不能合法启动。公开human流程仍须自己的stdin确认和原human来源，内部operator不能代替它。本卡不扩展公开需求流程、第二组、supplement或ledger版本。

## 固定范围、预算与成功条件

| 项目 | C16值 |
| --- | --- |
| 账本 / 声明 / quote | 原ledger `5.0.0` / `validation-declaration-2` / `validation-case-quote-1`，无budgetGroup |
| 模型 | `deepseek-flash` |
| shared / phase / case实际新增费用硬帽 | ¥150 / ¥30 / ¥5 |
| 五项allocation | planning¥2、design¥1.9、art¥5.7、coding¥7.6、repair¥3.8，合计¥21 |
| case时限 | 原子claim起5400000ms，含交付、stop、drain及controller owner释放 |
| 请求 / repair task / attempts / reviewer格式纠正 | 80 / 1 / 2 / 1，沿原策略 |
| 声明输出上限 | planning4096、design16384、art/coding65536、reviewer16384；实际编码沿已有较低策略 |
| 固定根 / manifest | `.cosmos/e2e/cos20-transfer-validation-16` / `cos20-transfer-validation-16-reuse.json` |

¥21是角色分配容量，实际支出仍受¥5、phase、shared、role、请求数与deadline交集限制。claim后shared未分配预计36911425µ；若用满¥5，phase累计21901000µ，仍低于¥30。prior721771µ已包含在共享累计，原parent¥10、supplement¥1.600314、组容量¥11.600314及已用¥9.892377不变。带图review继续按2131072µ预留，真实host最多八图；不能删图或降低预留来适配旧组余额。repair与review共同使用本case的¥5。

成功须同时满足：

1. 新coding工作副本初始没有C14/C15或其他未批准代码；作者输出、自检、capture、candidate与正式build绑定同一新版本。
2. 固定T16-01～06与C5实际冻结的完整八段/220步全部执行且无失败或跳过，含同profile/origin的真实进程关闭与重开。
3. 新candidate完整62项媒体字段通过；正常截图、视频和原始consumer报告绑定该candidate。视频成功finalize且可完整解码，正常退出与清理有证据。
4. 独立上下文reviewer实际收到最多八张正常截图，读取固定产物和主机证据并明确approved；task passed，`ArtifactRegistry.current()`精确指向该candidate。
5. 交付报告、源码/启动说明、费用和差距可定位；正常manual stop、owned work/drain/controller close完成于原deadline内，unknown/reserved为0，promotion在清理前后不变。

不复用C14候选的220/62通过数，也不以SOURCE176 checks/4媒体字段代替新实际验收。T16没有FPS条目，本卡不增加性能工作。即使C16通过，COS18的公开CLI真实确认、两种brief、用户正常试玩和完整经典游戏仍分别验收，`userExperience`保持`not_confirmed`。

## 输入与core准入

`probes/transfer/requirements-case-fifteen.json`实读后确认没有C15 case/window/task身份字段。D16直接复用它的原路径、版本和UTF-8字节，不新增或改写中文需求文件：requirements摘要`fa55cc277747ece5e76cdcffb7112ad6ed0c3f79ecdcb0f95afa407a6dcee6ed`，template摘要`d6dfe213c0b57c41e0be90bc017705b7de9316dd54c58e611affc9fb376c7025`，input hash`5864b22e0d1e682d5aa137cc95aab277bf71a3750b40afdd9a68ebd9ab34a72c`。同一冻结输入不等于同一验证身份；D16的case、五task、window、quote、operator、admission和当前requirement source均独立。

- `validation-validation.ts`保留`isFixedTransferCaseFifteenDeclaration`的C15-only语义，新增完整`isFixedTransferCaseSixteenDeclaration`。新谓词精确核对上述全部字段；可无损归一化固定C16 case/task IDs后复用C15完整匹配，但不能丢弃额外字段、接受任意ID或只检查limits。只有两个精确谓词允许90分钟；伪造C15/C16及其他案例45分钟+1ms仍拒绝。
- `validation-window.ts::eligible`只增加ledger5、当前为stopped C15且五grants全部closed→固定C16的分支。C15仍仅接受原C14前任。原重复/过期quote/费用未决/charge_overrun/owner/分配容量检查保留。
- prepare/claim/controller每次身份检查仍调用`verifyValidationBudgetSources`，读取旧delegation和supplement实际来源。原budgetGroup投影、ledger、allocation closure和RunController契约无须改变；C16五grants进入shared allocated，不进入旧COS16组。

## host的两个固定兼容证明

`entrypoint-host.ts::requireFixedTransferCaseFifteenInput`改为内部支持两个完整固定声明的同一证明。当前ID从已通过C15或C16精确谓词的scope declaration取得，不从CLI、环境变量、模型、外部布尔或兼容callback取得。

原证明逐项保留：当前唯一window、ledger5/quote1/无group、controller snapshot与当前requirement身份和operator决定一致；旧来源必须是同账本唯一C5 window及原design/art task；manifest、reviewedPlatformSha、旧input hash、旧operator决定、原root和已签名requirement capture一致。当前source为`<currentId>-input`/`requirements/fixed.json`，manifest引用和targetRoot归当前case；旧source与capture仍归C5。

host在import/capture/session/作者创建前，读取C5已认证capture中的旧requirement字节及当前已认证scope的`requirements/fixed.json`，分别按各自声明核摘要。旧固定路径仍为`probes/transfer/requirements.json`，两个新case的路径均为`probes/transfer/requirements-case-fifteen.json`；template及version相同。仅移除旧JSON中精确原COS16 budgetGroup后，新旧完整对象全等，完整acceptance、brief、scope、preparation、unsupported和draft均不得变化。cold restore重走证明；其他案例继续原同hash规则，逐次scope/source检查保持。

## 共享入口与历史认证

新增`probes/transfer/validation-shared-coding-entry.ts`，只承载C15/C16共用逻辑；内部冻结两份固定policy，外部不接收policy、declaration、historyCount、预算或源码检查开关。两个具名构造函数分别绑定固定policy；C15原入口保留全部现有exports与函数签名，通过薄包装或再导出调用共享实现。C16提供自己的declaration/entry/run/source/driver/task薄接线。

共享生命周期保持：free preflight不写文件、不占owner、不prepare host或创建provider；正式入口免费host.prepare后重验同quote，保存operator-covered admission，再原子claim一次。后续由现有controller/OwnedWork、C6 coding-only driver/task、真实reused host/factory/Pi/orchestrator执行。失败保全、相同active window的cold restore、精确promotion、正常stop/drain/close与费用检查均保留。没有失败回调自动重试或自动换case。原C15已stopped，因此任何cold resume仍拒绝。

| 契约 | C15保持 | C16新增 |
| --- | --- | --- |
| 前任与历史 | C14；22 cases/110 closures/20 audits | C15；23 cases/115 closures/21 audits |
| 旧group成员 | C1～C14，14 delegations，一次supplement | 完全相同；C15不加入成员 |
| 历史quote与inputs | 原native历史及C1～C14规则保持 | 上述前缀外，单独追加D15/quote1/D15.inputs |
| 历史请求与费用 | 715、16901000µ | 同值，C15增量为0 |
| 自身source approval | COS101及原完整依赖 | COS101及原完整依赖，再加COS102自己的reviewed/merge SHA与固定source marker |
| admission / manifest | 原格式、身份及路径保持 | `transfer-case-sixteen-admission/1`及C16专属引用 |

C16 preflight除原22-case认证外，须单独认证C15尾项：

1. 唯一C15窗口的完整D15/quote1/无group、原operator实际字节与quote、原claim/deadline/manual stop/repair=null均一致；没有C15 task、request或费用行，五原allocation存在且无delegation。
2. closure21为原独立decision，引用该case/window/originalQuoteId/operator摘要及固定artifactRoot；五项spent0、合计released21000000µ，与ledger closures一致。实际21份closure来源、原budget来源均重读；C16历史accounting摘要覆盖23个case、115closures/21audits与原请求/费用/supplement前缀。
3. C15 operator覆盖的admission及reuse文件须读取实际字节、核其版本摘要、当时quote/manifest/sourceApprovals/execution receipt身份和内部摘要绑定。旧reviewed/merge来源须是新reviewed main祖先。旧execution记录保留当时的文件路径和摘要，不能调用当前source capture/require去重算旧执行闭包；旧文件经过源码升级是正常的，不能据此改写旧回执。
4. C15空根必须是原closure认证的固定目录且无owner/registry writer。它不是runtime产物，不要求或补造origin、marker、execution、candidate、result或任务历史。新C16根与marker仍必须在首次准入前不存在。

C16不得把C15输入套成D5.inputs/quote2，也不能把14个group成员计数改为15。当前quote基线绑定真实snapshot字节/revision；source、费用或历史漂移时停止并重新报价，不放宽到一个范围。

## 源码闭包必须覆盖抽取后的实现

`validation-case-seven-source.ts::captureFixedTransferCodingSource`当前从run/driver/task开始，遍历同一行的字面量相对`import/export ... from`及字面量动态import，再显式加入validation-worker、coding-check-worker和acceptance process。仅在类型联合中增加`'sixteen'`不能证明新共享模块已经封存。

必须建立可由现有遍历器识别的真实导入链：C15/C16 run→各自entry→`validation-shared-coding-entry`，各自driver→各自source/task及共享认证函数。共享模块对实际driver的动态import使用明确字面量路径；不要把关键依赖藏进计算路径、外部配置或遍历器不识别的导出布局。若确有未识别的真实动态worker，按原机制加入显式固定seed并测试，不能扫描全仓或跳过检查。

SOURCE与compiled两种capture都必须列出新共享模块及其必要传递依赖、各自wrapper、真实host/factory/Pi、三个动态worker和原锁定dependency/template。C15闭包仍验证C15自己的入口，C16验证C16自己的入口；admission各自覆盖本次完整execution。测试在TEMP分别篡改共享模块和仅经共享模块传递导入的依赖，四种组合（C15/C16 × TS/JS）均须在provider/owned child前拒绝，且已封存receipt不能因重新capture被替换。当前来源持续核验；没有允许跳过旧来源的callback/布尔。

## 验证与实际执行关口

复用COS101预算矩阵、C5来源与approved成果、原C15 SOURCE和已通过native导航/媒体组件、图片预留与UTC三行修正证据。新增检查集中于C16身份、C15零任务历史尾项、共享入口抽取、host兼容和source/compiled传递闭包；计划见[实施计划](../plans/2026-10-16-cos102-transfer-case16.md)。隔离SOURCE复用原API历史，仅追加C15零任务claim/stop/closure21，不重建C1～C14、不为凑715构造重复请求；SOURCE364和实际715始终分开。

独立reviewer通过设计后由唯一merger合入；Root随后单独授权源码。源码各task独立作者/独立reviewer、准确SHA和证据经唯一merger核对后集成。SOURCE只证明源码范围，不授予付费或实际运行。

源码集成并发布独审元数据后，Root准备C16独立C5 manifest，授权一次实际715只读preflight；它必须返回固定quote1和完整admission，前后实际账本及旧来源不变。随后Root与独立reviewer核对精确quote及新launcher，Root另行批准一次paid启动。无approved quote/launcher不得启动新provider。

新私有launcher保留claim前15分钟免费prepare外guard，claim后只使用新C16原90分钟硬deadline。原C15 v1永久保留；复用已审三行UTC修正（`-DateKind String`、`InvariantCulture`、`.ToUniversalTime()`）与原7项RED/GREEN证据。新launcher仍需用实际JSON读取链证明：准确选择C16与批准quote/window、忽略closed C15、保留UTC标记/毫秒、claim后观察时绝对deadline仍在未来；核对绝对UTC instant和deadline前后边界，不能只比较两个错误时间的90分钟差值。具体launcher/source SHA、guard和一次消费记录在实际审批时冻结，不在本文捏造。

实际执行须重新取得新candidate的完整验收、视频解码、截图review、promotion和正常清理；到预算/时限/未知费边界即停止，保存差距。独立postcheck确认无残留后，Root再单独审查本case的closure quote/apply。不得重放C15、缩小验收、延长窗口或自动发起C17。最终报告保持COS16/COS18、human及完整经典的各自状态。
