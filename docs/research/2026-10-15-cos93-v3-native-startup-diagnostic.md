# COS93 v3：完整诊断结束，原15秒启动失败

日期：2026-10-15。v3结果为 `diagnostic_completed`，但 `startup.outcome=failed`；COS93保持open/partial。免费TEMP夹具经真实API建立自己的验证窗口，原共享账本没有新窗口、provider调用或费用。原C14失败及v1/v2记录不变，没有第四次actual授权。

## 执行与证据来源

| 项目 | 精确记录 |
| --- | --- |
| 执行源码／历史宿主main | `84f9c8857908d9db7ecbc404c6d5afbdfdc32542` |
| 已审observer作者提交／合入 | `40b9a310cc15deab962b92d805e0ed1edc1bacd3`／`c39819036464495353bedd72ba7d46891013527f` |
| 原C14生成源码 | `b20e9a43f26712a1f5a13468057df46b6c012b69`，与本轮诊断版本分别记录 |
| launcher SHA-256 | `e09c8241406be735f187dbc63191c883844b26aab647b912e32e70a5a0fb24fe` |
| 进程起止UTC | 2026-10-15 07:56:03.9384050—08:12:27.5910004 |
| 外层耗时／退出 | 983679ms，parent PID5744 exit0；本轮无OOM、guard未触发、未请求kill |
| 原时限 | scope 5000ms、open 15000ms；外guard 2695000ms、整轮2700000ms，heap未增加 |

[源码批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187110787)、[本次单次启动](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187320821)及[v3结果与独立后核](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187833755)由Root发布并精确读回。专职作者 `cos93_implementer`，独审 `cos93_reviewer`，唯一merger `batch_c14_cos92_merger`。本次证据文档分支 `codex/cos93-v3-evidence` 从上述84f9c885建立，沿用 `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`；旧分支和ignored证据保留，无reset。

私有证据前缀为 `E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/`：

- `cos93-native-startup-launch-v3.ps1`、`cos93-native-startup-root-intent-v3.json`：已审启动器及Root本次意图。
- `cos93-native-startup-launch-v3-intent.json`、`cos93-native-startup-launch-v3-result.json`、同前缀 `-stdout.log`／`-stderr.log`：本次启动、外guard结果和输出。stderr为空；TAP的1/1、exit0表示诊断证据完成，不表示浏览器启动通过。
- `cos93-v3-actual-result.md`：Root公开结果及独立后核的完整正文。
- 原raw根 `C:/Users/26557/AppData/Local/Temp/cos93-native-startup-RK3aDx`：`prepared.json`、`protected-before.json`、`progress.ndjson`、`trace.json`、`preservation.json`、`result.json`全部存在。

## 完整负载与观测

TEMP从revision2966的680请求历史，经生产prepare/claim/open及35行合成记账，达到revision3076、22 cases／14 delegations／105 closures／19 audits／715 requests／46 tasks／3078 events。合成输入复用原候选字节，没有生成新游戏；固定CLI准入、玩法、媒体、coding review、accepted/human不属于本次通过范围。

trace有3994 spans、5024 events，累计序列化预算计数1117950字节，0 dropped、observer incomplete=false；格式化 `trace.json` 实际1797586字节，两者不是同一个大小口径。进度写出8行、2460字节，句柄已关闭、无写失败；累计enqueue为1.1125ms，观测开销没有从实测扣除。保护清单在quote/claim之前发布；最终保全及独审均核到原466文件／61目录零变化。

真实共享账本保持revision3114、715请求、16901000µ，reserved/unknown为0，SHA-256仍为 `e8a921e618da619eacdd439c3260d2edcc10f48edcb823fd716274531cd85632`。TEMP窗口不授予原C14再次claim或消费组剩余额度的权限。

## 首因：ticket前的完整binding校验超过open界限

| span／顺序 | 实测事实 |
| --- | --- |
| `#2869 lifecycle.open`，父`#2604 nativeIO.playPersistent` | 768652.015→783650.7903ms，14998.7753ms后抛 `Owned browser launch ticket: timed out after 14996 ms` |
| `#2870 consumer.verifyBinding`，父`#2869` | 768655.4489→800564.4381ms，31908.9892ms，迟到returned；完整校验含六轮scope、六轮identity和19次history.verify |
| 前三轮scope `#2880/#2903/#2924` | 分别2045.2875／2014.2833／2023.9147ms；到第三轮相关检查`#2935`结束，距本次binding入口已12299.451ms |
| 第四轮scope `#2946` | open后14331.4207ms开始；open超时瞬间在其子`#2948 scope.source`内。该scope最终3777.4873ms returned |
| 超时前controller排队 | 15个queue入口到execute入口的实际等待为0.0262–0.0727ms；主要耗时在校验执行，不能把queue的嵌套总区间当排队时间 |
| 同轮open前两次binding `#2605/#2737` | 25417.5875／25129.1436ms，均returned，均已超过15秒；没有后续超时清理竞争的这两次调用也显示完整校验成本 |

