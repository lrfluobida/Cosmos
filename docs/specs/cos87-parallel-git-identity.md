# COS-87 并行读取独立 Git 身份字段

状态：PARALLEL_GIT_IDENTITY_SOURCE_READY / source scoped complete / closed。Issue [#88](https://github.com/lrfluobida/Cosmos/issues/88)，id5852635000；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，依赖 COS83、COS86 的源码及 C12 结果记录。

作者 `cos87_implementer`；独立 reviewer `cos87_reviewer`；唯一 merger `batch_c12_reference_merger`。实施计划：[2026-10-15-cos87-parallel-git-identity.md](../plans/2026-10-15-cos87-parallel-git-identity.md)。基线 `b94d0d49f032888d46d8e1a56e774713fe8fe973`；计划批准 exact `f509606a8da1ebe6e5f73ff2d0c430d787fe85c9`，无 findings。

## 目标与不变量

免费普通 prepared fixture 一次工具耗时135679.100ms，83次scope累计121935.049ms，其中完整Git身份77662.116ms、源码检查44219.650ms。实际源码为 `3cde457f77ef8990d73a650319b76900df3cdc11`；旧harness标签不能替代该来源。夹具的合成compiler与普通准备路径不能证明C12实际耗时或游戏验收。

本任务只把 `probes/e2e/validation-identity.ts` 的 `inspect()` 内四个独立只读 Git 查询并行，保留：

1. root核对 → 完整before → 固定输入读取 → 完整after，以及前后身份比较。
2. 每组最多4个child；精确SHA、clean main、hidden index flags、固定输入摘要和每次fresh读取。
3. 原共享5秒deadline与abort；全部started siblings结束后才返回或失败。
4. 按原字段顺序传播失败；index flags校验仍在status结果校验之前。
5. 原 `runChild` 参数、source snapshot、权限、预算和窗口。

## 交付与验证

计划批准后，旧生产RED准确失败于仅branch开始；最小生产修改后受控5/5、完整identity19/19、0skip，typecheck/build/受影响strict全部退出0。两次调用仍18次fresh查询；组内最大4个、root/input/前后组顺序保持。真实child查询失败、caller abort与原5秒timeout均确认全部4个PID在读取器拒绝前退出。现有身份守卫保留，根目录错误与输入读取期间变更补齐。

同环境真实main `59b89897435c2acd8d9cf64b878fd8306f3d154a` 上各预热1次、交替5次；每次仍9个真实Git查询且身份一致。中位数755.5810ms→348.6017ms，下降53.8631%，仅适用于此环境的身份读取。未重跑原135秒大夹具，不外推实际C12、自检总时长或费用。原始样本、命令与预检拒绝记录见计划及 `C:/Users/26557/AppData/Local/Temp/cos87-parallel-git-identity/`。

仅免费source/TEMP工作；不读真实ledger/session/key，不修改生成游戏，不访问参考安装，不重跑已消费C12，不开启新付费案例。共享 ¥150、正式 ¥200/12h、目标 ¥100/6h 保持；COS16/COS18、完整经典、PERFORMANCE、human仍按原验收要求推进。

## 独立审查与主线集成

最终 `ac91cff85ddbdd08720623fd600161f2e61bd6b6` 经 `cos87_reviewer` 实际规格及质量审查APPROVED，无剩余finding；唯一 `batch_c12_reference_merger` 合入 `49e892992749e5511f2bb4135ec67be4459fa30b`。计划 `f509606a8da1ebe6e5f73ff2d0c430d787fe85c9` 与基线祖先已核对，合并时全部5文件与批准提交逐字节一致。本卡已[在源码范围完成并关闭](https://github.com/lrfluobida/Cosmos/issues/88#issuecomment-6175145772)，closed(completed)及父勾选已由Root精确读回；本卡不启动付费验证。

主线受影响strict命令复用上述完整参数，退出0；`node --experimental-strip-types --test --test-name-pattern "COS87 identity (overlap|child-failure)$" tests/e2e/validation-identity.test.ts` 通过2/2、0skip，TAP1250.9167ms。两次独立读取共18个查询、峰值4、active0；真实失败场景4个PID均在返回前退出。原始记录为 `C:/Users/26557/AppData/Local/Temp/cos87-merge-affected-strict.log` 和 `C:/Users/26557/AppData/Local/Temp/cos87-merge-integration.tap`。原19/19、typecheck/build、abort/5秒清理及短性能基准按已审证据复用；没有重复长矩阵或性能采样。
