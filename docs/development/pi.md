# pi 与 DeepSeek 接入

COS-03 实施记录，2026-10-01。锁定 `@earendil-works/pi-coding-agent` 和 `@earendil-works/pi-ai` **0.99.2**；Node.js 22.22.2。此文记录 SDK 实现与离线证据，真实服务验证由有界探针另存报告，不能把模拟流当作真实调用通过。

## 已核实接口

- 原生 provider 为 `deepseek`，模型为 `deepseek-flash`（DeepSeek V4.1 Flash），API 为 `openai-completions`；目录声明文本、图像、1M 上下文和最大 384K 输出。简单任务显式用 `low`。
- 0.99.2 使用 `ModelRuntime`；公共内存凭据类为 pi-ai 的 `InMemoryCredentialStore`。旧示例里的直接 `authStorage` 参数不适用，`AuthStorage` 未从 coding-agent 公共入口导出。
- `createAgentSession` 管理工具循环、JSONL 会话和 `session.compact()`。`SessionManager.open()` 恢复保存的推理块和工具结果，不能仅恢复最后一条文本。
- 原生配置 `requiresReasoningContentOnAssistantMessages` 和 `thinkingFormat: deepseek` 负责 `reasoning_content`。适配器没有重写 provider。
- SDK 的 `AssistantMessage.responseModel` 只在服务返回不同模型名时出现；适配器从 `onProviderStreamEvent` 读取实际返回名，并记录用量是否确实出现。

