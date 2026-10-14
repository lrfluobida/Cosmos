# COS-91 补充分配后的固定迁移 C14

状态：source scoped complete/closed / source-only；actual C14 / paid / 真实supplement apply / human 均 NONE。Issue [#92](https://github.com/lrfluobida/Cosmos/issues/92)，id5855021876，Root 已报告原生挂父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，登记时91个子任务。依赖 COS88 #89、COS89 #90、COS90 #91。

专职作者 `cos91_implementer`；Root 指派独立 reviewer 和唯一 merger。分支 `codex/cos91-transfer-case14`，managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`，起点 main `3b2002ddd1541e20580e123ded819137dcc23e4c`；[实施计划](../plans/2026-10-15-cos91-transfer-case14.md)。本卡和计划先独立审查，COS90 生产接口独审稳定且 Root 指定集成基线后才实施。作者不更新共享 tracking、不写 GitHub、不读写真实账本或会话。

计划首版 `2fd886bc1394c40606de0b7f3907ef9653bb1584` 独审 P1 指出递归历史推导中的 C7 ledger4-only guard 会阻断补充后的 C14；本次只修订 plan/card，待独立复审，不开始生产实现。

修订计划 `dfe83f13c425a8952e1987adb7043eae37170a3b` 已由`cos91_reviewer`独立PLAN_APPROVED，无finding，[公开批准](https://github.com/lrfluobida/Cosmos/issues/92#issuecomment-6177975415)由Root交接。COS90最终源码`ca350ea612c924150e9f4501932a5799e4fcfbc4`、merge`7b676094fc16ddb3012804fdc3c78502f34fd0ab`已独审集成；作者已同步Root指定最终main`d44c5689e429836f0b3a7cd4eb281f014b977f50`，开始免费实施。唯一merger为`batch_cos90_91_merger`；上文未实施状态保留首版时点。

## 前提与目标

C13 已 failed 并消费，47 个 admitted coding-author 请求全部 settled，新增1641136µ，unknown/reserved为0，无 repair；没有生成源码。Root 完成 closure19 后为21 stopped / 13 delegations / 105 closed grants / 19 audits，原组 committed/allocated9100314µ、available899686µ，历史来源见 [C13结果](cos88-transfer-case13.md)。C13 不得重开、延长或借用其身份。

COS89 reviewed `b35124a8e48e532bda530607cfa04e25b3e1b57c`、merge `11c823a7fd1358cb570b1b80edd4b3300ee0115b`，标记 `AFFORDABLE_CODING_COMPACTION_SOURCE_READY`。COS90 已审计划 `0bd6683fd7ec80405da6ebb143e6c4b05715a6c8` 承接同一共享账本内一次固定1600314µ补充，绑定 C14完整向量，原parent allocation10000000µ及首个授权保持；最终生产 API、实际 source verifier、quote3 binding、reviewed/merge SHAs与 `VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY` 待Root交接。仅计划批准不能表示COS90生产源码已批准。

Root已转交稳定接口说明：`RunController.prepareValidationGroupSupplement` / `applyValidationGroupSupplement`，quote3 `budgetGroup.supplement={decisionId,limitMicroCny}`；`src/runtime/validation-budget.ts` 导出 `verifyValidationBudgetSources(root:string,state:RunSnapshot):Promise<void>` 验证包括supplement在内的实际receipt字节，closurequote3 basis含`allocationSupplements`。首次GREEN3/3仅为作者进度，生产仍等待最终独审与Root指定基线；phase须检查committed+2500000µ<=30000000µ。

## 固定范围与完成条件

1. 新独立案例 `cos20-transfer-validation-14`，固定2500000µ / 45min / 80requests / 一次合格coding repair、原两次logical attempts。planning/design/art各1µ、coding1900000µ、repair599997µ；五角色taskId固定为`cos20-transfer-validation-14-<role>`。旧声明、费用、窗口和审计不变，不提供CLI/模型预算、案例或角色选择。
2. 从真实停止C13推导D14：13个迁移历史声明，47个唯一request/entry精确对应coding-author/window/admitted/settled/evidence、zero unknown/reserved/no repair、每个grant恰一个实际closure及正确释放额。独立函数不调用预算可负担检查；费用变体只改变可用容量，不改变固定向量。递归会进入C7纯helper；最小扩`validation-case-seven-declaration.ts:24` version guard为ledger4/5并更新对应错误说明，原`COS16_GROUP_GRANTS`/10000000µ角色向量、费用检查与返回声明不变。C14 ledger5推导边界先`validateSnapshot(state)`；不得伪装ledger4、移除supplements或用新有效容量生成旧grant。旧声明保持指返回固定契约/序列化字节及持久历史保持，允许该必要guard调整；旧entry仍要求ledger4、旧历史quote2保持。
3. **资金引导分两步。** 未补充的ledger4也可推导真实D14，调用已有`fixedTransferValidationInput(D14).createTransferValidationIdentityReader`读取固定tracked requirements/template，供Root调用COS90 prepare/apply。该过程不生成窗口、不自动补充、不伪造quote/identity、不使用skip flag。C14正常预检随后必须要求已应用的精确supplement、ledger5和genuine case-quote3；补充不足或漂移即在host/provider/写入前拒绝。
4. 补充前available899686µ，COS90一次补充1600314µ后effective group capacity11600314µ、available2500000µ；原parent仍10000000µ。共享150000000µ、phase30000000µ、正式生成¥200/12h与优化目标¥100/6h保持。实际准入使用新snapshot/quote/source，不用本卡余额代替核账。
5. C5两passed阶段及七capture只读复用，零planner/design/art SDK；新coding author为空并运行时生成。保留旧C5 origin，当前C14 task/role/requirements/plan/candidate/manifest/operator receipt绑定准确，source/owner/请求/工具/child/截止守卫保持。
6. 六个C14薄wrapper，最小扩共用manifest/closure19、21cases/19audits、admission format与fourteen source seed。共用entry只为固定C14显式选择ledger5，旧缺省ledger4及旧C1–C13 quote2校验保持。partial沿原公式`preallocated + current grants`，标准样本11600314µ；旧C13的`<10000000`测试不复制到C14。
7. 继承旧prerequisites，再核COS88/COS89/COS90 marker与精确reviewed/merge双祖先。绑定完整quote3、snapshot fees/revision/hash、COS90实际supplement source bytes、manifest、source与roles。复用COS90已审source guard，在恢复/provider/tool/child边界拒绝stale、篡改或向量变化，不追加重复财务hash框架。
8. 独审计划后RED→GREEN，认证SOURCE、原host/factory/Pi fake、partial冷恢复、compiled与旧C7/C13短代表、typecheck/build/affected strict、UTF-8/中文回读及diffcheck通过。通过真实COS90 apply获取ledger5，断言补充前后D14 deepEqual、C1–C13历史声明序列化字节与quote2/parent/grants不变；正常entry/driver/task及冷恢复都实际递归推导成功，旧C7/C13 entry对ledger5仍零写入拒绝。独立reviewer查实际diff先规格后质量，作者修finding并重审。唯一merger集成推送、记录SHAs后才由Root登记`TRANSFER_CASE_FOURTEEN_SOURCE_READY`；计划作者不合main、不push。

## 免费证据安排

只读复用已评估存档`C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C13-proof-6daadf13-4334-44c6-b00b-006f3116c153`。history-1/2均ledger4/snapshot3/rev928、20/12/100/18，52个C12 admitted rows、无C13、zero unknown/reserved，合成C12费用1664926µ/1100000µ；result只有一笔C13 mock且没有closure19，不能作为C14财务基线。

从同一未改history前缀分别经原API追加47个C13合成请求和closure19，再经已审COS90原prepare/apply生成真实ledger5测试补充与receipt。标准C13费用1641136µ，第二视图改变C13合成费用；D14必须相等，容量行为按最终COS90契约。保留原parent、费用与历史前缀，使用真实SOURCE finance验证正常quote3准入；纯算术fixture或compiled简化窗口不作资金授权证明。

最终COS90要求原available+1600314µ恰为2500000µ；标准费用视图apply成功，较低C13费用1100000µ的第二视图应在prepare时拒绝固定supplement，保存零写入证据。共用最终报告只为显式C14使用已认证组limit11600314µ，旧入口保留10m检查。另仅调整旧C13一条错误文字正则以接受COS90新`authenticated`文字，容量拒绝断言不变。

SOURCE覆盖未补充与各种source/quote/vector/marker/ancestor/owner漂移拒绝，成功路径用真实host/factory/Pi配fake transport验证空作者、历史复用、当前绑定和同窗口partial冷恢复。compiled只验证JS闭包、JS worker及源码漂移拒绝。finally恢复原snapshot/mapping/已有fixture字节与mtime、原缺失目录和owner状态，核C5与旧proof保持。原始命令/TAP、实际计数、时间、恢复证据与局限写入计划，不能把合成历史称为实际C13/C14费用。

不重跑旧长seed或已通过且无实质变化的矩阵。源码作者不执行付费、新真实窗口或operator操作脚本，不访问真实ledger/session/key或只读参考安装；不修改生成游戏。Root负责后续独立审查真实supplement quote、显式apply、免费预检、一次性脚本和一次有界C14；没有自动top-up、retry或旧案例重跑。

实际C14另记时间、费用、自检、作者文件、handoff/capture、正式build/browser/review/repair/accepted及清理。源码或synthetic通过不等于实际游戏通过；COS16/COS18、完整经典和human仍未完成。

## 作者免费实现证据与已知限制

六项有效RED后，C14 unit6/6、compiled1/1、最终SOURCE补充代表1/1，均0skip；typecheck/build/affected strict退出0。旧C7/C13首次短代表9pass/1fail仅因COS90新错误文字，正则最小适配后受影响项1/1通过，另九项复用。COS90源码、旧声明返回固定契约和quote2历史保持；实际文件范围、命令、raw与归档见[计划](../plans/2026-10-15-cos91-transfer-case14.md)。

首次SOURCE所有正文断言完成：原API新增两组各47笔C13合成请求和closure19、标准COS90 ledger5 supplement、真实host/factory/Pi fake、空作者/C5历史、同窗口冷恢复与旧历史前缀。**首次整体0pass/1fail**，finally多余mtime重设造成C8受保护marker0.0002ms舍入差异；该循环已删除，已知marker精确ticks恢复，首次其余纳秒时间无保存，不能声称所有首次mtime逐bit不变。来源、费用与文件字节保持。

补充负例执行时173个捕获生产文件逐字节保持，tests不在闭包；该SOURCE SHA为`3b75fe6e7d87f4db8f92e73631e9c9eeff7ca0b2a1d87fe681d0c7350f5efb2a`。只复用原API认证历史补验真实D14补充前identity、前后deepEqual、旧entry ledger5拒绝、supplement实际source/target/vector、stale quote、派发前worker0、超过旧10m报告，最终1/1及finally恢复通过；未重复47笔seed或完整host正例。snapshot/mapping按既有<1ms时间容差检查，未改proof字节/mtime严格检查。

提交前将两个新文件中共4个CRLF规范为仓库要求的LF，保存原字节并确认只有这两路径换行改变，其余171个捕获文件保持；最终SOURCE SHA为`5ed07064e2476d7fc241926b82aa5d85227c938a77edd1c48a1906d1a5b6258a`。最终短source capture/compiled各1/1，前后src/probes全部180个发射JS逐字节相同，详见计划的raw及`cos91-line-ending-emit.json`。按该仅EOL/JS等价证据复用长SOURCE，不能称最终173个TS字节与初次完全相同。

两个费用视图D14相同；标准费用1641136µ的supplement成功，1100000µ视图固定supplement拒绝。最终report财务代表committed10100314µ、limit11600314µ，无错误的旧10m超限gap；report本身failed且没有游戏SDK/验收。compiled简化窗口只证明JS source/worker，所有真实运行和human仍NONE。最终 `28e89554b933da9409fac7820a12948cc2159271` 已经 `cos91_reviewer` 实际diff独立规格→质量APPROVED，无finding；唯一 `batch_cos90_91_merger` 合入 `f67979daf2c46752b67778c7433b4b54f202b7a2`，标记 `TRANSFER_CASE_FOURTEEN_SOURCE_READY`，[公开源码批准与关闭](https://github.com/lrfluobida/Cosmos/issues/92#issuecomment-6178757721)、closed(completed)及父勾选已由Root精确读回，发布主线 `b28fff1589c649dc412826edfd5d187f02a0471e`。主线typecheck/build退出0，C14 unit6/6、旧C7/C13短代表2/2、0skip；原始输出为 `C:/Users/26557/AppData/Local/Temp/cos91-merge-typecheck.log`、`cos91-merge-build.log`、`cos91-merge-unit.tap`（9050.6385ms）及 `cos91-merge-old.tap`（6364.6168ms）。已独审的SOURCE组合证据、恢复限制、最终source capture/compiled及180个JS等价证据按前述边界复用，未重新seed或长跑。Root后续operator源码前提已具备：在shared¥150硬上限内，先沿COS90对原组固定内部分配1600314µ，再按新quote准入C14的¥2.50/45分钟/80请求/一次合格repair；仍须Root独立核quote、显式apply和最终冻结。真实账本仍revision2965/v4、原组¥10/可分配899686µ、sharedsettled16108937µ，未quote/apply或运行C14。main保持unfrozen，phase¥30、正式¥200/12h保持，COS16/18、完整经典和human仍未完成。
