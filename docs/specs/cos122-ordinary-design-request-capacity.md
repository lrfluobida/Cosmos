# COS-122 · 普通设计作者会话的有界调用容量

状态：设计与计划已独立批准；[COS122 / #123](https://github.com/lrfluobida/Cosmos/issues/123)，父 COS18 / #19。源码待独立审查。基线 `69e3952e6fec9684fee9b2228e4d95f54d8d4fc4`，runtime `3de90d5e05c5ab2d4e7fd8b5c4eb7ba6f35a7a05`。用户已授权持续开发 Cosmos；本卡只做源码与免费 TEMP/fake transport 验证。memory 和 room1–6 均永久关闭。

## 已核实问题

room6 用户确认 v2 后运行 91.121 秒，以 incomplete 结束。规划通过；设计作者完成 16 个 toolUse 回复、18 个工具调用，随后在第 17 个模型请求发送前被 `Session request limit reached` 拒绝，零 usage。没有最终 handoff/capture/review，美术和编码未开始。

COS121 的映射改进在本案有效：第一次写出的 design.json 与终态完全相同，用生产纯 validator 检查设计结构、11 个玩法与 4 个体验映射均通过。最终验收计划为 106+25 步，原纯 validator 仍指出 reopen 阶段缺少 `checkpoint.savedSnapshot` 可见断言。末次有效 edit 暴露该缺口，之后一次 exact-string edit 未匹配，末两次请求读取 offset 815/875，再触限。不能称最终计划或设计语义已通过。

16 来自 entrypoint-host 非 validation 默认配置，不在本次用户的 ¥5/30 分钟授权中。设计任务原分配为 675000µ，本案设计实际 185378µ，仍余 489622µ；该分配还须供后续设计 review 使用，不能全部当作新增作者预算。失败时原窗口尚余约 28.5 分钟。作者 packet 展示分配、deadline、初始 committed，没有请求上限或剩余次数。

21 笔请求共 314904µ，已按原 API 停止/结算，释放 4685096µ。独立 PASS_CLOSED child111/shared3348，held/reserved/unknown=0；原失败/确认/时钟保留。详见 `.cosmos/public-validation/room-20261022-6/generation-execution.json` 和 `generation-closure.json`。

## 选择与范围

采用最小容量调整：普通设计作者从内部默认 16 改为明确的 32，并告诉作者为自检及最终交接留余量。32 是工程选择，真实效果尚待验证，不保证足够。

动态剩余次数提示需要修改 provider 上下文和成本估算，强制末几轮禁用工具可能阻断必要修复，本卡不做。结构化 JSON 编辑能减少已见的 exact-string/转义错误，但涉及新工具的路径权限、编码、原子修改和操作语义，本卡延后。现有具体错误反馈继续复用，不再扩展诊断或计划 validator。

## 设计

1. 在 `RoleFactoryOptions` 仿现有 `authorMaxOutputTokens` / `authorThinkingLevel` 增加可信的 `authorMaxRequests?: Partial<Record<AuthorRole, number>>`。采用原配置校验风格，只接受有效作者角色键与正的安全整数；不接受 planning/reviewer 或模型提供的新配置。
2. 在 factory 内只选择一次实际请求限额：仅当 `purpose === 'author'`、非 fixed validation 且角色为作者时使用该角色的显式覆盖，否则仍用原 `options.maxRequests`。规划常复用 design 角色，必须以 purpose 区分，不能只检查 role。
3. 生产 `entrypoint-host.ts` 仅对 ordinary design 设置 `{ design: 32 }`；art/coding 不设置，其他入口不设置。普通 funded validation 是普通产品入口，仍可获得该设计作者配置；旧 fixed validation 使用原声明限额，不能被覆盖。
4. 仅对实际启用覆盖的作者，在原 packet 或 system 提示中清楚说明同一个真实固定限额。说明模型请求轮次而非文件数或单个工具数，提醒为完整自检和最终 JSON handoff 留出调用；若仍有缺陷，必须如实报告剩余项，不能为终结而伪造完成。未启用覆盖的角色内容保持原样。
5. 提示与传给 Pi 的 maxRequests 共用同一个选定值，不能出现告知 32 而实际仍为 16 或反之。不增加动态计数器、额外请求、强制 finalization 或 readonlyPrompt 绕过。
6. 不改变原 grant、allocation、每次费用估价/预留/准入/结算、输出 token 上限、thinking、模型、超时、deadline、工具权限、artifact/capture/review、attempt 与 repair/window 规则。角色请求仍须通过原 requestWindow 和 budget 守卫；第 33 次被发送前拒绝。
7. 更改只作用于按新配置创建的会话，不重置正在运行的计数，不补写旧来源或修改旧 task。它不授予已失败、已停止、已关闭任务新的执行资格；所有已关闭历史保持关闭。

## 验收

- 生产 host 角色矩阵：ordinary design author=32；ordinary planning、review、art、coding 仍为各自原值；legacy/preparation 和 fixed validation 保持原值。trusted override 校验拒绝未知角色、0、负数、非整数和非有限值；缺省/空覆盖兼容。
- 实际 pinned Pi SDK 接 fake transport：旧 16 边界 RED；覆盖后能在超过 16 个请求后完成真实文本/协议交接，32 边界仍允许，33 发送前拒绝，不能发生第 33 个 fetch/收费请求。不把工具调用个数混为模型请求轮次。
- 启用 32 后，原额度不足、截止或 authority 失效仍可提前拒绝。验证不产生新 grant、attempt、窗口或历史恢复权限。
- 提示固定上限与实际配置一致，并保留如实报告缺陷的要求。实际文件仍经原 validator、capture 和独立 review；现有有效 host/反馈回归按未变范围复用。
- typecheck/build、变更测试 strict、UTF-8/中文与 diff 检查。每个任务独立 implementer/reviewer，唯一 merger 合并精确批准 SHA 并更新 issue/PROGRESS。

本卡完成只证明源码的有界容量和守卫行为。不得通过旧设计的内存修改、假 transport 或增加次数就宣称游戏完成。
