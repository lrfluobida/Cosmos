# 原生迁移 C14：正式构建通过，浏览器启动验收失败

记录日期：2026-10-15。冻结源码为 `b20e9a43f26712a1f5a13468057df46b6c012b69`。本记录依据固定运行的 result、正式构建及浏览器报告，`cos91_reviewer` 对费用和产物的独立核查，以及 Root 提供并独立复核的补充分配、owner 归档与 closure20 结果。它记录推箱子迁移验证；COS16/COS18、完整经典游戏和最终用户体验仍未完成。

## 实际结果

C14 为 **failed / insufficient_evidence**，身份已消费。运行时作者完成源码交接、捕获和正式构建；持久浏览器在首段启动界限失败，未完成玩法验收。没有调用独立 coding reviewer 或 repair，没有 accepted 候选和 human 确认。

| 项目 | 实际记录 |
| --- | --- |
| 开始／结束（2026-10-14 UTC） | 21:31:18.853／22:12:32.607 |
| 原截止时间（UTC） | 22:16:18.853 |
| 总用时 | 2,473,754毫秒，即41分13.754秒 |
| 固定案例上限 | ¥2.50／45分钟／80请求／一次合格repair |
| 作者请求 | 35次，全部admitted并settled |
| 新增费用／共享累计 | ¥0.792063／¥16.901000 |
| unknown／reserved | 0／0 |
| 当前SDK角色 | coding；C5已通过的design/art及七个capture只读复用 |
| 作者工具结果 | 21次read、10次write、7次edit、3次check；41个结果，0个工具错误 |
| 已记录原生压缩 | 0次 |

`stopReason.code=manual`对应单次运行完成后的普通停止文字，原身份仍消费；这不表示用户手动中止。启动器最终exit 1。没有重跑、延长C14或重新执行原案例。

## 作者产物、自检与正式构建

运行时作者生成 **10个文件、35,771字节**。`cos91_reviewer`独立核对了当前作者源码、封存的game-source v1、candidate v1、末次成功自检副本`F0b9Ok`和正式构建输入，十个文件逐字节一致。候选为`cos20-transfer-validation-14-game/v1`；存在候选不等于已接受。

三次作者自检依次为**失败、通过、通过**。首次在`BootScene.ts:40:39`因`Phaser.Events.LOAD_ERROR`不存在产生TS2339，TypeScript退出2；后两次TypeScript/Vite均退出0。作者继续修改后的当前版本与第三次通过副本相同，因此没有用较早版本的通过覆盖后续修改。

正式构建的TypeScript/Vite退出码均为0。**814毫秒仅为Vite报告的构建时间**，不代表作者自检、正式构建全链或生成总时间。静态交付helper退出0、`bytesMatched=true`，但`acceptancePassed=false`，不构成交付验收通过。

## 浏览器失败与清理限制

持久浏览器首段为2026-10-14 UTC **22:07:23.660–22:07:38.660**，在15秒启动界限处失败；21个步骤全部`skipped`。报告没有session字段，`browserPid`和`processExited`均为null，owned exit及profile身份未得到证明。现有报告不能断言OS浏览器进程是否实际启动，也不能将跳过的步骤解释为游戏断言失败。

coding review仍pending，repair为null，accepted为空，用户体验为`not_confirmed`。C14的失败与清理证据不足结论保留。

原运行停止后留下一个未登记PID的启动意图，生产自动恢复按原规则拒绝。Root在独立审查后检查原owner、九个已登记子进程、后代以及专用profile的当前状态，并完整归档原锁。**首次归档调用因PID 23364被复用，在任何写入前被守卫拒绝**；经独立调查和审查，精确进程代际例外允许第二次调用实际归档一次。没有杀死复用该PID的进程，没有改写生产恢复规则或伪造退出证明。

归档保留原锁字节、mtime和文件身份，snapshot仍为revision3113；独立postcheck通过。当前进程和profile检查只支持此次手动归档的静止状态，不补造C14历史OS spawn或owned exit证据。

