# 公开验证：闭桶零差额的会计核证

此入口只处理一个已结束普通运行中唯一的 admitted unknown，请求已经派发。两份官方导出、已知逐笔用量、账单口径和独占范围都核实后，预算 owner 可以接受截至指定时间的行政归属。结论是“没有额外可归属费用”。它不证明请求未发、零 token 或供应商逐笔免单，也不改变游戏结论。

## 准备证据并预览

1. 在已绑定的 shared 根下建私有 `public-funding-accounting/cases/<fundingId>/`。固定七份未签材料：`evidence.json`、`target.zip`、`all.zip`、`operator-facts.json`、`reviewer-facts.json`、`owner-decision.json`、`owner-binding.json`。保留真实授权答复原件和本案绑定，不把聊天内容、原始账单、账号、key 或私钥提交到 Git。
2. `evidence.json` 的完整版本、字段和单位见 [读取器](../../src/runtime/public-funding-charge-resolution.ts) 的 `ZeroResidualEvidence` 及 `validateEvidence`。散列为原件字节的 SHA-256 小写十六进制。账号散列输入是 UTF-8 的 CSV user_id；key 散列输入是 UTF-8 的 `JSON.stringify([api_key_name,api_key])`。清单时间是 UTC ISO 毫秒 Z。已知账单逐笔列 UUID 和原 v1 字节散列。只接受本文实现的 GMT+8 同服务日、连续小时、单一活跃 key、指定模型及精确 CNY/Paid 计费版本。没有可证明的时钟误差上界，填 null；此时要求两桶、最多 20 个成功请求、各维精确组合分区唯一，且与本地开始至结束的名义分区一致。还须核证同一稳定时差的假设。所有与成功请求相容的共同偏移都必须使未知请求的整个区间处于批准的两小时内；这些界限是推导值，不是时钟测量。计数相等不能代替独占和完整性签核。
3. 从已独审的源码目录，在 PowerShell 运行以下命令（替换三个占位参数为原绑定值）。它只读核对，不打开活跃 controller，不接触模型：

```powershell
node --experimental-strip-types --input-type=module -e "import {previewPublicFundingChargeResolution as preview} from './src/runtime/public-funding-charge-resolution.ts'; const [sharedRoot,runRoot,fundingId]=process.argv.slice(1); console.log(JSON.stringify(await preview({sharedRoot,runRoot,fundingId}),null,2));" -- '<shared 绝对路径>' '<child 绝对路径>' '<fundingId>'
```

`pending` 表示证据或原资金来源不足。`checked` 给出逐桶结果和预计结算/释放的整数微元；`approvalBlockers` 标出机器信任、缺少的签名、签名失效或复核冻结。即使 `approvalsReady:true`，预览本身也不改变余额。

## 受保护部署与签名（默认）

运维先在独立的受管域配置真实预算权限和人员身份。Windows 固定位置为 `C:/ProgramData/Cosmos/AccountingTrust/trust-v1.json`；POSIX 为 `/etc/cosmos/accounting-trust/trust-v1.json`。配置必须由机器管理员部署。执行器为非特权身份，不能改文件、置换其父目录或取得签名私钥。Windows 核验本机 ACL/所有者及祖先；POSIX 要求整条路径由 root 拥有且组和其他身份不可写。选择此模式而没有满足条件的信任域或独立签名端时，保留七份原件与预览结果，**保留 hold**。不要把调用方提供的公钥或共用 agent 能使用的私钥作为真实审批。单用户主机可明确选择下述本地运维模式；系统不会自动降级。

机器配置字段：

```json
{
  "formatVersion": "public-funding-accounting-trust/1",
  "sharedRunId": "<受管运行>",
  "sharedLedgerId": "<受管账本>",
  "principals": [
    {"id":"<操作员>","publicKey":"<Ed25519 SPKI DER base64>","roles":["operator","owner-witness"]},
    {"id":"<独立复核人>","publicKey":"<不同主体的公钥>","roles":["reviewer"]}
  ],
  "revoked": [], "disputed": [], "statements": []
}
```

`owner-witness` 必须确实获该预算权属域授权，单独见证并绑定预算 owner 的原始决定；它不是代替用户声称“用户拥有/使用了该 Ed25519 私钥”。operator 与 reviewer 分别核实两份原件及统计覆盖、粒度、独占、延迟和原请求范围。三项签名分别写同案的 `operator.json`、`reviewer.json`、`owner.json`。每项字段为 `{purpose,principal,approvedAt,expiresAt,sourceSha256,signature}`，purpose 分别为 `operator`、`reviewer`、`owner-witness`。sourceSha256 分别取对应事实记录、独审记录、原始 owner 决定的摘要；scope-binding 摘要也已纳入不可换案的 evidence.json。

Ed25519 直接签以下 UTF-8 字节，不附换行、不再次散列。签名前核对各字段，不能只核对一个身份名：

```js
Buffer.from(JSON.stringify([
  'public-funding-accounting-approval/1', purpose, principal,
  sharedRunId, sharedLedgerId, fundingId, requestId, evidenceSha256,
  approvedAt, expiresAt, sourceSha256
]), 'utf8')
```

## 应用、恢复与迟到更正

经过签核、部署和版本核验后，受控运维程序调用 `RunController.applyPublicFundingChargeResolution({sharedRoot,runRoot,fundingId})`（`src/runtime/run.ts`）。它在锁内重验身份、唯一历史与证据，写一次性时桶认领和补充件，在旧运行持久停止后结算 **0**，放开 child 所有权，再调用常规 shared 结算。中断后使用相同三参数；不要删除 claim、手写 settled 行或重启游戏。原 v1、计费未知事实和签名 cleanup 保持不动。

