# COS46 设计输出自检实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** 在原设计作者会话中提供当前 generic design 的只读反馈，提前发现非法标识符并由作者自行修正。

**Architecture:** 沿用 RoleFactory 的可信 hostTools 接口，规划前固定工具名。最小 helper 只读固定 `authors/design/design.json`，调用原 `validateDesign`；错误定位使用原 `identifier`，不建立第二套结构校验。host 在读取前后检查原任务、workspace、输入、source、窗口和取消信号，capture 与独立 review 仍重新验证真实输出。

**Tech Stack:** TypeScript、Node 22、pi 0.99.2、TypeBox、node:test。

---

## 任务范围

- Modify: `src/runtime/entrypoint-host.ts`，明确 design/art 标识符规则，组合 generic 与现有 transfer 工具。
- Create: `src/runtime/entrypoint-design-check.ts`，严格空参数的只读工具。
- Create: `tests/runtime/entrypoint-design-check.test.ts`，当前字节与错误反馈。
- Create: `tests/runtime/entrypoint-design-check-host.test.ts`，实际 host/native factory 合成会话、捕获与权限边界。
- 不修改原 validator、地图、旧实际案例、provider、orchestrator、账本和 retry 权限。

## 执行

- [x] RED：实际 transfer host 的规划前工具声明缺失，原 `onTarget` 负例仍失败。
- [x] GREEN：新增只读工具与 host 权限绑定。工具每次读取当前字节；缺文件或无效 JSON 返回字段与约束，未知参数直接拒绝。
- [x] 验证正常、非法、保留字、缺文件、重新读取、修改后原 capture 独立拒绝，以及 role/task/source/window/停止/到期边界。
- [x] 验证 generic 修正与 transfer 封存共用同一会话、attempt、grant、调用上限和时钟；地图字节、语义重作次数及 ledger 不因工具变化。
- [x] 运行定向测试、实际 import 闭包 strict、UTF-8/中文/换行与 diff 检查，记录证据。
- [ ] 提交独立审查；只有 batch08 merger 集成已审 SHA。

## 已有证据复用

复用 COS41 的 oracle/rewrite/exhausted/cache、COS40 consumer、预算与 80 调用计数、真实 Edge 大矩阵。不启动付费请求或浏览器。所有新测试仅使用临时合成 fixture，不能证明 Cosmos 生成目标游戏。

## 实施证据

- 基线 `c6a9d7068bafa75a7cc34b8e1cdd68275449d60d`。修改原 host 32 行；helper 调用原 validator，只补 identifier 错误路径。
- RED：`node --experimental-strip-types --test tests/runtime/entrypoint-design-check-host.test.ts`，工具声明断言失败；4053.5887 ms。
- 原 author 会话正例 1/1，7797.7908 ms：transfer 首次通过封存，generic 非法状态定位后由作者改为合法状态；capture、verify、独立 review 通过。1 design session、1 attempt，工具前后 controller 全值相同、地图 SHA 相同；art/coding/build/play 零派发。
- 新定向测试 9 个场景均有通过证据。首次组合执行 6/9，通过 helper 三项、原会话正例、operator 只读/角色路径边界、deadline；另三项只是 fixture 尝试修改冻结 requirement、既有 stop code 和 HostFailure 文本断言的问题。修正测试后 source/window 与 stop 2/2（3890.0766 ms），当前字节 capture 1/1（3917.536 ms）。生产代码没有因这些测试断言调整。
- 受影响既有检查：operator grant/cap 与 source/mirroring 边界 2/2（4127.8744 ms），media 原严格校验 3/3（315.8258 ms），default generic capture/current report 1/1（4011.6427 ms）。不重复未变大矩阵。
- 实际两组新测试 import 闭包 `tsc --noEmit --strict --module NodeNext --moduleResolution NodeNext --target ES2022 --allowImportingTsExtensions --skipLibCheck --types node` 退出 0（7064.1531 ms）。初次仅测试 execute/content 类型错误已修正，生产类型规则未放宽。
- 只读反馈没有 capture/evidence/审计写入；原 host capture 仍独立拒绝工具通过后被改成非法状态的输出。旧 actual Case2、原 validator、账本、provider、调用上限、deadline、语义 rewrite 与 coding repair 权限均保持。