## 补充分配与closure20

在C14前，Root沿COS90已审接口对原COS16组**一次实际补充分配¥1.600314**。这笔分配来自既有共享¥150总额；原parent allocation仍为¥10，组有效容量为¥11.600314，补充后可分配¥2.50。apply将revision2965推进到2966，未发送付费请求，原历史保持；quote与apply后状态均经独立核查。

owner归档后，Root一次执行已审closure20，并由`c14_owner_recovery_review`独立核对：

| 项目 | closure20之后 |
| --- | ---: |
| revision／账本版本 | 3114／5.0.0 |
| 已停止案例／delegations | 22／14 |
| 已关闭grants／closure审计 | 110／20 |
| 本次释放／组可分配 | ¥1.707937／¥1.707937 |
| 组有效容量／已用 | ¥11.600314／¥9.892377 |
| 共享累计／unknown／reserved | ¥16.901000／0／0 |

快照差异只有revision、五个C14关闭项、一个审计和一个事件；715个历史请求、22个案例、14个delegations、原费用、补充分配与既有前缀保持。最终snapshot SHA-256为`e8a921e618da619eacdd439c3260d2edcc10f48edcb823fd716274531cd85632`。进程及锁检查、owner与closure独立postcheck完成后，Root明确解除main冻结。

共享¥150、phase¥30、正式生成¥200/12h及优化目标¥100/6h保持。剩余组容量不授权重开已消费C14。

## 免费只读诊断与后续源码任务

冻结版本上的独立诊断每个组件测一次，全部通过；没有构造活动controller/store、调用provider、启动浏览器或原案例、追加窗口、重新seed历史。生产identity reader使用只读Git子进程。snapshot、admission和历史manifest的字节与纳秒mtime保持。

单次源码校验实测 **873.523毫秒**。源码调用链显示，启动的`verifyBinding`在`controller.prepareOwnedChild`之前嵌套12次validation scope，每次经过两次源码校验，合计24次。`873.523 × 24 = 20,964.552毫秒`只是**独立样本与源码计数的外推**，不是实际整链或C14历史耗时，也不是下界；没有单项实测达到15秒。重复嵌套校验是待验证的主要解释。

源码还显示，外层timeout race不会取消内部操作；prepare可能在超时后创建未完成ticket，prepare之后、spawn之前缺少本地启动deadline/取消复核。原运行deadline仍有检查，不能把本地15秒启动界限与原45分钟运行截止混同。

[COS92 / #93](https://github.com/lrfluobida/Cosmos/issues/93)已登记为open / `SOURCE_NOT_READY`，依赖COS37、COS52、COS91，由`cos92_implementer`负责免费源码修复。范围是启动内重复校验的测量与收敛、本地取消/截止贯穿prepare、持久ticket创建和spawn前复核，以及精确未spawn ticket的有界清理。短回归须覆盖迟到prepare、ticket到spawn间截止、已登记PID的正常退出、原运行取消/截止与来源漂移、及时路径仅启动一次。其计划和源码仍须独立审查；本登记不表示修复已通过或授权新付费案例。

## 证据位置与公开结果

- 实际运行：`.cosmos/e2e/cos20-transfer-validation-14/result.json`；正式构建及host报告在其`evidence/cos20-transfer-validation-14-coding/`下；首段和持久序列报告在其`browser-evidence/`下。
- 安全汇总及只读诊断：`.cosmos/reconciliation/2026-10-13-c6-provider-usage/coordinator-cos85-86-state.json`、`case14-guard-timing.json`、`case14-guard-assessment.txt`。私有运行文件保持原位，本记录未复制会话正文、密钥或模型推理。
- [COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6180211123)及[C14入口结果](https://github.com/lrfluobida/Cosmos/issues/92#issuecomment-6180211817)已由Root发布并精确读回。COS90/COS91的源码范围完成状态保持；实际迁移失败与未完成的完整经典/体验验收单独保留。
