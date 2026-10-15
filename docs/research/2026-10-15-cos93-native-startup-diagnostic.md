# COS93 首次实际诊断：浏览器前的范围检查超时

记录日期：2026-10-15。本次唯一实际运行是 **diagnostic_incomplete**：真实nativeIO尚未调用，原15秒浏览器启动链未测得。原C14仍failed/consumed，COS93完整目标尚未完成。[公开实际结果与后核](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6182530375)已由Root精确读回。

## 版本与运行边界

| 项目 | 实际值 |
| --- | --- |
| 执行工作树源码 | `59dd5d3a34fb65d5e6933f492aa91613a0fab19b`，独立 `PRE_RUN_SOURCE_APPROVED` |
| 历史宿主冻结main | `7df1e5b3b8662a4fa836c466f266f9b80d04d2e8` |
| 原C14游戏生成版本 | `b20e9a43f26712a1f5a13468057df46b6c012b69` |
| 已审私有launcher SHA-256 | `b2f3bec8d0d87923daaaf52f5617188c37919237e839b8a97fc3b88ab3a8e4ca` |
| UTC起止 | 2026-10-15 01:26:59.338—01:39:44.533 |
| 外层总耗时／退出 | 765169ms（12分45.169秒），Node exit1 |
| 外层限制 | 2700000ms；2695000ms guard未触发，未请求kill |
| nativeIO／open／CDP／浏览器spawn | 全部0；没有浏览器版本或身份通过证据 |

Node为v22.22.2；执行source closure为173个文件，摘要 `59549bd35653a3764410c712ed5f556027dbceed8a79eaa8ab05f90bb624c177`。依赖为pi-coding-agent/pi-ai 0.99.2、typebox 1.3.27、Playwright 1.63.0。Node测试module mock只作透明观测，命令含 `--experimental-test-module-mocks`。这些版本与原C14版本分别记录。

## 实际负载与未到达的阶段

新TEMP副本从原revision2966、15246901字节的preclaim快照开始，通过生产quote/claim/open及reserve/admit/settle API建立合成测试窗口。它保留原历史绝对路径的只读验证，并添加35条明确标记的模拟记账记录；原共享账本没有创建新窗口或新增费用。

| 启动准备完成时 | 实际值 |
| --- | ---: |
| TEMP revision／snapshot字节 | 3076／15376612 |
| cases／delegations | 22／14 |
| closures／closure audits | 105／19 |
| requests／entries | 715／715 |
| tasks／events | 46／3078 |
| 模拟settled／reserved／unknown | 16901000µ／0／0 |

已有C14候选字节和dist仅作synthetic fixture输入，没有模型或provider调用，没有正式编译、新游戏生成、coding批准、accepted或human提升。原8段220步series没有执行；本次也未重复独立玩法或媒体诊断。

`host.verify` span933用时330820.3402ms，返回失败evidence；其开始位置为观测时钟431060.7299ms。失败发生于delivery/consumer准备期间、nativeIO调用之前。现有trace把这些上层调用共同归于host.verify，不能进一步确定是哪一个上层guard调用点；不得补写未观测的调用栈。

## 首因：原5秒scope限制

原 `host-report.json` 中 `evidence.outcome=failed`，精确summary为 **`Validation scope check timed out.`**。唯一失败span为2197，记录中第100/105次 `scope.read`，耗时 **5014.7298ms**；此处受原5000ms范围检查约束，尚未进入15秒浏览器open。

| 该scope内的直接工作 | 实测毫秒 | 结果 |
| --- | ---: | --- |
| history.verify | 559.067 | returned |
| scope.source | 769.640 | returned |
| scope.template | 1.753 | returned |
| scope.toolchain | 410.701 | returned |
| controller.read的串行操作 | 1539.609 | returned |
| controller排队部分 | 0.185 | returned |
| scope.accounting | 162.692 | returned |
| scope.git-fixed-input | 1074.822 | returned |

