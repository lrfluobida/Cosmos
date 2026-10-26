# COS131 ready 发布窗口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 仅在 clean-delivery ready 握手中等待可确认的硬链接发布结束，最终继续严格独立文件校验。

**Architecture:** 在原 readReady 中加入一次有界元数据探测；可确认的 nlink=2 发布返回 null，复用原等待、deadline、取消与 finally。禁止修改 publisher/regularFile 及增加额度或等待窗口。

**Tech Stack:** Node 22、TypeScript、node:test、已有 fs/OwnedWork/本地 HTTP；无新依赖。

基线 `c65a30233681adbfbf30d96740f0949bec612f05`，依据[正式规格](../specs/cos131-delivery-ready-publication.md)及原私有reproduction.json诊断回执。Root 已确定复现；不重复诊断大矩阵。固定计划已独立APPROVED_PLAN并获Root批准实施；源码已最终独审和唯一合入，仅source-scoped完成。

源码记录：COS131源码 `9b922f10695c0d45b993cddd4c8b4daad258ca37` 已获ready_publication_reviewer最终APPROVED_SOURCE_SCOPED、无finding，合入发布 `03fb1d5461277b5ca0532ad38f0b5b3b618539fb`；[批准](https://github.com/lrfluobida/Cosmos/issues/132#issuecomment-6424314125)、[关闭](https://github.com/lrfluobida/Cosmos/issues/132#issuecomment-6424321715)已核证。3文件精确一致，typecheck/build exit0，合并COS129后的真实raw publisher屏障正例1/1、0skip、TAP4135.8218ms；19项/正常1/最后2项有效证据复用，不累计。仅source-scoped完成，COS130新入口真实交付组合已source_verified，paidReady=false。

审批记录：[COS131 / #132](https://github.com/lrfluobida/Cosmos/issues/132)；独立ready_publication_reviewer已APPROVED_PLAN，Root批准免费实施并接受其明确非阻塞建议：正常代表名仅字面修正为standalone package records exact capture provenance，其余设计不变。实现者ready_publication_implementer、独立源码reviewer ready_publication_reviewer、唯一merger public_agent_batch_merger；源码已最终独审批准并集成，结果见上述源码记录。

- 批准规格输入 SHA256：`450049530ee045b7108ed82c658520585becc72e391c29e98b5c41722774d1f0`
- Root接受字面修订后的固定计划输入 SHA256：`e68e711a295f8ac657ce95df3db1318dd0613441b183abc92e83e8794e00b7ae`

批准诊断基线c65a30233681adbfbf30d96740f0949bec612f05保持；登记main为已审COS129源码 `6bdc9af3c06fee719e50dac8c129e300df22b46f`。主线已用合并后的真实raw-bytes publisher完成发布窗口正例；仅源码范围完成，COS130最终新增入口交付组合已source_verified，不授权付费或真实运行。

## 文件

- 修改 `src/runtime/entrypoint-delivery.ts`：readReady 和等待循环的取消/截止检查。
- 新增 `tests/runtime/entrypoint-delivery-ready.test.ts`；必要时新增 `tests/runtime/entrypoint-delivery-ready.fixture.mjs`，只承载受控 unlink 屏障/preload。
- 可对 `tests/runtime/entrypoint-delivery.test.ts` 做最小 fixture 提取以复用准备逻辑；无必要时保持不动。不得修改 `receipt-file.ts`、`paths.ts`、worker、owned-command 或预算代码。

## Task 1：确定性 RED

- [ ] 在独立 managed worktree/`codex/` 分支核对基线，读取 AGENTS；检测目标 UTF-8/换行，写前列文件。
- [ ] 复用 Root reproduction 的真实 publisher 机制，写测试专用屏障：仅暂停匹配 ready 临时文件的 unlink；真实发布函数、硬链接及文件读取保持。补 after/finally，任何断言失败都解除屏障、还原 fs/spawn patch、结束测试子进程。
- [ ] 经 actual withCleanDelivery 启动 owned worker；如需 preload，仅包装测试 spawn 参数。等 readReady 取得 stat=2 且进入原 25ms 等待后释放屏障；可观察原定时器创建事件，不改变其行为。将 reader 提前拒绝与等待事件并行观察，旧源码先拒绝即记录 RED 并在 finally 放行，避免测试挂起。
- [ ] 运行新正例，记录旧源码因 `Expected an independent regular file: ready.json` 的明确 RED；失败不能来自 fixture 环境、spawn 注入、JSON 或其它绑定。禁止用 sleep 定时命中或多跑直到失败。

## Task 2：最小生产改动

- [ ] readReady 先以 safePath/lstat 探测 ready；ENOENT 返回 null。对 file+nlink=2 才有界列举匹配 UUID 临时名，lstat bigint dev/ino 验证唯一同 inode 普通文件且两边 nlink=2；身份必须可用，返回 null 前复核 ready 身份/链接数，不能用大小/时间戳替代。
- [ ] 可确认发布中返回 null；临时项 ENOENT 或不匹配时转原 regularFile，不吞其它错误。禁止通过原始 readFile 绕过独立性、解析临时文件或依赖 error.message 分支。
- [ ] 继续使用原 regularFile(signal)、解码与 identity 校验。每个异步探测/读取后检查 signal，receipt 接纳前检查原 readyDeadline。原 running/25ms/10000ms/cleanup deadline 与 finally 保留，不新增重试层。
- [ ] 重跑同一 RED 用例至 GREEN；确认屏障期间 action=0，解除后 action=1、ready nlink=1、HTTP 字节与原 fixture 相同，最后 helper/server 关闭、干净目录删除。

## Task 3：必要负例与兼容

- [ ] 在同一真实发布窗口触发 AbortSignal：断言拒绝且 action=0，清理完成。用测试保存的真实 worker PID/URL 核对退出；不因尚未接纳 pid 而补造报告成功字段。
- [ ] 保持临时别名不释放直到原 readyDeadline，验证超时、action=0、原预算/截止不变与 owned worker 清理。再释放测试屏障，清理专用临时目录。使用已有截止时间或隔离测试时钟推进，不延长生产超时。
- [ ] 加小型表驱动拒绝代表：无匹配临时名/不同 inode 的硬链接、nlink>2、非普通/链接目标、坏 UTF-8/JSON、错 ready identity；最终 regularFile 和原绑定不得被跳过。
- [ ] 覆盖临时项在探测中消失可随后严格读取；取消/期限到达后解除屏障仍拒绝；worker 提前退出沿旧错误路径。只比较必要的 SOURCE 文件与进程状态。
- [ ] 运行一个既有正常 clean-delivery 代表，验证新分类未影响正常接纳/清理。复用其它未变 delivery/browser/registry 既有证据，不重跑大矩阵。

## Task 4：验证与交接

```powershell
node --experimental-strip-types --test tests/runtime/entrypoint-delivery-ready.test.ts
node --experimental-strip-types --test --test-name-pattern="^standalone package records exact capture provenance" tests/runtime/entrypoint-delivery.test.ts
npm run typecheck
npm run build
```

- [ ] 新测试 PASS、无非预期 skip；正常代表 PASS（按名称筛选的其它 skip 不计为覆盖）。记录原 RED 与修复 GREEN 的固定来源 SHA、命令、结果及取消/超时清理事实。
- [ ] 重开修改文件核对中文与 UTF-8、最小 diff；确认 publisher/paths 无改动。作者提交自己的 SHA 并报告 known gaps。
- [ ] 独立 reviewer 先审 spec compliance 再 code quality；finding 由原作者修复并复审。唯一 merger 合批准 SHA，跑组合必要代表，复用有效结果。

只完成免费 SOURCE/TEMP 修复；COS129 raw-bytes publisher 扩展独立开发，合并时仅补一个组合正例确认真实 publisher 仍可通过握手。本任务不操作真实 room/controller/ledger、API 或模型，不把偶发复跑成功当成修复证据。
