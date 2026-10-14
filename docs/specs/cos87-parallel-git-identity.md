# COS-87 并行读取独立 Git 身份字段

状态：PLAN_REVIEW_PENDING / SOURCE_NOT_READY。Issue [#88](https://github.com/lrfluobida/Cosmos/issues/88)，id5852635000；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，依赖 COS83、COS86 的源码及 C12 结果记录。

作者 `cos87_implementer`；独立 reviewer 由 Root 指派；唯一 merger `batch_c12_reference_merger`。实施计划：[2026-10-15-cos87-parallel-git-identity.md](../plans/2026-10-15-cos87-parallel-git-identity.md)。基线 `b94d0d49f032888d46d8e1a56e774713fe8fe973`。

## 目标与不变量

免费普通 prepared fixture 一次工具耗时135679.100ms，83次scope累计121935.049ms，其中完整Git身份77662.116ms、源码检查44219.650ms。实际源码为 `3cde457f77ef8990d73a650319b76900df3cdc11`；旧harness标签不能替代该来源。夹具的合成compiler与普通准备路径不能证明C12实际耗时或游戏验收。

本任务只把 `probes/e2e/validation-identity.ts` 的 `inspect()` 内四个独立只读 Git 查询并行，保留：

1. root核对 → 完整before → 固定输入读取 → 完整after，以及前后身份比较。
2. 每组最多4个child；精确SHA、clean main、hidden index flags、固定输入摘要和每次fresh读取。
3. 原共享5秒deadline与abort；全部started siblings结束后才返回或失败。
4. 按原字段顺序传播失败；index flags校验仍在status结果校验之前。
5. 原 `runChild` 参数、source snapshot、权限、预算和窗口。

## 交付与验证

计划先独审，后按 RED→GREEN 修改源码。最小受控测试证明同组重叠、跨组有序、失败收齐与确定性错误；真实child测试证明取消/超时后PID退出。保留现有身份守卫测试，补固定输入期间变更与根目录错误。运行完整identity测试、typecheck/build及受影响strict检查。

同环境旧/新身份读取实测保存原始样本与中位数，不设置墙钟通过阈值，不重跑原135秒大夹具。证据目录：`C:/Users/26557/AppData/Local/Temp/cos87-parallel-git-identity/`。计划阶段不声明实际提速。

仅免费source/TEMP工作；不读真实ledger/session/key，不修改生成游戏，不访问参考安装，不重跑已消费C12，不开启新付费案例。共享 ¥150、正式 ¥200/12h、目标 ¥100/6h 保持；COS16/COS18、完整经典、PERFORMANCE、human仍按原验收要求推进。最终实际diff须独审后由唯一merger集成。