六个scope均returned，范围2014.2833–3777.4873ms，没有单次5秒scope失败。上述父子区间不相加充当整链耗时。超时后 `#2949 consumer.verifyBinding` 开始，与迟到的`#2870`重叠；例如`#2955`随后排队1598.1981ms。这是超时后的竞争，不能把31908.9892ms全部当成无竞争基线。

对应源码为执行版的 `src/runtime/adapters/transfer/runtime-acceptance.ts:34`：guard调用context.requireCurrent，再重新绑定计划和manifest；`src/runtime/entrypoint-host.ts:382` 的requireDispatch经validationScope及preparation.bindCandidate，进入 `src/runtime/adapters/transfer/runtime-host.ts:207` 的继承来源检查和多次origin guard。scope检查仍走真实controller、来源、历史及固定输入校验。

`src/runtime/entrypoint-host.ts:112` 先await verifyBinding，随后check取消，到113行才调用prepareOwnedChild；`src/acceptance/persistent.ts:365`等待其ticket。因此本次迟到的是校验，没有迟到浏览器ticket。校验在open超时后16913.6478ms返回；按源码控制流，随后取消检查在创建ticket之前拒绝。trace未单独记录这次raw prepare的拒绝回调，这一收尾顺序是代码与完整调用记录的对应结论。

本轮nativeIO调用1次，但浏览器prepareOwnedChild、ticket持久化、PID登记、OS spawn、CDP、身份验证、session及诊断stop均未到达。trace唯一ticket及PID10532属于更早的clean-delivery Node服务，不能算浏览器ticket；2502个Git和1个Node spawn均有exit0。原8段series仍只得到首段failed报告，其中21步全部skipped，其余玩法未执行。后续聚合报告的owned-exit证据不足及host summary是失败结果，不替换上述首个open超时原因。

## 正常收尾与独立后核

fixture的finally已完成：preparationClosed、drained、controllerClosed、locksAbsent均true，cleanup.errors为空；`#3990 cleanup.drained`为0.2463ms returned。原raw `processesExited=false`保留，未改写成true。独审于UTC08:18:06给出 `POSTCHECK_NO_LIVE_RESIDUE`：关联进程已不在，delivery PID10532及helper PID17812均exit0，64624／65221端口清空，20个核查owner/recovery锁无；12个同号PID确认为后建进程复用。Root据此解除main/worktree冻结。

专用profile `C:/Users/26557/AppData/Local/Temp/cosmos-browser-CnLieH`原样保留，仅36字节 `.owner` 和空子目录 `profile-6c4cb1bb-2acc-4293-9153-b26db0eea97a`，无DevToolsActivePort。没有删除、恢复或kill。finally/drain/controller关闭有本轮证据；浏览器未启动，不能宣称浏览器正常exit或正常close已通过。

Root已保存**选择范围副本**：私有前缀下 `cos93-v3-actual-preserved`，相邻 `cos93-v3-actual-preservation.json`。共344文件、201目录、41769581字节，范围为六个raw根文件、完整TEMP validation-shared/current C14目录及保留profile，排除Git历史与tracked/dependency checkout。manifest记录复制前后source SHA／纳秒mtime／dev／ino／nlink不变、全部destination hash匹配；这不是完整checkout副本，也不单独证明启动或进程退出。原输入完整before/final证据与独立后核分别保留。

## 下一必要方向与本次文档验证

下一独立任务仅评估完整consumer.verifyBinding内部独立来源核验的有界并发，保留全部实时读取、guard检查点、来源比较和取消语义。尚未实施或证明可在15秒完成；不能以缓存、跳过检查或增加时限替代。COS93继续open/partial/startup-failed，不授予第四次actual。

本次只新增本研究记录并更新任务卡；UTF-8无BOM、LF、中文回读和diff检查通过。原observer短测试、strict、v3实际运行及独立后核证据复用，没有测试或actual重跑，也没有生产/fixture/tracking/GitHub改动。
