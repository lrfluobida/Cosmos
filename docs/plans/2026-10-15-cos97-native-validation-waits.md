# COS97 Native Validation Waits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在指定原生验证 transfer consumer 路径实现有限阶段预算，保留全部实时授权、原截止、取消和精确所有权，并覆盖真实 HTTP 导航等待。

**Architecture:** 可信 host 构造一个绑定当前验证 authority 的窄 wait 对象，consumer 将同一对象传给 clean origin 与 native persistent lifecycle。runner/persistent 逐段使用固定预算；origin 使用当前 segment lease 和原完整 pre/post guard，标量证据保存总耗时与错误来源。

**Tech Stack:** 现有 Node 22.22.2、TypeScript 5.9.3、node:test、Playwright 1.63.0；无新依赖。

---

状态：`design-pending / NOT_REVIEWED`，只写文档，全部实施/测试复选框未执行。任务 [COS97 / #98](https://github.com/lrfluobida/Cosmos/issues/98)，id5864160449；[完整规格](../specs/cos97-native-validation-waits.md)、[ADR0002 proposed](../adr/0002-native-validation-waits.md)。设计基线 `dd367c5dd007ecbd43e2daf5b4e29635afc87fbb`，作者 `cos97_implementer`、独审 `cos97_reviewer`，唯一 merger `batch_c14_cos92_merger`。作者在 `codex/cos97-native-validation-waits` 和 own managed worktree 工作，不改 main/shared tracking/GitHub，不 push。

用户已授权持续推进 harness 工程，现阶段仅准备可审设计。产品决定已确认；Root 与独立 reviewer 审 routine 工程选择。本计划须独审通过，且 Root 明确授权源码阶段后才能运行下列步骤。actual、浏览器、真实 controller/715 seed、provider 与付费始终另需授权。

## 文件归属与最小范围

| 文件 | 责任 |
| --- | --- |
| `src/acceptance/native-validation-waits.ts`（新） | 固定 caps/版本、source factory provenance、阶段 race、HTTP segment lease、first cause、标量计时；不做通用框架 |
| `src/acceptance/runner.ts` | 可选可信 lifecycle 接线；native open/navigation、可信导航 gate、finally revoke、raw 标量证据；普通输入/default 保持 |
| `src/acceptance/persistent.ts` | native 三阶段 open、可选 register lifetime、raw registration settle 跟踪与 per-segment context；generic 分支保持 |
| `src/runtime/entrypoint-host.ts` | 仅 validation transfer consumer 构造与校验 wait 对象；nativeIO 同对象校验和 ownedChild registration lifetime/completion |
| `src/runtime/entrypoint-preparation.ts` | consumer context 增加只读可选可信字段，result 增加 consumer 终点摘要 |
| `src/runtime/adapters/transfer/runtime-acceptance.ts` | 同一对象传 mount/playPersistent/diagnostic expected，consumer 总计时 |
| `src/runtime/adapters/transfer/runtime-host.ts` | 将可选对象沿 mount closure 转交，保持全部 binding 调用顺序 |
| `src/runtime/adapters/transfer/loopback-origin.ts` | 仅带新对象的 clean mount 执行 gate 与 HTTP 三阶段；旧 non-clean/generic 保持 |
| `src/runtime/adapters/transfer/persistent-diagnostics.ts` | 可选 expected 版本与新 timing 校验；旧报告兼容 |
| `tests/acceptance/native-validation-waits.test.ts`（新） | 有限预算、父夹紧、reason、stage/lease 与计数单元测试 |
| `tests/acceptance/persistent-launch.test.ts` | 生产 native handoff/lifecycle 的长授权、后登记、取消与迟到回归；旧 COS92 断言保持 |
| `tests/acceptance/native-validation-runner.test.ts`（新） | 无真实浏览器的 production runner transport fixture，导航与原正常输入时限 |
| `tests/transfer/native-validation-origin.test.ts`（新） | 隔离 TEMP + loopback 合成服务的 gate、实际 bytes 与 pre/post drift；不启动浏览器/真实历史 controller |
| `tests/transfer/runtime-acceptance.test.ts` | 当前 production consumer 与 clean 路径的同对象/选择范围代表 |
| `tests/transfer/persistent-diagnostics.test.ts` | 新契约缺失/漂移/时序/未收敛拒绝与旧 expected 兼容 |
| 本 spec / ADR / plan | 独审、实施、命令与结果记录；ADR 接受状态由独审结果决定 |

不改 validation-scope、RunController、OwnedWork 的默认 guard/drain、source/identity/history 算法、通用 bounded、游戏、参考安装、真实账本与旧报告。不新增 CONTEXT 词条：本次采用既有“当前执行绑定”“自动验收”“交付清理终点”，技术阶段名放 spec。

## Task 1：固定契约、阶段 race 与 segment lease

- [ ] 阅读最终批准 spec/ADR 与当前实际 diff，确认源代码相对设计基线的变化；只更新被真实变化影响的步骤。
- [ ] 检查上述目标文件字节，严格 UTF-8/no BOM 和现有行尾；发现非 UTF-8 在写入前停止并报告。开始编辑前说明具体文件。
- [ ] 新建 `tests/acceptance/native-validation-waits.test.ts`，先写最小 RED：源码工厂存在且不能选择 cap；prepare 25 秒合法、60 秒精确到期；W 较短时父夹紧，剩余≤0 零派发。使用 Node fake Date/setTimeout 与真实 deferred Promise，不能用此模拟时长声称性能。
- [ ] Run: `node --experimental-strip-types --test tests/acceptance/native-validation-waits.test.ts`。预期 RED 是缺工厂/未实现契约的具体断言；保留原始日志，不把导入配置错误当作行为 RED。
- [ ] 创建窄模块，固定 `native-validation-waits/1`、prepare/register 60000、transport 15000、navigation 300000、HTTP 60000/15000/60000；只接收 authority/signal/工作跟踪，不接受 cap 或 clock override。内部 WeakSet 验证 source factory 对象。
- [ ] 实现 spec 的固定状态机、一次 stage 冻结、原 reason 首因、timer/listener finally 收尾、入口捕获 lease 与标量 snapshot。操作 promise 必须观察迟到 rejection；成功不得取消后续 exact handoff 使用的 lifetime。
- [ ] 扩展边界测试：预取消原 reason 同对象、parent 到期、私有 timer 独立品牌、首因后 cleanup 附加、closed/reopen/旧 lease拒绝、无源码对象/身份漂移拒绝、计数溢出失败、HTTP 聚合有界。原私有 scope classifier 另在 Task 4 真实生产路径验证，不靠同名 Error 替代。
- [ ] 重跑同一目标命令，预期全 pass、0 skip、无 unhandled rejection；记录 SHA、断言和可复用证据，提交 `feat: add fixed native validation wait contract`。

## Task 2：可信选择与三阶段 owned launch

- [ ] 在 `tests/acceptance/persistent-launch.test.ts` 使用现有真实 production `createPersistentOwnedChild` 和合成 spawn/CDP seam；保留旧无对象 COS92 fixture。先加 RED：new native pre-ticket binding 超过15秒仍无早 spawn；post-register binding 超过15秒仍零 CDP，只有 fresh 完成后一次 connect；transport 自己15秒到期。
- [ ] Run: `node --experimental-strip-types --test --test-name-pattern="COS97" tests/acceptance/persistent-launch.test.ts`。预期长授权/分段或对象接线断言失败，原测试不改成更宽容的旧默认。
- [ ] `entrypoint-host.ts` 在 validation transfer consumer 分支构造源对象；验证 current coding case/window/task/deadline。consumer context 类型增加可选字段；nativeIO 拒绝错 identity/series/deadline 或无 provenance 对象，generic/human 不构造。
- [ ] `runtime-acceptance.ts` 与 `runtime-host.ts` 只转交同对象，不重建、不复制 caps、不减少任何 current guard。native object 无 cleanDelivery 立即拒绝。
- [ ] `persistent.ts` 的 native open 实现 prepare→spawn→register+fresh→transport 三段；所有边界检查使用 W。原 ordinary lifetime 和 runner15秒行为保持；保留 endpoint/profile/PID/default context/service-worker 检查。
- [ ] `PreparedPersistentChild.register` 增加可选 registration lifetime。先启动 exact PID 持久化，再完整 fresh，不因本地到期丢弃已 spawn 的 PID。仅新native路径的 launch.completion 观察 raw registration/fresh 真正 settle，bounded 拒绝不得移除追踪；raw prepare迟到仍释放exact unspawned ticket。
- [ ] 增加阶段间 source/HEAD/index/window/budget drift 断言：pre-ticket读取中漂移零ticket/spawn；pre检查通过后至postfresh期间漂移允许owned spawn/PID登记，但零CDP/零gate；postfresh后漂移由HTTP pre/post拒绝有效字节。用现有最小production守卫fixture/隔离TEMP，不把检查间隙写成零OS副作用事务保证。
- [ ] 增加取消、late handle、late register、exact release 失败、release rollback、public drain pending/cleanup AggregateError、原 abort reason。逐项断言 retained ticket/PID、无 unhandled rejection、未收敛时不得 controller.close 成功。
- [ ] Run: `node --experimental-strip-types --test tests/acceptance/persistent-launch.test.ts tests/acceptance/native-validation-waits.test.ts`。预期全 pass/0 skip。旧 COS92默认15秒断言是兼容验收；提交 `feat: separate native authorization and browser launch waits`。

## Task 3：真实 HTTP 等待、恢复门禁与 runner 导航

- [ ] 在 `tests/transfer/native-validation-origin.test.ts` 创建新的隔离 TEMP clean服务，走生产 `reserveTransferOrigin.mountCandidate`；新对象到达时 gate关闭。RED：恢复请求在注册fresh/CDP/导航前404且不读取upstream；同一请求不能在后来open时转为合法；新段拒绝旧lease。
- [ ] 在 `tests/acceptance/native-validation-runner.test.ts` 用最小合成 context/page/CDP transport 驱动 production runner，无真实 browser。RED：合法HTTP授权等待超过15秒仍等待，同样normal-input仍原2秒/plan值，navigation300秒与W任一先到立即失败。
- [ ] Run: `node --experimental-strip-types --test tests/transfer/native-validation-origin.test.ts tests/acceptance/native-validation-runner.test.ts`。保留行为 RED。
- [ ] `loopback-origin.ts` 仅 new native clean mount 捕获当前lease、跟踪raw request并运行原verifyScope→fetch/完整bytes→verifyScope；追加每段截止和lease/mount检查后才writeHead/end。closed/旧lease请求404且不排队等开门。原non-clean/generic处理原样保留。
- [ ] `runner.ts` native open不套旧15秒总race；使用同对象父界限和三阶段证据。原页面/route/视频/异常设置完成后紧邻goto调用beginNavigation，goto/load/response/origin成功后finishNavigation；navigation既有请求不重置自身截止。
- [ ] runner finally先revoke再原清理，取消本段请求并在原剩余cleanup预算内检查settle；超时记录pending/cleanup failure，host-owned tracker继续保留责任。不能将网络连接关闭视为授权工作settled。
- [ ] 补HTTP body期间实际source/HEAD/index/window/budget、origin receipt、mount及clean实际文件变化拒绝；pre/post检查计数与次序明确，零有效字节响应，origin原private-scope close例外保持。补取消中/迟到拒绝/failedpostfirstcause，不增drain默认值。
- [ ] 静态疑点 `runtime-acceptance.test.ts` 的旧 `completeBindings===1` 与现源码每HTTP调用verifyBinding不一致：先在新的独立TEMP用原fixture单一baseline核证，记录结果，再只按批准spec与实际必要性修正受影响断言；不得为全suite通过删除fresh断言或现在提前跑baseline。
- [ ] Run: `node --experimental-strip-types --test tests/transfer/native-validation-origin.test.ts tests/acceptance/native-validation-runner.test.ts tests/transfer/runtime-acceptance.test.ts`。预期新行为通过；若旧baseline失败，保留失败和最小修正证据。提交 `feat: bound native guarded navigation and reject early restored traffic`。

## Task 4：版本化证据、诊断与兼容

- [ ] `tests/transfer/persistent-diagnostics.test.ts` 先加RED：可信expected新版本但raw缺记录、错task/deadline、阶段越界/次序错、pending非零、elapsed/总起止不一致都拒绝；旧expected无version仍读旧raw，旧v3不改。
- [ ] 在runner/persistent raw增加spec限定nativeWaits，只记已发生的segment/series终点与consumer起点；consumer最后guard完成后在result及host原browser envelope记consumer独立终点，不回写已认证raw。Date绝对时间与performance实际elapsed分清；并发HTTP固定3行聚合，非加和成总墙钟，race结束与raw未收敛pending分别记录。
- [ ] diagnostic expected仅由可信consumer传version；校验新记录后仍执行原report/evidence/identity/checkpoint/failure facts全部检查。生命周期/权限/HTTP错误保持insufficient_evidence；sourcefirstcause不能被派生goto/404改成code_defect。
- [ ] 用真实 `requireValidationScope` 生产guard的最小合成绑定触发原5秒私有timer，并跨native stage/HTTP验证`isValidationScopeTimeout`对象身份与原controller abort reason；预取消/同名伪Error不能获得私有分类。只用独立TEMP，不复制715历史seed或真实账本。
- [ ] 验证 selector 范围：generic persistent、human、无可信对象、plain runAcceptance 仍原open/navigation15秒，普通输入2000/locator/observations保持；伪native对象与series JSON中的预算字段拒绝。复用现有generic unit fixture，若其中browser步骤需要实际浏览器则列为另待授权，先运行其合成兼容代表。
- [ ] Run: `node --experimental-strip-types --test tests/transfer/persistent-diagnostics.test.ts tests/acceptance/native-validation-waits.test.ts tests/acceptance/persistent-launch.test.ts tests/acceptance/native-validation-runner.test.ts tests/transfer/native-validation-origin.test.ts`。预期全pass/0skip；旧证据只因真实代码delta选择代表，不重跑220/62。
- [ ] 提交 `feat: record and verify native wait contract evidence`，在本计划记录targeted命令、结果、exactSHA、首因/阶段与已知未测项。

## Task 5：受影响检查与独立源码审查

- [ ] 执行 `npm run typecheck`、`npm run build`。预期exit0；不通过时修复当前delta，再重跑受影响检查。
- [ ] 对新增及受影响文件运行现有项目strict命令：`node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck src/acceptance/native-validation-waits.ts tests/acceptance/native-validation-waits.test.ts tests/acceptance/persistent-launch.test.ts tests/acceptance/native-validation-runner.test.ts tests/transfer/native-validation-origin.test.ts`。若既有transitive基线诊断出现，先固定baseline核证并记录，不通过扩大源码范围掩盖；其余必要strict根据实际触及文件补精确清单。
- [ ] 运行独立reviewer指定的最少组合代表：真实private scope timeout/abort、source+closure drift、ownership late release/drain、consumer clean mount与旧generic synthetic；已通过未变组按版本复用。不要运行全量paid/e2e或复制715历史。
- [ ] 严格UTF-8/no BOM解码全部编辑文件并回读中文，检查原文件行尾/中文minimalpatch；执行 `git diff --check` 和 `git status --short`。预期无编码变化、无无关diff、仅批准范围。
- [ ] 交独立`cos97_reviewer` actual diff与exactSHA、批准spec/ADR/plan、原始检查日志与known gaps；先规格后质量。可行动finding仅在作者branch修复，补受影响验证并复审。
- [ ] 唯一merger只集成独审批准SHA，按实际变化做最少integration checks并记录；作者不合main/push。ADR的accepted须有独审通过记录，不能靠作者自行提升。

## 后续 actual 准备关口（不在本计划实施授权内）

- [ ] 若Root另行授权新的免费完整诊断，先单独提交一次性launcher方案并独审；冻结已审集成源码，新TEMP与new intent，只读旧来源，保持原45min外guard、5秒scope和所有预算。
- [ ] 至少走真实导航/ready与正常browser/helper/controller/ports/owner清理；pre-newPage sentinel不足。分报prepare/register/transport/HTTP/navigation/exit及consumer/series总墙钟，同时列新contract与旧15秒超界观测，不提升旧C14/accepted/human。
- [ ] Actual由Root授权的运行方执行一次并独立核证；当前不创建脚本、不启动browser/controller、不复制seed、不调用provider、不付费。

## 设计提交验证与证据复用

本次只新增spec、ADR proposed、plan三份UTF-8无BOM/LF文档；不改CONTEXT或源码/测试。作者提交前只做文本严格解码、中文回读、链接/实际源文件路径静态核对与git diff --check，不运行测试/构建/诊断。已有COS92/93/96的通过与失败均按原版本复用。

原C14 failed/consumed与v1/v2/v3不改；真实ledger revision3114、715请求、¥16.901000、reserved/unknown0，¥150验证（含prior¥0.721771）、正式¥200/12h、优化¥100/6h保持。参考游戏只读，不复制美术音频；APIkeys不得进入文件、日志、任务、Git或模型上下文。COS93仍open/partial/startup-failed，COS16/COS18、完整经典、coding批准、accepted与human仍未完成。
