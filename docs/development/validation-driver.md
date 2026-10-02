# COS20 固定验证案例入口

本段准备声明和固定输入校验，尚未接入窗口激活或实际执行。它不读取真实验证快照、会话或模型配置，也不产生游戏需求确认、已通过阶段、计时或费用记录。

- 声明：`probes/e2e/validation-declaration.ts` 固定 `cos20-native-validation-1`。单例增量 ¥5、45 分钟、40 次调用、一次语义修复；规划、评审、格式纠正和压缩共同计数。共享生命周期 ¥150 与首批累计 ¥30 同时约束。
- 新 planning grant 为 ¥2；design/art/coding/repair 分别为 ¥1.9/5.7/7.6/3.8，总计 ¥21，仅可使用旧账本未分配额度。旧 allocations、费用、首窗截止、停止和失败事实留存。claim 后即消费新 case ID，包括零请求启动失败；旧三个实验 ID 不重开。
- 模型固定 `deepseek-flash`。新原生 art/coding 作者明确选用 65536 输出上限；design/reviewer 保留 16384，planning 保留 4096。接线必须从同一声明读取上限，并让已有 `requestReservation` 按 SDK 实际请求大小预留；旧 probe 常量保持不变。
- `validation-input.ts` 核对既有 COS10 `cos10-pilot-v2` 文件及八个已跟踪通用模板文件的固定字节摘要。排除构建目录和依赖目录，额外模板源文件、缺文件、内容或编码改变均拒绝。返回 `validation-case-input`，不把原固定范围伪装成刚完成的真人访谈。
- 新解析器仅接受 `--validation-preflight <reviewed-main-sha>` 或 `--validation-case <reviewed-main-sha> <operator-validation-source>`，返回未激活的 intent。当前旧 `run.ts` 尚不接这些参数；不提供自定义 root、case ID、时钟或 reset。真实入口须核当前已审 main、原账本与窗口准入，再记录既有授权内的真实 `operator_validation` 来源。

后续接线复用同 `SnapshotStore`/`RunController` 的 validation 权限分支、原 planner/角色/registry/正常输入验收与有限 repair；新路径跳过旧 driver 自行填写 `confirmed:true` 的访谈包装。所有目标游戏专属代码及素材仍由原生角色在实际运行中生成；离线 fixture 明确不计为生成游戏。正式生成 ¥200/12h 及其人类准确报价续窗不受这套开发验证入口改写。

付费运行仍须源码独立 READY、合入 main 且实际准入通过，由协调方执行；声明、参数解析和本段测试均不构成一次已执行实验。

本段验证：`node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/e2e/validation-declaration.test.ts`，9 项先红后绿。另对两个新 probe 模块及测试运行显式 `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --types node`，通过；根项目 build 不包含 probe，因此未用它代替此类型检查。测试仅复制临时固定输入、改变副本并检查拒绝，不创建模型会话、浏览器、子进程或生成游戏，亦不访问真实验证目录。

## V2b：真实源码身份读取

`validation-identity.ts` 的 `createValidationIdentityReader({ repository, reviewedPlatformSha })` 返回接收 `AbortSignal` 的只读 reader，供后续 core 在 claim/open/每次 reserve/admit 调用。它核对真实仓库根、实际 main 分支、HEAD 和包含未跟踪文件的 Git status，再完整读取冻结输入，并重复分支/HEAD/status 检查；调用方不能通过传入“已验证”标志替代这些检查。

每次读取重新检查源码，返回实际 `reviewedPlatformSha` 与 `sha256(JSON.stringify(VALIDATION_CASE.inputs))`。Git 使用原有有界 `runChild` 和环境白名单；参数以数组传递，关闭可选 index 写锁、fsmonitor 和 untracked cache。忽略 Git 已忽略的产物；源码变化、脏工作区、额外未跟踪源码或固定输入漂移均拒绝。检查预算最多 5 秒，也接受 core 更早的取消，Git 终止仍等待原有受控清理，不把超时当作成功。

本段只新增身份读取，没有接入运行权限、执行输入契约或 paid driver。10 项测试使用真实临时 Git 仓库与冻结输入副本，覆盖 clean 读取无写（含 index 字节/mtime）、错误 SHA、错误分支/游离 HEAD、脏输入/源码、未跟踪源码、已提交输入漂移、后续 commit、取消及并发源码变化；不读取真实账本、历史 case 或会话。
