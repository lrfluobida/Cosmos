# COS178：已结束运行的有界阶段占用

本卡只为已结束并完成资源清理的公开验证运行撤销后续执行权限，同时保留已知费用与全部未知请求原始预留。它不认定未知费用为零，不结算请求、不退款，也不关闭或减少底层账本 allocation。

## 范围与来源

操作员可调用 `previewPublicValidationFundingSuspension({ sharedRoot, runRoot, fundingId })` 只读查看，随后调用 `suspendPublicValidationFunding`。调用方不能传金额、usage、预算增长或 owner as-of 决定；这两个接口没有加入模型工具或游戏 CLI。预览为建议值，实际应用在原有锁内重新核验。

仅支持已有原授权、format-1 正式生成身份、签名 owner-drain 与全部资源 closed 的运行，且至少保留一笔已准入 unknown。每笔未知请求必须有原 host billing 回执、原请求身份、DeepSeek flash 固定计价版本、无图像及原 SDK inputBytes/output cap。原始报价 `inputBytes × 2 + maxOutputTokens × 8` 必须与回执报价和原账本完整预留相等。缺少来源、未知计价、未准入预留、超支或不一致情况均拒绝；其余已关闭请求按现有回执规则核验。

固定 held 为原子账本全部 `settledMicroCny + reservedMicroCny` 之和。一次不可变 suspension 来源保存原 snapshot、cleanup 绑定和 billing 字节；共享记录及唯一事件在 child → registry → shared 锁内提交。原 child、billing、cleanup 和所有账本 allocation/closure 保持不变。精确重试不增加 revision、事件或释放金额。

## 执行与会计边界

Suspension 永久拒绝此 funding 的 reserve/admit、恢复派发和修订授权。通用 `RunController.open` 在创建控制器、期限处理和任何子账本写入前拒绝 suspended child。已有控制器持有 child 锁时 suspension 无法提交，因此不存在提交后仍可修改费用的旧通用控制器。

仅保留既有、单独授权的 protected/local 零差额归因静态入口；它已在整个核验、claim、stop 和 settle(0) 期间持有 child → registry → shared 锁。Suspension 不提供归因授权，原 R27 许可不能借此用于其他请求。子账更新后到父账导入前仍保留完整原 held；中断期间原 pending claim 门禁继续阻止新增付费。

每次共享来源检查都核验固定 suspension 来源、原签名 cleanup、原回执，以及当前子账只发生允许的会计延伸。新增请求、原历史或来源改变、实际暴露超过固定 held 均拒绝后续资金操作。通用正向外部账单归因不在本卡范围；已有接口无法认证的费用不得通过新开普通控制器绕过。

## 正式结算

全部原请求获得现有规则认可的真实结算后，原结算入口导入全部费用一次，hold 归零，并按原完整 grant 生成一次 allocation closure。`releasedMicroCny` 仍为原 grant 减实际费用，不能再加上 suspension 曾减少的阶段 held。超出保留上界的结算直接拒绝，不静默使用已释放的阶段容量。

R30 的只读设计基线是 72,082 微元已知费用和 407,922 微元未知预留，合计 held 480,004；原 4,480,000 grant 可减少阶段占用 3,999,996。C 保持 40,511,661，C+H 为 40,991,665，phase45 剩余 4,008,335。数字只是本案验算，源码没有按该运行硬编码。本文不表示真实 R30 已应用、已结算或游戏通过。

## 验证范围

使用真实签名的免费 incomplete funding 夹具验证来源与金额推导、原字节保留、精确重试、旧所有权拒绝、通用恢复封锁、变造来源和超界阻断。专用 local-authority 夹具验证共享锁竞争、子账完成但父账导入失败的中断间隙、原归因审批仍有效，以及最终完整 grant 只导入/关闭一次。该验证使用 fake provider/browser，不证明真实供应商费用或目标游戏验收通过。

作者工作树 typecheck、build 均退出 0；suspension 与 local-authority 两文件 11/11、无跳过，另加阶段容量边界新测试 1/1：旧 grant 占满时拒绝新 funding，suspension 后精确填至原 phase 上限，再多 1 微元仍拒绝，原 unknown 不变。既有 funding/phase successor 六项代表 6/6、无跳过。执行日期为 2026-11-05；独审和实际应用结果另行登记，以上不是实际 R30 资金操作。
