# COS83 作者工具来源校验实施计划

> 使用 diagnosing-bugs / writing-plans / TDD。专属 implementer `cos76_implementer` acting COS83；独立 reviewer `cos77_implementer`；唯一 merger `batch75_76_merger`。先审免费基线方案，再按实测证据审最小生产选择。

**目标：** 减少作者工具中的重复来源校验，保留每次操作的当前授权、输入漂移与进程边界检查。

**基线：** main `a464b0fb523ce29f6e688a92a08ccd156b6502a7`，managed `cos76-transfer-case8/Cosmos`，分支 `codex/cos83-tool-scope`。Issue [#84](https://github.com/lrfluobida/Cosmos/issues/84)，id5847590995；依赖 COS55/75/82。后续 C10结果提交只涉及文档时复用当前生产基线。

## 已知事实与待验证问题

Root报告 C10 的两次 check-game-build 分别约226秒和378秒，第二次 TypeScript/Vite退出0、Vite自报901ms。这是背景输入；本卡不读取真实会话/账本/生成代码，也不将静态推导的60/94次scope当成实测。

实际链为 factory.beforeTool→requireDispatch→checker初始guard→每phase前guard→runOwnedNode/worker/compiler→phase后guard→当前源码签名。transfer `guard` 先 `ctx.requireScope()` 再 `origin.verify()`，后者内部再次调用同一 requireScope。它是候选冗余；coding guard前 requireDispatch 与后 preparation.requireCurrent 之间有controller/capture/template读取，不能据相同名字直接删掉后者。

## 阶段一：免费可执行基线，生产不改

- [x] exact计划/卡交独审，PLAN_APPROVED后才运行基线。
- [x] 在 `C:/Users/26557/AppData/Local/Temp/cos83-tool-scope/` 保存独立诊断脚本/结果/TAP。复用现有 transferFixture 与 codingAuthor 的公开API装配顺序，沿真实 transfer host、factory提供的tool.execute、checker、owned launcher/worker；合成tsc/vite只写阶段标志并退出，不安装依赖或编译真实游戏。reader须在host创建前包装，见下文首次接线失败。
- [x] 仅包装夹具已有 `validation.readScope`：每次计数/计时后仍调用原reader；可加入固定5ms且响应原signal的SOURCE延迟。host其它guard、scope验证、controller/registry和原worker边界全部保留，不用计数stub代替它们。
- [x] 同一原作者上下文执行两次完整check（0ms/5ms延迟），分别记录scopeCalls、实际toolElapsedMs、受控延迟累计、两个compiler退出/PID；断言都产生当前scope读取、两次计数稳定、原费用/任务/registry不变。用调用次数作确定性反馈，墙钟仅记录，不设脆弱性能断言。
- [x] 命令只选择 `SOURCE COS83`。最终脚本直接导入fixture和public runtime，不注册旧测试；实际1/1、0skip，不重跑矩阵。诊断用普通prepared transfer夹具，不冒充C10 inherited路径实测或付费节省。
- [x] 报告实测次数、耗时与具体调用链；阶段二生产选择仍待独审。夹具接线问题先定位，不改生产去迁就基准、不重建C10长seed。

## 阶段二：基线后的最小选择，等待独审

选择只删 `src/runtime/adapters/transfer/runtime-host.ts` 的 transfer guard 中先行 `ctx.requireScope()`，保留 `await origin.verify()`；后者仍在listener/receipt检查前完整读取当前scope。已核 `initialize` 先await reserveTransferOrigin赋值，再进入继承verify或构建设计校验工具；外部host只在initialize完成后返回，因此guard可使用已绑定origin。原异常/abort/COS75局部timeout关闭逻辑保持。两个scope调用间没有其它业务读取或执行边界；保留的origin.verify自身执行当前scope及listener/receipt读取，不以先前检查结果代替新授权。

不改 `entrypoint-host.ts` 的第二次 preparation.requireCurrent，不删工具/worker/付费执行前后guard，不改输入/输出签名、完整历史验证或owner绑定。若实测不能支持该单点收益，先提交证据与新方案审查，不能扩大到跨可变await去重。

若该候选获批，预计最小文件范围：生产仅上述一个文件；在 `tests/runtime/entrypoint-coding-check.test.ts` 给现成测试helper增加创建host前的可选scope观察回调（始终调用原reader，不是生产开关），增加实际tool计数回归：以实测旧160为基线先断言应减少得到RED，再记录GREEN实际值；两次各自读取、状态/费用/输入不变。必要更新 `tests/transfer/scope-timeout-origin.test.ts` 中描述被删除外层位置的测试标题，保留实际语义。本计划与 `docs/specs/cos83-tool-scope.md` 自有，shared tracking由merger负责。

## 阶段二验证边界

- [ ] 实际check性能代表先RED后GREEN，报告新旧实测scope次数及受控延迟，两个独立调用仍各自验证当前scope；不增加授权cache。
- [ ] 定向复用/运行现有COS55代表：源码或固定输入在compiler期间变化、取消、TypeScript后Vite前输入变化仍拒绝；worker注册屏障、清理与120秒phase时限保持。
- [ ] 定向COS75：真实transfer guard局部scope timeout保持origin、后续独立调用重新校验；真实abort/owner取消、receipt或binding变更仍关闭/拒绝，不能凭新位置吞错误。未变长矩阵复用。
- [ ] typecheck/build/受影响strict、UTF-8/LF/中文回读、完整base diff check；保存原始证据与exact SHA交独审。只有通过后可使用 `AUTHOR_TOOL_SCOPE_SOURCE_READY`。

## 排除范围

不加跨请求授权cache、通用预算/ledger/schema/CLI，不扩大tool120秒或窗口时限。不读取真实ledger/session/thinking/key、C10作者文件或参考游戏；不重C10付费、不启动C11，不用实际生成游戏作免费基准。若确需真实生成代码，须先说明文件范围并由Root显式提供独立副本。

## 阶段一实测

阶段一计划 exact `a7b420a2c70249e0ae025c96601bce518a1063a6` 已由 `cos77_implementer` PLAN_APPROVED。运行期间生产与仓内测试均未修改。

首轮直接调用codingAuthor返回后替换f.validation.readScope，真实工具虽完成，但计数为0，断言失败（TAP28050.9589ms）。定位为 `entrypoint-host.ts:219` 在创建host时浅拷贝validation，后换原对象方法无效。改为在TEMP按原codingAuthor公开装配顺序复用transferFixture，先包装原reader再创建host。首轮脚本和TAP保存在 `baseline-reader-hook-miss.mjs`、`baseline-reader-hook-miss.tap`，不计作性能RED或“0次校验”证据。

有效命令：`node --experimental-strip-types --test --test-name-pattern="SOURCE COS83" C:/Users/26557/AppData/Local/Temp/cos83-tool-scope/baseline.mjs`。原始 `baseline.mjs`、`baseline.json`、`baseline.tap` 均保存在该目录。结果1/1、0skip，退出0，test36580.1998ms/TAP40257.063ms。

| 实际调用 | scopeCalls | toolElapsedMs | requestedDelayTotalMs | 实际延迟累计ms | reader累计ms |
| --- | --- | --- | --- | --- | --- |
| 第一次，0ms延迟 | 160 | 11544.607 | 0 | 0 | 48.108 |
| 第二次，每次请求5ms延迟 | 160 | 13847.8701 | 800 | 2067.3611 | 2154.5817 |

setup10817.4109ms/337次scope在测量区间外。5ms定时器实际累计明显大于请求800ms，因此不把预设延迟当实际耗时。工具从真实factory的config.tools取出执行，包含entrypoint-host启用的beforeTool→requireDispatch；不是直接调用裸checker。两次均真实启动typecheck/build两个owned worker及合成compiler，codes[0,0]、所有worker/compiler PID退出，原snapshot/registry/author字节保持、network0；TAP正常结束包含owner/目录清理。没有C10 inherited或实际Git-reader成本实测，160不能与静态60/94直接比较。

该反馈能确定当前工具仍有大量scope读取，且两次独立调用均重新读取；生产候选的实际降幅必须在阶段二GREEN测得后报告，不先声称提速比例。状态：阶段一完成 / 阶段二生产方案待独审 / SOURCE_NOT_READY。