controller总区间1539.794ms包含1539.609ms执行，不能再把二者相加。直接子区间共4518.4699ms，剩余496.2599ms未单独命名；其中controller.read返回至accounting开始相隔426.8337ms，源码在此执行历史摘要和声明推导。现有观测不能分别归因，也不能证明GC或磁盘是原因。各子检查返回之后，组合scope到达5秒限制并被取消。

### bytesMatched=false的含义

此字段不是本次“某文件字节不一致”的证据。生产 `withCleanDelivery` 在helper启动前完成初始目录字节比较，本次helper已ready，故初始比较已通过。`bytesMatched`只在action返回、后置guard和最终比较全部完成后设为true；本次 `acceptancePassed=null`，上述成功出口未到达。没有可指认的不匹配文件；清理已删除临时交付目录，本任务不重复全目录比对或恢复该目录。

## 清理、原始记录与P2修正

原raw `result.json`仍保留 `phase=cleanup`、`error=null`、`startup.outcome=failed`。这是fixture丢弃 `host.verify` 返回失败evidence的报告缺口：生产host将内部失败转换成evidence并正常返回，`try/catch`不能捕获这种返回值。本次事实通过原host报告和trace独立复核；不改写旧raw来补造字段。

本轮最小修正仅保留返回的完整evidence、精确summary及对应失败span；未调用nativeIO时明确 `startup.outcome=not_reached` 并给出 `failingGate`。实际抛出的exception仍单列；预定DiagnosticStartupComplete停止点仍可伴随整体failed验收报告，不误记为启动失败。小契约测试RED后GREEN，无第二次真实历史、浏览器或大账本构造。

`cos93_reviewer`独立后核为 **POSTCHECK CLEAN**：原466文件的SHA/大小/纳秒mtime及61目录清单保持，原账本仍revision3114、715请求、共享16901000µ、reserved/unknown为0。PID5484、14828、29720、8916已不存在，1135个观测spawn（1134 Git + 1 Node）退出码为0；PID28572为后来svchost复用，没有把无关进程当成本次残留。50548/51207端口已关闭，临时交付目录已删除，12个原owner/recovery锁无残留。Root后核后解除冻结。launcher本身保留tree/finally cleanup为unproven，清理结论来自独立后核，不能从exit1或handle退出推定。

### 证据位置

- 原TEMP：`C:/Users/26557/AppData/Local/Temp/cos93-native-startup-hIZ6wP`，包括 `prepared.json`、`result.json`、`trace.json`、`preservation.json`；host报告与delivery-check位于其 `repository/.cosmos/e2e/cos20-transfer-validation-14/evidence/cos20-transfer-validation-14-coding/`。
- 稳定的**选择范围副本**：`E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/cos93-first-actual-preserved`，334文件、40225837字节。仅含三个根result/trace/preservation JSON、完整TEMP validation-shared目录及当前e2e/C14目录；不含TEMP仓库的 `.git` 和受Git跟踪的checkout，不是整个TEMP归档。相邻 `cos93-first-actual-preservation.json`保存逐文件source/destination SHA及原大小/纳秒mtime核对。
- 私有launcher、intent、stdout TAP、stderr重定向和result位于同一reconciliation父目录，均保持本次已消费版本；本任务未打印stderr或环境。
- 原result SHA-256：`5116965e3a07459f947d7b6909df18e7e66fc87088c93e289d7f499941ea3dc8`；trace：`fa29320d64da98cb0afb6610e1c6d68488ec9a0e817e8215d59b67b76aa4ba80`；preservation：`7c1295bd46eff83270a634c07e5232bb30d05553a0d12898918232d6e3cd032b`。

## 后续边界

原15秒完整启动结果仍未知，COS93不能按全部目标完成关闭。下一独立性能任务可复用此trace，先用小型离线分段检查区分controller只读快照与历史核验开销；本任务不修改生产scope限额、授权、缓存或delivery路径，也不重新构造大历史碰运气。原C14失败、shared¥150/phase¥30/正式¥200与12h限制保持。
