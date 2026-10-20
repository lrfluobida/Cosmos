# COS109 公开生成的共享验证额度绑定

[COS109 / #110](https://github.com/lrfluobida/Cosmos/issues/110)，id5943672677，原生父 [COS18 / #19](https://github.com/lrfluobida/Cosmos/issues/19)。依赖已完成的 COS107/COS108；基线 `415e7a061d1e6ba71bce744fe9b3d51ea68b822e`。计划 `4acc3d104a0b5d0cc3d5f1dfefae1e184fa659f8` 已独审 `APPROVED_PLAN` 并获 Root 批准；当前源码与免费验收候选待最终独审，尚未集成。

专职 implementer：`public_validation_route_assessment`；独立 reviewer：`public_run_limits_reviewer`；唯一 merger：`public_agent_batch_merger`。实现按[实施计划](../plans/2026-10-20-public-validation-funding.md)独审后由 Root 批准推进。

## 问题

普通 `new` 已支持用户选择较小预算和时限，访谈与生成共用该运行的原账本，但它没有事前占用原开发验证共享 ¥150。现有 validation case 入口与固定五角色 grants 不能直接承接新的公共访谈运行。

本卡接通公共 CLI 与共享开发验证预算，随后可用于非 PvZ 的鼠标配对等普通游戏需求。目标是验证 Cosmos 作为通用游戏开发 agent 的能力，不新增固定游戏 case 或第二套生成流程。

## 选定行为

1. 一个窄的 operator 入口读取真实预算授权来源，调用现有 `runCli` 和生产 host；公共游戏访谈、需求确认、生成、评审、修复和交付保持原链。
2. 第一笔访谈调用前，从原共享 snapshot 原子分配本次完整费用上限。沿用 `allocation` 表达拨款，不能把整次运行伪装成供应商请求。
3. 拨款唯一绑定共享账本身份、规范化运行根、运行 ID、本地 ledger ID、金额、时限和授权来源。共享与本地写入不是跨目录原子事务；每个中断点必须保留身份并在调用前核验。
4. 公共运行继续使用原 intake/generation 单账本逐请求记账；shared 在结清前占用完整拨款，不随局部费用结算提前释放。
5. 原执行清理已证明结束、费用证据完整且没有 reserved/unknown 后，原子纳入真实费用并归还余额。正式失败或未产出报告也必须有原签名清理证明；intake 还须持久停止及原生命周期关闭证明。
6. 保留真实请求 ID、供应商、价格版本、原任务及回执映射。共享结算是同一费用计入总账，不能重复累加子账金额；重复结算幂等，冲突来源拒绝。
7. 冷恢复保留原限额、费用、时钟、确认和拨款。绑定在首访谈、正式 host 打开与普通恢复入口均不能省略；已结清拨款不得再次派发。
8. 普通未绑定运行行为保持。首版绑定仅覆盖原运行，`continue` 的加钱或加时均在确认、owner 激活及调用前拒绝。

唯一授权 payload 保存固定 ID/根/限额/brief/采样、真实决定和来源引用，不含自身 hash 或派生完整 binding。先发布并读回原字节，再计算 hash 构造 binding；intent 仅索引该授权，不成为第二份权威。

## 总额与阶段容量

设 `C` 为共享已结算与 provider 预留之和，`H` 为所有未结清公共拨款的完整上限之和，`L` 为新拨款。

- `L` 必须满足原共享 ¥150 中的未分配 allocation 容量。
- `C + H + L <= 30_000_000` micro-CNY；现有 ¥30 阶段门槛保持。不能只检查已有 entries。
- 已结清拨款的真实费用已进入 `C`，不再计入 `H`。存在真实超预留时保留事实并停止新增拨款，不截断账面金额。
- `H > 0` 或存在公共 overrun 时，旧 case 的新 claim/reserve/admit 拒绝；会计、stop/read 仍可用。绑定公共控制器在每次新 reserve/admit 重读 shared，A 的 overrun 已登记后，已打开的 B 下一新 transport 也必须为0。
- 原共享账本身份、总上限、旧案例、旧费用、旧停止原因、COS16 分组和闭账历史保持。
- 访谈的费用属于本次限额；正式生成时钟仍在真实草稿确认且环境就绪后按原规则激活一次。

## 确认与恢复边界

预算授权不是游戏需求确认。先展示真实草稿版本，用户通过原 stdin 输入对应 `confirm N`；operator、Root 或模型不能自动制造 `local-user` 确认。聊天中的明确答复只有在对应真实草稿展示后才可作为后续交互输入。

预留后退出、未确认访谈退出、缺回执、unknown、未确认 owner 清理均保留完整拨款。未确认且仍可恢复的 intake 不能仅因进程结束而释放；须先持久终止。恢复与结清按运行根、registry（存在时）、共享账本的顺序取得锁；不持有共享锁等待运行锁。

闭账使用原清理证据。正式 reported/unreported 收据须认证签名、原 snapshot、nonce/anchor、全部资源与 owner-drain 的 closed 结果；游戏计时未确认不等于清理失败。仅后续会计/stop 变更可承接签名覆盖的原 snapshot；新 host/child 执行不能复用旧证明。intake 将操作结果与实际 session.close 分开，warnings/control、会计和 owner 关闭后才发布证明；冷恢复保留原恢复 API 已核验的 OwnerRecord，不猜测清除未知工作。

超预留保留真实子账、回执及实际金额，在新拨款记录 `overrun`、保持整笔占额并阻止新增拨款；正常无超额路径才结清。不强行向旧 shared entries 导入超帽费用，不改旧 `stopReason`、阶段门槛或案例以容纳新费用。预占、必要派发和结算均核对原非分组/分组 operator、释放额度的 closure 及 supplement 决定原字节，不重放旧游戏或 SDK 请求。

## 验收

| 编号 | 可检查结果 |
| --- | --- |
| A1 | 并发拨款不超共享未分配容量或包含全部未结清拨款的 ¥30 门槛；C=¥18、H=¥10 时旧 case 新派发被拒，原会计/stop/read 可用。 |
| A2 | 真实无自引用授权可发布读回并推导绑定；来源/intent冲突或不完整绑定时，首访谈及恢复后的 provider 调用数为零。 |
| A3 | 实际公共 session 配合受控 provider，走完访谈、展示、stdin 确认和原生成入口；旧版本或缺失确认不能激活。 |
| A4 | intent、shared 预占、本地 origin/snapshot 和结算关键写入中断后，复用原身份，不重复拨款、费用或确认。 |
| A5 | unknown、缺失或冲突回执、未确认清理均保留完整拨款；沿原回执对账后才能结清。 |
| A6 | 结束后按实际费用归还余额；重复结算幂等；恢复与结清竞争不能再次派发。 |
| A7 | 真实超预留费用保留；A写入shared overrun后，已打开B的下一reserve或尚未admit请求的transport为0。旧历史案例及费用不变，不能伪造旧五角色closure。 |
| A8 | 绑定运行追加窗口提前拒绝；普通未绑定 CLI 的限额、确认、恢复及已完成报告读取代表回归通过。 |

## 交付范围

复用 `SnapshotStore`、allocation/entry/closure、原 provider 预算钩子、回执核验和公开生成链，只补拨款来源、生命周期核验与调用接线。保持现有 ledger 版本，不增加 ledger6、游戏 adapter 或通用验证框架。

本卡交付源码和免费夹具证据，没有真实 provider/browser、付费运行、真实共享账本或旧 owner 操作。源码通过不代表真实通用游戏生成、COS18 整体或完整 PvZ 验收通过。

## 作者验证（待最终独审）

- 初始公共非法绑定 RED 为“缺少预期拒绝”，随后 GREEN；原共享事件拒绝的三项 RED、授权决定重复消费 RED、direct host 门禁 RED、清理证明与旧来源缺失 RED 均保留。
- 阶段源码 `ad24b2b32e82fbefe6d7c4a04c0e3bd661bc7dab` 的真实清理证明与完整既有预算来源两项 P2 已在 `ebdfb24205bf89b34041c08ee66591515360f65d` 最终复审中闭合；该次新增的恢复记录持久化 P2 是当前唯一待差异复审项。
- 新增定向 24/24、清理相关原调用方 76/76，均 exit0/0skip；typecheck/build exit0。此前受影响回归 111/111 的无变化范围复用，重叠计数不相加。
- 真实公共 session、生产 factory 和原生成入口配受控 SDK：草稿展示后先拒绝错误版本再接收相应 stdin 确认，访谈/草稿/规划三笔共30µ；夹具在规划边界主动停止，不运行浏览器或生成实际游戏。
- 私有原输出索引 `.cosmos/cos109/verification-index.json`；首次两个 assertion 类型注解诊断及一处 fixture 路径错误已修正，原失败输出保留。
- 恢复差异：在原 `.recovery` guard 内完成既有 PID/children/untracked/spawn 与锁原文核验后，先可靠记录真实 OwnerRecord，再复核锁原文并 unlink。记录失败保留原锁；已发布记录复用首次时间和字节，响应丢失可重试，不凭无锁补证。RED2/2 后 affected7/7、0skip；覆盖真实文件系统写入失败、记录前后中断、unlink响应丢失及写后锁替换。其余已审源码与24/76/111证据按无变化范围复用，不相加。
