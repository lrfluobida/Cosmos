# COS-118 · 普通设计写入后的即时只读校验反馈

父任务 COS18 / #19。前置 COS114/COS112；与 COS117 同批，互不依赖源码。独立设计评估 `intake_budget_recovery_design` 已给 APPROVED_DESIGN。

## 事实与目标

原room3设计作者的15个真实响应包含6次read、4次write、7次edit，没有调用已声明的validate-game-design，也没有完成handoff。计划112+18步中有26个action带不允许的acceptanceId、12个含selector的mouse-click使用像素坐标，另缺重开后的savedSnapshot断言。已有提示已写明正确规则；单纯再追加提示或多放行一次请求不能证明问题解决。

目标：普通设计作者成功写入或修改声明的设计文件后，在同一工具结果中直接收到现有validator的简短诊断，尽早修正结构错误。只读反馈仍是建议，最终capture与独立review继续核验实际产物。

## 必须满足

- 在RoleFactory现有工具执行包装处加窄的可选afterFileWrite回调。runtime host提供受限的现有design checker调用；provider/workspace-tools不得导入runtime validator。
- 仅ordinary-design/1的design author，且仅本任务实际声明的设计文件成功write/edit后触发。路径通过原scope/UTF-8/link检查；回调不得扩大读写权限。read、失败/抛错write/edit、reviewer、其他角色、legacy、preparation及validation路径保持原行为。
- 复用createGameDesignCheck的validator与完整需求来源、task/attempt、前后guard和deadline检查，不复制一套校验规则。模块或classic附加文件仅在原ordinary选择已经要求时按原声明检查。
- 保留原写入成功内容，追加只读诊断；不更改文件内容或将校验失败伪装成写入未完成。其他文件缺失、JSON分块未完成是当前输出不完整，返回可操作反馈，允许后续合法写入。
- 最多8条诊断、4096个字符的附加内容，包含文件、schema路径及原因，不返回全文/diff。未知字段要指出字段名。该小诊断改动仅改善定位，不放宽现有验证谓词。
- abort/guard/authority失效不能静默当作校验通过；按现有控制路径停止，保留已成功写入事实。普通schema错误只是反馈，不是新模型请求、attempt、repair或retry授权。
- 不新增模型调用、预算、请求次数、cap、窗口或自动确认。保留显式validate-game-design。自动反馈不写capture、review verdict或通过记录；capture与review仍独立检查完整输出。

## 免费验收

1. 不显式调用自检的模拟作者，write后收到同源具体schema错误；成功edit修正后获得更新反馈。覆盖真实失败类别：action未知字段、selector坐标、reopen checkpoint缺失。
2. 只有第一份文件、半份JSON或连续分块写入时，写入成功保留，可继续补完；最终完整文件仍由原validator决定结果。
3. 失败edit/越权路径/非UTF-8/link、read、reviewer和其他模式不触发；前后guard与取消保持。检查最多8条/4096字符，字段名可定位，中文显示正确。
4. 受控host路径证明反馈不能替代capture或独立review：错误输出仍不能晋级，写入后篡改/缺文件由原捕获拒绝；有效输出沿原路径通过。
5. 必要兼容代表、typecheck/build/changed-test strict通过；复用未变证据。

无需真实模型或浏览器执行。本卡不手写游戏，不修正已关闭运行的文件，不声称自动结构反馈解决了所有语义与体验问题。

## 实现状态

作者实现与免费验证完成，等待独立审查。实现记录与证据范围见 [实施计划](../plans/2026-10-21-design-write-feedback.md)。自动反馈保留写入成功正文，仅提供当前文件的只读结构诊断；guard/取消错误继续抛出，已成功写入字节保留。最终 capture 与独审仍决定产物能否通过。
