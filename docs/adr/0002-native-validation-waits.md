---
status: accepted
---

# 原生验证按阶段约束权限等待、浏览器传输与导航

COS93 v3 的完整实时 binding 已在无重叠条件下耗约 25 秒，六个 scope 各自仍低于原 5 秒 guard。现行内部 whole-open 15 秒在 ticket 前失败；导航还会等待每个 HTTP 请求前后的完整授权。COS96 的局部平面读取改进不足以支持整个链在 15 秒内完成。产品要求所有准备与等待计入原截止并保留清理时间，没有统一 15 秒的用户游戏验收值。

提议在可信源码选择的原生 validation transfer consumer 路径采用 `native-validation-waits/1`：保留完整 pre-ticket 授权、exact PID 登记与登记后完整 fresh 授权的顺序，再进行短界限的 CDP/身份工作。prepare 与 register 各最多 60 秒，browser transport 最多 15 秒，导航最多 300 秒，HTTP 的 pre/body/post 分别最多 60/15/60 秒；每段同时受原任务/窗口/运行截止与既有至少 5 秒工作预留夹紧。所有墙钟照实累计，原 5 秒 scope、正常输入/观测默认与清理规则保持。具体接口、信号、阶段起点与错误归属见 [COS97 spec](../specs/cos97-native-validation-waits.md)。

选择此方案，是为了把有限的授权等待与物理传输停滞分开，并为导航的真实 HTTP guard 留下明确预算。60 秒是根据约 25 秒独立 binding 与 31.9 秒迟到重叠样本提出的规划余量，15 秒保持物理短界限，300 秒为两个可能串行的 135 秒 guarded 响应留有限空间；样本未给出 p99、最坏值或实际 HTTP 通过保证。只让授权等待消耗父 deadline 会失去局部停止边界；只扩大一个总 timeout 无法说明责任；减少嵌套检查则尚无保持 expire/close 副作用与实时来源拒绝的等价证明。阶段值是新的有限内部契约，不能据此宣称实际游戏已加载或性能已达标。

新路径需要共享的窄内部 segment lease，使恢复页面在登记后 fresh、CDP 身份与可信导航前零有效游戏内容；每个放行请求仍执行既有完整 pre/post 和实际字节读取。raw prepare/registration 的迟到结果继续受 owner/drain 追踪；新增版本化标量计时不会移除等待。generic、human 与无该可信对象的调用保持原 whole-open/导航 15 秒默认，non-clean dist 回退不在本次修改范围。

独审前版提出两项P2，本提案据实补齐：caller signal须穿过consumer/preparation/origin/cleanDelivery与scope/identity/history的真实只读链，原私有5秒及controller reason优先保持；只有外围race不足以停止底层下一轮。局部caller取消只撤销对应lease，旧generation的迟到错误不能通过origin/preparation失效回调关闭新段；真实controller取消和当前来源漂移仍按原reason关闭对应origin。现有clean requireCurrent也不比较actual response，最终snapshot只能事后发现变化。因此仅新native转发路径增加基于withCleanDelivery既有私有fixed Map的verifyPayload：沿origin已解析name查dist/key，与实际已读Buffer比较后再发送；错payload即使磁盘恢复仍拒绝有效200，原最终双snapshot保持。新增可信可选参数默认不变，不修改standalone launcher或复制URL映射。

最终affected复审另要求两处内层race的收尾可实现：仅native caller的scope reader与identity work通过host回调在实际开始前取得OwnedWork所有权，组合signal继承同一source-owned关联，原5秒/首因仍及时返回。独立raw集合保留到reader实际settled；segment只等其raw子集合，外部drain观察已预登记operation，不能因外层race返回而假drained，也不等待包含自身的parent工作。默认/generic与通用race不变。

这是对指定路径内部时限契约的显式修订，不降低用户的完整游戏要求，也不追认 COS92/COS93 原 15 秒通过。旧 v1/v2/v3 与 C14 failed/consumed、账本及证据保留；内容、数值容差、普通玩法、FPS、体验验收和 ¥150 验证 / ¥200、12h 正式硬上限保持。独立 spec/ADR/plan 审查通过后才可由 Root 授权源码实施；本 ADR 初始为 proposed。
