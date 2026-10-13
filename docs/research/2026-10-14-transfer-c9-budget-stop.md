# 原生迁移 C9：请求准入停止与未交付代码

记录日期：2026-10-14（Asia/Shanghai）。依据Root提供的安全结果、`cos77_implementer` 对result/host/journal/files的独立核对，以及`cos76_implementer`的免费隔离构建诊断。记录作者未读取真实ledger/session/key，未修改生成文件或重跑构建、模型和源码测试。

## 实际运行

- 冻结源码：`730cb4de0cb6c3eb08b2f230ec9b09f54644c120`。
- 31次编码请求均已结算，新增 **¥0.960162**，共享累计 **¥10.380055**。五次真实原生压缩成功后继续了请求，预算和原窗口保持。
- 末条SDK错误为 `Request output limit authority rejected; no provider request sent`。宿主的 failed / insufficient_evidence 是归一化分类，不是作者主动声明未完成。
- 作者留下6个文件、34,507字节，没有交接或捕获，也未形成候选、构建、浏览器验收、评审、修复和接受结果。实际C9未通过。

| 时间点 | UTC时间或时长 |
| --- | --- |
| 开始 | 2026-10-13T20:00:12.055Z |
| 原截止时间 | 2026-10-13T20:45:12.055Z |
| 停止 | 2026-10-13T20:29:47.916Z |
| 结束 | 2026-10-13T20:29:48.136Z |
| 总用时 | 1,776,081毫秒，即29分36.081秒 |

五次实际压缩前后context bytes：

| 次数 | 压缩前 | 压缩后 |
| --- | ---: | ---: |
| 1 | 145144 | 84403 |
| 2 | 136185 | 108639 |
| 3 | 159149 | 110438 |
| 4 | 167970 | 119449 |
| 5 | 217473 | 113644 |

## 免费诊断的范围

- `cos76_implementer` 在隔离副本中原样构建：`media.ts:206` 的AudioBuffer无参构造器断言触发TS2352，TypeScript检查退出2，Vite未运行。原6个作者文件、4个配置文件和35个媒体文件的字节、修改时间都不变。这是运行结束后的离线诊断，不能写成C9实际执行过可信构建。原始日志：[隔离构建目录](C:/Users/26557/AppData/Local/Temp/SOURCE-cos9-build-diagnostic-1e5167da7967451aa335455426a5d57c)。
- Root纯离线重放得到下一普通请求的规范化输入为169,319字节。输出上限65,536 tokens需预留 **¥0.862926**，最低4,096 tokens需 **¥0.371406**，均超过剩余 **¥0.273028**。原生`prepareCompaction`在这次离线重建中没有执行压缩，摘要回调次数为0；这不证明实际末次运行发生过同一no-op事件，也不能将它计作第六次实时压缩。

## 停止与后续边界

Root已执行closure15，关闭本案例的五个角色额度，并保留全部已结算费用。编码剩余 **¥0.273028**，原预算组剩余 **¥6.628568**；共享已结算仍为 **¥10.380055**。案例已消费，不能重跑，预算不变。

| 账本核对项 | closure15之后 |
| --- | ---: |
| revision | 2217 |
| 已停止案例 | 17 |
| delegation记录 | 9 |
| 已关闭grants | 85 |
| closure审计 | 15 |
| 未知费用、预留 | 均为0 |

[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6155055951)与[C9入口实际结果](https://github.com/lrfluobida/Cosmos/issues/79#issuecomment-6155056831)由Root发布并精确读回。COS16/COS18仍partial/open；COS78/COS79的源码范围完成不代表C9或完整classic/human通过。COS79已有[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/80#issuecomment-6154080327)，本次五次原生压缩与继续行为是局部实际证据。
