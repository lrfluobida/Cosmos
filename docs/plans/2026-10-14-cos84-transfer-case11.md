# COS84 固定迁移 C11 实施计划

> 使用 writing-plans / executing-plans / TDD。作者 `cos76_implementer` acting COS84；独立 reviewer `cos77_implementer`；唯一 merger `batch75_76_merger`。独立 PLAN_APPROVED 后实施。

**目标：** 准备 `cos20-transfer-validation-11`，使用 COS83 已审来源校验去重与原固定 ¥3/45min 边界，保留所有已停止历史。

**基线：** 当前 main `32af0aa4c101bd03ccfd759d64a482231aefd970`（已包含 COS83 source merge），分支 `codex/cos84-transfer-case11`，managed `cos76-transfer-case8/Cosmos`。生产测试前并入 Root 提供的 COS83 最终已审主线。Issue [#85](https://github.com/lrfluobida/Cosmos/issues/85)，id5848367426；依赖 COS82/83。

## 固定契约

- C11是新案例，不重开C10。独立ID/root/marker/reuse manifest/admission quote/operator receipts，clean pushed exactmain、source/compiled执行闭包、当前requirement/task/candidate与owner idle绑定保持。
- 旧18stopped/10delegations/90closed/16audits完整保留；C1–9沿原验证，C10必须原声明、40个coding author admitted/settled请求与对应费用/evidence、同window、无repair/unknown/reserved。closure16逐grant释放额等于原grant减实际费用；实际source字节不变，历史费用不硬编码。
- 新grants仍planning1/design1/art1/coding2400000/repair599997µ，合计3m；incremental hard3m/45min/80requests/一次合格repair、两logical attempts。原COS16 parent10m/phase30m/shared150m、output cap/floor和请求时限不变。按availableAllocation动态核准；不改旧allocation或ledger schema。
- 原partial恢复公式直接复用：`window.quote.budgetGroup.allocatedMicroCny + sum(current grants)`，不使用全局quote.basis分配值、不借其他组额度。
- C5 design/art两阶段七capture只读复用，零planner/design/art SDK；新作者目录为空，不预置C10六个失败文件。新增COS82 `TRANSFER_CASE_TEN_SOURCE_READY` 与COS83 `AUTHOR_TOOL_SCOPE_SOURCE_READY` 及reviewed/merge双祖先，保留原COS78–81和更早守卫。

Root提供的实际背景为C10 40笔author/coding/admitted/settled、1086265µ，snapshot2384、组available5542303µ、共享11466320µ；仅作规格背景，生产从实际历史/closure与quote重新验证。真实免费准入和paid由Root单独操作。

## 最小文件范围与实现选择

- 新增 `probes/transfer/validation-case-eleven-{declaration,entry,run,driver,task,source}.ts` 六个薄wrapper，复用原entry/task/driver，不复制运行编排。
- 在 `validation-case-ten-declaration.ts` 提取仅支持ten/eleven的内部固定预算后继helper：固定selector绑定C10←C9/31笔/9成员与C11←C10/40笔/10成员，固定3m向量不可配置。C10原导出委托给ten绑定，原声明输出、错误拒绝与旧quote语义保持；C11 history是在原C10 history后追加实际派生C10声明。
- `validation-case-six-entry.ts`、`validation-case-seven-entry.ts`、`validation-case-seven-source.ts` 只扩C11 manifest/admission/eleven闭包及18/16字面量。partial实现不改，C6–9默认不改。
- 新增 `tests/transfer/validation-case-eleven{,-runtime,-compiled}.test.ts` 和 `.fixture.ts`；必要窄复用既有C10 SOURCE夹具流程，README只追加C11说明。自有plan/card之外的tracking由merger修改。

## SOURCE可用性与补齐

已只读核 `C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C10-proof-f99d7222-2af2-48df-97c7-89c0ae61c0c2/`：history-1/2均17stopped/9delegations/85closed/15audits，可作为C10前缀。result-snapshot虽18stopped，却只有1笔C10合成费用10µ、仍85closed/15audits；不能冒充40笔与closure16。原case10已归档，活动case10目录不存在。

从history-1视图出发，经原prepare/claim/RunController reserve/admit/settle/stop/closure API，使用新SOURCE身份只追加40笔合成C10费用和closure16；不跑C10作者、host/Pi或修复。必要历史空目录只在TEMP建立，finally恢复原缺失状态。旧归档/C5资料不改，关闭全部owner后恢复原snapshot字节/mtime与临时SOURCE mapping，新历史/结果另存。若源失配，先报告精确差异，不自动重建长seed。

## 步骤与最小免费验证

- [ ] exact计划/卡交独审；并入Root指定最终已审main后才开始生产测试。
- [ ] RED：两组合成C10费用均生成相同新3m向量、group available准确变化；拒绝数量/role/purpose/window/settled/evidence/closure/grant/prefix漂移、unknown/reserved与容量不足。原C10 unit证明helper重用未改变31笔/closure15语义。
- [ ] GREEN：仅固定helper和eleven wrappers、计数字面量；claim一次且保留原18case全部费用/request/closure/audit前缀，旧quote失效。
- [ ] SOURCE一次新C11准入/current host+factory/Pi fake/同窗口冷恢复代表，证明空作者、C5复用、当前plan/quote绑定和COS82/83审批双祖先。基于保存历史只补合成费用，不重C10约6分钟运行链。
- [ ] compiled新入口/JS worker路径与closure，source receipt和compiled字节变更拒绝；worker transport若为synthetic须准确标注。C10 partial、旧repair/v2与COS83性能矩阵复用，不重跑未变证据。
- [ ] affected C10/C11 unit、typecheck/build/probes/tests strict；UTF-8/LF/中文回读及完整base diff check，保存命令/原始TAP/限制，提交exact给独立规格→质量审查后交sole merger。

拟定命令：`node --experimental-strip-types --test tests/transfer/validation-case-eleven.test.ts tests/transfer/validation-case-ten.test.ts`；runtime、compiled各自运行，避免同SOURCE seed并发。`npm run typecheck`、`npm run build`及C11 runner/三tests显式strict使用C10已审参数。

状态：计划待独审 / SOURCE_NOT_READY，目标marker `TRANSFER_CASE_ELEVEN_SOURCE_READY`。无真实ledger/session/thinking/key/C10生成文件读取或写入，无实际C11或付费操作。
