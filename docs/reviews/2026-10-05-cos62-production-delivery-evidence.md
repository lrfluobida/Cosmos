# COS62 生产交付与试玩验证记录

基线：`415dfb57bb04042ebc02128fa3c43fffdf055e5f`。本任务只增加测试和文档，生产代码未改。

## 纠正任务前提

首轮测试按初始卡片假设“plan.tasks 只有当前 coding”。真实公开 `createProductHost.execute` 已经得到 `awaiting_user_experience`；失败发生在随后 plan.tasks 数量断言。`continuation-plan.ts` 保留无 grant 的原两个 passed prepared contract，只有当前 coding clone 获得新授权，所以主机和报告实际收到三个角色。向 core 单独注入一个 task 的旧探针不能代表公开入口；本任务没有为该假设修改主机或新增内部交付接口。

## 实际通过的组合

`tests/transfer/human-continuation-delivery.test.ts` 调用真实 `runCli continue`、`createProductHost.execute`、transfer/core 主机、角色工具、捕获/journal、独立 review、candidate promotion、report、experience 与 status。只在 stdin、模型、构建和浏览器 I/O 使用 SYNTHETIC transport；没有替换 validateTasks、finish 或角色调度。原阶段夹具来源是现有 humanContinuationFixture。

- plan.tasks 是原 `actual-design-58`、`actual-art-58` 与当前 grant.taskId；window.grants 只有一项。最终运行的当前随机 ID 没有打印，TEMP 已按测试清理，因此不填写一个推测的 ID。
- effectiveTasks 包含这三个同版本任务证明；acceptanceScope.acceptance 完整等于原 requirement.acceptance，没有删设计或媒体条目。
- 原任务结果、原停止与截止保留；新增 synthetic 调用只有 coding 和 reviewer。实际模型调用、费用与 human 验收均为 NONE。
- loadExperienceBinding 成功；真实 experience 的 cancel/EOF 无决定，等待 stdin 时旧 art review context 变化拒绝，恢复原快照后 approve 和 status 均显示 approved。
- 体验命令完成后 snapshot 字节、模型调用列表、原四份来源文件字节和 mtime 不变。决定只写独立体验回执，不产生 grant、费用、延时或旧阶段派发。
- reject、相反决定冲突及 candidate/report 变更矩阵复用 COS34 原已通过证据；Source61 source/compiled 证据保持。本次无生产、依赖或契约变化，未重复旧矩阵、typecheck 或 build。

## 工具返回原文

本 implementer 自有 session：`01a10c56-43ac-7ef2-a5b6-7c2adffb98b4`。仅提取下面两个实际 custom_tool_call_output 内的 exec JSON/stdout，没有复制 prompt、分析、环境或其他会话。

完整保留目录：`C:/Users/26557/AppData/Local/Temp/cos62-production-delivery-01a10c56`，含 `incorrect-plan-assumption.tool.json` / `.tap` 与 `production-delivery-green.tool.json` / `.tap`。

首轮错误预期：own session line 167，call `call_Y2e5xB1vay81CI3bxUGNedgD`，chunk `26dc71`，exit 1；test 105867.8974ms、process 109318.218ms、0 pass / 1 fail / 0 skip。完整失败栈保留在上述 TEMP 文件。此失败不是产品 bug。

纠正预期后的通过：own session line 222，call `call_AFEaFG58PSFB3Y5ooPxHFp4a`，chunk `ab1798`，exit 0，实际 stdout：

```text
# Subtest: production human coding continuation delivers all approved task proofs to final experience
ok 1 - production human coding continuation delivers all approved task proofs to final experience
  ---
  duration_ms: 106812.2946
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 109884.2448
```

## 保持的缺口

本组合不证明真实模型、真实浏览器游戏、实际用户试玩或完整经典 PC 基准通过。实际 C6 unknown 974882 micro-CNY、closure12、真实 C7、第二次追加和通用试玩等待阶段仍保持原状态；COS18 整体继续 partial/open。
