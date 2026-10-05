# COS61 原始工具输出交接

产品源码与测试冻结在 `400b7aed55496ce413111b7b4217df92833e6e3f`。本次仅整理证据，没有重跑测试。

原执行没有另外落盘独立 stdout 日志。真实保留来源是本 implementer 自己的 Codex audit rollout：

`E:/CodexData/.codex/sessions/2026/10/05/rollout-2026-10-05T16-23-58-01a10b29-9a67-7f03-b1a6-21ec2efa8a94.jsonl`

`session_meta.payload.id = 01a10b29-9a67-7f03-b1a6-21ec2efa8a94`。这不是 Cosmos 的 Root 运行会话；没有读取 Root `.cosmos`、运行账本、凭据、目标游戏会话或参考安装。

以下块于本次交接从该文件中指定行的 `response_item / custom_tool_call_output / payload.output[].text` 原文提取，只选包含指定 `chunk_id` 的完整工具结果 JSON。保留 stdout、exit、wall time 与原 chunk，未复制 user/system/assistant 内容、reasoning、prompts、ENV 或完整 rollout。活动 audit writer 下可用 .NET FileStream 的 Read + FileShare.ReadWrite 只读访问。原记录行号、call ID 和 chunk 均可回查；JSON `output` 是工具返回的原 stdout 字符串。

保留边界：TEMP 运行目录按测试的既有清理流程已删除。测试 stdout 没有打印两个 worker PID 的具体数值，因而不补造 PID；最终 compiled 测试中的实际 `toolReports[0].workerPids.length === 2` 和 `passed` 断言通过，源码断言与下面的真实 TAP PASS 共同支持 worker2。TSC/Vite 是 TEMP synthetic tools，Node worker 实际执行；没有真实浏览器玩法或模型网络。

`7.027` 秒属于原 grouped shell 调用（tsc --noEmit、diff check、diff stat、status），其工具结果整体 exit0、无编译诊断；没有单独保存该 tsc 子命令的 exit 字段。最终 compiled 代表另实际断言 fresh tsc 的 status0。不能把 grouped shell 元数据改写成独立 tsc 日志。

cancel 的 `18.631` 秒是下述 exit1 cohort 中第二个子测试 PASS，不能称整个 cohort GREEN。第三个 unknown 初始 fixture 当时只触发 beforeRequest，未发送 unknown response hook，其 unknown 断言失败；随后 fixture 按实际 provider-budget protocol 发 unknown response，最终 `68.809` 秒组中 source authorization / unknown 两个测试均 PASS、整体 exit0。失败原文完整保留。

## Source current pipeline + cold resume

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `497`；UTC `2026-10-05T09:24:05.762Z`；call ID `call_6IkpHQt62085bbbLt1KgvMXF`；chunk `2db190`；exec session `44098`。

```json
{"chunk_id":"2db190","wall_time_seconds":0.0000094,"exit_code":0,"original_token_count":87,"output":"# Subtest: first human coding window seals two audit plans and cold resume reuses passed stages\nok 1 - first human coding window seals two audit plans and cold resume reuses passed stages\n  ---\n  duration_ms: 123509.114\n  type: 'test'\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 126453.4474\n"}
```

## Final compiled pipeline / worker assertions / cold resume

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `953`；UTC `2026-10-05T10:21:25.195Z`；call ID `call_WIp8rgvHfterSxgB0CufDeJm`；chunk `281649`；exec session `81713`。

```json
{"chunk_id":"281649","wall_time_seconds":0.0000081,"exit_code":0,"original_token_count":96,"output":"# Subtest: compiled human coding window uses its actual worker and dependencies then cold resumes without billing\nok 1 - compiled human coding window uses its actual worker and dependencies then cold resumes without billing\n  ---\n  duration_ms: 166931.9917\n  type: 'test'\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 170179.0071\n"}
```

## Final grouped strict typecheck and diff command

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `953`；UTC `2026-10-05T10:21:25.195Z`；call ID `call_WIp8rgvHfterSxgB0CufDeJm`；chunk `3cbca4`；exec session `exec completed`。

