# 原生迁移 C13：编码请求准入拒绝，未产出游戏源码

记录日期：2026-10-15。结果依据固定运行的 result/host-result、journal、registry，以及 Root 提供并经 `cos88_reviewer` 独立批准的费用、SDK、作者文件与 closure19 安全汇总。冻结源码为 `388defc543ab4445b5446be6618215a61785168c`。

## 实际结果

C13 结果为 **failed**，总用时 **26分26.253秒**。47次请求全部 admitted/settled，新增 **¥1.641136**，共享累计 **¥16.108937**，unknown/reserved均为0。coding grant原为¥1.90，结束时剩余¥0.258864；案例¥2.50/45分钟上限与原预算组保持。

唯一coding attempt `eb089674-d935-4cf7-a749-b94e501aa266` 失败分类为 `insufficient_evidence`，原因为请求准入被拒绝，该失败请求未发送给provider。作者目录只有空`src`，源码文件数为0；最终工具元数据为53次read、53个tool results、0个tool errors，write/edit/check-game-build均为0。

| 时间点 | 2026-10-14 UTC或时长 |
| --- | --- |
| 案例开始 | 18:55:36.919 |
| 原截止时间 | 19:40:36.919 |
| coding attempt开始／结束 | 18:57:13.865／19:21:36.094 |
| 单次运行清理停止 | 19:22:02.837 |
| 结果结束 | 19:22:03.172 |
| 总用时 | 1,586,253毫秒 |

`stopReason.code=manual`对应普通单次清理文字`This one-shot coding-only validation finished; its identity remains consumed.`。本次先因准入拒绝失败，再完成清理；没有触及原截止时间，也没有用户或Root中断。

C5 design/art仍为passed。journal只有origin，registry candidates为空；registry实际保留**7个C5输入捕获和3个C13计划/需求捕获**。没有编码handoff、游戏捕获、正式build/browser/review/repair/accepted，用户体验仍未确认。

## 压缩、末次请求与预算条件

安全SDK元数据记录10次成功原生压缩，`tokensBefore`范围为31,115–47,722。末次付费请求`ebde7a53-a042-478f-bf0c-a0a6dc7f8e4c`于19:21:03.851获准，`inputBytes=82486`、输出cap8192；返回`length`并结算，usage为input21407/output8192/reasoning1505，费用108350µ，耗时31,091.1558毫秒。最后assistant事件在19:21:35.957记录`Request output limit authority rejected; no provider request sent`。

请求kind未持久化，末次`length`属于可选预算摘要的判断仅由源码和时序支持。若它确为该摘要，则摘要截断恢复后使用原projection：触发条件给出`B >= 131072`，普通请求输出下限4096的预留至少为`2 × 131072 + 8 × 4096 = 294912µ`，超过coding剩余258864µ。这里没有取得被拒请求的精确`B`，不能把该下界当作其实测输入字节数。

冻结版本的[factory判断](https://github.com/lrfluobida/Cosmos/blob/388defc543ab4445b5446be6618215a61785168c/src/roles/factory.ts#L183-L190)在`B >= 131072`且完整输出cap65536的预留超过剩余额度一半时选择摘要；此处预留公式为`Q = 2B + 8cap`（µ）。[Pi适配器](https://github.com/lrfluobida/Cosmos/blob/388defc543ab4445b5446be6618215a61785168c/src/providers/pi.ts#L330)临时把`reserveTokens`设为模型`contextWindow=1000000`，使原生触发阈值为0，`keepRecentTokens=16000`。因此上述31k–48k的成功压缩记录并不表示上下文接近1M窗口。

当前计划93,578字节、93,474个JavaScript UTF-16单元，按四单元粗估约23,369 tokens；这不是provider实测token数。minify后仍有56,997字节，超过现有read的50KiB单行完整读取界限，不能把简单minify当成已验证修复。最终`case13-final-metadata.json`记录当前计划v1读取调用30次、v2读取调用1次；这些次数不代表每次完整读取。早期`case13-plan-read-metadata.json`只覆盖18次计划读取和5次压缩，不是最终总计；压缩与重复读取的因果关系尚未确定。

## closure19与后续边界

Root已一次执行closure19，释放未用额度 **¥0.858864**；原费用、历史字段和前缀保持。启动器16143以exit 1结束，Node18084及其后代退出，精确`.controller.lock`与`.commit.lock`缺失，Root已解除main冻结。

| 核对项 | closure19之后 |
| --- | ---: |
| revision | 2965 |
| 已停止案例／delegations | 21／13 |
| 已关闭grants／closure审计 | 105／19 |
| unknown／reserved | 0／0 |
| 原COS16组可分配额度 | ¥0.899686 |

原shared ¥150、phase ¥30、COS16 group ¥10不变。C13身份已消费，不能重跑或延长；[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6176958554)与[C13入口结果](https://github.com/lrfluobida/Cosmos/issues/89#issuecomment-6176959551)已由Root精确读回。COS88保持源码范围完成，COS16/COS18、完整经典基准和最终用户试玩仍未完成。

[COS89 #90](https://github.com/lrfluobida/Cosmos/issues/90)最终 `b35124a8` 已经 `cos89_reviewer` 独审APPROVED并合入 `11c823a7`：仅在普通`min(4096, cap)`输出也无法准入时才选择预算摘要，源码范围待公开关闭。短计划 `66c51d6` 已独审及公开批准；免费fixture不证明本轮原因已全部解决或实际生成改善，没有新付费运行。
