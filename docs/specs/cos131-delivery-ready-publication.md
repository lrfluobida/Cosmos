# COS-131 · ready 发布窗口的有界等待

状态：已最终APPROVED_SOURCE_SCOPED并由唯一merger集成，仅source-scoped完成。基线 `c65a30233681adbfbf30d96740f0949bec612f05`。

源码记录：COS131源码 `9b922f10695c0d45b993cddd4c8b4daad258ca37` 已获ready_publication_reviewer最终APPROVED_SOURCE_SCOPED、无finding，合入发布 `03fb1d5461277b5ca0532ad38f0b5b3b618539fb`；[批准](https://github.com/lrfluobida/Cosmos/issues/132#issuecomment-6424314125)、[关闭](https://github.com/lrfluobida/Cosmos/issues/132#issuecomment-6424321715)已核证。3文件精确一致，typecheck/build exit0，合并COS129后的真实raw publisher屏障正例1/1、0skip、TAP4135.8218ms；19项/正常1/最后2项有效证据复用，不累计。仅source-scoped完成，COS130新入口真实交付组合已source_verified，paidReady=false。

审批记录：[COS131 / #132](https://github.com/lrfluobida/Cosmos/issues/132)；独立ready_publication_reviewer已APPROVED_PLAN，Root批准免费实施并接受其明确非阻塞建议：正常代表名仅字面修正为standalone package records exact capture provenance，其余设计不变。实现者ready_publication_implementer、独立源码reviewer ready_publication_reviewer、唯一merger public_agent_batch_merger；源码已最终独审批准并集成，结果见上述源码记录。

- 批准规格输入 SHA256：`450049530ee045b7108ed82c658520585becc72e391c29e98b5c41722774d1f0`
- Root接受字面修订后的固定计划输入 SHA256：`e68e711a295f8ac657ce95df3db1318dd0613441b183abc92e83e8794e00b7ae`

批准诊断基线c65a30233681adbfbf30d96740f0949bec612f05保持；登记main为已审COS129源码 `6bdc9af3c06fee719e50dac8c129e300df22b46f`。主线已用合并后的真实raw-bytes publisher完成发布窗口正例；仅源码范围完成，COS130最终新增入口交付组合已source_verified，不授权付费或真实运行。

配套[实施计划](../plans/2026-10-27-delivery-ready-publication.md)。

## 问题与已有证据

Root 的 `reproduction.json` 已复现：原 `publishReceipt` 完成 link(temp, ready) 后、unlink(temp) 前，ready 是 nlink=2 的普通文件，`regularFile` 报 `Expected an independent regular file: ready.json`；unlink 完成后 nlink=1 可读。生产 publisher SHA256 `acb13c0d508c4c85864efb1241794bffaef2563afe38174be13075a7e627ea83` 未改。复用此证据，不重新运行大矩阵。

`entrypoint-delivery.ts` 的 ready 循环只把 ENOENT 当未就绪，因而把合法发布中的状态立即当成失败。重跑通过不能消除此竞态。

## 方案选择

推荐只在 ready 握手中识别未结束的原子发布并继续原等待。直接放宽所有 nlink>1 或捕获所有文件错误会放过无法解释的文件；更换 publisher/全局 regularFile 则扩大影响，并与 COS129 raw-bytes 扩展冲突。

生产改动限 `src/runtime/entrypoint-delivery.ts` 的 readReady/原等待循环；如需分函数，留在同一文件。publisher、paths guard、一般 receipt 读取及 worker 协议保持。

## ready 分类与接纳

1. 先检查取消，使用现有 `safePath(control, 'ready.json', signal)` 与 lstat。ready 不存在返回 null；路径链接、非普通文件继续由现有门禁拒绝。
2. 只有 ready 的 nlink 恰为 2，才检查同一 control 目录中符合 publisher 命名 `ready.json.<UUID>.tmp` 的临时名字。用 lstat 的 bigint dev/ino 比较身份，不读字节、不跟随符号链接；临时项也必须是普通文件、nlink=2，且恰有一个与 ready 相同的文件身份。dev/ino 不可用时保守拒绝，不用大小或时间戳替代；Windows 同样遵守。返回 null 前复核 ready 身份/链接数，变化则转严格读取。不能靠文件名、内容相同或错误字符串推断发布中。
3. 若上述条件可核实，返回 null，继续原来的 running/25ms 等待；本轮不解析 JSON、不设置 pid/url、不调用 action。永久保留同一发布临时名也只能等到原 readyDeadline 后失败。
4. 探测时临时名字 ENOENT 表示可能已完成发布，立即回到现有 regularFile 读取当前 ready；其他读取错误不吞掉。找不到同身份临时名、nlink>2 或身份无法可靠判定，也回到严格 regularFile 门禁，不作为已就绪。
5. 真正接纳永远经过 `regularFile(control, 'ready.json', signal)` 的独立文件检查，之后保留 UTF-8/JSON 解码及原 formatVersion/candidate/project/url/pid 校验。全局 regularFile 仍拒绝所有 nlink!=1。
6. 每次等待、探测及读取后重新检查取消；在接纳 receipt 前检查原 readyDeadline，避免解除屏障时已经超时仍进入 action。保留 `min(cleanup deadline, now+10000)`、25ms 轮询、原 worker 剩余时间和 cleanup 预留，不重算或延长截止时间。

探测仅区分“可继续等”与“可以严格读取”；它不授予文件真实性或成功结论。读取期间发生变化时只沿上述有限路径重新核验，不新增内部重试循环。

## 测试切口

新增 `tests/runtime/entrypoint-delivery-ready.test.ts`，必要时增加同目录测试专用 preload fixture。优先调用实际 `withCleanDelivery`，复用现有 delivery fixture 最小准备逻辑；不增加生产可注入 publisher/clock 或通用等待框架。

在独立测试子进程中，用现有 `syncBuiltinESMExports` 方式拦截真实 publisher 的临时 unlink：真实 open/write/sync/link 全部执行，仅删除动作由显式屏障放行。如需把 preload 加到 owned worker，只在测试包装 spawn 的原 worker 参数；生产 runOwnedNode 与 worker 不变。父测试等待读者取得 nlink=2 并进入原 25ms 等待后放行，可只观察该定时器创建而保持其行为；旧源码在等待前稳定报 independent-file 错误，由测试 finally 放行清理。不能只观察 safePath 前置 stat 就放行，也不得用随机 sleep/重复运行碰窗口。

- 正例：屏障期间 action=0；释放后严格读取 nlink=1，真实 HTTP 服务可用，action 执行一次，原 finally 关闭 helper/server 并移除干净项目。
- 永久发布临时名：不释放直到 readyDeadline；action=0，结果失败，原 finally 停止 owned worker；截止时间/预算原值保持。测试屏障最终可释放并清理，不能遗留测试进程。
- 取消：确认进入该窗口后触发原 AbortSignal；action=0，拒绝取消，原 finally 清理。测试明确核对子进程/服务消失与项目删除；pid 尚未接纳时不要求报告虚构 helperPid/helperExited。
- 拒绝代表：无匹配临时名的永久硬链接、同名不同 inode、nlink>2、目录/符号链接、损坏 UTF-8/JSON、错误 candidate/project/url/pid；均不得进入 action。无 ready 的 ENOENT 仍是等待。
- 发布在探测中完成：临时项消失后仍能经 regularFile 读出合法独立文件；解除屏障时已取消/超时不得接纳。保留原 worker 提前退出拒绝。

清理使用原 withCleanDelivery finally；不增加重启 worker、重开窗口、额外请求或费用。本卡只做 SOURCE/TEMP 与本地测试 HTTP，不读取真实 room/ledger、凭据，不调用模型/API。

## 完成标准

真实 publisher 的确定性窗口 RED→GREEN、窄负例与取消/超时清理通过；现有一个正常 delivery 代表通过；typecheck/build 通过。原 publisher 与 paths 文件无 diff，运行预算/时钟无变化。独立作者提交固定 SHA，独立 reviewer 审 diff，唯一 merger 集成；源码完成不代表实际游戏生成通过。