```json
{"chunk_id":"3cbca4","wall_time_seconds":7.0274296,"exit_code":0,"original_token_count":131,"output":" README.md                                    |  2 +-\n docs/development/quickstart.md               |  2 +\n src/runtime/entrypoint-host.ts               |  5 ++-\n src/runtime/entrypoint-human-continuation.ts |  5 ++-\n tests/transfer/human-continuation.test.ts    | 55 ++++++++++++++++++++++++++++\n 5 files changed, 65 insertions(+), 4 deletions(-)\n M README.md\n M docs/development/quickstart.md\n M src/runtime/entrypoint-host.ts\n M src/runtime/entrypoint-human-continuation.ts\n M tests/transfer/human-continuation.test.ts\n"}
```

## Source context / authorization / unknown cold resume

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `932`；UTC `2026-10-05T10:13:59.575Z`；call ID `call_zvBX8WrlkCqY62a64QmDo5n9`；chunk `623189`；exec session `30562`。

```json
{"chunk_id":"623189","wall_time_seconds":0.0000276,"exit_code":0,"original_token_count":136,"output":"# Subtest: human current preparation context exposes one task and candidate in both audit slots\nok 1 - human current preparation context exposes one task and candidate in both audit slots\n  ---\n  duration_ms: 24061.4267\n  type: 'test'\n  ...\n# Subtest: unknown current human request cannot be repeated by cold resume\nok 2 - unknown current human request cannot be repeated by cold resume\n  ---\n  duration_ms: 41734.7478\n  type: 'test'\n  ...\n1..2\n# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 68808.5494\n"}
```

## Cancel / EOF / wrong confirm / changed proof: child PASS, cohort exit 1

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `846`；UTC `2026-10-05T10:05:17.040Z`；call ID `call_ZEf2OeKPuB8CBPaOEzFCwFns`；chunk `2c3ddd`；exec session `34872`。

```json
{"chunk_id":"2c3ddd","wall_time_seconds":0.0000096,"exit_code":1,"original_token_count":362,"output":"# Subtest: human current preparation context exposes one task and candidate in both audit slots\nok 1 - human current preparation context exposes one task and candidate in both audit slots\n  ---\n  duration_ms: 20318.6114\n  type: 'test'\n  ...\n# Subtest: human continue cancellation and changed proof never activate or add requests\nok 2 - human continue cancellation and changed proof never activate or add requests\n  ---\n  duration_ms: 18631.133\n  type: 'test'\n  ...\n# Subtest: unknown current human request cannot be repeated by cold resume\nnot ok 3 - unknown current human request cannot be repeated by cold resume\n  ---\n  duration_ms: 38704.7103\n  type: 'test'\n  location: 'E:\\\\CodexData\\\\.codex\\\\worktrees\\\\cos-05-cli\\\\Cosmos\\\\tests\\\\transfer\\\\human-continuation.test.ts:245:1'\n  failureType: 'testCodeFailure'\n  error: |-\n    The expression evaluated to a falsy value:\n    \n      assert.ok(state.ledger.entries.some((entry     ) => entry.unknown))\n    \n  code: 'ERR_ASSERTION'\n  name: 'AssertionError'\n  expected: true\n  actual: false\n  operator: '=='\n  stack: |-\n    TestContext.<anonymous> (file:///E:/CodexData/.codex/worktrees/cos-05-cli/Cosmos/tests/transfer/human-continuation.test.ts:257:36)\n    async Test.run (node:internal/test_runner/test:1054:7)\n    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)\n  ...\n1..3\n# tests 3\n# suites 0\n# pass 2\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 80664.7875\n"}
```

## Registered original repair: first output of later successful cohort

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `717`；UTC `2026-10-05T09:46:24.104Z`；call ID `call_UzWfsZU0zmpcU22TBfbZwcLp`；chunk `0740a8`；exec session `6866`。

```json
{"chunk_id":"0740a8","wall_time_seconds":5.0133735,"session_id":6866,"original_token_count":62,"output":"# Subtest: registered original coding repair maps its v2 lineage to the sole current primary plan\nok 1 - registered original coding repair maps its v2 lineage to the sole current primary plan\n  ---\n  duration_ms: 43680.8537\n  type: 'test'\n  ...\n"}
```

## Registered repair + first compiled cohort final result

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `760`；UTC `2026-10-05T09:55:22.935Z`；call ID `call_VxRx4TXb5iYZMzcuW2BHwuzM`；chunk `8ce67f`；exec session `6866`。