依据：[官方 SDK 文档](https://github.com/earendil-works/pi/blob/v0.99.2/packages/coding-agent/docs/sdk.md)、已安装包的公共声明、原生 DeepSeek 目录和 OpenAI completions 实现。注册表实际发布版为 0.99.2，之前调研的 0.99.1 没有继续沿用。

## 供 COS-07 使用

入口为 `src/providers/pi.ts` 的 `createPiSession(options)` 和 `createWorkspaceTools(options)`。

必须显式提供：工作目录、会话目录、系统提示、冻结任务上下文、工具列表、每次输出上限、会话请求上限、请求超时、最坏费用估计和逐请求预算 hooks。冻结上下文应包含验收 ID、接口、输入版本、预算引用和已知失败；每次创建和恢复均由宿主提供。凭据只读当前进程 `DEEPSEEK_API_KEY`，可由宿主以 `env` 参数传入独立环境对象。

```ts
const tools = await createWorkspaceTools({
  workspace, readPaths: ['inputs', 'src'], writePaths: ['src'],
});
const session = await createPiSession({
  workspace, stateDirectory, systemPrompt, context, tools,
  maxOutputTokens: 2048, maxRequests: 8, requestTimeoutMs: 30000,
  estimatedMaxCostMicroCny: estimateWorstCaseForThisRequest,
  budget: { beforeRequest, afterResponse },
});
try {
  const result = await session.prompt(taskText, { signal, images });
  // result.text is a model response, not an acceptance verdict.
} finally {
  await session.close();
}
```

`subscribe()` 暴露 SDK 事件；`requestRecords` 包含实际模型、归一化 token、首个原始流事件时间和请求耗时。工具开始/结束事件可计算工具等待。`prompt()` 支持继续对话和图片；`compact()` 显式调用原生压缩；`sessionFile` 用于下一次 `resumeFile`。会话文件会保留续接所需的推理内容，属于运行私有数据，不应默认发布。`cancel()` 等待 SDK 空闲，失败或取消后的适配器实例不能再发请求；恢复需由宿主核对原运行与账本。

没有加载用户目录 auth、settings、models、AGENTS、skills、extensions 或 prompt templates。设置与模型目录存储均在内存中；会话只落在声明的目录。自动重试、缓存预热和自动压缩关闭。模型名不匹配、无模型回包、无用量、请求超限、结算持久化失败或输出 `length` 均停止；`length` 在 SDK 执行其工具调用前变为失败，不能当完整产物。

文件工具只有显式 read/write/edit；写范围按相对文件或目录前缀声明。越界、符号链接和非 UTF-8 既有文本被拒绝。没有 shell 工具。调用者自定义工具仍须自行执行授权、取消和路径检查。这些检查用于任务能力约束，不能声称是操作系统隔离；外部进程并发改路径仍需独立工作区管理。

## 预算接点

`beforeRequest` 为每次 SDK provider 请求分配独立 ID，工具循环、续接和压缩都经过它。它应调用 COS-06 `reserve()` 后 `admit()`；抛错时不发送请求。若宿主准入步骤部分成功后抛错，宿主须对该事务进行核对，不能自行假定没有预留。

`afterResponse` 每个已准入请求最多调用一次，并在允许 SDK 执行工具或下轮调用前等待其完成：

| outcome | 宿主操作 |
| --- | --- |
| `settled` | 按带版本的 CNY 价格转换返回 token，保存证据后 `settle()` |
| `unknown` | 已开始 provider 调用但没有有效用量，`markUnknown()`，保留预留 |
| `not_sent` | 准入完成后、provider 调用前取消，附证据 `cancel(..., { provenNoCost: true })` |

SDK `usage.cost` 是目录 USD 估计，不能作为 CNY 实扣。输入会随工具结果和压缩变化；估计回调收到 `inputBytes`、`hasImages` 与输出上限，不应把固定短提示估价用于任意长历史。live 探针对每次调用保守预留整个 1M 输入窗口加 2048 输出：**¥2.016384**，所以截图与压缩也被覆盖。

## 有界真实探针

合入 COS-06 后执行：

```powershell
node --experimental-strip-types probes/pi/live.mjs <existing-ledger-root> <new-output-directory>
```

前提：由宿主创建或打开同一份 ¥150 验证账本，给 `COS-03` 分配额度；使用 `importSettled()` 以请求 ID `prior-deepseek-direct-probes` 导入既有 **¥0.721771** 与来源引用。探针只打开已有账本，验证该历史记录存在，不创建第二份账本。输出目录必须全新，建议在忽略的 `runs/` 下；凭据由当前进程环境注入，不写文件。

上限为 8 次请求、每次 2048 输出、整体 90 秒，串行执行：真实工具错误 → 写文件 → 精确编辑 → 原生压缩 → 恢复后无工具的图像及历史标记检查。复用直接 API 探针的原创网格图片，期望坐标有确定性断言。每次请求报告与费用证据单独保存，最终 `report.json` 明确 passed/failed。异常或截断停止，不自动重跑。取消与传输失败的核心边界通过离线故障注入验证；不会为重复同一故障再制造付费请求。

价格版本 `deepseek-flash-peak-cny-2026-10-01`：缓存未命中 ¥2、命中 ¥0.04、输出 ¥8 / 百万 token，2026-10-01 已核对 [DeepSeek 官方中文价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。峰值估计与账单实扣分开标注。复现前若价格改变，需要更新估计和计价版本。

## 验证范围与已知限制

`node --experimental-strip-types --test tests/providers/pi.test.ts` 通过原生 provider 的 HTTP 序列化和模拟 SSE 验证模型、low、无工具、UTF-8、工具错误修复、推理续接、持久恢复、压缩、图像、截断、取消、拒绝准入、未知用量、模型误配与结算失败。模拟流不会证明真实模型遵循任务或视觉识别准确；简单网格也不能保证真实游戏缺陷检测。串行/有限并发的既有直接 API 费用与延时证据继续保留，不冒充 pi 性能结果。

依赖审计：SDK 自带 npm shrinkwrap 将 `minimatch@10.2.6 → brace-expansion@5.0.9` 固定在已知拒绝服务版本，`npm audit` 报 1 个 high 包，关联 [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)、[GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7)、[GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)。本接入未启用 glob 工具或扩展发现，但没有证明 SDK 所有内部调用都不可达。目标 `npm update` 和窄 5.0.12 override 均未改变实际安装版，因此未保留无效 override，也没有扩展为整仓升级。
