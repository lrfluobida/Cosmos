# 公共 CLI 开发验证拨款

此 operator 包装复用原 `new/resume`、生产 host 和真实 stdin。先取得具体预算授权，再由可信 operator 保存 `PublicValidationAuthorization`：

- `formatVersion: public-validation-authorization/1`
- 唯一 `fundingId`、原 `sharedRoot/sharedRunId/sharedLedgerId`
- 规范化且彼此分离的 `runRoot/runId/ledgerId`
- `limits: { limitMicroCny, durationMs }`、`brief`、`renderFrames`
- 真实 `decisionId/actorId/decidedAt/sourceRefs`

授权文件不含自身 hash、派生 binding 或密钥；放在生成运行根之外。字段形状见 `src/runtime/public-validation-funding-types.ts`。

```powershell
node --experimental-strip-types probes/public-cli/validation.ts new <run-dir> --shared-root <original-shared-ledger> --authorization <decision.json>
node --experimental-strip-types probes/public-cli/validation.ts resume <run-dir>
node --experimental-strip-types probes/public-cli/validation.ts settle <run-dir>
```

第一条调用先在原共享 ¥150 中占用完整限额，并保留原 ¥30 阶段门槛。访谈和生成继续由本地原账本逐请求记账。显示具体草稿后，用户自行输入相应 `confirm N`；预算决定不替代该确认。

已有完整普通需求确认时，可使用 `public-validation-authorization/2`：保留 v1 全部字段，新增必填 `requirementsSource`（`confirmed-requirements-source/1` 的 root/runId/revision/draftSha256/confirmationSha256）。授权的 brief/renderFrames 必须等于原确认版本。wrapper 在占用新拨款前只读核验来源，再调用公开 `new --requirements-from <source-run-dir> --requirements-revision <N>`；不再访谈或创建新的需求确认决定。

普通设计需要沿用一版已捕获的待修草稿时，可在上述公开命令追加 `--design-draft-from <旧运行>/journal/task-<设计任务ID>/review.json`。选择原设计或其修订任务的精确回执，系统核对同一原始需求确认及两份捕获文件的字节。新作者从旧版 `design.json` 和 `acceptance-plan.json` 开始，在只读的 `design-draft-feedback.json` 查看该版独审意见。新运行须重新捕获、检查和独审，批准后才能派发美术和编码。恢复时使用已固定的来源。

使用拨款 wrapper 时，将一条 `artifactId` 为 `ordinary-design-draft-review` 的引用加入 v2 授权的 `sourceRefs`，其 `location` 为上述回执的规范绝对路径，`version` 为回执原始字节的 64 位小写 SHA-256。wrapper 在占用额度前核验它，再将选择传给公开 CLI。

执行指定稿时，使用 `src/runtime/supplied-design.ts` 导出的 `selectSuppliedDesign(设计目录, requirementsSource, runRoot)`，把返回的 `reference` 加入 v2 授权的 `sourceRefs`。其 `artifactId` 为 `ordinary-supplied-design`，版本摘要绑定原确认和两份文件的原始字节。wrapper 在占用额度前检查该引用，再调用公开 CLI 的 `--design-input`。每笔授权只能选择一份设计来源。新运行独审通过后，美术与编码方可使用指定稿；退回时查看本次设计任务的审查回执。

若旧运行的指定稿已获独审批准，可在同一原始需求确认的新运行使用 `--approved-design-from <旧运行目录>`。资金 wrapper 使用 `src/runtime/approved-design-source.ts` 中的 `selectApprovedDesign(旧运行目录, requirementsSource, { root: 新运行目录, runId, ledgerId })`，把返回的 `reference` 作为 v2 授权唯一的设计来源加入 `sourceRefs`。新运行从美术开始，随后编码。两项任务各自独审，使用本次账本与截止时间。报告的 `historicalDesign` 记录来源运行、设计尝试、审批和文件摘要。恢复时须可读取原始确认、原指定稿、历史批准回执及捕获文件。

v2 的限额、runId 和 ledgerId 属于新尝试，原来源的停止、费用、时钟和体验决定保持原状。授权文件 hash 继续固定完整输入，v1/v2 不可互换；未确认版本、来源漂移、递归引用或缺摘要均拒绝。初始化中断可沿同一 intent 和来源恢复，已有需求副本必须逐字节相同，绑定后缺文件不能重建。

实时需求来源核验用于新拨款和当前执行派发。历史账务读取继续核验原授权 hash、身份、账单与清理证据；旧需求文件变化不会阻止安全停止、结清已发生费用，或创建另一笔独立拨款。

重复 `new` 复用原 intent；已存在 snapshot 时调用原 `resume`，不增加额度或时间。`status`、`stop`、最终 `experience` 仍用普通 CLI；绑定运行不接受 `continue`。开放公共拨款或公共 overrun 会阻止旧 validation case 的新派发。

`settle` 要求原清理证据：intake 须持久停止且原会话、控制资源、会计与owner已关闭；formal须认证已有reported/unreported签名cleanup，失败游戏也须全部资源closed。stop或无锁本身不够，settle不补证。仅后续会计/stop可承接原formal清理证明；未知旧owner、unknown、缺回执或未核清清理均保留整笔拨款。正常结算一次纳入真实费用并归还余额。超额保留真实子账/回执和shared overrun，不强行导入超帽费用，也不允许新拨款或其它绑定运行的新请求。

源码夹具通过不授权实际付费运行。此入口不自动配置凭据，也不读取 User/Machine 环境变量；后续 operator 应按已授权安排把凭据安全配置到启动进程。
