# 原生迁移 C10：自检通过后因时限取消

记录日期：2026-10-14。依据Root提供的安全运行汇总、公开结果，以及`cos77_implementer`对作者文件与成功自检临时副本的独立核对。本次只记录文档，未读取真实ledger/session/key，未修改生成文件或重跑代码检查。

## 实际结果

- 冻结源码：`a464b0fb523ce29f6e688a92a08ccd156b6502a7`。
- 40次请求已准入并全部结算，新增 **¥1.086265**，共享累计 **¥11.466320**；没有未知费用或预留。
- 编码任务在`taskHistory`中为`cancelled`。journal只有origin，候选目录为空；没有host-result、handoff、capture、正式构建、浏览器验收、评审、修复或接受结果，体验未确认。
- 作者留下6个源码文件，共30,046字节。cos77已确认它们与第二次成功自检的`check-Z1sPsZ`临时目录中的6个原始源码文件逐字节一致。复用的C5 execution/origin依赖核对仍通过。

| 时间点 | 2026-10-14 UTC或时长 |
| --- | --- |
| 开始 | 11:16:52.422 |
| 原截止时间 | 12:01:52.422 |
| 自动停止 | 12:01:47.503 |
| 结果结束 | 12:01:48.112 |
| 总用时 | 2,695,690毫秒，即44分55.690秒 |

停止由既定的`deadline - 5000ms`清理定时器触发。Root已确认启动器56931以退出码1结束，Node35604已消失，两个controller锁均已释放，随后解除main冻结。

## 作者自检与工具统计

| 自检 | 开始UTC | 结束UTC | 结果 |
| --- | --- | --- | --- |
| 第一次 | 11:41:47.183 | 11:45:33.177 | TS2352：`scene.ts:279`将boolean断言为BaseSound，检查失败 |
| 第二次 | 11:47:07.984 | 11:53:25.930 | 作者自主修改后，两项退出码均为0；Vite自报901毫秒 |

第二次是作者自检通过，不是正式候选构建或游戏验收通过。没有产生交接和捕获，不能据此宣称C10完成。

Root的工具元数据记录了5次原生压缩、33次read、6次write、3次edit和2次check。对当前plan-v1有15次读取调用，其中9次在编译通过后；这里只记录调用次数，不推断作者动机或把读取调用当作全文重读。

## 准入准备与取消后的日志

- 第一次免费预检因Root尚未创建C10 reuse清单而拒绝，付费请求为0，账本版本2217保持。Root随后补齐C10清单，沿用纯C5历史字节、两项passed阶段和7个capture；来源清单原文件未改。第二次免费预检ready，确认¥3/45分钟，付费请求仍为0，snapshot未变。
- 结果中的旧C6标签来自共享handler，实际案例仍为C10。
- `Historical source changed`出现在signal已取消之后：`historical.verify`调用`readManifest`，首行`throwIfAborted`抛出，再被统一catch改成该文字。它不能证明原来源文件发生改变。

## closure16与范围

Root已一次执行成功closure16，释放本案未使用的 **¥1.913735**，保留本次和全部旧费用。原C10窗口已经结束，不重开。

| 核对项 | closure16之后 |
| --- | ---: |
| revision | 2384 |
| 已停止案例 | 18 |
| delegation记录 | 10 |
| 已关闭grants | 90 |
| closure审计 | 16 |
| 未知费用、预留 | 均为0 |

[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6168008318)和[C10入口实际结果](https://github.com/lrfluobida/Cosmos/issues/83#issuecomment-6168010789)均已由Root精确读回。COS82的[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/83#issuecomment-6167055060)仅说明source scoped完成；COS16/COS18仍partial，实际游戏与human未通过。本次没有新付费、C11或预算变更。