```json
{"chunk_id":"8ce67f","wall_time_seconds":0.0000115,"exit_code":0,"original_token_count":96,"output":"# Subtest: compiled human coding window uses its actual worker and dependencies then cold resumes without billing\nok 2 - compiled human coding window uses its actual worker and dependencies then cold resumes without billing\n  ---\n  duration_ms: 167532.2235\n  type: 'test'\n  ...\n1..2\n# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 214349.2746\n"}
```

## Stop ACK and missing current origin

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `710`；UTC `2026-10-05T09:45:44.248Z`；call ID `call_eqiJQOSbPhCBaC4znnJCXIJB`；chunk `d542c9`；exec session `31293`。

```json
{"chunk_id":"d542c9","wall_time_seconds":0.0000108,"exit_code":0,"original_token_count":143,"output":"# Subtest: active human window stop awaits preparation close before the public ACK\nok 1 - active human window stop awaits preparation close before the public ACK\n  ---\n  duration_ms: 39243.6087\n  type: 'test'\n  ...\n# Subtest: registered human window refuses a lost current origin without manufacturing a replacement\nok 2 - registered human window refuses a lost current origin without manufacturing a replacement\n  ---\n  duration_ms: 32395.7415\n  type: 'test'\n  ...\n1..2\n# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 74677.4218\n"}
```

## Fresh public quote / current origin path / public scope

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `578`；UTC `2026-10-05T09:29:57.306Z`；call ID `call_IfIhp9x2gqSWaffFlJdXj95G`；chunk `571e9d`；exec session `23021`。

```json
{"chunk_id":"571e9d","wall_time_seconds":0.0000091,"exit_code":0,"original_token_count":147,"output":"# Subtest: fresh public preparation quote loads the actual source dependencies without a running host\nok 2 - fresh public preparation quote loads the actual source dependencies without a running host\n  ---\n  duration_ms: 16564.052\n  type: 'test'\n  ...\n# Subtest: current human origin refuses the original receipt path before creating a listener\nok 3 - current human origin refuses the original receipt path before creating a listener\n  ---\n  duration_ms: 2.3029\n  type: 'test'\n  ...\n1..3\n# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 19748.7047\n"}
```

## Missing/browser mode rejection

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `615`；UTC `2026-10-05T09:33:14.030Z`；call ID `call_gU9G1cZo7RtVsZfzqWkMiBTd`；chunk `e863dd`；exec session `56942`。

```json
{"chunk_id":"e863dd","wall_time_seconds":0.0000094,"exit_code":0,"original_token_count":95,"output":"# Subtest: human preparation quote refuses a missing or browser mode without falling back to generic generation\nok 1 - human preparation quote refuses a missing or browser mode without falling back to generic generation\n  ---\n  duration_ms: 14666.1889\n  type: 'test'\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 17681.4352\n"}
```

## Initial preparation quote

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `382`；UTC `2026-10-05T09:03:46.351Z`；call ID `call_lZj09sEWzsShWl4U5gkfMOwe`；chunk `3a487c`；exec session `99805`。

```json
{"chunk_id":"3a487c","wall_time_seconds":0.0000091,"exit_code":0,"original_token_count":88,"output":"# Subtest: preparation coding quote authenticates two passed stages without activation or billing\nok 1 - preparation coding quote authenticates two passed stages without activation or billing\n  ---\n  duration_ms: 15058.9664\n  type: 'test'\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 18108.9527\n"}
```

## Immutable descriptor and wrong version mapping

来源：session_meta `01a10b29-9a67-7f03-b1a6-21ec2efa8a94`；audit line `424`；UTC `2026-10-05T09:07:36.359Z`；call ID `call_oyPqSTNSugRVhxJsjQGEaBSp`；chunk `ae6087`；exec session `88851`。

```json
{"chunk_id":"ae6087","wall_time_seconds":0.0000089,"exit_code":0,"original_token_count":89,"output":"# Subtest: human preparation plan fixes current interfaces and refuses a wrong plan version mapping\nok 1 - human preparation plan fixes current interfaces and refuses a wrong plan version mapping\n  ---\n  duration_ms: 18575.9648\n  type: 'test'\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 21727.7455\n"}
```