下期正式账单可用时，管理员在 `statements` 记录 `{evidenceSha256,availableAt}`。复核以一个工作日（GMT+8 周一到周五）和 owner 指定的兜底期限中更早者为界。发现迟记或范围变化，立即在 `disputed` 登记证据摘要，通知 owner 并保留两期原件。撤回决定用 `revoked`。这些状态会阻止相关 shared 的新资金预留和现有公开运行的付费派发；不会改写旧账。逾期或争议没有自动解冻：需单独受权的独立复核/更正流程。此版本不提供改金额或清理争议的开关；受保护模式仍完整校验机器信任。

### 按期完成复核

将正式账单与比较记录存放在 shared 的 `public-funding-accounting/statement-reviews/<evidenceSha256>/statement.bin` 和 `comparison.json`，每份不超过 8 MiB。原指定的两位负责人分别签以下 UTF-8 字节：

```js
Buffer.from(JSON.stringify([
  'public-funding-statement-review/1', role, principal, sharedRunId, sharedLedgerId,
  evidenceSha256, availableAt, reviewedAt, statementSha256, comparisonSha256, 'matched'
]), 'utf8')
```

管理员在原 notice 中加入 `review:{outcome:"matched",reviewedAt,statementSha256,comparisonSha256,operatorSignature,reviewerSignature}`。原指定操作员和复核人的签名、两类原件摘要及按期完成时间均核实后，才允许继续付费。迟交、来源变化、撤销或争议仍冻结。经核证的占用认领的摘要会先登记到 shared funding，未完成认领也参与排他校验。首次 shared 释放须按当前时点重验全部批准及冻结状态；已导入的相同归档允许历史回读。

## 单用户主机的本地运维授权

此模式信任操作本机的运维调用方核实真实 owner 决定及独立审查来源。它记录 `authority=local_operator_record`，不声称同用户文件、不同名字或散列证明独立 OS 身份。独立 reviewer 须实际检查原件和计算，不能只由 operator 复制“通过”结论。原生角色只持有任务文件工具；没有会计入口，任务写入范围不包含 shared 的授权与复核记录。恶意本机管理员不在此模式的隔离保证内。

保留前述七份原件。在同案目录增加 UTF-8 `local-authority.json`：

```json
{
  "formatVersion":"public-funding-local-authority/1", "authority":"local_operator_record",
  "sharedRunId":"<原 shared run>", "sharedLedgerId":"<原 shared ledger>",
  "runId":"<原 child run>", "ledgerId":"<原 child ledger>",
  "fundingId":"<原拨款>", "requestId":"<唯一 unknown 请求>",
  "evidenceSha256":"<evidence.json 原字节摘要>",
  "ownerDecisionSha256":"<真实用户决定原件摘要>", "ownerBindingSha256":"<同案绑定摘要>",
  "operatorFactsSha256":"<操作员事实记录摘要>", "reviewerFactsSha256":"<独立审查记录摘要>",
  "operator":"<evidence.followupOperator>", "reviewer":"<evidence.followupReviewer>",
  "approvedAt":"<实际运维核证 UTC ISO 毫秒 Z>", "expiresAt":"<本次应用有效期 UTC ISO 毫秒 Z>"
}
```

上述摘要及身份须与原 evidence/binding 精确一致。`approvedAt` 是本次运维核证时间，不是伪造新的用户答复；须晚于两份导出的 cutoff，早于 expiresAt。原 `reviewDueAt` 保持。另建 `local-followup.json`，字段为 `{formatVersion:"public-funding-local-followup/1",authoritySha256:"<local-authority.json 原字节摘要>",evidenceSha256:"<同一证据摘要>",revoked:null,disputed:null,statement:null}`。

运维使用已独审版本，先显式预览：

```powershell
node --experimental-strip-types --input-type=module -e "import {previewLocalPublicFundingChargeResolution as preview} from './src/runtime/public-funding-charge-resolution.ts'; const [sharedRoot,runRoot,fundingId]=process.argv.slice(1); console.log(JSON.stringify(await preview({sharedRoot,runRoot,fundingId}),null,2));" -- '<shared 绝对路径>' '<child 绝对路径>' '<fundingId>'
```

核对 `checked/approvalsReady:true` 和原授权范围后，运维程序调用 `RunController.applyLocalPublicFundingChargeResolution({sharedRoot,runRoot,fundingId})`；没有金额参数。默认 `applyPublicFundingChargeResolution` 仍使用受保护模式。已认领的 authority 原件及摘要写入 claim/archive；中断重试使用相同入口和三参数，不能改 authority 或切换模式。原 unknown、cleanup、零差额算术、预算及唯一认领全部沿用。

本地后续状态仅由运维更新 `local-followup.json`：撤销或争议分别把 `revoked` / `disputed` 设为 `{recordedAt,sourceSha256}`，原件分别存 `revoked.json` / `disputed.json`。账单可用时设置 `statement:{availableAt,sourceSha256}`，通知原件存 `statement-available.json`。通知时间均为真实 UTC ISO 毫秒 Z；摘要绑定原件字节。保留原件及历史状态，不删除通知来解除冻结。

按期完成独立复核后，在该 statement 加 `review:{outcome:"matched",reviewedAt,operator,reviewer,statementSha256,comparisonSha256,operatorFactsSha256,reviewerFactsSha256}`。人员标签必须与原 authority 相同；四份原件分别存 shared 的 `public-funding-accounting/statement-reviews/<evidenceSha256>/statement.bin`、`comparison.json`、`local-operator-review.json`、`local-reviewer-review.json`。同样遵守下一工作日和原兜底期限中更早者。缺失、变更、逾期、撤销或争议阻止新资金和派发；历史回读不授予付费权。迟到金额更正仍须另案授权与独审，不修改原已结账行。
