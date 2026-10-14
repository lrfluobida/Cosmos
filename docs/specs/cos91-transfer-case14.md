# COS-91 补充分配后的固定迁移 C14

状态：plan awaiting independent review；未开始生产实现，actual C14 / paid / supplement apply / human 均 NONE。Issue [#92](https://github.com/lrfluobida/Cosmos/issues/92)，id5855021876，Root 已报告原生挂父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，登记时91个子任务。依赖 COS88 #89、COS89 #90、COS90 #91。

专职作者 `cos91_implementer`；Root 指派独立 reviewer 和唯一 merger。分支 `codex/cos91-transfer-case14`，managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`，起点 main `3b2002ddd1541e20580e123ded819137dcc23e4c`；[实施计划](../plans/2026-10-15-cos91-transfer-case14.md)。本卡和计划先独立审查，COS90 生产接口独审稳定且 Root 指定集成基线后才实施。作者不更新共享 tracking、不写 GitHub、不读写真实账本或会话。

## 前提与目标

C13 已 failed 并消费，47 个 admitted coding-author 请求全部 settled，新增1641136µ，unknown/reserved为0，无 repair；没有生成源码。Root 完成 closure19 后为21 stopped / 13 delegations / 105 closed grants / 19 audits，原组 committed/allocated9100314µ、available899686µ，历史来源见 [C13结果](cos88-transfer-case13.md)。C13 不得重开、延长或借用其身份。

COS89 reviewed `b35124a8e48e532bda530607cfa04e25b3e1b57c`、merge `11c823a7fd1358cb570b1b80edd4b3300ee0115b`，标记 `AFFORDABLE_CODING_COMPACTION_SOURCE_READY`。COS90 已审计划 `0bd6683fd7ec80405da6ebb143e6c4b05715a6c8` 承接同一共享账本内一次固定1600314µ补充，绑定 C14完整向量，原parent allocation10000000µ及首个授权保持；最终生产 API、实际 source verifier、quote3 binding、reviewed/merge SHAs与 `VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY` 待Root交接。仅计划批准不能表示COS90生产源码已批准。

Root已转交稳定接口说明：`RunController.prepareValidationGroupSupplement` / `applyValidationGroupSupplement`，quote3 `budgetGroup.supplement={decisionId,limitMicroCny}`；`src/runtime/validation-budget.ts` 导出 `verifyValidationBudgetSources(root:string,state:RunSnapshot):Promise<void>` 验证包括supplement在内的实际receipt字节，closurequote3 basis含`allocationSupplements`。首次GREEN3/3仅为作者进度，生产仍等待最终独审与Root指定基线；phase须检查committed+2500000µ<=30000000µ。

## 固定范围与完成条件

1. 新独立案例 `cos20-transfer-validation-14`，固定2500000µ / 45min / 80requests / 一次合格coding repair、原两次logical attempts。planning/design/art各1µ、coding1900000µ、repair599997µ；五角色taskId固定为`cos20-transfer-validation-14-<role>`。旧声明、费用、窗口和审计不变，不提供CLI/模型预算、案例或角色选择。
2. 从真实停止C13推导D14：13个迁移历史声明，47个唯一request/entry精确对应coding-author/window/admitted/settled/evidence、zero unknown/reserved/no repair、每个grant恰一个实际closure及正确释放额。独立函数不调用预算可负担检查；费用变体只改变可用容量，不改变固定向量。
3. **资金引导分两步。** 未补充的ledger4也可推导真实D14，调用已有`fixedTransferValidationInput(D14).createTransferValidationIdentityReader`读取固定tracked requirements/template，供Root调用COS90 prepare/apply。该过程不生成窗口、不自动补充、不伪造quote/identity、不使用skip flag。C14正常预检随后必须要求已应用的精确supplement、ledger5和genuine case-quote3；补充不足或漂移即在host/provider/写入前拒绝。
4. 补充前available899686µ，COS90一次补充1600314µ后effective group capacity11600314µ、available2500000µ；原parent仍10000000µ。共享150000000µ、phase30000000µ、正式生成¥200/12h与优化目标¥100/6h保持。实际准入使用新snapshot/quote/source，不用本卡余额代替核账。
5. C5两passed阶段及七capture只读复用，零planner/design/art SDK；新coding author为空并运行时生成。保留旧C5 origin，当前C14 task/role/requirements/plan/candidate/manifest/operator receipt绑定准确，source/owner/请求/工具/child/截止守卫保持。
6. 六个C14薄wrapper，最小扩共用manifest/closure19、21cases/19audits、admission format与fourteen source seed。共用entry只为固定C14显式选择ledger5，旧缺省ledger4及旧C1–C13 quote2校验保持。partial沿原公式`preallocated + current grants`，标准样本11600314µ；旧C13的`<10000000`测试不复制到C14。
7. 继承旧prerequisites，再核COS88/COS89/COS90 marker与精确reviewed/merge双祖先。绑定完整quote3、snapshot fees/revision/hash、COS90实际supplement source bytes、manifest、source与roles。复用COS90已审source guard，在恢复/provider/tool/child边界拒绝stale、篡改或向量变化，不追加重复财务hash框架。
8. 独审计划后RED→GREEN，认证SOURCE、原host/factory/Pi fake、partial冷恢复、compiled与旧C13短代表、typecheck/build/affected strict、UTF-8/中文回读及diffcheck通过。独立reviewer查实际diff先规格后质量，作者修finding并重审。唯一merger集成推送、记录SHAs后才由Root登记`TRANSFER_CASE_FOURTEEN_SOURCE_READY`；计划作者不合main、不push。

## 免费证据安排

只读复用已评估存档`C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C13-proof-6daadf13-4334-44c6-b00b-006f3116c153`。history-1/2均ledger4/snapshot3/rev928、20/12/100/18，52个C12 admitted rows、无C13、zero unknown/reserved，合成C12费用1664926µ/1100000µ；result只有一笔C13 mock且没有closure19，不能作为C14财务基线。

从同一未改history前缀分别经原API追加47个C13合成请求和closure19，再经已审COS90原prepare/apply生成真实ledger5测试补充与receipt。标准C13费用1641136µ，第二视图改变C13合成费用；D14必须相等，容量行为按最终COS90契约。保留原parent、费用与历史前缀，使用真实SOURCE finance验证正常quote3准入；纯算术fixture或compiled简化窗口不作资金授权证明。

SOURCE覆盖未补充与各种source/quote/vector/marker/ancestor/owner漂移拒绝，成功路径用真实host/factory/Pi配fake transport验证空作者、历史复用、当前绑定和同窗口partial冷恢复。compiled只验证JS闭包、JS worker及源码漂移拒绝。finally恢复原snapshot/mapping/已有fixture字节与mtime、原缺失目录和owner状态，核C5与旧proof保持。原始命令/TAP、实际计数、时间、恢复证据与局限写入计划，不能把合成历史称为实际C13/C14费用。

不重跑旧长seed或已通过且无实质变化的矩阵。源码作者不执行付费、新真实窗口或operator操作脚本，不访问真实ledger/session/key或只读参考安装；不修改生成游戏。Root负责后续独立审查真实supplement quote、显式apply、免费预检、一次性脚本和一次有界C14；没有自动top-up、retry或旧案例重跑。

实际C14另记时间、费用、自检、作者文件、handoff/capture、正式build/browser/review/repair/accepted及清理。源码或synthetic通过不等于实际游戏通过；COS16/COS18、完整经典和human仍未完成。
