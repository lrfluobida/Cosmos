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

v2 的限额、runId 和 ledgerId 属于新尝试，原来源的停止、费用、时钟和体验决定保持原状。授权文件 hash 继续固定完整输入，v1/v2 不可互换；未确认版本、来源漂移、递归引用或缺摘要均拒绝。初始化中断可沿同一 intent 和来源恢复，已有需求副本必须逐字节相同，绑定后缺文件不能重建。

重复 `new` 复用原 intent；已存在 snapshot 时调用原 `resume`，不增加额度或时间。`status`、`stop`、最终 `experience` 仍用普通 CLI；绑定运行不接受 `continue`。开放公共拨款或公共 overrun 会阻止旧 validation case 的新派发。

`settle` 要求原清理证据：intake 须持久停止且原会话、控制资源、会计与owner已关闭；formal须认证已有reported/unreported签名cleanup，失败游戏也须全部资源closed。stop或无锁本身不够，settle不补证。仅后续会计/stop可承接原formal清理证明；未知旧owner、unknown、缺回执或未核清清理均保留整笔拨款。正常结算一次纳入真实费用并归还余额。超额保留真实子账/回执和shared overrun，不强行导入超帽费用，也不允许新拨款或其它绑定运行的新请求。

源码夹具通过不授权实际付费运行。此入口不自动配置凭据，也不读取 User/Machine 环境变量；后续 operator 应按已授权安排把凭据安全配置到启动进程。
