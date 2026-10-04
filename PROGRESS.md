# Cosmos 进度

更新时间：2026-10-04

## 当前阶段

Spec v1.0 已发布：[主 issue #1](https://github.com/lrfluobida/Cosmos/issues/1)，下挂 43 个原生子任务。早期验证历史：COS-10 首轮及一次有界续跑均失败；续跑 22.379 秒，设计宿主检查通过，但独立评审返回 `approved` 加非空 `findings`，被响应契约拒绝。原 pilot 累计 13 次请求已结算，当时共享验证估算 ¥0.892282，预留与未知费用均为零；其美术、编码及玩法验收未执行，#11 保持 open。评审字段说明修正 `608ac1f` 已独立批准并合入 `00db85a`；原 pilot 仍失败，不再调用现有 `--continue`。COS-11 有界修复与协议纠错 `005f51b` 已独立批准并合入 `e1467f0`，组合检查 170/170、构建与类型检查通过；#12 为 `offline-verified-awaiting-live`，保持 open，G3 仍关闭。[失败证据与决策](docs/research/2026-10-01-first-runtime-failure.md)。COS-18 A/B/C 与角色交接修复已集成；首次 formal 追加窗口公开确认、执行、恢复、停止和交付已审合入 `73ec63a`，主线八项组合检查及严格构建通过，`bacb22d` 已干净推送。多次正式追加决定、最终试玩持久阶段、完整经典适配与真实生成仍有缺口，#19 保持 partial/open；开发验证首个新窗口已执行但启动失败，由 COS-21 免费诊断。COS-01 参考仍未冻结。正式生成原硬上限 ¥200/12h、优化目标 ¥100/6h 的成绩不被追加窗口覆盖。

第六批补充：固定新试验于 `2026-10-01T11:43:38.426Z` 开始，8.204 秒后在首次输入 capture 发布窗口失败，模型请求与新增费用均为零；原因未知。启动恢复实现虽已独立批准并合入，但实际命令被原 `12:43:38.426Z` 截止拒绝，不能再试或延时。COS-13 已独立批准并合入 `d3aab99`，状态为 `offline-verified-awaiting-live`，#14 保持 open；真实长链路尚未执行，当时无通过的生成游戏，#11/#12 与 G3 状态不变。

此前实验结果：`cos10-reviewed-validation-1` 在 `f16c896` 上运行 92.746 秒后失败，8 次原生请求新增估算 ¥0.224120，共享累计 **¥1.116402**，预留/未知为零。design 写出文件后交接 JSON 格式解析失败，art 在 16,384 token 截断后被正确拒绝；两者各失败一次、尚未 capture，coding 因依赖失败未开始，未进入修复、独立评审或玩法验收。唯一机会已消费，不恢复或重开；[失败实证](docs/research/2026-10-02-reviewed-experiment-failure.md)。[COS-19 / #20](https://github.com/lrfluobida/Cosmos/issues/20) 的角色交接、截断诊断与输出配置修复已独立批准并合入 `d0c39ad`，69/69 聚焦检查、类型检查与构建通过；真实生成效果尚未新实测，不改变范围、预算或旧失败结论，#20 暂保持 open。

首例结果：真实 `cos20-native-validation-1` 在 `efb5170` 上于 `2026-10-02T11:58:02.694Z` 开始，原定截止 `2026-10-02T12:43:02.694Z`，`2026-10-02T11:58:09.818Z` 以 manual stop 结束，共 7.124 秒。零 SDK 请求、零新增费用，当时共享估算 **1,116,402 micro-CNY / ¥1.116402**，预留/未知为零；bootstrap 与 requirements capture 成功，template capture 的原子 rename 报 EPERM，guardAborted:false。case 已消费，结果及 marker 保留，首例 main 冻结已由协调者解除。COS-20 当时为 source-ready-real-startup-failed/open，COS-10 仍失败/open，G3/G4 未通过，未生成合格游戏；[COS-21 / #22](https://github.com/lrfluobida/Cosmos/issues/22) 承接该发布失败。

Case2 结果：`cos20-native-validation-2` 在准确 `f5522e8` 上于 `2026-10-02T15:39:49.986Z` 开始，原定截止 `16:24:49.986Z`，`15:46:42.301Z` 结束，共 412,315 ms / 6 分 52.315 秒。40 次实际 SDK 请求耗尽本 case 的 40 次上限，下一请求在发送前被自动拒绝；新增保守峰值估算 **¥0.857751**，共享累计 **¥1.974153**，预留/未知为零。design/art 的真实 host 与独立评审通过，coding 一次 attempt 失败，未 capture/build/check_project/browser，无独立 accepted candidate，语义修复未 claim。case2 manual stop/结果/marker 已消费，本轮 main 冻结解除；COS-10/COS-20 保持失败/open，G3/G4 未通过。COS-21 的 requirements/template 及 design/art capture 在真实 case2 均正常，Windows 发布修复完成，不代表目标游戏通过。

Case3 结果：`cos20-native-validation-3` 在准确 `c78b12c` 上于 `2026-10-03T05:23:54.699Z` 开始，原定 `06:08:54.699Z` 截止，`05:24:45.981Z` 结束，51,282 ms。planning 2/design author 3 共 5/80 SDK 请求，新增保守峰值估算 **¥0.068875**，共享累计 **¥2.043028**，unknown/reserved 零。design 一次 attempt 最终 1,549 bytes prose 无 JSON fence，严格 decoder 报 `Model response requires one complete JSON object`，未 host capture 或独立 review；art/coding 未开始，accepted candidate 无，语义修复未 claim。金额、45 分钟和 80 次上限均未触及，case3 manual one-shot finish/结果/marker 已消费，root 确认退出和锁释放后解除 main 冻结；G3/G4 与完整生成目标仍未通过。

Case4 结果：`cos20-native-validation-4` 在准确 `b0cf64f` 上于 `2026-10-03T08:06:12.677Z` 开始，原定 `08:51:12.677Z` 截止，`08:06:25.965Z` 结束，13,288 ms。startup/bootstrap/template 通过，planning 1 请求/1,396 bytes 严格 JSON 的角色 ID、完整 10 AC 和 DAG 条件均合法；host `src/roles/planner.ts:115` 仍按 gross allocation 168,596,040 > 150,000,000 拒绝，未采用合法有效容量 106,522,666。新增保守峰值估算 **¥0.011432**，共享累计 **¥2.054460**，unknown/reserved 零、结束时 snapshot revision 345/ledger 3.0.0。design/art/coding 未创建或开始，accepted null，无 semantic repair；未触 80/¥5/45 分钟上限，manual finish/结果/marker 已消费。Root 已核退出、清除凭据和锁释放，解除 main 冻结；其后免费 closure2 仅关闭 C4 五 grants 未用容量，revision 346、费用不变，case5 和 G3/G4 尚未通过。

Case5 结果：`cos20-native-validation-5` 在准确 `8fc7ce5` 上于 `2026-10-03T09:28:05.370Z` 开始，原定 `10:13:05.370Z` 截止，`09:35:55.652Z` 结束，470,282 ms / 7 分 50.282 秒。47 个实际请求新增保守峰值估算 **¥0.901041**，共享累计 **¥2.955501**，unknown/reserved 零，结束时 snapshot revision 555/ledger3。design/art 一次 attempt passed，coding check_project 六次、TypeScript/Vite 通过且 immutable v1 已捕获，但 author_handoff/insufficient_evidence 因两项 host-owned 观察问题被当成作者 blocker 而失败；原 remaining []/uncertainty 保留，host verify/browser/独立 coding review 未运行，accepted null/repair0，非 JSON 协议失败。五案例均已消费，root 确认退出和锁释放后解冻；第三次免费 closure 只归还 C5 未用容量，revision 556/费用保持，case6 和 G3/G4 未通过。

Case6 结果：`cos20-native-validation-6` 在准确 `7e51632` 于 `2026-10-03T11:22:00.263Z` 开始，原定 `12:07:00.263Z` 截止，`11:32:19.891Z` 结束，619,628 ms / 10 分 19.628 秒。66 请求新增保守峰值估算 **¥1.280416**，共享 **¥4.235917**，unknown/reserved0、snapshot841/ledger3。design/art passed，coding 原三 concerns 经实际 readonly clarification 完整保留（一项转 summary、两 uncertainty 仍在），在 author_handoff/insufficient_evidence 失败；TypeScript/Vite 成功、v1 已捕获，但原run未 host/browser/独立 coding review，accepted null/repair0，manual consumed。

Case7 结果（历史）：`cos20-native-validation-7` 在准确 `2404982` 于 `2026-10-03T15:47:24.285Z` 开始，原定 `16:32:24.285Z` 截止，`15:56:47.389Z` 结束，563,104 ms / 9 分 23.104 秒。54 次请求新增保守峰值估算 **¥1.223114**，共享 **¥5.459031**，unknown/reserved0、结束时 snapshot1079/ledger3。design/art passed；coding 构建通过、v1 捕获且进入 host/browser，但第005步状态仍“准备开始”而非“防守中”，pageerror 显示 HUD `[data-testid="wave"]` 缺失。原111步计划仅三项检查和 start input 通过，005失败后其余 skipped，非111步通过；局部等待超时并强制退出，诊断 insufficient_evidence，未独立 coding review、repair0/无accepted。Root核退出、凭据清除和锁释放后解冻；随后第五次免费closure仅归还C7未用容量，revision1080/费用不变，未claim新case8。

正面实证：root 克隆未修改的原生生成 v1 候选，独立免费执行原 host build 和未改 normal mouse plan，真实 Edge 111 步通过/0 failed/0 skip/no errors，约96.4秒正常退出。原 candidate file list/所有文件 SHA 与 shared snapshot bytes 不变、0 model/0 fee；候选实际游戏完成固定玩法诊断。该诊断不 resume/promote 原 C6、不改其 failed/consumed 或并入旧decl时间，不是正式 native accepted、独立 coding review 或完整 classic benchmark 通过。C6免费诊断与原失败分列；最新C8已原生生成并接受v2有界单关，完整经典基准与实际用户体验仍未通过。

最新 Case8 结果：`cos20-native-validation-8` 在准确 `ef4b2ea2bdd9b867cac6fe9797a56257569d663a` 上由原生运行生成并自动接受 **v2 有界单关**。UTC`2026-10-03T18:41:12.207Z`开始、原定`19:26:12.207Z`截止、`18:56:49.704Z`结束，937,497ms / 15分37.497秒。76请求新增保守峰值估算 **¥1.549592**，共享 **¥7.008623**，unknown/reserved0、结束时snapshot1413/ledger3。v1在browser090的`media.audioStarted-defeat:false`被真实归为code_defect；一次自动linked repair后v2构建通过、真实Edge111/111、0failed/0skip/errors[]、独立codingreview approved并promotion。原v1失败与旧七案例保留，平台实施者没有手改游戏；manual consumed，不重开。Closure6仅归还C8未用任务capacity，revision1414/费用不变。此为有界单关自动成功，不代表完整经典基准、最终还原目标或实际用户体验通过。

## 用户提出的目标

- 以 pi agent 为基座，构建游戏开发 agent。
- 已确认产品边界：可扩展的 2D 游戏 agent，先攻克类《植物大战僵尸》。
- 首个能力目标：百分百还原原版核心玩法和内容规模；原创美术可简化，但角色需与原作一一对应，界面布局大体相似。
- 已确认交互方式：前期集中提问并确认需求，执行中自主推进，仅遇到预算或关键决策问题时找用户；重点做好 harness engineering。
- 已确认资源偏好：正式单次生成验证 ¥200/12h 硬上限，优化目标 ¥100/6h，计时包含修复、自动验收、打包和启动检查；质量 > 成本 > 速度；本地 RTX 3060 6GB，可考虑云端资源；指定 DeepSeek v4.1 Flash，API 标识 `deepseek-flash`，pi 有界接入验证通过。
- 已确认首版形态：Windows 命令行 Cosmos，交付浏览器游戏与完整源码。
- 已确认复用与范围：允许通用模板，游戏专属实现由 Cosmos 生成；经典 PC 版主要内容全纳入，GOTY 新增项另列；关键数值对齐并规定容差。
- 初步角色设想：Cosmos-agent 负责任务拆解、安排、结果收集与审查；coding-agent 开发代码；design-agent 设计玩法并通过提问完善需求；art-agent 负责美术。
- 当前优先事项是按已发布任务实施、独立审核和批次合并；技术缺口通过有界验证解决。

## 工作清单

| 工作 | 状态 | 证据 / 下一步 |
| --- | --- | --- |
| 检查工作区与已有项目约定 | 已完成 | 初始为空目录；现已初始化 Git，文档与探针记录已推送 main，保持 UTF-8 / LF |
| 查找 GitHub 发布位置 | 已完成 | [lrfluobida/Cosmos](https://github.com/lrfluobida/Cosmos)，使用已认证的同名账户发布；连接器的 issue 写入权限不足已由本机标准认证完成 |
| pi SDK 接入 | 真实有界探针通过 | pi 0.99.2 原生 DeepSeek：工具错误恢复、写/编辑、压缩、恢复与图像输入 6 次请求通过；[真实报告](probes/pi/evidence/live-2026-10-01.json) |
| 游戏运行、自动试玩与美术验收调研 | 首轮完成 | [候选平台、验收办法与验证任务](docs/research/2026-09-30-feasibility.md) |
| 第 1 轮需求访谈 | 已回答 | 已记录产品、内容与美术要求、交互、资源偏好及仓库 |
| 第 2 轮需求访谈 | 已回答 | 平台、时限对象、复用范围、模式范围与还原精度已确认；预算在第 3 轮确认 |
| DeepSeek 与美术能力核实 | pi 与 Phaser 媒体集成探针通过 | [真实 pi 报告](probes/pi/evidence/live-2026-10-01.json)；[Phaser 证据](probes/artifacts/evidence/verification.json) 导入 14 帧/3 状态、解码并经正常鼠标输入静音触发 5 WAV；听感与完整游戏仍未验收 |
| 原版内容与版本边界核实 | 首轮核实完成 | [内容来源与版本差异](docs/research/2026-09-30-model-budget.md)，完整规则名册仍需核对 |
| Harness 契约与失败场景审查 | COS-02、COS-06 完成 | 版本化契约与独立评审检查已合入；COS-06 增加持久账本、原子预留、未知费用阻断与截止中止；22 项新增测试通过 |
| 第 3 轮需求访谈 | 已回答，预算随后更新 | 当前验证 ¥150 / 正式单次 ¥200/12h；背景音乐和关键音效；最终由用户试玩确认 |
| 参考依据确认 | 已提供安装路径 | `C:\Program Files (x86)\PlantsVsZombies`，只读核对版本与资料，COS-01 正在记录 |
| 记录领域术语 | 持续更新 | [CONTEXT.md](CONTEXT.md) 已记录 Cosmos 与目标游戏 |
| 比较方案并记录关键决策 | 待前置决策 | 真正涉及重要取舍时再创建 ADR |
| 编写、审查并确认 spec | v1.0 发布基线 | 结构审查通过，用户已确认 ¥200/12h 硬上限和 ¥100/6h 优化目标 |
| 真实成本与时延探针 | native C8 有界单关自动通过，v2 已接受 | 76 请求新增保守峰值估算 ¥1.549592，共享 ¥7.008623，unknown/reserved0；一次自动repair后Edge111/111与独立codingreview通过，八案例已消费，六closures/40grants仅归还未用容量 |
| 任务拆分 | 已发布 | [43 项任务卡](docs/specs/cosmos-issues.md)，含依赖、产物、验收和上下文包；COS-20 承接原 R6/R7，COS-21 承接原 R5/R11 的发布失败，COS-22 承接更高调用上限实验，COS-23/COS-24 承接作者格式纠正与未用分配额度归还，COS-25 登记纠正后的完整原生验证，COS-26/COS-27 承接有效容量修复与独立 case5，COS-28/COS-29 承接职责澄清与 case6，COS-30/COS-31 承接主机证据/独立评审未决项处理与独立 case7，COS-32/COS-33 承接浏览器失败分类/有界修复与独立 case8，COS-34 承接最终用户体验决定的持久化与版本绑定，COS-35/COS-36 准备共享浏览器host与运行时推箱子设计/可信鼠标计划，COS-37 准备隔离profile/同origin的真实进程重开，COS-38 连接运行时设计与固定角色输入，COS-39 记录持久浏览器失败事实并保守分类，COS-40 接通持久浏览器与生成媒体consumer，COS-41 准备原design会话的有界语义反馈，COS-42 准备原COS16预算组绑定，COS-43 准备固定迁移native入口/准入 |
| 发布 spec 主 issue 和子任务 | 已完成 | [主 issue #1](https://github.com/lrfluobida/Cosmos/issues/1) + #2–#44；43 项原生父子关系由协调者发布并精确读回；[编号映射](docs/specs/github-issues.json) |
| 子代理逐项实施 | COS30..42 source 审批保持，COS43实施中/SOURCE_NOT_READY，实际 C8 有界单关通过 | COS10切片主要目标与COS11一次真实修复形成实证；C7失败、C6免费111诊断保持，COS34源码已审集成但实际human NONE；G3其余长时/恢复条件仍待核对，完整classic/G4和用户体验未通过 |

## 开发批次

用户要求：每个任务分别设置 implementer 和 reviewer，由同批唯一 merger 合入 main；持续推进已授权工作。

第三批 COS-09 已完成固定版本产物的校验、暂存与提升，COS-07 已完成明确需求确认、模型任务计划与受限角色执行，两项均经独立复审、集成验证后推送。计划与产物都必须经过宿主验证，模型回复本身不代表通过；真实游戏生成由 COS-10 验证。

第二批追加 COS-04 通用美术与音频验证，与 provider 和浏览器的审核修复并行；同批仍由 batch02_merger 唯一合并。

| 批次 | 任务 | Implementer | Reviewer | Merger | 状态 |
| --- | --- | --- | --- | --- | --- |
| 01 | COS-01 / #2 | cos01_implementer | cos01_reviewer | batch01_merger | 791472e 经修复复审批准部分交付，合并 8b64b59；参考测试 16/16，230 项中 221 项待核对；#2 保持 open |
| 01 | COS-02 / #3 | cos02_implementer | cos02_reviewer | batch01_merger | 45c3cf6 修复两项 P2 后复审批准，合并 a6247ec；40 项契约测试、构建与类型检查通过；#3 已关闭 |
| 01 | COS-05 / #6 | cos05_implementer | cos05_reviewer | batch01_merger | 1121ae2 已独立批准，合并 5e3670e；构建、类型检查、CLI 7/7 通过，复用浏览器 1/1；#6 已关闭 |
| 02 | COS-03 / #4 | cos03_implementer | cos03_reviewer | batch02_merger | 79969d3 批准并合入 7a05b11；真实 pi 6 次请求/3 项检查通过；已推送，#4 已关闭 |
| 02 | COS-06 / #7 | cos06_implementer | cos06_reviewer | batch02_merger | 1bed423 批准并合入 f724d5f；22 项运行/预算测试及共享真实账本验证通过；已推送，#7 已关闭 |
| 02 | COS-08 / #9 | cos08_implementer | cos08_reviewer | batch02_merger | fa6a0ae 修复同步进程清理并复审批准，合并 331bdd4；最终卡死点击 2879 ms、观测 2737 ms，128/128 组合测试通过；#9 已关闭 |
| 02 | COS-04 / #5 | cos04_implementer | cos04_reviewer | batch02_merger | a7a337b 批准并合入 d89639b；7 项测试、14 帧/3 状态/5 WAV 解码和首 BGM 静音播放通过；外部费用 ¥0；#5 已关闭 |
| 03 | COS-09 / #10 | cos09_implementer | cos09_reviewer | batch03_merger | 94c52cf 修复评审与验证尝试绑定后获批，合并 5e00bdc；10/10 产物测试、类型检查与构建通过；已推送，#10 已关闭 |
| 03 | COS-07 / #8 | cos07_implementer | cos07_reviewer | batch03_merger | 3f0489d 修复三项发现后复审批准，合并 f779c4f；最终 177/177、构建与类型检查通过；已推送，#8 已关闭 |
| 04 | COS-10 / #11 | cos10_implementer | cos10_reviewer | batch04_merger | 驱动 e28df14 合并 29a9c69，续跑入口 f65ecc9 合并 a195173；分别通过 194/194 与受影响 63/63 检查；首轮及一次续跑失败，#11 保持 open |
| 05 | COS-11 / #12 | cos11_implementer | 独立 reviewer 最终 READY | batch05_merger | 005f51b 修复三项 P2 后获批，合并 e1467f0；170/170、构建与类型检查通过；offline-verified-awaiting-live，#12 保持 open |
| 05 | COS-12 / #13 | cos12_implementer | 独立 reviewer PHASE_B_READY | batch05_merger | Phase A 合并 7cff537；Phase B 128f4d1 修复 P1/P2 后获批，合并 1dc6b00；186/186、构建与类型检查通过，故障验收完成，#13 已关闭 |
| 06 | COS-10/11 固定新 trial | feat/cos-10-e2e 独立 implementer | 独立 reviewer READY_FOR_FIXED_TRIAL_INTEGRATION / startup READY | batch06_merger | 4fb66fa 合入 17b41e4，103/103；启动恢复 841b86c 合入 7c130e7，1/1；真实 trial 启动失败且恢复过期拒绝，零请求/新增费用，#11 保持 open |
| 06 | COS-13 / #14 | feat/cos-13-scheduler 独立 implementer | 独立 reviewer 最终 READY | batch06_merger | cf7d5f6 修复取消恢复 P2 后获批，合入 d3aab99；219 项中 218 首轮通过、Edge 单项重跑 1/1；严格类型检查/构建通过，offline-verified-awaiting-live，#14 保持 open |
| 07 | COS-18 / #19 | 独立 A/B implementer | cos18_reviewer / cos18_d2_reviewer | batch07_merger | B2 与 smoke 已过；idle 2c32091、control ab67c1d、C 92a7e6e 分别批准后，组合 73ec63a 获 COMBINED_SOURCE_READY；主线 8/8、严格构建通过；首个正式追加窗口已离线接通，#19 仍 partial/open |
| 07 | COS-01 / #2 资源元数据补充 | feat/cos-01-resource-evidence 独立 implementer | cos01_reviewer | batch07_merger | b8790a8 获 READY，合入 2aa62fa；参考 CLI 校验通过，复用 16/16；230 项中 221 项待核对，基准仍未冻结 |
| 07 | COS-14 / #15 验收工具草稿 | feat/cos-14-acceptance-draft 独立 implementer | cos14_reviewer | batch07_merger | 1c3e189 修复计时边界 P2 后获 READY，合入 522ae51；10/10、参考 CLI 通过；恒为 draft/blocked，#15 保持 open/preparatory，G4 仍关闭 |
| 07 | COS-16 / #17 迁移用例文档 | feat/cos-16-transfer-case 独立 implementer | cos16_reviewer | batch07_merger | bb00583 获 READY，合入 6cc42f6；单文档源一致、UTF-8/LF 与中文复读通过；preparation-only/open，尚未生成或验收游戏 |
| 07 | COS-10 / #11 已审实验 | feat/cos-10-reviewed-experiment 独立 implementer | cos10_reviewer | batch07_merger | ecfc150 合入 75cf405，5/5 准入与类型检查通过；f16c896 上真实实验 92.746 秒/8 请求后失败，新增估算 ¥0.224120；唯一机会已消费，#11 保持 open |
| 07 | COS-08 / #9 文本可见性修复 | fix/acceptance-visible-text 独立 implementer | cos08_reviewer | batch07_merger | cca4f10 获 READY，合入 1704d37；源一致、组合类型检查通过，复用真实 Edge 4/4；保留已完成任务状态，不代表完整视觉验收 |
| 07 | COS-19 / #20 角色交接与截断处理 | role_io_implementer / fix/native-role-io | role_io_reviewer | batch07_merger | 6397e15 修复同行多 JSON scalar 的 P2 后获 READY，合入 d0c39ad；69/69、类型检查与构建通过；offline-verified-awaiting-live，#20 暂保持 open |
| 07 | COS-20 / #21 开发验证窗口 | 专属 core/driver implementer | 各自独立 reviewer | batch07_merger | native 732f3d1 获 NATIVE_DRIVER_SOURCE_READY，合入 92e183a；主线 2/2、0 skip 与严格构建通过，probe 类型/通用 smoke 复用；offline-source-ready-awaiting-real-case，#21 open |
| 07 | COS-01 / #2 静态基础值证据 | codex/cos-01-static-plants implementer | cos18_reviewer | batch07_merger | fdd64c8 获 STATIC_SOURCE_READY，合入 80d4d75；三路径完全一致，JSON 53×9 结构检查通过；复用采集与独立样本证据，基准仍未冻结 |
| 07 | COS-01 / #2 Zombie 静态证据 | codex/cos-01-static-zombies implementer | cos01_zombies_reviewer | batch07_merger | e292b49 获 ZOMBIE_STATIC_SOURCE_READY，合入 73cf4fe；三路径一致，JSON 34×7/ID/偏移检查通过；复用采集及独立样本，230/221 与未冻结状态不变 |
| 07 | COS-01 / #2 初始 HP 静态证据 | static-health implementer | cos01_health_reviewer | batch07_merger | a1c1371 获 HEALTH_STATIC_SOURCE_READY，合入 80794c3；三路径一致，保存 JSON 17 样本/3 立即数结构通过；复用只读采集与独立指令样本，未冻结 |
| 08 | COS-01 / #2 投射物静态证据 | codex/cos-01-static-projectiles implementer | cos01_projectiles_reviewer | batch08_merger | 3a20bae 获 PROJECTILE_STATIC_SOURCE_READY，合入 89f8162；三路径一致，保存 JSON 14×3 与 11 短样本检查通过；复用作者及 reviewer 证据，230/221 未冻结 |
| 08 | COS-21 / #22 Windows 原子发布修复 | cos21_implementer | cos21_reviewer | batch08_merger | 1d03122 获 WINDOWS_PUBLICATION_SOURCE_READY，合入 99e6d87；三路径一致，主线延迟/不可覆盖 2/2、0 skip 与类型检查通过；offline-verified-awaiting-live/open |
| 08 | COS-20 / #21 Case2 声明与准入 | codex/validation-case-two implementer | 独立 case2 reviewer | batch08_merger | b3ab706 获 CASE_TWO_SOURCE_READY，合入 89085f3；八路径一致，主线零调用新 claim/历史保持与 case1 未停止拒绝 2/2、0 skip；source-ready-newcase2-awaiting-paid/open |
| 08 | COS-22 / #23 Case3 版本化声明与准入 | codex/validation-case-three implementer | cos22_reviewer | batch08_merger | 27c81b3 获 VERSIONED_CASE_THREE_SOURCE_READY，合入 474a6a9；十路径一致，主线版本边界/只读 quote 历史保持 2/2、0 skip 与源码类型检查通过；offline-verified-awaiting-live/open |
| 08 | COS-23 / #24 一次作者格式纠正 | codex/author-handoff-correction implementer | cos23_reviewer | batch08_merger | d334c82 获 AUTHOR_PROTOCOL_SOURCE_READY，合入 d49d132；13 路径一致，联合 strict noEmit 和组合恢复代表通过；offline-verified-awaiting-live/open |
| 08 | COS-24 / #25 未用分配容量归还 | codex/validation-allocation-closure implementer | cos24_reviewer | batch08_merger | 最终 ee4ef28 获 VALIDATION_ALLOCATION_CLOSURE_SOURCE_READY，合入 98aa9cc；18 路径一致，联合 strict noEmit 和 v3 新 case/隔离代表通过；offline-verified-awaiting-live/open |
| 08 | COS-25 / #26 Case4 独立入口 | codex/validation-case-four implementer | 独立 case4 source reviewer | batch08_merger | be02266 获 CASE_FOUR_SOURCE_READY，合入 b3901ca；八路径一致，新入口只读历史/漂移拒绝 2/2、0 skip；offline-verified-awaiting-live/open |
| 08 | COS-25 / #26 COS22 源级失败态准入修复 | 原 codex/validation-case-four implementer | 原独立 case4 reviewer | batch08_merger | bc97d7d 增量获 CASE_FOUR_SOURCE_READY，合入 4039844；四路径一致，复用 public shape RED→2 GREEN 与独立 2/2；源码时点免费 preflight READY，仍待最终 main 新 quote |
| 08 | COS-26 / #27 有效分配容量核算 | codex/planning-effective-capacity implementer | 独立 COS26 reviewer | batch08_merger | 6f6960b 获 PLANNING_EFFECTIVE_CAPACITY_SOURCE_READY，合入 4098683；五路径一致，联合 strict noEmit 与 v3 planner 代表通过；offline-verified-awaiting-live/open |
| 08 | COS-27 / #28 Case5 独立入口 | codex/validation-case-five implementer | 独立 COS27 reviewer | batch08_merger | 8348495 获 CASE_FIVE_SOURCE_READY，合入 0efc5ec；七逻辑/八物理路径（含重命名）一致，联合 strict noEmit 与 compatibility/history 代表通过；offline-verified-awaiting-live/open |

文件归属、测试步骤与合并关口见 [第一批执行计划](docs/plans/2026-10-01-batch-01.md)。

审核提交、合并提交、验证范围与待同步事项见 [第一批集成记录](docs/reviews/batch-01.md)。

后续文件归属与验收步骤见 [第二批执行计划](docs/plans/2026-10-01-batch-02.md)，审核和同步状态见 [第二批集成记录](docs/reviews/batch-02.md)。

[第三批执行计划](docs/plans/2026-10-01-batch-03.md) 覆盖 COS-07 角色执行、明确需求确认与 COS-09 产物集成；审核与合并证据见 [第三批集成记录](docs/reviews/batch-03.md)。复用本批验证结果，真实端到端生成由 COS-10 验证。

[第四批执行计划](docs/plans/2026-10-01-batch-04.md) 的集成与两次失败事实见 [第四批集成记录](docs/reviews/batch-04.md) 和 [#11 续跑结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5928251714)。八项玩法验收、附加检查和独立启动尚未执行；保留失败产物，COS-11 基于实际协议失败提前实施有界纠错，现有 pilot 不再续跑。[COS-18 / #19](https://github.com/lrfluobida/Cosmos/issues/19) 的任务卡已独立审查并发布，作为 COS-15/16/17 的前置；COS-16 仍依赖 COS-10/13/18。

[第五批执行计划](docs/plans/2026-10-01-batch-05.md) 从 `0d7fd04` 接管 main；COS-11 与 COS-12 两阶段已按获批准确提交集成，记录见 [第五批集成记录](docs/reviews/batch-05.md)、[#12 状态](https://github.com/lrfluobida/Cosmos/issues/12#issuecomment-5928992000) 和 [#13 恢复验收](https://github.com/lrfluobida/Cosmos/issues/13#issuecomment-5929980089)。每项任务保留独立 implementer/reviewer，本批仅由 batch05_merger 合入。COS-13 可从新 main 的恢复 API 开工；COS-18 仍等待 COS-10/11/13。恢复证据使用实际本地进程/文件、模拟供应商和模拟截止时间，无法核实的阶段明确阻断；真实游戏修复仍待验证，G3 仍关闭。共享费用仍为 ¥0.892282，付费验证仍仅由协调者执行。

[第六批执行计划](docs/plans/2026-10-01-batch-06.md) 已完成固定 trial、一次零请求启动恢复及 COS-13 平台代码集成，记录见 [第六批集成记录](docs/reviews/batch-06.md)。固定 trial 启动失败，恢复命令在原截止后被拒绝；不重开试验、不改 clock，不改变旧 pilot 的两次失败及已用 continuation。费用仍为 ¥0.892282，未知/预留为零。[#11 结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5931925580) 与 [#14 离线集成](https://github.com/lrfluobida/Cosmos/issues/14#issuecomment-5931926489) 已同步并保持 open。COS-13 原生 SDK 压缩使用模拟 HTTP，12h 边界使用模拟时钟；真实长链路由 root 后续有界执行，G3 仍关闭。

[第七批执行计划](docs/plans/2026-10-01-batch-07.md) 从 `0a10f42` 接管 main，已集成独立批准的 COS-18 A/B 与 COS-01 资源元数据补充；证据见 [第七批集成记录](docs/reviews/batch-07.md)。同一 runId、snapshot 与账本衔接确认前访谈和确认后生成计时。资源条目计数不替代单位名册，配置语言不代表可见语言，两轮截图失败仍无玩法证据；#2/#19 保持 open。未重开旧试验、变更共享费用或 G3 状态。

第七批追加：COS-14 Phase A 验收工具草稿已合入 `522ae51`，保留完整输入清单、固定版本绑定、正常输入与机制引用分列及纯数值比较；10/10 草稿测试和参考 CLI 通过。草稿不认证证据或执行游戏，步长/等价性见证、模式 runner 与执行 adapter 仍待实现，[#15 状态已同步](https://github.com/lrfluobida/Cosmos/issues/15#issuecomment-5934444118)，保持 open/preparatory，G4 关闭。此前 [#19 Phase A](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-5933952295) 与 [#2 资源补充](https://github.com/lrfluobida/Cosmos/issues/2#issuecomment-5933953194) 已同步并读回为 open。

COS-16 [网格推箱子用例](probes/transfer/README.md) 已独立批准并合入 `6cc42f6`，固定 T16-01 至 T16-06 正常输入验收；地图与解法由 runtime design 产生，host 独立校验后冻结，真实浏览器关闭/重开及可信 plan 绑定接口仍待补齐。[#17 已同步](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-5934548679)并保持 preparation-only/open，原账本、额度、截止与停止状态不变；本次仅文档准备，未生成游戏或启动付费试验。

2026-10-02，COS-18 B 接通公开 `new/status/stop/resume`、真实 stdin 修订确认、独立运行时角色及固定产物的构建、正常输入、媒体观测、截图和评审；保留原账本、80% 提示、受限纠错与修复历史。46/46 聚焦检查与编译串行通过。复用 production-host 的真实 tsc/Vite→Edge 点击→report→registry smoke，模型/API 请求为零，报告明确 `generatedByCosmos: false` 和 test-only 媒体观测，不能当作游戏生成通过。通用 host 单批限 1–16 角色、0–16 PCM；下游修复续接、硬停止后用户追加额度/时间与完整经典适配缺口仍在，#19 保持 open。旧试验、共享费用和 G3/G4 状态不变。

`cos10-reviewed-validation-1` 以 PREP_ONLY 合入 `75cf405`，随后由协调者在固定 `f16c896` 上执行一次并失败。原增量 ¥5、累计 ¥30、同一 ¥150 账本和 `2026-10-01T18:16:16.857Z` 截止，以及 45 分钟、40 请求、一次修复边界均保留。5/5 准入检查及作者 37/37 仍是平台证据；其中 headless Edge contact-sheet 不代表游戏通过。本次 design/art 各失败一次、capture 产物/证据均为空，coding 未开始；无独立评审、语义修复或正常输入验收。实验已消费，无恢复或重开；main 冻结已由协调者解除。

同步合入 `1704d37` 修复隐藏 DOM 胜利文本可误通过的问题：文本 locator 先按 Playwright 标准可见性过滤，再在原 timeout 内读取；runner 剩余时间限制不变。独立评审通过，真实 Edge 4/4 与组合类型检查继续复用；完整视觉验收仍需其他证据。[#9 修复记录](https://github.com/lrfluobida/Cosmos/issues/9#issuecomment-5936979760) 保持 closed；[#11 实验失败](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5936978319) 和 [#19 B 与缺口](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-5936979272) 保持 open，没有新增游戏或 live gate 通过。

COS-19 按已发布 #20 正文补齐唯一明确模型 JSON 的解码、严格 schema、安全截断诊断，以及生产 art/coding 作者 65,536 token 与同配置预留；其余默认 8,192 与旧 probe 显式 16,384、原费用和截止不变。typed incomplete 保留已用费用与 `insufficient_evidence`，以 `provider_output_truncated` 明确原因，不自动重试或执行截断内容。最终 `6397e15` 经复审合入 `d0c39ad`，48 项 decoder/cap 与 21 项调用方/截断检查全部通过，类型检查和构建串行通过并刷新 dist。#20 先记录为 offline-verified-awaiting-live/open，关闭由协调者按任务卡判断；代码修复不表示新游戏通过。COS-18 C 后续已获组合批准并集成，见下条；没有新增付费或已消费实验执行，账本与失败产物不变。

COS-18 C 与 COS-19 的精确组合 `b886b2f` 已独立批准并合入 `a3845a3`。一次语义修复可为合法未启动下游建立明确的 v2 继任任务，原任务、分配、费用与时间保留；诊断原文和 manifest 固定签名在恢复时核验，组原子登记/恢复，交付使用有效 DAG，status 只读展示 supersededBy，旧 B 单修复计划兼容。最终有效 DAG 全部通过才交付，继任失败不获得第二次修复。四项纯 fake 组检查、类型检查与构建通过，其余 39/72 及原 11+19 证据复用；无浏览器或 API。#19 保持 partial-offline-verified/open，完整经典适配与真实生成仍未完成；R15 代码开发已授权，按下列 D 阶段独立实施和审查。

COS-18 D1 只读续跑报价已独立批准并合入 `991f7f3`：公开 `continue --quote --add-cny --add-minutes` 只为已记录硬停止或原截止已过的正式 v1 generation 生成精确 proposal；单次拟追加 ¥0–200、1–720 分钟，原硬上限和成绩不改。命令不写文件、不持锁、不调用模型、不激活窗口；validation/intake/unknown/reserved 均拒绝，到期但未记录停止明确列为待核实。三项代表检查覆盖 public 只读、循环映射拒绝和真实 Node CLI 的 snapshot/owner 标记字节、mtime、目录不变，3/3、0 skip，构建通过；作者 41/41 复用。D2 底层集成见下文，公开 CLI 仍只有报价；纯代码授权不等于真实续跑的费用/时间授权，#19 仍 partial/open。[#19 D1 进度](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-5939261633)、[#19 组合进度](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-5938538831) 与 [#20 角色交接修复](https://github.com/lrfluobida/Cosmos/issues/20#issuecomment-5938539844) 已同步并读回为 open。

COS-18 D2 `41ea1c5` 经独立复审合入 `7525e63`，首次 formal v1→v2 snapshot/ledger2 在原子提交中记录完整 quote 的真实 caller 确认、旧 grant 关闭、新 grant 与窗口；身份、原截止/上限、已有停止事实和费用历史保留，同决定幂等，旧 signal 不复活，新实例必须显式指定窗口。原 overrun、第二个 v2 决定、validation/intake、unknown/reserved 与未收敛 owner 均拒绝，`artifactReuse` 明确待 D3 校验。四个 legacy DAG 入口在任何读写或调度前同步拒绝 v2，schema 按 `$id` 解析到真实 v1 绝对 URI。七项代表检查、0 skip、构建通过；98/70 原证据复用，D1 五个文件与批准源完全一致。D3 的公开激活、窗口执行/调度、继任和交付正在独立实施，尚未验收或合入；#19 保持 partial/open，不声明完整 R15 或真实生成通过。

原共享验证截止 `2026-10-01T18:16:16.857Z` 已过，协调者确认之后没有 API 调用；费用估算仍为 ¥1.116402，未知/预留为零。原时钟与已消费 experiment 不重置、不重开；后续仅进行平台代码开发。

D3a `696a0eb` 和 D3b1 `bc044d0` 已分别独立批准并合入 `9b49ea9` / `cfd1855`。窗口只能经完整 DAG resume，全部报价目标、固定依赖和旧通过祖先证据先核验；固定输入镜像先检查所有目标父路径/叶节点，保持中文与二进制字节，复制本身不构成产物认证。六项代表检查、0 skip、构建通过。两位专属作者继续 D3b2 host 和 D3c public 接线，准备钩子由 orchestrator 作者独占、host 由另一作者独占，编译/进程检查串行安排；未审实现不进 main。真实窗口、费用和旧失败事实不改。

preAuthor `9134e59` 与 D3b2 host `38da6e0` 已分别独立批准，合入 `cb16fa4` / `9b9e350`。准备发生在固定证据核验后、attempt 前；新作者区、准确产物引用和真实 task/window 子进程权限接通，原 authors 不变，当前窗停止阻止提升，WeakMap proof 不能从 JSON 伪造。主线四项代表检查和构建通过。实机 smoke 首次因主工作区未装模板 TypeScript 依赖在构建阶段失败，证据保留；离线安装既有 lockfile 后，同一源码复验 1/1，Edge 十步骤、普通点击计数 1、报告与提升通过，浏览器退出和 owner 释放已核实。报告明确 `generatedByCosmos:false`、模型请求 0、合成账本 entries 0、通用模板/test-only 媒体及离线 verdict；不作为游戏生成通过。后续 D3c 的组合结果见下条，未重复此实机 smoke。

D3c 首次 formal 追加窗口已完成免费代码实现、独立审查和主线集成：idle core `2c32091` 合入 `3dabb9b`，控制最终修订 `ab67c1d` 合入 `293bd95`，公开流程 `92a7e6e` 合入 `73ec63a`。两个 P2 均经原作者回归修复和复审：同窗口假 ACK 需重读持久停止事实；准备失败不得报告未登记继任关系。最终组合19个路径均与批准源一致、三次remerge diff为空，独立获 COMBINED_SOURCE_READY；主线8/8、0 skip和严格构建通过。作者75项、core17项及控制证据复用；控制阶段实际22项中曾因筛选误包含而重复5项旧进程测试，均已退出且本轮未再跑。

公开 `continue` 先免费前置检查并展示准确 quote，只有真实 stdin 的 `confirm <quoteId>` 才保存完整来源并激活；取消、EOF、陈旧数据或前置失败不激活/付费。固定 plan 使用准确新 task/grant/context/version/workspace，只有可证零既往工作时补齐准备，同一 window resume 不重计时/增费；已过祖先先认证，旧 partial 保留，新失败不领取第二 attempt/语义修复。停止绑定当前window并等待drain；正常无owner路径使用controller锚定且成功close后发布的准确idle证明。status/report只投影已登记继任，预算提示分列effective与original，原¥200/12h结果永久单列not_met。所有验证均为合成账本和明确夹具，没有开启真实续跑或改变真实费用。

剩余边界：正式续跑仅首个窗口，多不同 decision、最终用户试玩持久阶段、完整经典适配及真实生成仍未完成。G3/G4 仍关闭，共享原窗已过期、已消费实验仍失败，估算 ¥1.116402 且未知/预留为零。开发验证新 case 按下述 COS-20 的原预算授权与明确 operator_validation 决定准备，不套用 formal human quote；参考 UTF-16 只读例外仍待用户明确允许，reference 仍为 230 项/221 待核实、未冻结。

[COS-20 / #21](https://github.com/lrfluobida/Cosmos/issues/21) 已发布为第 20 个原生子任务，区分正式生成 ¥200/12h 与平台开发验证合计 ¥150。用户原验证预算、凭据提供及持续推进授权支持可信 coordinator 在原额度内选择更严格的新开发 case：最多新增实际加预留 ¥5、45 分钟、40 调用、一次语义修复，首批累计 ¥30 不变。必须先完成 profile/driver 源码独立审查、集成和实际准入，之后才由 root 执行；本次文档登记没有运行新 case。

新路径沿用同一权威 snapshot/run/ledger，追加真实操作来源、准确已审 SHA、新 case/window 与固定 COS-10 输入 hash；原日期、stop、费用、requests、allocations 和失败 case 保留，不伪造用户 GameDraft/humanDecisions，不用假时钟或改名重开旧 case。首例仅用原未分配额安排 grants；协调者已只读确认 65,403,960 micro-CNY，本次未读取真实账本。COS-06/07/08/09/11/12/13/18/19 的已审已集成源码是前置，COS-10 实际验证是产出，避免循环依赖。CONTEXT/ADR 留给后续作者独立审查，本 checkpoint 只更新任务卡、映射与进度。

COS-20 V2a `6754bd3` 已独立批准并合入 `f3217df`，六个路径包含作者已审的 CONTEXT/ADR0001、说明、固定声明/input 模块与测试。主线三项纯解析/文件检查通过、0 skip；相同 Node/TypeScript、依赖与固定输入下复用作者 9/9 及显式 strict probe/test noEmit 证据，未运行不覆盖 probes 的根构建。声明固定 `cos20-native-validation-1`，候选 grants 共 ¥21（planning ¥2），实际加预留仍最多 ¥5；固定 COS-10 v2 和八个模板文件，拒绝额外/漂移输入，不生成确认、窗口或费用。仅声明/input 离线就绪，profile V1 未获本批批准，driver 尚未接通；#21 保持 open，没有 claim 或执行新 case，真实费用和旧日期/失败记录均不变。

后续 COS-01 静态证据 `fdd64c8` 合入 `80d4d75`，保存 53 行 × 9 DWORD 原始观测并单列字段语义推导。主线仅检查 JSON 结构及准确来源，复用作者完整采集、318 字段对照和 reviewer 样本检查，没有重读 EXE 或重跑 collector。53 不代表可选植物分母，launchRate 不是秒值；reference/catalog 未改，仍为 230 项、221 待核实、未冻结，未获得玩法验收。

COS-20 V2b `26fcfae` 获独立 `V2B_SOURCE_READY` 并合入 `26da1a2`。reader 两轮读取真实 main/HEAD/status、隐藏 index 标志及固定输入；主线 clean 无写、skip-worktree 隐藏改动拒绝两项检查通过（2/2、0 skip）。复用作者原 10 项、修复两反例及显式 strict 类型证据；仅身份读取离线就绪，profile/执行 driver 未接、新 case 未 claim/执行。共享真实估算仍 ¥1.116402、reserved/unknown 为零，原过期窗口、旧失败、G3/G4 状态不变。Root 已同步读回 [COS-18 状态](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-5948068412) 与 [COS-20 V2a 状态](https://github.com/lrfluobida/Cosmos/issues/21#issuecomment-5948069088)。

COS-20 V1 `d46294d` 获独立 `V1_SOURCE_READY` 后合入 `43f3ba5`，12 个批准路径一致。主线 3 个新 profile 与 v1/v2 各 1 项代表检查共 5/5、0 skip，严格构建通过；复用作者 27 项、两项有界崩溃、7 项旧入口及显式测试类型证据。profile 3 沿原 ledger 1.0.0/¥150 记账，保留原历史/时钟/grants；case 限额 ¥5/45 分钟/40 请求/一次修复，过期 accountingOnly 只对账，unknown 阻断新准入。真实 identity reader 与执行 driver 尚未接线，反馈实际文件/provenance 和旧 artifactRoot 收敛仍由 V2 验证，不把固定引用或 ledgerRoot registry 检查当完整证明。#21 仍 open，未 claim/运行新 case；共享估算 ¥1.116402、零预留/未知、旧失败及 G3/G4 不变。Root 已同步读回 [COS-01 静态证据](https://github.com/lrfluobida/Cosmos/issues/2#issuecomment-5948580887) 与 [COS-20 identity 结果](https://github.com/lrfluobida/Cosmos/issues/21#issuecomment-5948581401)。

V1 checkpoint `afbbd15` 已干净推送。随后 COS-20 V2c 仅数据层 `30bd06c` 获独立 `V2C_DATA_SOURCE_READY` 并合入 `a6aa1ac`，四路径一致；主线纯数据代表 2/2、0 skip，复用作者 9 项及显式 module/test strict 类型证据。新模块保持完整 acceptance 和 operator 来源，深冻结副本；旧 human schema 未改，不制造 confirmed*、GameDraft、预算或时钟。形状合法不证明真实固定范围、来源文件或权限；已有 core/reader 仍未接 native factory/planner/orchestrator/driver，#21 保持 open，无新 case 或费用，历史与 G3/G4 不变。

COS-01 Zombie 静态证据 `e292b49` 获独立批准并合入 `73cf4fe`：保存当前指纹绑定 EXE 的 34×7 原始 DWORD，五列 170 项源码对照作为既有推导证据单列，动画枚举未对照、名称指针未解码。主线仅检查保存 JSON/准确源码/UTF-8，复用作者只读采集及 reviewer 样本，没有重采 EXE。34 含特殊项/Zombatar，不作为经典完整分母；mZombieValue 不是 HP，startingLevel/firstwave/pickweight 不代表实际波次，HP/伤害/速度/交互/经典等价性仍未知。catalog 230 项、221 待核实及未冻结状态不变，无新游戏或付费运行。Root 已同步读回 [COS-20 core/data 状态](https://github.com/lrfluobida/Cosmos/issues/21#issuecomment-5949151327)；共享估算仍 ¥1.116402、零未知/预留，旧失败保留。

COS-20 routing `aa413a5` 独立获批并合入 `21256ae`，13 路径一致；主线 3 新+1 旧代表 4/4、0 skip 及严格构建通过。原生角色、planner、原串行 DAG/journal 绑定真实 validation case，完整 AC/operator 来源在副作用前校验；SDK 实际输出 cap/input 与评审纠错、compaction 请求统一计费计数。admit 拒绝且未派发时须持久 not_sent 回执才能释放预留，回执失败保留 exposure。公开 fixed driver、owned host 和 coding-only 一次语义修复尚未完成；planning owned-child core 缺口修复未审，本批未合，不宣称真实启动或游戏通过。

COS-01 health `a1c1371` 独立获批并合入 `80794c3`，保存 17 处短指令样本及 270/370/1100 初始化赋值，源码推导单列。主线仅检查保存 JSON 与准确来源，复用作者只读采集及 reviewer 少量反汇编样本，不重读 EXE、整段函数或既有研究。最终有效 HP、分支覆盖与经典等价性仍未知；catalog 230/221、accepted/未冻结状态不变。[Zombie 证据评论](https://github.com/lrfluobida/Cosmos/issues/2#issuecomment-5949484132) 已由 root 同步读回。#21 仍 open、G3/G4 仍关闭，未 claim 新 case；共享估算 ¥1.116402、零预留/未知及旧失败保持不变。

Planning child `3704bdd` 获独立 `PLANNING_CHILD_SOURCE_READY` 并合入 `c73431c`，三路径一致；仅按当前声明的 taskId 选择 planning purpose，其他角色仍走 author 检查。主线 ticket/错任务/错窗口 pureFS 代表 1/1、0 skip，类型检查通过；复用作者 3 项 FS、1 个有界真实 Node child 和独立两项检查证据，没有重复 child/build。此修复只补齐 planning bootstrap 权限，不代表实际 fixed driver/owned host 通过；未审 shared helper 未合、未 claim 新 case，费用 ¥1.116402 与旧历史不变。

随后 shared helper/validation repair `8ac0467` 获独立 `SHARED_HOST_REPAIR_SOURCE_READY` 并合入 `032b7e4`，八路径一致；与 planning core 修复组合后的 repair/formal host 代表 2/2、0 skip，严格构建通过并刷新 dist。正式 host 抽出共用 runOwnedNode，复用原 controller ticket/PID/start gate 和 owner，IPC 断线清理 worker 树；复用作者三项真实 child 退出证据，不重复运行。repair 使用当前 case deadline 与预分配 grant，原失败回执 wx 保存成功后才记录实际固定引用；实际反馈文件内容/版本/来源认证及 fixed driver/validation worker 仍待接通。没有假 passed planning、真实新 case 或费用；#21 open、G3/G4 及历史状态不变，后续 GitHub 评论尚未宣称已发布。

COS-20 entry/scope `37e0418` 经 finish-stop 竞态 P2 修复复审后获独立 READY，合入 `7aacad1`，七路径一致。主线 preflight 只读与 promoted-fixture 并发 stop 两项通过（2/2、0 skip）；复用作者 entry/scope、独立复现及显式 probe/test strict 类型证据，不以根 build 代替 probe 检查。内部可信 host API 先免费准备、重核 exact quote 和真实 operator receipt 后 claim，零请求启动失败也消费案例；scope 读取固定九文件、完整 AC、operator 原字节及 planning input 的 registry provenance。finish 在 await promotion 读取之后及 drain 后复核 stop/deadline/费用，不覆盖外部停止。native fixed host、公开 flags、owned workers、完整反馈文件认证仍未接，不代表真实启动或生成通过。

Root 已同步读回 [HP 静态证据](https://github.com/lrfluobida/Cosmos/issues/2#issuecomment-5950233739) 和 [COS-20 routing/core/helper](https://github.com/lrfluobida/Cosmos/issues/21#issuecomment-5950234444)。#21 保持 open，未 claim/运行真实新 case，共享估算 ¥1.116402、零预留/未知、旧失败和 G3/G4 状态不变。

Entry 时间边界修复 `9a91f75` 获独立 ENTRY_SCOPE_SOURCE_READY 并合入 `58b6e59`：core 分别读取 stop/event 时间，允许前者早于对应唯一新事件，避免正常结束相差毫秒被误判；同步 abort、外部 stop、promotion 和 drain 后费用/截止核验仍保留。主线强制真实 3ms 跨时钟正常 fixture 1/1、0 skip，复用独立竞态及显式 probe 类型证据。Root 在此前已审 `ec9de7a` 完成真实只读 preflight READY：revision 130、baseline 1,116,402 micro-CNY、九个源码前置祖先已审，原 snapshot bytes/mtime 不变，paidRequests 0，未 claim；详见批次记录。该 quote 绑定旧 SHA，不能用于新 main 付费运行；最终 native main 须重新免费核对。native host/公开 flags/worker/完整反馈认证仍待接，#21 open，真实费用与旧历史不变。

COS-20 native driver `732f3d1` 经独立完整 13 路径审查获 READY，合入 `92e183a`，批准源码逐字节一致。主线公开 flags 拒 fixture/root 开关与 dist 漂移拒 repair 两项 2/2、0 skip，严格构建通过并刷新 dist；复用作者 native probes/tests/smoke 显式 strict 类型证据。两个严格 validation flags 只绑定原生 host；免费准备在 claim 前核环境/锁定依赖，claim 后 bootstrap/build/media/play 共用原 owned helper 与八项 AC。真实 UTF-8 feedback、task/attempt/完整输入产物/费用/来源及 write-once failure-snapshot 认证后才可 wx stage、claim 唯一 coding repair，新 workspace/context/v2 保留旧失败/v1；无可信 host code_defect 的 changes_requested 仍报告差距。

复用的完整 fake 路径含 9 个假请求、一次 review 协议纠正和原 coding 失败→fresh repair 通过/真实 registry v2 promotion。单次真实通用 worker smoke 1/1（test 34.08 秒，Node 37.02 秒），all PIDs 退出、owner 释放；generatedByCosmos:false/modelRequests:0，不证明目标游戏通过。#21 为 offline-source-ready-awaiting-real-case，G3/G4 未通过，共享估算仍 ¥1.116402、零未知/预留。Root 报告只读余额检查满足本 case ¥5 覆盖，不记录账户金额。最终 docs HEAD 清推后 main 冻结：root 须按该准确 SHA 重做免费 preflight，再按 ¥150/首批 ¥30/本次 ¥5、45 分钟、40 调用、一次修复边界执行首个真实 case；结束并明确释放前不合参考/doc 或其他源。旧三个失败/已消费案例、原日期及参考 230/221 未冻结状态保留，旧 quote 不复用。

第八批接管：协调者已执行并结束上述首个真实 case，提供以下安全元数据；本批文档作者未读取真实账本、凭据或原 session。snapshot format 3/revision 132，原 run start `2026-10-01T06:16:16.857Z` 与 original deadline `2026-10-01T18:16:16.857Z` 保留；原未写入的 stop 在真实 claim 时按已到 deadline 落盘，没有 backdate。case finish 为 manual stop/consumed，保留自己的结果与 marker；controller/registry 锁释放、Node 无存活，root 已清除临时凭据，故本次 main 冻结解除。

实际 owned bootstrap exit 0，npm ci 安装 18 packages/5 秒，requirements capture 成功。template capture 诊断为 EPERM/syscall rename：`registry/tmp/273fd56b-48f5-40a5-92f7-f82ba0edcc90` → `registry/captures/cos20-native-validation-1-template/v1`，guardAborted:false；未确认杀毒软件、文件 watcher 或永久 ACL 为原因。零 SDK 请求、零新增费用，sharedEstimatedMicroCny 1,116,402，reserved/unknown 均为零。COS-20 源码就绪但实际启动失败，COS-10 与 G3/G4 不通过，case1 不重开或改名复用。

[COS-21 / #22](https://github.com/lrfluobida/Cosmos/issues/22) 已由 root 发布、关联原生父 #1 并精确读回（id 5677200875，childCount 21）。任务承接原 R5/R11 的 Windows 产物原子发布失败，免费实际文件系统诊断、最小修复、独立审查与真实项目 publisher 免费检查由专属作者推进；源级前置 COS-09/COS-20，产出反馈 COS-10/COS-20，不要求失败任务先关闭。新 case2 的独立已审声明与真实 operator 决定尚未就绪，不开始付费执行；原验证 ¥150、首批 ¥30 与新 case ¥5/45 分钟/40 请求/一次 coding repair 边界保持，旧日期、费用与失败保留。

COS-01 投射物静态证据 `3a20bae` 经独立 PROJECTILE_STATIC_SOURCE_READY 合入 `89f8162`，仅三个新增路径。主线保存 JSON 14×3、ID/偏移、11 处短指令、UTF-8/LF 与批准路径逐字节一致检查通过；复用作者采集/未知 build 拒绝/stdout 一致/EXE 未变及 reviewer 短样本，没有重读 EXE、重跑 collector、旧表/HP 研究或根构建。非 UTF-8 cpp byte 4780/BD 已停止读取，字段只由 UTF-8 头文件推导；普通豌豆基础字段 20 不证明最终伤害或正常命中路径，护甲/倍率/交互/运行/经典等价性仍未知。catalog 230/221、accepted、完整分母与未冻结状态保持，#2 partial/open。

COS-21 `1d03122` 经独立 WINDOWS_PUBLICATION_SOURCE_READY 合入 `99e6d87`，仅 `src/artifacts/index.ts`、`tests/artifacts/registry-publication.test.ts`、`docs/development/artifacts.md` 三个批准路径，主线逐字节一致。真实 Windows 无 Delete 共享句柄的两次 RED 重现同类 EPERM/atomic rename，释放句柄后 native GREEN；这证明确定性共享占用模式，原失败具体 locker、杀毒软件、文件 watcher 或 ACL 来源仍未知，不能宣称消除所有 EPERM。

本地原子发布仅对 Windows EPERM 最多六次尝试，等待 25/50/100/200/400 ms 共 775 ms，单调一秒窗口限制重试派发；每次检查 temp/destination 的安全路径、不可变目标不存在、commit owner 原字节未变及原 AbortSignal。延迟 event loop 到限或异步 guard 返回后到限均返回原 EPERM，不再 rename。主线仅重跑新延迟用例与不可覆盖代表共 2/2、0 skip（1153.5 ms/92.7 ms），一次 `npm run typecheck` 通过；复用作者 registry 18、恢复 4、类型/测试 noEmit 与 reviewer 真实锁、边界和短重试证据，未重复完整套件、PS child、smoke 或根构建。

Case2 执行前记录（历史）：COS-21 映射为 offline-verified-awaiting-live/open，保存准确批准与 merge SHA；root 将在最终 main 执行独立于原 snapshot 的真实 E: 工作目录免费 publisher 检查。case2 声明另行实施和独立审查，尚未真实运行，后续 quote 必须包含本次 fixed source 祖先。COS-20 source-ready-real-startup-failed、case1 消费/失败、1,116,402 micro-CNY、原时钟/allocations 与 G3/G4 未通过均保持；本轮没有付费调用或私有账本、凭据、session 读取。

Case2 声明与免费准入 `b3ab706` 经独立 CASE_TWO_SOURCE_READY 合入 `89085f3`，八个批准路径与源逐字节一致。固定新 `cos20-native-validation-2`，不重开已消费 case1；免费 prepare 要求 profile 3、current case1 已明确 stop、COS-21 精确 WINDOWS_PUBLICATION_SOURCE_READY/已集成状态/reviewed 与 merge 双 SHA 都属于准确 main，closed 无法绕过。实际 core 合成/停止 case1 的临时 Git/FS fixture 检查两例通过（2/2、0 skip，13.103 秒）：零调用新 claim 保留旧案例/decisions/费用/requests/grants/原时钟/stop 并幂等；case1 未停止时在 host、receipt、claim 与新写入前拒绝。

作者声明 9、入口 25（23 首轮通过、两费用 fixture 修正后定向 2/2）、11 新门槛先红后绿、scope/quote/flags 代表 3 和显式 probe/tests noEmit 证据复用；独立 reviewer 四项 4/4、0 skip 复用。main 的 package/lock/tsconfig 与批准源一致，未重复 compiler、根构建、完整 fake flow、worker、Browser 或 smoke。runtime core/host/driver、模板、需求、caps、五 grants 总额 ¥21、模型与输出额度均未改；新窗口仍最多实际加预留 ¥5/45 分钟/40 调用/一次 coding repair，共享 ¥150、首批 ¥30 保持。

Case2 执行前记录（历史）：COS-20 当前 source-ready-newcase2-awaiting-paid/open；原真实 case1 的 `efb5170`、开始/截止/结束、7.124 秒、零新增费/请求、manual stop/消费与失败 marker 全部保留，累计仍 ¥1.116402、零 reserved/unknown，原时钟与 allocations 不重置。COS-21 修复源码已 READY，fresh real case2 尚未运行，COS-10 与 G3/G4 未通过。最终文档 main 干净推送后冻结：root 须按最新准确 SHA 做免费只读 preflight，核实际 Windows publisher 与原共享余额准入后，以临时内存凭据执行 native case2；真实 operator 决定由可信协调者记录，不伪造 human GameDraft 确认。case2 结束并由 root 明确解除前，任何 docs/source/reference 均不改 main。

Case2 执行前记录（历史）：Root 已补充实际 E: 工作目录免费 publisher 通过证据：`8aced7c` 的相同 `1d03122` 源码在新 ignored `.cosmos/diagnostics/windows-publication-fixed-8b80f87b-92e6-4964-9b52-4b3d2973b30e/` 使用实际 ArtifactRegistry，先 capture requirements 三文件，再 capture template 四文件。真实 PS/.NET FileShare.ReadWrite 无 Delete 句柄持有 template capture.json，首次真实 rename 返回 EPERM/syscall rename；释放句柄并确认 child exit 0/ESRCH 后，第二次 atomic rename 成功，template capture metadata 存在、registry/tmp 清空。Node 0.833 秒/exit 0/model 0，`diagnostic-result.json` 已保存；原 shared snapshot 的 bytes/mtime 前后相同，未读取 key、未重开 case1、case2 未 claim。本文按协调者提供的安全元数据登记，作者未读取私有账本或重复 free publisher。该证据可复用于当前 case2 准入，原 case1 具体 locker 仍未知，不声明真实 native case2 或游戏已通过；最新 main 的只读 preflight 与后续付费结果仍由 root 执行和记录。

真实 case2 结果由 root 提供安全元数据，本轮文档作者未读取真实 snapshot、session 或凭据。source 为 `f5522e8b6f15862aee39ee9d457c7f6f19ba69de`，开始 `2026-10-02T15:39:49.986Z`、原定截止 `2026-10-02T16:24:49.986Z`、结束 `2026-10-02T15:46:42.301Z`，elapsed 412,315 ms；snapshot format 3/revision 312。session 进程 exit 1，credentialCleared:true，controller/registry 锁均已释放，本轮 main 冻结由 root 解除。40 条实际调用账目全部 settled，新增估算 857,751 micro-CNY，共享累计 1,974,153 micro-CNY，unknown/reserved 均零；这些是保守峰值估算，不是账户实际发票。原 case1 的史、grants、clock、费用和完整结果对象保留，case2 one-shot manual finish/stop、结果与 marker 已消费，不重开或改名复用。

调用和费用分解：planning 1 请求/14,268 micro-CNY；design 8（author 4/reviewer 4）/83,234；art 24（author 16/reviewer 8）/473,575；coding 7（author 7）/286,674。上游合计 33 次，coding 只剩 7 次；第八次 coding 请求在发送前被 request guard 拒绝，最后 assistant 为 admissionRejected。coding 一次 attempt、9 reads/3 writes/1 edit，未 capture、build、check_project、browser 或独立 accepted candidate；semantic repair 0、未 claim。保留 caseFiles `index.html` 和 `src/main.ts` 3,987 bytes、`model.ts` 15,253、`media.ts` 4,573、`level.ts` 4,308 只是当前文件副作用，不是可运行或玩法验收证据，不手工修改游戏补足失败。

本次失败为 request-limit-exhausted：40 次是协调者早期选择的有界准入，不是用户金额或 45 分钟硬上限；费用 ¥0.857751 < ¥5，耗时 6 分 52.315 秒 < 45 分钟。design/art 的真实 host 与独立 review passed，coding 未能在剩余调用内走到 handoff/build。COS-10/COS-20 仍 open/failed，G3/G4 与父 #1 完整目标未通过。Windows publication 的 startup、requirements/template capture 及后续 design/art captures 在实际 case2 全部正常；结合已审最小修复、真实 E: held-handle publisher 和既有边界证据，COS-21 component complete/source-and-live-publication-verified。映射 integrationStatus 使用已获准入支持的 `complete`，reviewStatus 保持准确 WINDOWS_PUBLICATION_SOURCE_READY；原 case1 的具体锁进程仍未知，root 已同步并精确读回 #22 completed/closed。

COS-22 登记时记录（历史）：后续仅准备新独立 case3 的 version 2 声明和请求上限 80 的源级校验，仍沿 ¥5/45 分钟、共享 ¥150/首批 ¥30 与一次 coding repair；尚无已审新源码或新 paid run。旧 case1/case2 的 40 次 quote、已消费结果及费用不修改，不自动恢复；下一任务范围由 root 另行登记，未审源码不写成 READY，未来付费前再次冻结准确 main。

Root 已同步并精确读回 [COS-10 case2 结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5965622790)、[COS-20 case2 结果](https://github.com/lrfluobida/Cosmos/issues/21#issuecomment-5965623143) 和 [COS-21 完成证据](https://github.com/lrfluobida/Cosmos/issues/22#issuecomment-5956839404)；#22 GET 确认为 closed/state_reason:completed。关闭仅覆盖 Windows 共享占用模式的 registry 修复及真实 publication 验证，原 case1 locker 仍未知，不代表游戏验收通过。COS-20 源码 integrationStatus 使用通用 offline-verified-awaiting-live，保留 CASE_TWO_SOURCE_READY、b3ab706/89085f3 源码与合并 SHA；实际 case2 的 request-limit-exhausted 结果单列，不因源码状态而改成通过。

COS-22 登记时记录（历史）：[COS-22 / #23](https://github.com/lrfluobida/Cosmos/issues/23) 已由 root 发布、原生关联父 #1 并精确读回（id 5680389595，childCount 22），父正文追加相应 checkbox。任务验证更高调用上限下的完整原生生成；源级前置 COS-20/COS-21 已审集成源码，产出反馈 COS-10/COS-20，不要求失败的 COS-20 先关闭。当前 open/not-started，case3 version 2/80 次声明与准入尚未独立批准或执行；固定输入、模型、输出 caps、五 grants 总额 ¥21、¥5/45 分钟/一次 coding repair、共享 ¥150/首批 ¥30 保持。旧 version 1 的两 case 永远保持 40 次及原 quote/hash、费用、grants、时钟、失败与已消费结果，不全局提高旧记录或手写游戏补足失败。

COS-22 case3 源码 `27c81b327164f1318e0352193d72d923a54f77bd` 经独立 VERSIONED_CASE_THREE_SOURCE_READY 合入 `474a6a9f634a72eb33c26734cf4596aa26dff4ac`，十个批准路径逐字节一致。core 声明类型支持 version 1/2，version 1 永远最多 40、version 2 最多 80，未知版本拒绝；固定新 `cos20-native-validation-3` 使用 validation-declaration-2/80 请求，相同 ¥5/45 分钟/共享 ¥150/首批 ¥30/一次 coding repair、五 grants ¥21、输入/DeepSeek/输出 caps 保持。case3 免费入口要求旧 case1 历史存在且已 stop、current case2 已明确 stop；COS-20 必须为 CASE_TWO_SOURCE_READY/b3ab706/89085f3 已集成祖先，COS-21 为 WINDOWS_PUBLICATION_SOURCE_READY/1d03122/99e6d87 已集成祖先，closed 不能绕过来源门槛。

主线只重跑 version 1/2 请求边界与只读 case3 preflight/原 snapshot bytes/mtime/历史保持两个代表，各 1/1、0 skip（case 72.3 ms/6.575 秒），一次 `npm run typecheck` 通过。作者 9 声明、4 runtime、26 entry 与补充旧 case1 缺失拒绝、flags/scope 代表 2，以及独立 reviewer 4/4、0 skip 证据复用；相关 probe/test 显式 strict 类型证据在相同源码/依赖下复用，不以根构建代替。未重跑全套、fake flow、worker、Browser 或 PS child，未改游戏/host/native engine/资产/完整 AC，没有新增 API 或私有账本/凭据/session 访问。

Case3 执行前记录（历史）：COS-22 当前 offline-verified-awaiting-live/open，审批和准确 source/merge SHA 只记入该独立任务；COS-20 的 CASE_TWO_SOURCE_READY/b3ab706/89085f3、offline-verified-awaiting-live 及真实 case2 request-limit-exhausted 结果保持，COS-21 complete/closed 保持。原 case1 完整对象、case2 40 次/857,751 micro-CNY/412,315 ms/manual stop/已消费结果与共享 1,974,153 micro-CNY、grants、原时钟和 quote/hash 均不改；G3/G4 与生成目标未通过，case3 尚未真实 claim 或执行。最终文档 main 干净推送后冻结，root 按最新准确 SHA 做免费只读 preflight、官方 CNY 资金准入与真实 operator 决定，以临时内存凭据执行 fixed case3；case3 结束并由 root 明确解除前，不合入任何 docs/source/reference。

真实 case3 结束后，root 提供安全元数据：source `c78b12c548ed8c072ac52a41f056e7c807c7190d`，开始 `2026-10-03T05:23:54.699Z`、原定截止 `2026-10-03T06:08:54.699Z`、结束 `2026-10-03T05:24:45.981Z`，elapsed 51,282 ms，snapshot revision 338；进程 exit 1/credentialCleared，controller/registry 锁均已释放且无 Cosmos Node 存活，本轮 main 冻结解除。5 次实际 SDK 请求为 planning 2/design author 3，新增保守峰值估算 68,875 micro-CNY、共享 2,043,028 micro-CNY，unknown/reserved 零。design 失败一次 attempt，art/coding not-started/零 attempt，accepted null，semantic repair 0；原 case1/case2 的费用、日期、40 次 caps、源码、grants、quotes 和完整对象保留，case3 manual one-shot finish/结果/marker 已消费，不重开或手改模型游戏。

design 实际写出 summary/17 notes/8 AC mapping，但最终作者 1,549 bytes prose 无 JSON fence，含 remaining/uncertainty 字样，被严格 final handoff decoder 以 `Model response requires one complete JSON object` 拒绝。未到 host capture 或独立 review，不证明设计内容、结构值或游戏已通过；classification 为 insufficient_evidence/early execution。此失败未触 80 次、¥5 或 45 分钟限制；COS-22 actual-validation-failed-author-handoff/open，源码审批 VERSIONED_CASE_THREE_SOURCE_READY/27c81b3/474a6a9 保留，COS-20 CASE_TWO_SOURCE_READY/b3ab706/89085f3 原审批保持，最新实际 case3 失败单列，G3/G4 未通过。

COS-23/COS-24 登记时记录（历史）：Root 已发布并精确读回 [COS-23 / #24](https://github.com/lrfluobida/Cosmos/issues/24)（id 5686944546）和 [COS-24 / #25](https://github.com/lrfluobida/Cosmos/issues/25)（id 5686944963），原生关联父 #1，childCount 24。前者最多增加一次真正 SDK 的只读作者格式纠正，保留原回复和 strict schema/语义 uncertainty，用 pi/SDK 实际关闭 mutating tools，调用计入原费用和请求、不增加语义修复；source 前置 COS-07/COS-20，产出反馈 COS-10/COS-20。后者处理已停止/drained/known-settled 案例的未用任务 grant capacity；source 前置 COS-06/COS-20，产出反馈 COS-20/COS-23，不要求失败任务完成形成循环。两任务当前 open/not-started，方案/源码待实施审查，没有新 READY、allocation closure 或 case4 执行。

COS-24 需求登记时记录（历史）：分配阻塞由协调者安全元数据确认：allocated 147,596,040 micro-CNY、实际累计 2,043,028、reserved/unknown 零、unallocated 2,403,960，不足新五 grants 共 ¥21 的 envelope。COS-24 将追加版本化 allocation closure，精确归还已停止且收敛案例未花的分配容量，永久关闭旧 grant ID 新派发；原 amounts、settled fees、quotes/operator 决定、日期/请求/历史保留。只读 exact closure quote 绑定真实当前代码/原 snapshot bytes/revision/拟关闭 IDs+amounts/旧案例+requests，由真实 operator receipt 原子提交、同操作幂等，状态漂移或未知费用拒绝。金额不是已结算费用退款，不清零账目或增加 ¥150；共享 ¥150/首批 ¥30/新 case ¥5/45 分钟/80 请求/一次 coding repair 保持。具体 ledger format 尚待只读调研，文档登记不修改实际私有账本、凭据或 session，不声称已经归还容量或生成通过。

COS-25 登记时记录（历史）：Root 已同步并精确读回 [COS-10 case3 结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5966131791) 与 [COS-22 case3 结果](https://github.com/lrfluobida/Cosmos/issues/23#issuecomment-5966131994)；原 case3 失败/已消费、费用 ¥0.068875、共享 ¥2.043028、时钟和 caps 保持。COS-23 在 cos05、COS-24 在 cos04 的独立 managed worktree 实施源码，当前 in-progress/open、SOURCE_NOT_READY，无批准 SHA，未合入主线或运行真实 closure。

COS-25 登记时记录（历史）：[COS-25 / #26](https://github.com/lrfluobida/Cosmos/issues/26) 已由 root 发布并精确读回（id 5687112557），原生关联父 #1；flatten 后实际子任务 25 项、编号 #2–#26，父 checkbox 已核对。该任务登记独立 `cos20-native-validation-4`，沿用 declaration-v2/80、同固定输入/模型/output caps、五 grants ¥21、新 case ¥5/45 分钟/一次语义 coding repair、共享 ¥150/首批 ¥30；新 native host 显式 authorProtocolCorrections:1。前置 COS-20/21/22/23/24 只要求准确独立已审且集成源码，旧三个案例 stopped/drained 并仅精确归还未用容量后，root 另做免费源码 preflight、真实 operator 决定和准确 main 冻结，再执行付费 case。旧声明/hash/quotes/40 或 80 次/日期/费用和已消费历史保持，不伪造 human 记录或手改游戏。COS-25 当前 registered/not-started/open，源码和 case4 尚未就绪；本次仅文档待审提交，不启动 paid、不归还真实额度、不合未审源码、不冻结 main。

COS-23 `d334c82a71aaf160bc81578860234085b07e4a1a` 经独立 AUTHOR_PROTOCOL_SOURCE_READY 合入 `d49d132c0d991daac8879d014c50b7ada69daed3`；COS-24 最终 `ee4ef2810c1b337aced6637b4a71b90ad90e6626`（链 915f9a5 → ee4ef28）经独立 VALIDATION_ALLOCATION_CLOSURE_SOURCE_READY 合入 `98aa9ccc18fa7192a693930d53550dce3a91ae18`。两链 13/18 个批准路径无碰撞，合计 31 个路径逐字节一致、UTF-8/LF/中文与 diffcheck 通过；组合 source 已干净推送 main，local/remote/origin 均为准确 `98aa9cc`。

联合类型检查一次覆盖所有 src、两个 changed probes 及新接口 tests/fixture，采用 strict/NodeNext/noEmit 等原有参数并保留源码 verbatimModuleSyntax，exit 0；三个 pure FS 组合代表 3/3、0 skip：格式纠正 response 中断恢复 260.9 ms、新 ledger v3 归还容量后的 fresh case/旧 ID 拒派 357.9 ms、generation scope/额外钱/未知费用/不精确 closure 拒绝 3.5 ms。复用 COS-23 独立 6 代表、作者 provider 22/author 17/explicit wrapper 1 与类型证据，以及 COS-24 独立 6、作者 71/30 与类型证据；未重全套、42 秒 wrapper、80 请求循环、Browser、child 或额外根 build。

COS-23 的真正一次无工具格式纠正仍在原 session/attempt、purpose/cap/grant/signal 下计费，实际 SDK 工具集合控制，codemode/deferred 暴露时拒绝；原始/响应/作者范围签名与 journal 固定恢复，未完成纠正不获第二次 dispatch。COS-24 validation-only ledger 3.0.0 仅追加精确未用容量 closure、真实 operator 决定与原子事件；原 amounts、已结算费用、旧 request/quote/时钟保留，closed grant IDs 永久拒新派发，新 case 经原 budgetCapacity 使用归还容量。原 v1/formal v2 不自动获得该权限。

实际 closure 前记录（历史）：两任务映射现为 offline-verified-awaiting-live/open，保存各自精确批准 marker/source/merge SHA；COS-25 in-progress/open、SOURCE_NOT_READY，独立 case4 源码待审批和真实准入。当前文档只记录已审 source/离线组合证据，不执行真实 closure、paid case 或私有账本操作，不把游戏写成通过；前三案例完整失败与费用、共享 ¥2.043028、unknown/reserved 零、G3/G4 未通过保持。Root 可在准确源码 main 冻结期间独立做免费实际 closure，真实结果由安全元数据另记；本 docs 候选仅在独立 worktree，未审内容不进 main，未来 paid case 仍须新准确 main preflight 和真实 operator 决定。

Root 已在准确 `98aa9ccc18fa7192a693930d53550dce3a91ae18` 完成真实免费 allocation closure 并解除 main 短冻结；本作者只按安全元数据补记，未读取私有 snapshot/session/凭据或重跑操作。Quote `vacq1-2a910f734049d8a4219bb3200fcfe80e688b8800425a450c1581cf119633113c` 绑定真实 operator decision `operator-allocation-closure-90df97d8-853f-426f-8219-fc3a14c962ff`，kind operator_validation_allocation_closure、actor coordinator，未制造 human 决定；appliedAt `2026-10-03T06:52:44.358Z`，snapshot revision 338→339、ledger contract 1.0.0→3.0.0。

15 个旧 grants 仅关闭未用容量，released 62,073,374 micro-CNY，effective allocated 147,596,040→85,522,666，unallocated 2,403,960→64,477,334；保守峰值费用 2,043,028 micro-CNY 完全不变，reserved/unknown 零。原 run/tasks/validation 的三个 cases/requests/stop/原 clock 等逐项 DeepEqual；除显式 contractVersion 升级外，原 ledger 字段、entries、allocation amounts 保持，旧 events prefix 原样，仅追加一个 event 和真实 receipt。Owner 已释放、无 `.controller.lock`，Node 6.733 秒/exit 0，模型请求 0，无新游戏或 paid case。最初核对脚本引用不存在的 settled 字段，在 quote 前即断言停止、零写入；核实 actual API 改为 entries sum 后才执行上述成功操作，这不是 runtime/source 缺陷或第二次实际 closure。

COS-25 源码审查前记录（历史）：[COS-23 源码进展](https://github.com/lrfluobida/Cosmos/issues/24#issuecomment-5966532371) 与 [COS-24 实际 closure 结果](https://github.com/lrfluobida/Cosmos/issues/25#issuecomment-5966532705) 已由 root 发布并精确读回。COS-23 保持 offline-verified-awaiting-live/open 与 AUTHOR_PROTOCOL_SOURCE_READY；COS-24 integrationStatus 同样保持 offline-verified-awaiting-live/open 与 VALIDATION_ALLOCATION_CLOSURE_SOURCE_READY，精确 source/merge 不变，actualAllocationClosure/liveValidationStatus 单列已 apply/awaiting-fresh-native-claim。COS-25 仍 in-progress/open、SOURCE_NOT_READY，case4 尚未 claim 或付费；前三真实失败及原额度/历史保持，G3/G4 和游戏目标未通过。此次四 docs 仍是独立 worktree 的待审候选，不合 main，root 稍后安排 fresh 独立审查。

COS-25 `be02266a5f171ddc5383e02a55d3e231bb9dbe7c` 经独立 CASE_FOUR_SOURCE_READY 合入 `b3901caf3f3cecd141b1003b3f91e4574cc898c4`，八条批准路径逐字节一致、UTF-8/LF/diffcheck 通过，source 已清推、local/remote/origin 精确一致。主线新入口两代表 2/2、0 skip：只读 case4 preflight 保留历史并接受祖先源码的真实 closure 记录（临时 fixture 6.144 秒），历史 receipt/closure audit/旧 owner 漂移拒绝（4.253 秒）。作者声明 9、新 entry 9/旧 10、三个 probe/四 tests 的显式 strict noEmit，以及独立五风险代表证据复用；base 与组合源码相同，未重复 root build、typecheck、native/worker/Browser 或 paid 流程。

首次实际 preflight 前记录（历史）：COS-25 当前 offline-verified-awaiting-live/open，保存精确 CASE_FOUR_SOURCE_READY、source be02266/merge b3901ca；前置 COS-20/21/22/23/24 精确 marker 与 source/merge 祖先不变，真实 allocation closure 已由 root 完成并记录，但 case4 尚未真实 claim、paid、游戏验收或体验通过。等待最终 main metadata、准确 SHA 免费只读 preflight、资金准入与真实 operator 决定，再冻结准确 main 执行；结束并明确释放前不改主线。原 actualAllocationClosure/snapshot revision 339、费用 2,043,028 micro-CNY 和前三例历史保持，G3/G4 未通过。本修订只在同 docs 分支，当前未审文档不合 main，交原 reviewer 增量复核。

首次免费实际 preflight（历史）：root 在准确 `15f337526aa960a26af4be2bcce5518b7d74eb7a` 核对时，被 COS-22 的 source gate 拒绝。COS-22 的 VERSIONED_CASE_THREE_SOURCE_READY、批准源码 `27c81b3` 与合并 `474a6a9` 均已审并属于 main 祖先，但实际失败状态 actual-validation-failed-author-handoff/open 未被新 generic status list 接受；源级前置要求已审源码，不要求失败运行验收先通过。原作者将最小修正入口并用真实 public metadata shape 复现 RED，再由原 reviewer 增量复核；不修改历史失败状态或 metadata 绕过门槛，不集成未审源码。

此次实际核对保持 snapshot revision 339、已用估算 2,043,028 micro-CNY、current stopped case3，case4 root/marker/owner 均不存在，未 claim、写入或 paid，模型请求 0。Root 的免费账户 GET 确认 CNY 可覆盖本 case ¥5 且 deepseek-flash 路由可用，临时凭据已清除，并明确解除本次 main 冻结。case4 仍等待准确 fixed source/文档重新审查、准入和冻结；本作者按 root 安全元数据登记，未改真实账本、session、key 或主线。

COS-25 最新增量 `bc97d7d191fbd6c03d22d506943f469e9717441c` 经原 reviewer CASE_FOUR_SOURCE_READY 合入 `403984489725b4272ef8739e86d640cdd86ce1f8`，四条批准路径逐字节一致、UTF-8/LF/diffcheck 通过；原首轮 be02266/b3901ca 审批保留在 sourceApprovalHistory 和进度。修复只对 COS-22 已知 actual-validation-failed-author-handoff/open 配合精确 VERSIONED_CASE_THREE_SOURCE_READY、唯一任务与 source/merge 双祖先允许源级前置；unknown 状态和 COS-23 借用仍拒，不修改历史失败为通过。真实 public metadata shape 的 RED→2 GREEN、原 reviewer 2/2、0 skip 和作者 strict probe/tests noEmit 证据复用，没有重编译、全矩阵、Browser 或 native 运行；source 已精确清推 local/remote/origin 4039844。

Case4 执行前免费 quote（历史）：Root 在准确 source `403984489725b4272ef8739e86d640cdd86ce1f8` 完成免费真实 preflight READY，4.600 秒/model 0，quote `vq1-aeffbe5d1cd9880336534b9d7d4702d21460bbf4f9dc996dbe552eae9a947881`；revision 339、committed 2,043,028 micro-CNY、allocated 85,522,666，limits incremental 5,000,000/duration 2,700,000 ms/maxRequests 80。14 项 source approvals（COS-06..09/11..13/18..24）通过，原 snapshot bytes/mtime 完全不变，C4 root/marker/shared owner 均无 created；未 claim、写入、paid 或生成游戏。该 quote 只绑定 source403 时点，不能沿用到最终文档 main，root 仍须 latest exact SHA 新免费 quote/资金核对/真实 operator 决定，再冻结并执行，结束前不改主线。

Case4 执行前准入记录（历史）：当前 COS-25 offline-verified-awaiting-live/open，reviewStatus 保持 CASE_FOUR_SOURCE_READY，最新 reviewedCommit bc97d7d/mergeCommit 4039844；旧 be02266/b3901ca 与所有其他任务、真实 closure、费用 2,043,028 micro-CNY、revision 339 和前三例历史保持。case4 未真实 claim 或付费，G3/G4 未通过，本轮冻结已解除；这四 docs 仅为同 managed worktree 的待审提交，交原 reviewer 做本增量检查，不合未审文档或读取实际私有 ledger/session/key。

真实 case4 结果由 root 提供安全元数据：source `b0cf64f59505acf7f2e115e6d874552725f12a12`，quote `vq1-9b0a7e0a3ca27c629e181893748c229af9a5ed7109cf8e5eace70942090a667f`，开始 `2026-10-03T08:06:12.677Z`、原定截止 `2026-10-03T08:51:12.677Z`、结束 `2026-10-03T08:06:25.965Z`，elapsed 13,288 ms。仅 planning 一个真实请求新增 11,432 micro-CNY，共享累计 2,054,460、unknown/reserved 零，结束时 snapshot revision 345/ledger 3.0.0；native PID 30920 dead/exit 1/credentialCleared:true，shared controller/case4 registry 锁 absent，owner known closed，main 冻结已解除。旧三个案例及首轮 closure 保留，case4 manual finish/结果/marker 已消费，不重开或改模型 proposal/game。

启动/bootstrap/template 成功；原规划回复 1,396 bytes strict JSON，3 roles IDs、完整 10 AC、acyclic 和 coding both parents 均合法。Host `src/roles/planner.ts:115` 按原 allocation gross 168,596,040 与 ¥150 比较，忘记扣已 closed grants 的未用容量；budgetCapacity effective 106,522,666 本应合法。这是 host 核算缺口，非规划 JSON/模型结构失败；design/art/coding 尚未创建或开始、暂无角色 task，accepted null、无 semantic repair。调用 1/80、费用 ¥0.011432/¥5、耗时 13.288 秒/45 分钟均未到限。COS-25 integrationStatus 保留 offline-verified-awaiting-live/open 与 CASE_FOUR_SOURCE_READY/bc97d7d/4039844，actualValidationFailure 和 C4 结果单列，不用 runtime failed 状态替换 source 状态；G3/G4 和完整目标未通过。

[COS-10 case4 结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5967241823) 与 [COS-25 case4 结果](https://github.com/lrfluobida/Cosmos/issues/26#issuecomment-5967242082) 已由 root POST 并精确读回；旧 C3 结果链接保留在历史而非新 C4 result。Root 已发布并精确读回原生子任务 [COS-26 / #27](https://github.com/lrfluobida/Cosmos/issues/27)（id 5687873042）和 [COS-27 / #28](https://github.com/lrfluobida/Cosmos/issues/28)（id 5687874167），父 checkbox 与 27 个子任务 #2–#28 核对。COS-26 source 前置 06/07/20/24、输出 10/20/25；COS-27 source 前置 20/21/22/23/24/25/26、输出 10/20，均为已审集成源码门槛，不以失败任务 closed 作为循环条件。

COS-26/COS-27 源码集成前记录（历史）：COS-26 候选 `6f6960b89daaea3dde9032ae620a76fa7b9ce138` 已获独立 PLANNING_EFFECTIVE_CAPACITY_SOURCE_READY，独立六代表/作者六项及 strict types 证据可复用，尚未 main 集成、没有 mergeCommit，本轮不代其改实现或提前编译。COS-27 in-progress/open、SOURCE_NOT_READY，专属作者准备新固定 `cos20-native-validation-5`，同 inputs/declaration-v2/80/model/output caps/五 grants ¥21/case ¥5/45 分钟/一次 coding repair/共享 ¥150/首批 ¥30/native authorProtocolCorrections:1；尚未源码批准、claim 或 paid。等待其独立批准后由唯一 merger 联合集成，当前只文档登记。

Root 于 `2026-10-03T08:45:43.574Z` 在准确 `b0cf64f59505acf7f2e115e6d874552725f12a12` 完成免费 second closure：quote `vacq1-c399333f1956c1e73a5226662893db1cd4df081e872bdea00f243abd94306167`，真实 coordinator 决定 `operator-allocation-closure-e7b12ab3-79d2-4b75-afe9-55a41f74889e`、kind operator_validation_allocation_closure。仅关闭 C4 五 grants 未用 20,988,568 micro-CNY，closure 总数 20/decisions 2；原三案例 15 closures/62,073,374 不重执行。revision 345→346、ledger 3.0.0 不变，allocated 106,522,666→85,534,098、unallocated 43,477,334→64,465,902；共享估算费用 2,054,460、unknown/reserved 零完全保持。

Case5 执行前 closure2 记录（历史）：Second closure 保持原 run/tasks/四 cases/requests/operator/human/date 等字段、原 ledger entries/allocation amounts 与第一笔 closure 的 15 record/events 前缀逐项 DeepEqual，仅追加 C4 closure 决定和记录；current 仍为 stopped case4，不是新 case5。Node 3.906 秒/exit 0/owner released、模型请求 0，root 明确解除本次短 main 冻结。未清费、未提升 ¥150 或复活 closed IDs；case5 仍待源码独立批准和新真实准入。本作者只依据安全 metadata 登记，未访问私有账本/session/key 或调用模型，未编译/测试/修改 main，候选四 docs 待 root 安排 fresh 独立审查。

COS-26 `6f6960b89daaea3dde9032ae620a76fa7b9ce138` 经独立 PLANNING_EFFECTIVE_CAPACITY_SOURCE_READY 合入 `409868335cb45ee2f50e065f92ac0f4cd9419208`；COS-27 `8348495794da8e49bed1129fe4b02a8a920505fb` 经独立 CASE_FIVE_SOURCE_READY 合入 `0efc5ec905786358dc4d43a646d34c17dbf11b26`。两链五 + 七逻辑路径无碰撞；case-four 测试 gitmv 为 case-five 按旧/新路径一起核对，共 13 物理路径准确匹配批准版本，旧路径删除、UTF-8/LF/diffcheck 通过。Source 已清推，local/remote/origin main 精确 `0efc5ec`、工作树干净；先保留 b9fe411 文档候选，再在独立 worktree 同步已审源码，未 blind reset 或先合未审文档。

一次联合 strict/NodeNext/noEmit 覆盖 src、相关 probes 与两组新 tests/fixtures，exit 0；仅三项跨组合 pure FS 代表 3/3、0 skip：closed-grant 有效容量 planner 317 ms、显式 fresh-core 无历史/closures/额外费用兼容 fixture 898 ms、case5 只读 preflight/history/mtime 7.694 秒。作者/独立 reviewer 固定证据复用，未重复 80 次循环、43 秒 full flow、Browser、child 或真实 API；未代修改实现，组合没有失败。原 docs reviewer 对四文档仅两处历史语境 P2，现只给 COS23 同步证据加执行前限定，并让 COS25 source 状态指向已失败/消费的真实 C4 结果，其余旧事实复用。

Case5 执行前源码准入记录（历史）：COS-26/COS-27 当前 offline-verified-awaiting-live/open，保存各自精确 marker/source/merge SHA；planner 采用原 budgetCapacity 有效分配基数，固定新 `cos20-native-validation-5`、v2/80、既有 inputs/model/output caps/五 grants ¥21/新 case ¥5/45 分钟/一次 coding repair/共享 ¥150/首批 ¥30/native authorProtocolCorrections:1 保持。两笔 closure 已完成、snapshot revision 346、费用 2,054,460 micro-CNY、unknown/reserved 零、20 closures/2 decisions 和四个失败案例原历史保持；case5 尚未真实 claim 或 paid，G3/G4 未通过。最终四文档独立批准并清推后，root 仍须 latest main 实际只读 preflight、资金核对、真实 operator 决定和准确冻结，结束并明确解除前不改主线；本增量候选尚未 main 集成。

真实 case5 安全元数据由 root 提供：source `8fc7ce5ae1c957cafd2f7cc90a37fd6815751a30`，quote `vq1-3eec2ee59c21dda34a1d5ea6a0772f8662eec4328179d04c2883cfe7334b6c5f`，开始 `2026-10-03T09:28:05.370Z`、原定截止 `2026-10-03T10:13:05.370Z`、结束 `2026-10-03T09:35:55.652Z`，elapsed 470,282 ms。实际请求 47：planning 1/13,572、design 11/160,804、art 11/269,665、coding 24/457,000 micro-CNY，增量共 901,041、共享 2,955,501，unknown/reserved 零，结束时 snapshot revision 555/ledger3；未触 80 请求/¥5/45 分钟上限。Parent Node 23096 dead/exit 1/key cleared/controller+registry locks absent，root 明确解除 main 冻结；C5 manual finish/结果/marker 已消费，不重开，旧四 cases 与两笔 closures 原样保留。

规划容量组件实际通过并继续派发角色，COS-26 原 source marker/source/merge/offline/open 保持，liveValidationStatus 单列 source-and-live-planning-capacity-verified。design/art 各一 attempt passed，coding 一 attempt failed/checkId author_handoff/classification insufficient_evidence；原 remaining []，两项 uncertainty 涉及主机 SVG/WAV 实际加载与隐藏正常鼠标 occupied/cooldown 场景，误把 host-owned observation 当 author blocking，不是 JSON protocol failure。Coding 真实 check_project 记录六次，TypeScript+Vite 已通过，immutable candidate v1 captured；host verify/browser/独立 coding review 没运行，accepted null/semantic repair0。构建和捕获不能记成 game passed，raw proposal/未决含义和 actualcase5 games 保留，不人工抹除 uncertainty 或修改游戏。

COS-28 源码审查前登记（历史）：COS-27 integrationStatus 继续 offline-verified-awaiting-live/open，审批 CASE_FIVE_SOURCE_READY/8348495/0efc5ec 不被 runtime failure 覆盖；actualValidationFailure/nativeValidationCase5 单列失败。Root 已发布并精确读回 [COS-28 / #29](https://github.com/lrfluobida/Cosmos/issues/29)（id 5688544970）与 [COS-29 / #30](https://github.com/lrfluobida/Cosmos/issues/30)（id 5688546212），父 checkbox/29 个原生子任务 #2–#30 核对。前者 source 前置 07/20/23、输出 10/20/27，后者 source 前置 20..28、输出 10/20，不用失败任务 completed 形成循环条件；两项当前 in-progress/open、SOURCE_NOT_READY，源码未独立批准或集成，case6 未 claim 或 paid。

COS-28 实施前设计记录（历史）：COS-28 ≤300 词设计已由 root 批准，源码正在 TDD：新 codingHandoffClarifications:1 仅 validation/coding-only/validJSON/remaining0/uncertainties 触发原同一 SDK session 的真正只读职责澄清，format+scope 每个 attempt 共享 ONE extra provider slot。保留 raw/hash/signature/identity/durable/no-repeat-unknown 费用，真正未完成仍失败；host 全 AC/独立 review 不减少，不改游戏或增加 semantic repair。原 flag0 与五历史权限保持，源码尚未 READY。COS-29 新固定 `cos20-native-validation-6` 同 inputs/v2/80/五 grants ¥21/新 case ¥5/45 分钟/一次 coding repair/共享 ¥150/首批 ¥30，新 caller 已收到明确接口，仍待 source 独立批准及精确 marker/双祖先/main hash/receipt 和 prior1..5 stopped/current5/25closures 准入。

[COS-10 case5 结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5968250963) 与 [COS-27 case5/第三笔 closure 结果](https://github.com/lrfluobida/Cosmos/issues/28#issuecomment-5968251262) 已由 root 发布并精确读回；旧 C3/C4 结果链接保留在各自历史，不当作新 C5 结果。Root 于 `2026-10-03T10:17:11.499Z` 在准确 `8fc7ce5ae1c957cafd2f7cc90a37fd6815751a30` 完成免费第三次 closure：quote `vacq1-57c30109bcefe82ebba5c85e602d61d18a5bb2cdbefab2990db9283d2eb8df72`，真实 coordinator 决定 `operator-allocation-closure-b5164eff-ce2a-4146-9537-048ff84aeda3`、kind operator_validation_allocation_closure。仅关闭 C5 五 grants 未用 20,098,959 micro-CNY（¥21 减去已花 901,041），closed 总数 25/decisions3；旧 20 closures/2 decisions/events prefix 不重复、严格 DeepEqual，原 run/tasks/五 cases/requests/times/quotes/operator/human/artifact refs 与 ledger 原费用/alloc amounts 保持。

第三笔 closure 将 revision 555→556、ledger3 保持，allocated 106,534,098→86,435,139、unallocated 43,465,902→63,564,861；共享估算 2,955,501、unknown/reserved 零完全不变。Owner released/Node 3.836 秒/exit0/model0，root 明确解除短 main 冻结；原 C5 deadline 10:13 已过但 manual-stopped 历史不刷新、不重开、不清费或追加 ¥150。这是免费容量归还，不是新 case6；五个失败案例、第三笔 closure 和 G3/G4 状态如实分列。本作者只按安全 metadata 登记，未读取私有 ledger/session/key、编译/软件测试/调用模型或修改 main；候选四 docs 待 fresh 独立复核。

Case6 执行前 Source28 集成记录（历史）：COS-28 `625f4b33d32110a7dbed6f2d3d0bcf3dbe448a87` 经独立 HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY 合入 `846e94cf558863f9b6829a8b875b0955f1af7938`；九条批准路径逐字节一致、UTF-8/LF/diffcheck 通过，source 已推送且 local/remote/origin main 精确 846e94c、干净。只在主线跑 format+scope 共享 ONE slot 的 pure FS 代表 1/1、0 skip（1.069 秒），独立 scope 七代表/legacy 两代表、作者 35 与一次 coding/repair 转发和类型证据复用；未重复 47 秒 fake flow、旧 provider 或编译，没有真实 case6 结果。

Source29 集成前草稿记录（历史）：原 docs reviewer 对 ad308de 唯一 P2 为 closure2 中旧“current stopped4”的时态，现仅将该卡标题改为 Case5 执行前准入准备（历史），明确 current 状态是 closure2 当时时点，原准入数据保持。COS-28 metadata 为 offline-verified-awaiting-live/open 与精确 HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY/source625f4b33/merge846e94c；当时 COS-29 仍 in-progress/SOURCE_NOT_READY，尚未源码批准、claim 或 paid。四 docs 保持未提交草稿，等 Source29 精确批准和集成后统一补字段并交原 reviewer 增量复核；main 不写入未审内容，五案例/三 closures/费用 2,955,501 micro-CNY/revision 556 与 G3/G4 状态保持。

Case6 执行前源码集成记录（历史）：COS-29 `56919a3e4265bfe5d42345c1e5cd32cb8049dd20` 经独立 CASE_SIX_SOURCE_READY 合入 `89d4fc0ba991bb446139e7e4465b524b5f91e1ee`，八项逻辑/九条物理批准路径（case-five test gitmv case-six 含旧路径删除）字节一致、UTF-8/LF/diffcheck 通过。相同 Source28 已审 base 上类型与独立六风险/作者固定证据复用；主线仅固定声明 1/1 与只读五历史 1/1，共 2/2、0 skip（1.741 ms/9.378 秒），没有重 compiler、全矩阵、47 秒 flow、Browser 或 paid。Source 已清推，local/remote/origin 精确 89d4fc0、干净，独立 docs 分支安全同步并保留 ad308de 链及四个未提交草稿的原字节。

Case6 执行前最终准入记录（历史）：COS-28/COS-29 当前 offline-verified-awaiting-live/open，分别保存 HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY/625f4b33/846e94c 与 CASE_SIX_SOURCE_READY/56919a3/89d4fc0。唯一历史语境 P2 已修正，其他事实/29 项计数/依赖/五案例/三 closures/费用 2,955,501 micro-CNY/snapshot revision 556 保持；case6 尚未真实 claim、paid 或 accepted game，G3/G4 未通过。最终四 docs 原 reviewer 增量批准并清推后，root 仍须新准确 main 实际只读 preflight、资金核对、真实 operator 决定和冻结，结束并明确解除前不改主线；本候选不合未审文档，不接触实际私有 ledger/session/key。

真实 case6 安全 metadata：source `7e5163270519e20e4d1bda9dc1c8dc5e475785ae`，开始 `2026-10-03T11:22:00.263Z`、原定截止 `2026-10-03T12:07:00.263Z`、结束 `2026-10-03T11:32:19.891Z`，elapsed619,628ms。66 请求/新增1,280,416 micro-CNY，共享4,235,917、unknown/reserved0、snapshot841/ledger3；planning3/23,792、design10/99,404、art22/530,791、coding31/626,429。design/art 各一 attempt passed，coding 一 attempt failed/insufficient_evidence/author_handoff；read-only scope clarification 实际发生、shared slot 被区分，原三 concerns 完整保留，一项进入 summary 后仍两 uncertainty：胜利 pacing 与是否必须 runtime fetch manifest，remaining0。真实作者 check_project TypeScript/Vite 成功、immutable v1 capture，但原run未host verify/browser/独立 coding review，accepted null、semanticrepair0。Manual finish/结果/marker 已消费不重开，Node28236dead/exit1/keyclear/locksnone 后 root 明确解除 main 冻结。

Root 免费 postfailure 诊断将原 immutable candidate 克隆至 `.cosmos/diagnostics/case6-host-diagnostic-61d2d518-1bce-4268-a37e-86fcc6ad7ac7`，调用原 host build 与未修改 normal mouse plan，真实 Edge29728：build passed、111 steps passed/0failed/0skip/noerrors，约96.4秒正常退出、forcedfalse。原 candidate file list/每个 file SHA 和 shared snapshot bytes 完全未变，0模型请求/0新增费用，没有 resume/promote 或改原Case6结果；免费诊断时间不加入旧声明。此证明原生生成候选实际游戏可完成固定玩法诊断，不能代替正式native accepted、independent code review、用户体验或完整classic benchmark。

本机诊断报告：`.cosmos/diagnostics/case6-host-diagnostic-61d2d518-1bce-4268-a37e-86fcc6ad7ac7/evidence/cos10-pilot/cos20-native-validation-6-game/v1/case6-host-diagnostic-61d2d518-1bce-4268-a37e-86fcc6ad7ac7/normal-input-diagnostic/report.json`；胜利/失败截图 basename 分别 `066-066-visible-status.png`、`089-089-visible-status.png`。本作者按 root 安全metadata登记，未访问私有 ledger/session/key 或重新检查原候选/诊断，不用 fixture 代替实际游戏证据。

COS30 登记时的历史：COS-28 HANDOFF_SCOPE_CLARIFICATION_SOURCE_READY/625f4b33/846e94c 与 COS-29 CASE_SIX_SOURCE_READY/56919a3/89d4fc0、offline-verified-awaiting-live/open 原审批保持，实际C6差距和诊断单列。Root 发布并精确读回 [COS-30 / #31](https://github.com/lrfluobida/Cosmos/issues/31)（id5689492852），父checkbox/30children #2–#31 已核对；source 前置07/08/20/23/28、输出10/20/29。当时 Task30 in-progress/open/SOURCE_NOT_READY，作者先≤300词设计交root审阅再实现新validation-only coding opt-in：strict原remaining0后capturefixedversion，原concerns保留并运行全部原HostAC/additionalchecks，即使uncertaintiespending。

COS-31 登记与 closure4 前约束（历史）：只有实际全部主机证据和独立review对每项原concern的准确ID/ref/currentversion/evidence支持ConcernResolution才可pass；漏项、错ref/version/id、未解决或durable不足fail，genuine unfinished remaining仍fail。真正host code_defect可沿既有一次repair，不增加semanticrepair、不手改game/自动清数组、不再向作者开启LLM clarify loop，旧六历史权限不新授。新case7以后由root另登记，当前不创建case7或第31个任务；费用仍4,235,917，六案例/旧三closures25grants保持，C6潜在unused19,719,584 micro-CNY（¥21减1,280,416）尚未关闭归还，不假释放/清费/刷新旧时钟。G3/G4和体验未通过，候选四docs待fresh独立审查，不修改main或运行新模型。

COS30 源码批准前的历史：Root 已发布并精确读回 [COS-31 / #32](https://github.com/lrfluobida/Cosmos/issues/32)（id5689873259），native parent/31children #2–#32 和父 checkbox 核对；这是 issue/owned author 登记，不是创建实际 case7。Source 前置20..30为独立已审集成stage、output10/20，不要求failed任务closed。当时 COS30/COS31仍in-progress/open/SOURCE_NOT_READY，source30评审问题修正中，未将未批准候选当READY；source31在pureFS准备新 `cos20-native-validation-7`、v2/80/同9inputs/model/caps/五grants¥21/newcase¥5/45分钟/一次repair/shared¥150/首30，nativepolicy固定 {authorProtocolCorrections:1,codingHandoffClarifications:1,hostEvidencedCodingHandoff:1}。当时独立批准/主线接口/types尚未齐备，不claim/paid，不改旧6权限或game。

Root 在准确 `7e5163270519e20e4d1bda9dc1c8dc5e475785ae` 于 `2026-10-03T14:22:19.998Z` 免费应用第四笔 closure：quote `vacq1-fad24e4a4e0ce30bab9a851c866e55b4622ebbf4e553ad0bbbc5418d37c2176a`，真实coordinator决定 `operator-allocation-closure-55d15226-86f6-4025-914e-cf2625dfcbbe`、kind operator_validation_allocation_closure。Revision841→842、ledger3保持，只新关闭C6五grants/released19,719,584，total30closed/fouraudits；allocated107,435,139→87,715,555/unallocated42,564,861→62,284,445，sharedfee4,235,917/unknownreserve0原样。旧run/tasks/6cases/time/quotes/sourceoperator/human/artifact refs、ledger旧fee/allocamounts、25closures/3audits/events prefix逐项保持，不重复前三笔、不清费或追加¥150。

Closure4 Node5.021秒/exit0/model0/ownerreleased，current仍manual-stopped6，free postdeadline不复活旧run；root明确解除短 main freeze。原freeDiag111/约96.4秒/build/win+defeat/noerrors/originalcandidate全部SHA和当时sharedsnapshotbytes不变，仍distinct，不native accepted/classicpassed；旧C6 paid结果、费用和时钟不变。[COS-10最新C6结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5970095296) 与 [COS-29 C6/诊断/closure4](https://github.com/lrfluobida/Cosmos/issues/30#issuecomment-5970095850) 已POST并exactreadback，旧C5链接保持history。当时 Source30/31未READY、没有actualCase7fees；本作者只安全metadata补记，不private访问、compile/model/旧game素材操作或main改动，四docs待fresh独审。

### COS30 主机证据交接源码审批与集成

COS30 独审批准 `90e4557e8e31fd48081613fbcc5da4651557e906`（父 `e6993c3ccee7c10a38d104d9dfd3e847dafbcc26`），主线合并 `8d23a9e8319a7d1b235e1c0abaa6ba0a7ea10e62`；准确 marker `HOST_EVIDENCED_HANDOFF_SOURCE_READY`，integrationStatus `offline-verified-awaiting-live`，issue 保持 open。[公共源码进展](https://github.com/lrfluobida/Cosmos/issues/31#issuecomment-5970378743) 已由 root POST 并精确读回。12 路径按已审字节集成，UTF-8/LF/中文与 diff-check 通过；独审增量4/4、7.26秒，联合纯FS单次发布代表1/1、0 skip、1223.9ms。复用作者集中类型与受影响单测证据，没有重跑编译、大矩阵或48秒driver。

COS31 源码审批前的历史：仅同步已审接口并准备一次严格类型检查，当时仍 in-progress/open/SOURCE_NOT_READY；新 case7 尚未 claim/paid。C6 failed/consumed、免费111步诊断、closure4/revision842、费用估算4235917及既有源码审批原样保留，G3/G4 未通过。

### COS31 独立 case7 源码审批与集成

COS31 独审批准 `8a07e66d065ba6ddec719ea29e6b519898276c23`（base `8d23a9e8319a7d1b235e1c0abaa6ba0a7ea10e62`），合入主线 `21218fd0624034f6d8abad38bd7de2cc8341606c`；准确 marker `CASE_SEVEN_SOURCE_READY`，integrationStatus `offline-verified-awaiting-live`，issue 保持 open。[公共源码审批](https://github.com/lrfluobida/Cosmos/issues/32#issuecomment-5970626041) 已由 root POST 并精确读回。九个逻辑路径（含测试 git mv，十个物理路径）与已审字节完全一致、无碰撞，UTF-8/no BOM/LF/diff-check 通过。复用作者31个集中用例与唯一 strict noEmit、独审tempFS 6/6/0 skip/exit0；联合仅运行固定声明/opt-in policy 代表1/1、0 skip（1.7087ms），未重编译、大矩阵、Browser或访问私有数据。

Case7 执行前源码集成准入（历史）：Root 在 source `21218fd0624034f6d8abad38bd7de2cc8341606c` 实际免费只读 preflight READY：quote `vq1-d7ace21cefc82a6227a75e141b1b945fc68bf8ccba4d17195cb61f4c270f166f`，20 source approvals，8.95秒/exit0/paid0。实际 snapshot bytes+mtime 不变，当时 case7 root/marker/sharedowner 仍 absent；此为源码集成准入证据，未 claim 或生成游戏。最终文档合入改变 main SHA 后须 root 重新 quote，后续实际quote与结果单列。

Case7 执行前边界（历史）：源码批准不等于新 case7 已执行或游戏已验收。当时六案例、C6 failed/free111诊断、四次closure/revision842/费用估算4235917、既有审批与预算保持；最终文档批准后 root 使用最新准确 main 重新获取免费 quote、核对资金并绑定真实 operator/freeze 后执行，G3/G4 仍未通过。

### Case7 真实 browser 失败与第五笔额度归还

Root 在最终准确 `2404982d075cf7f69c914eb1ad41e9162807747c` 重新取得 READY quote `vq1-4a07e8156cdfc3a004228f4b69b30e8e67a121444b19dbab59b98baa4ef17772`，核对 CNY¥5 funding/deepseek-flash 后执行 C7。窗口 `2026-10-03T15:47:24.285Z`→原定`16:32:24.285Z`，实际 `15:56:47.389Z` 结束，563104ms；54 requests 精确分为 planning1/design10/art17/coding26/repair0，费用micro-CNY为15106/113027/526943/568038/0，合1223114、shared5459031、unknownreserved0、snapshot1079/ledger3。未触80请求/¥5/45分钟上限，旧六案例历史保留。

Design/art passed；coding attempt `64fcd18e-063a-4b9c-baef-57eb000c5e5e` 真实构建通过、immutable v1 captured，scope澄清后原两uncertainties仍保留，已进入host证据/browser路径。原111步plan前三项检查和startinput通过，第005步 title“准备开始” !=“防守中”失败，其余skipped；CapturedPageerror `HUD element [data-testid="wave"] is missing`，生成index只有strong id="wave"，hud.ts却要求data-testid=wave。报告记录3条错误，局部等待出现boundedDeadlineError并强制退出，诊断classification insufficient_evidence；未执行独立codingreview/semanticrepair，无accepted。这与C6独立免费111步通过是不同候选和结果，不改旧game或把部分检查写为游戏通过。

C7结束时的历史：Exec27393/exit1、Node32584及Edge31536 dead、credentialCleared、shared/registryowner absent后root明确解冻。COS30 HOST_EVIDENCED_HANDOFF_SOURCE_READY/90e455→8d23 与COS31 CASE_SEVEN_SOURCE_READY/8a07e6→21218审批及offline-verified-awaiting-live/open保持，实际C7失败另列；未创建或claim新case8。

Root于`2026-10-03T16:17:34.316Z`在source2404982免费应用closure5：quote `vacq1-503240846076601b7328ea854efb915ce17e908998ca4cf1685b555bee5d0a00`，真实coordinator决定 `operator-allocation-closure-95b6ec15-2a0e-4337-91da-7d709ad5e04e`，kind operator_validation_allocation_closure。Revision1079→1080/ledger3保持，仅关闭C7五grants/released19776886、累计35closed/5audits；allocated108715555→88938669/unallocated41284445→61061331，费用5459031/unknownreserved0完全不变。Run/tasks/requests/stop/seven histories、ledger entries/allocamounts、旧30closures/4receipts/events prefix均deepEqual保留。Node3.284秒/exit0/model0/ownerReleased；这是归还未用任务capacity，不清费用、刷新旧窗口或增加¥150，不重开C7。

COS32/33登记时的历史：C7实际失败和closure5已由root发布并精确读回：[COS10最新C7结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5971124406)、[COS31 C7/closure5](https://github.com/lrfluobida/Cosmos/issues/32#issuecomment-5971124741)，C6/C5旧链接保留history。Root新增并核对[COS32/#33](https://github.com/lrfluobida/Cosmos/issues/33)（id5691425244，区分游戏断言超时与浏览器故障并触发有界修复）和[COS33/#34](https://github.com/lrfluobida/Cosmos/issues/34)（id5691425850，验证浏览器缺陷反馈后的完整原生生成）；native parent共33children #2–#34/父checkbox准确读回。两项均in-progress/open/SOURCE_NOT_READY；COS32 source前置07/08/11/13/20/30、输出10/20/31，COS33 source前置20..32、输出10/20，为source审批门槛而非失败任务closed依赖。新fixedcase8/v2/80沿原inputs/model/caps/五grants¥21/newcase¥5/45分钟/一次repair/shared¥150/首30，source尚未独批、新case8未claim/paid；本轮仅owned四docs安全metadata登记，待独审，不写main或访问私有状态。

### COS32 归类源码审批与 COS34 最终体验登记

Case8执行前COS32源码集成（历史）：独审 BROWSER_DEFECT_CLASSIFICATION_SOURCE_READY 批准 `af883ba936806003034ea5015dfc3d1ce11939a8`（父 `2031bd073cb3ecd126c875daa7194ee1957fd0af`），唯一merger合入并清推 `bc24755518abe5c2f8c02e6fbf1add6414c72f33`。四批准路径字节一致、UTF8/LF/中文保持/diffcheck通过；作者23pure/首P2修正10pure/termination20/shared6、两不同真实Edge fixture各1/1与初次/增量types证据复用，独审增量6/6、2.92秒、0skip/exit0，联合仅局部观察race归类代表1/1、0skip（7.2949ms）。没有新Edge/compiler/provider或长driver；保存的两份实际报告在新可信事实下诊断为code_defect（1），原C7保存报告仍为insufficient_evidence（2），未回写旧C7结果/费用/closure5。COS32 integrationStatus仍offline-verified-awaiting-live/open，新case8未claim/paid。 [COS32公共源码审批](https://github.com/lrfluobida/Cosmos/issues/33#issuecomment-5972022726) 已由root发布并精确读回。

COS34登记与COS33批准前记录（历史）：Root发布并精确读回[COS34/#35](https://github.com/lrfluobida/Cosmos/issues/35)（id5692013242，持久化最终用户体验决定并绑定交付版本）；native parent共34children #2–#35/父checkbox已核。Source前置COS08/11/18已审源码，COS18部分源码stage不要求closed，输出18/17/15；in-progress/open/SOURCE_NOT_READY。≤300词方案已批准，正式generation用户仅approve/reject/cancel，host内部绑定交付hash/report/currentcandidate/attempt与独立review、owner短锁/write-once receipt；保留待体验阶段，generation而非validation，决定入口0模型/0费用，不fakehuman。源码仍专属分支pure TDD，未独审集成或真实用户认可；COS33 caller候选尚待独审，source-not-ready，七案例费用5459031/closure5/revision1080与C6 free111、COS30/31审批保持。本轮只有owned四docs待审候选，不合main或读取私有状态。

### COS33 独立 case8 源码审批与集成

独审 CASE_EIGHT_SOURCE_READY 批准 `d5df6e3d7ed8258356af4316d496acdb5e1f99c9`（base `bc24755518abe5c2f8c02e6fbf1add6414c72f33`），唯一merger合入并清推 `887d51459ef8e5b55a9ed10a6f83a45fd6017567`，offline-verified-awaiting-live/open。八逻辑/九物理批准路径（含test git mv）字节一致、UTF8/LF/中文保持/diffcheck通过，authorProtocolCorrections/codingHandoffClarifications/hostEvidencedCodingHandoff 均保持1，host文件原字节保持。复用作者31focused/唯一strict7.202秒/importClosure exit0、独审pureFS6/6/0skip（71.592秒）；联合仅固定声明代表1/1、0skip（2.0592ms），没有再跑6/31矩阵、compiler或Browser。 [COS33公共源码审批](https://github.com/lrfluobida/Cosmos/issues/34#issuecomment-5972107850) 已由root发布并精确读回。

Case8执行前最终边界（历史）：新fixedcase8/v2/80与同9inputs/model/caps/五grants¥21/newcase¥5/45分钟/一次repair/shared¥150/首30保持，旧七案例和35closed/五真实closure记录认证，COS31/COS32精确marker与source+merge祖先要求保持。源码已批准不表示case8已claim、付费或游戏通过；最终四docs尚待独审，root之后须以最终准确main重新免费preflight/资金/真实coordinator决定并冻结再执行。COS34仍in-progress/open/SOURCE_NOT_READY，无真实用户体验决定；C7原failed/费用5459031/revision1080/closure5及C6 free111与其他审批历史保持，G3/G4未通过。

### Case8 原生单关通过、一次修复与第六笔额度归还

Root在最终准确source `ef4b2ea2bdd9b867cac6fe9797a56257569d663a`完成fresh免费preflight READY，quote `vq1-f700847060460534b768c8d1dd1d5a496a5ef1b58c26b57ea1e9acc75e0eff3b`，22项source approvals、revision1080/费用5459031原样、paid0/no outputs；核对CNY¥5资金/deepseek-flash后执行新C8。UTC窗口`2026-10-03T18:41:12.207Z`→原定`19:26:12.207Z`，实际`18:56:49.704Z`结束、937497ms。76calls精确分为planning1/design9/art19/coding22/repair25，micro费用13588/112966/338470/635051/449517，合1549592/shared7008623，unknown/reserved0、snapshot1413/ledger3；未触80请求/¥5/45分钟上限。

Design/art passed，coding初v1真实browser090 `media.audioStarted-defeat:false`失败，classification code_defect；既有一次semantic repair新建linked attempt，25实际请求/449517 micro-CNY后v2 passed。V2真实buildpass、Edge PID464执行原111计划全部通过/0failed/0skip/errors[]，forcedfalse/exitedtrue；独立reviewer `reviewer-d8fa2e7c-384e-4c69-a374-b92b6ca556fb`、context `review-57ebec92-2203-4f5d-8113-bddb8e2e4924`、attempt `0e2233ce-af05-4653-9e2e-bfd19db5bcec`对同v2 verdict approved。AcceptedAt `2026-10-03T18:56:49.570Z`，准确project为 `registry/candidates/cos20-native-validation-8-game/v2/project`；原v1失败保留，没有平台人工改game。COS10端到端单关主要目标与COS11一次真实有界修复形成实证，完整classic/最终还原目标、G4和实际用户体验仍未证明；G3其余长时/恢复条件待核对，不盲关其他任务。

Nativeexec12527/exit0、Node26584 dead/Edge464 gone、credentialCleared、shared/registryowner absent后root明确解冻，C8 manual consumed。只读预览服务不是model/ledgerwriter，不作为用户已看到或认可的证据，本批未停止它。Root真实closure6于`2026-10-03T19:04:38.225Z`在同sourceef4b应用：quote `vacq1-d14678c03cdc3506c8e8ff97e92ed2acffc27f950d31d5c0c035182b4886045e`，真实coordinator决定 `operator-allocation-closure-b75bf447-5adf-476a-b5cb-fb967fedeb9e`/kind operator_validation_allocation_closure。Revision1413→1414/ledger3，只关闭C8五grants/release19450408、累计40closed/6audits；effectiveallocated109938669→90488261/unallocated40061331→59511739，fee7008623/unknownreserved0不变。Run/tasks/requests/stop/8history/fees/grantamount及旧35closures/5receipts/events prefix全部deepEqual保留；elapsed3515ms/3.515秒、exit0/model0/ownerfree，不清费用、增预算或续跑已消费C8。

[COS10最新C8结果](https://github.com/lrfluobida/Cosmos/issues/11#issuecomment-5972584874)与[COS33 C8/closure6](https://github.com/lrfluobida/Cosmos/issues/34#issuecomment-5972585087)已由root发布并精确读回，C7/C6/C5链接归history。Source20..33原精确marker/source+merge/审批状态保持，actual live组件证据另列；C7原insufficient_evidence不被后来的成功洗掉，C6免费111诊断仍独立于正式native结果。

### COS34 最终用户体验决定源码审批

独审 USER_EXPERIENCE_DECISION_SOURCE_READY 批准 `02243f6362168af9ddef3dcec878e0b10e590899`（父 `dab20b210159617f16279f06a8725159318f5d27`、base `b0af54f31968134b597ecdb53683b110cd6abb03`），唯一merger合入并清推 `5d4d1d478aefce9fcde6254359edee906a551213`，offline-verified-awaiting-live/open。九批准路径无碰撞、字节一致、UTF8/LF/中文保持/diffcheck通过；复用作者五groups/61affected/初次strict7.107秒、取消修复7pure/2.346秒/4path strict6.689秒与独审增量5/5/583ms/zeroFee。联合仅legacy两参数receipt和取消代表1/1、0skip（17.6295ms），未重61/strict/Browser或访问私有状态。

正式generation用户只approve/reject/cancel，host内部绑定准确交付版本/当前report/candidate/attempt与独立review，短owner锁及write-once receipt保留来源；取消传播在commit前无receipt/tmp/lock，commit后准确恢复，旧两参数publisher行为保持。源码能力完成不等于实际用户体验通过；实际human NONE，validation C8不冒充正式generation的体验决定，费用/旧钟/七失败案例与C8接受v2及六closures保持。本轮owned四docs待fresh独审，未合main，不生成或claim新案例。

COS35/36登记时的历史：[COS34公共源码审批](https://github.com/lrfluobida/Cosmos/issues/35#issuecomment-5972864380)已由root发布并精确读回。Root新增并精确读回[COS35/#36](https://github.com/lrfluobida/Cosmos/issues/36)（id5692927967，为通用浏览器host绑定共享验证窗口和角色额度）及[COS36/#37](https://github.com/lrfluobida/Cosmos/issues/37)（id5692928479，绑定运行时推箱子设计与可信鼠标验收计划），native parent实际36children #2–#37/父checkbox已核。两项in-progress/open/SOURCE_NOT_READY，仅owned branch设计/pure TDD；未来marker分别SHARED_VALIDATION_BROWSER_HOST_SOURCE_READY/TRANSFER_DESIGN_BINDING_SOURCE_READY，当前无批准SHA。

COS35 source前置07/08/18/20/23/28/30/32（18 partial source）、COS36 source02/08/14draft/16frozen/18dynamic partial，输出均16/18；依赖是对应源码/冻结契约输入，不以任务closed造循环。沿用COS16原10,000,000 micro-CNY（¥10）/shared¥150/首批¥30及旧times，未新借任务加预算或刷新旧case。Actual transfer仍缺same profile真关进程重开与入口，当前preparation-only；不写游戏/地图到template、不新claim/paid或声称迁移通过，新实际window以后由root声明。C8接受v2、原v1失败/旧七历史、费用7008623/revision1414/40closed/6audits及actualhuman NONE保持；源码/文档最终审查与真实完整classic目标继续分列。

### COS35/COS36 已审平台准备与 COS37 登记

独审 TRANSFER_DESIGN_BINDING_SOURCE_READY 批准 `d862f7747826dd0bc82b80e7fce6c9c04bdce69d`（base5d4d），合入并清推 `dbe86ea42e408f0c32785f98247357a54c185cc6`；六路径字节一致/无碰撞/UTF8LF中文diff通过。复用独审5/5 oracle/restore/suffix/mapv1v2/registry篡改/原README8287bytes前缀与作者6/6（1040.6669ms）/strict6.790秒；联合binding保留六AC、normalbuttons/saved expectations和不可用process checkpoint代表1/1、0skip（409.8785ms），没有新Browser/compiler/matrix。

独审 SHARED_VALIDATION_BROWSER_HOST_SOURCE_READY 批准 `bc352be3e62d02f594f4fed55197b5be921f72e9`（含d5e6链、base5d4d），合入并清推 `e806020d055ea0a1641849154aea971f796b9c2b`；九路径字节一致/无碰撞/UTF8LF中文diff通过。独审增量5groups/7.211秒exit0覆盖合法planning read不需DAG/fee、错role/task/write/toolsource漂移拒绝、错repair role/output不占slot、feedback篡改拒绝后合法codingrepair绑定；作者5pure/3defaults/affectedstrict/修复3REDGREEN及一次完整synthetic修复/评审/promotion证据复用。联合仅合法planning read代表1/1、0skip（266.2969ms），未重5groups/strict/实际Browser。

两任务integrationStatus均offline-verified-awaiting-live/open，实际仍preparation_only/not_executable；原generation defaults保持，T16-05/06尚无真实同profile跨进程重开/迁移结果，新driver、运行时map及真实profile绑定窗口还未执行，不把synthetic fixture当游戏通过。沿用COS16原10,000,000micro-CNY/shared¥150/首30和旧times，C8/closure6/source34及actualhuman NONE原样；只读preview未触。

COS37登记时的历史：Root新登记并精确读回[COS37/#38](https://github.com/lrfluobida/Cosmos/issues/38)（id5696255260，通过隔离profile和同origin验证真实浏览器进程重开），native parent实际37children #2–#38/父checkbox已核。Source08/12/32/36已审components、outputs16/18，in-progress/open/SOURCE_NOT_READY，未来marker PERSISTENT_PROFILE_PROCESS_REOPEN_SOURCE_READY；只设计/自有synthetic temp profiles/browser fixture，不读用户profile/Rootprivate、不reload/storage injection假恢复、不退化默认runner32，不调用model/paid。当前未批Source37，无新ledger/预算续跑/实际window；本批四docs待same reviewer增量，不合未审metadata。

### COS37 隔离 profile 与真实进程重开源码审批

独审 PERSISTENT_PROFILE_PROCESS_REOPEN_SOURCE_READY 批准 `b936020a1abdcd738998d660e7d0b57eb2637be6`（含 `e9912b8376fbcc74b79ebafd289a844dcc5cde8e`、base `dbe86ea42e408f0c32785f98247357a54c185cc6`），唯一merger合入并清推 `3f2a9420acf53a6a62a5b904cf7a73160b14f80a`，offline-verified-awaiting-live/open。12 actual paths字节一致、与35/36无碰撞、UTF8/LF/中文保持/diffcheck通过；独审初始5pure/增量2 context blocker/await、pinnedpolicy字节匹配及作者strict/pure/旧normal/source32证据复用。联合仅pinned blocker before page scripts代表1/1、0skip（5.6615ms），未重复真实Edge/矩阵/compiler。

作者正常fixture Edge27860→29284/default31540正常exit/webm PNG log，SW修复fixture9864→26576正常exit、同profile/origin、four warning，首/重开parent和iframe四register均被阻断，0 SW/controller/request；这些是自有synthetic browser harness fixture，未使用用户profile或Rootprivate，也不是Cosmos生成的迁移游戏。Public默认ctx补同一registration blocker并await，默认source32行为证据保持；真实进程重开capability源码就绪，consumer可用，实际T16迁移仍缺runtime adapter/付费入口及真实profile/window/model生成，T16-05/06实际迁移尚未验收。

C8/closure6及source20..36审批字段保持，八案例/7008623/revision1414/40closed/6audits未变，actualhuman NONE；本批没有新ledger、旧case续跑、Budget追加或实际window，沿COS16原¥10/shared¥150/首30及旧时钟继续平台准备。Preview未触，四docs候选待same reviewer增量，不合未审metadata；完整classic/95/G4及真实用户体验未宣称通过。

### COS38 修正后的运行时输入连接登记

COS38登记时的历史：Root实时REST已精确读回[COS38/#39](https://github.com/lrfluobida/Cosmos/issues/39)（id5696791572，最终title“COS-38 连接运行时关卡设计与固定角色输入”），native parent实际38children #2–#39/父checkbox已核。Public web仍缓存旧完整adapter标题/正文，匿名REST限额；本次只按root最后REST校验的最终input-adapter scope登记，不采用旧完整consumer实现边界。Source35/36/37已审对应源码、16 frozen contract、18 partial source，outputs16/18，in-progress/open/SOURCE_NOT_READY，未来marker TRANSFER_RUNTIME_INPUT_ADAPTER_SOURCE_READY。

本项规划前四outputs、runtime map oracle、冻结两版本plan、稳定origin、current-candidate plan选择/依赖字节与完整ExecutionRequirement+stage连接；保持真实Human确认来源或Validation operator/case/window/source/hash，无fake confirmedBy/后改输入。Persistent/media实际consumer、machine phase facts/diagnostics接线、design semanticrevision及actualentry留后继；未接consumer的prep-candidate仍failed insufficient_evidence，不能fallback/promotion，本项不启用design semanticrepair。零paid，不改真实八cases/ledger/caps、COS16原¥10/shared¥150/首30及旧时钟，迁移与human仍NONE。

[Source35公共审批](https://github.com/lrfluobida/Cosmos/issues/36#issuecomment-5977191130)、[Source36公共审批](https://github.com/lrfluobida/Cosmos/issues/37#issuecomment-5977191367)、[Source37公共审批](https://github.com/lrfluobida/Cosmos/issues/38#issuecomment-5977191638)已由root POST并精确GET；Source37保留完整e9912b8376fbcc74b79ebafd289a844dcc5cde8e链。其他37对象及C8费用7008623/revision1414/40closed/6audits、原v1失败/七历史/C6free111/source34 actualhuman NONE不变；四docs候选待独审，未合main/触preview或私有状态。

COS39登记时的历史：Root后继[COS39/#40](https://github.com/lrfluobida/Cosmos/issues/40)已POST+GET精确读回：id5696864882，记录持久浏览器失败事实并保守分类；native parent实际39children #2–#40/父checkbox已核。Source32/37已审对应源码，outputs16/18后续actual consumer，in-progress/open/SOURCE_NOT_READY，未来marker PERSISTENT_FAILURE_FACTS_SOURCE_READY。只受控phase/error packet/persistent raw/evidence/ownedexit核对与probe保守聚合复用Source32，四source/test路径+计划，不改Source38 host/binding/wrapper，不连接media/actualentry，不新增修复权限；legacy/坏facts/unknown/deadline/cancel/binding/exit不足保留insuff，early真实settled mismatch可code_defect但series仍failed、不造未执行witness。

COS38/39审批前文档边界（历史）：本批最终39计数与新38/39卡/映射一起待独审；两项都未READY，零paid/private/preview，原八案例/7008623/revision1414/40closed/6audits、source20..37审批与actualhuman NONE保持，COS16原¥10/shared150/首30和旧times不变。不等新源码、不开新窗口，最终consumer/machinefacts接线/designsemanticrevision/actualentry仍分别准备，未接consumer不得fallback/promote。

### Source38/39 输入连接与失败事实源码审批

独审 PERSISTENT_FAILURE_FACTS_SOURCE_READY 批准 `47d82443838cdf713ef08ff91811ca7bd4d735eb`（含573450e858d740380694fb3cef6673b6754cccbf），合入并清推 `bf6d78d124a6977ea5fc2fd7ca37e4dfe8c9f0be`。五路径字节一致、无38碰撞、UTF8/LF/中文/diffcheck通过；strict schema关闭nested exception.sourceURL coercion，独审增量2/2/0skip（3074.0187ms）、作者12probe/17jointpure/strict证据复用。联合仅nested exception类型/declared fields分类代表1/1、0skip（140.2498ms）；未Edge/大matrix/重复compiler。[公共审批](https://github.com/lrfluobida/Cosmos/issues/40#issuecomment-5977698439)已由root POST+GET精确读回。

独审 TRANSFER_RUNTIME_INPUT_ADAPTER_SOURCE_READY 批准 `03772ff0561de97a4ada0689c03b71bf10f7503f`（含5ca2d8e6f9c66b23df02f8607bed88bb760e7d9b、base8b6f），合入并清推 `5d7a99217c2448be74d2c6cb18280d8abeac4e8c`；12路径字节一致、无39碰撞、UTF8/LF/中文/diffcheck通过，早期frozen输入P2已关闭。独审2/2/0skip/exit0（17.029秒）、作者19initial/default3/strict及增量4tamper/normal5/5/v1v2group1/1/strict证据复用，fullgate沿原TaskJournal signatures、不新schema。联合仅当前候选v1/v2计划/deps准备绑定一组1/1、0skip（13965.4067ms），未再scope/tamper矩阵、Edge或compiler。

两source integrationStatus均offline-verified-awaiting-live/open，输入固定/失败事实为preparation_only，未形成实际迁移或人类体验。未连接persistent/media consumer、machinephasefacts/diagnostics入口时必须failed insufficient_evidence、不fallback/promote；design semanticrevision/有界语义修复与actual paid entry仍待后继。C8/closure6/source20..37、八历史/7008623/revision1414/40closed/6audits/humanNONE与COS16原¥10/shared150/首30/旧时钟保持，Preview和真实ledger/key未触。当时COS40尚未发布，不预登记任务号/READY；后续真实登记见下，本批只有四docs候选待独审。

[Source38公共审批](https://github.com/lrfluobida/Cosmos/issues/39#issuecomment-5977815615)与[Source39公共审批](https://github.com/lrfluobida/Cosmos/issues/40#issuecomment-5977698439)均由root POST+GET精确读回。Root现已真实登记[COS40/#41](https://github.com/lrfluobida/Cosmos/issues/41)（id5697434114，接通持久浏览器与生成媒体的完整验收），native parent实际40children #2–#41/父checkbox已核，in-progress/open/SOURCE_NOT_READY，未来marker TRANSFER_PERSISTENT_MEDIA_CONSUMER_SOURCE_READY；source35..39已审代码+16 frozen/18 partial、outputs16/18，不要求完整任务closed。

本项可信host opt-in consumer接actualcandidate build/originalorigin/八段persistent/Source39diagnostics及media readonly样本union，loadedFrame max非sum、boolOR带witness；提前冻结真实taskIds兼容legacyDefault，不改IR/200steps/sixAC，沿原OwnedWork envelope/controller tickets/PIDbeforeCDP。Exact独立review/proof/promote与唯一codingrepair v2同map期望绑定；坏packet/null/env/缺exit一律insuff，健康全系列false可codingdefect，defaultprepared failed/no fallback保留。Design semanticrevision与actual paid entry继续后继，本项0paid、不改真实fees/八cases/window/denominator/humanNONE，COS16原¥10/shared150/首30不变；源码40未READY、实际迁移未开始。

四docs最后候选统一40当前计数（含spec任务卡行）、38/39源码批准双SHA和40真实登记，旧其他37task对象及C8/closure6/7008623/revision1414/40closed/6audits/actualhuman NONE保持，不触source/preview/private/paid，不合未审metadata。

### COS41 原设计会话的有界语义反馈登记

COS40源码批准前的COS41登记（历史）：Root真实REST POST/GET精确读回[COS41/#42](https://github.com/lrfluobida/Cosmos/issues/42)（id5697722881，在原设计会话中提供有界语义反馈），native parent实际41children #2–#42/父checkbox已核。Phase design-approved-awaiting-COS40-source/open/SOURCE_NOT_READY，未来marker TRANSFER_DESIGN_FEEDBACK_SOURCE_READY；source07/23/38/40对应源码stage、outputs16/18，40尚QA/pure未独批，真正41code须等40source独审merge，不用完整taskclosed造循环。当前只有只读设计方案批准，无source/reviewed/merge SHA，本批sole merger仍唯一合入main。

同原design session可信hostTools validate-transfer-design及grant/maxcalls/fee/deadline/session/attempt不变；firstinvalid一次rewrite process、secondinvalid永久exhausted、firstpassseal、samebytesidempotent，started无result恢复保守。Mutable审计仅design、无params任意路径，capture成功receipt/sealedbytes/source/inputs/task/attempt/provenance；无tool或afterseal改map不得推进downstream。Generic说明可完善，不扩readonlycorrection/codingrepair/TaskAttempts/factory/orchestrator/provider/ledger/caseSchema，不新paid/window/预算，沿COS16原¥10/shared150/首30及formal200/12原契约。

COS41登记时文档边界（历史）：四docs当前41计数（含spec任务卡行），原40对象、八cases/费用7008623/revision1414/40closed/6audits、C8closure6/source20..39/C6free111/actualhuman NONE原样；Source40仍未READY、41待source40，源码40owned branch/Preview21628/真实ledger/key未触。候选待case6独审，不合未审metadata。

### COS42 原 COS16 预算组登记

COS42源码批准前登记（历史）：Root真实POST/GET及原生parent精确读回[COS42/#43](https://github.com/lrfluobida/Cosmos/issues/43)（id5698140786，将迁移验证绑定到原COS16预算组），parent实际42children #2–#43/父checkbox已核。Source02/03/20/24已审对应component、outputs16/18，in-progress/open/SOURCE_NOT_READY，未来marker VALIDATION_COS16_GROUP_SOURCE_READY；只读设计已批准、14必要src闭包后实施，当前无core审批或live ledger upgrade。后续actualentry尚未发布，不占新任务号。

本项declaration3/validationledger4/snapshot3保留旧v1v2/ledger1..3/八cases/六audit解释；Root独有实际核对父COS-16 allocation10m/无entry/committed0，本作者不读private、不猜legacy84,596,040。Derived五roles初向量planning.4/design1.2/art2.8/code2.8/repair2.8合¥10，delegation append-only、父row/amount不改/directparentdispatch禁；原子task/case5/group10/first30/shared150守卫，group committed=settled+reserved含unknown。Capacity raw-allclosures-derivedNet，derivedNet childalloc-childclosure，父10bucket保留、不加预算；childclosure只恢复组capacity，下一例精确剩余grant不能再领10。必要新groupclosure quote不重写旧六receipts，settleoverrun保真停，不扩财政platform/provider/factory/scheduler/requestmeta/ownedcommand/transferhost。

COS42登记时的边界（历史）：预算core独立40/41，当时source40未approved/41wait40/42NOTREADY，公开COS16 CLI仍待验、internaloperator不fakehuman；零paid，旧41task对象、C8/closure6/费用7008623/clock/caps/eight history/40closed6audit/actualhuman NONE原样。当时42计数含spec任务卡行，四docs候选待独审；未触preview、真实ledger/key或新窗口，未自行升级实际snapshot。

### COS40 可信 persistent/media consumer 源码审批

独审 TRANSFER_PERSISTENT_MEDIA_CONSUMER_SOURCE_READY 批准 `6192b92efdf106941963ecdda2b66a3a34d2cddd`（含 `7d59adc57cb14beb93c632b36c7881dd45b7c5b6`、base5d7a），合入并清推 `ea0971b2c1605000e86d7f7fd552aac715880339`，offline-verified-awaiting-live/open。16批准路径字节一致、无group预算42 source碰撞、UTF8/noBOM/LF/中文/diffcheck通过；独审codingOrigin.requirement+reservedexpectedArtifacts P2修复代表1/1/0skip（12.347秒）、输出ref tamper/strict/原7runtime146.354秒/媒体8/binding2/default2/prep/envelope/promotionrepair/唯一PhaserQA2/2（3.530秒）证据复用。联合只media witness union（loadedFrame max/boolOR/readonly）代表1/1、0skip（4.3296ms），未完整链/146s/Phaser/重开/compiler。

Source42批准与41启动前边界（历史）：[Source40公共审批](https://github.com/lrfluobida/Cosmos/issues/41#issuecomment-5979024302)已由root POST+GET精确读回。批准仅可信source consumer及synthetic证据，不是实际COS16/model生成/付费入口或human通过；prepared默认failed/no fallback、原IR/200steps/sixAC及唯一codingrepair权限保持。41前置source40已具备、只读设计已批准，实施待Root启动，尚无source41批准SHA；42仍独审未批/未真实ledger upgrade，剩余有界design语义反馈/原预算组准入/actual paid entry与公开CLI待验证。

当前42计数不变，其他40task对象及C8/closure6/source20..39/7008623/revision1414/40closed6audit/actualhuman NONE原样，COS16原¥10/shared150/首30与formal200/12不变。Preview/ledger/cases/key未触，四docs source40审批候选待same reviewer，未合metadata或启动新window。

### COS42 原预算组源码审批与 COS41 实施启动

独审 VALIDATION_COS16_GROUP_SOURCE_READY 批准 `851020833c044cafa419245a08e467db3873951b`（base `340bc04d2ce6f186d4bdbd2bb0041b7fed057b56`），唯一merger合入清推 `6b94b31725e341d5c4116bdc16d25ce775adf1a5`，offline-verified-awaiting-live/open。18批准paths/14src字节一致、与40无sharedfile碰撞、UTF8/LF/中文/diffcheck通过；独审2/2/0skip（840.0559ms）验证multi3case累计旧auditprefix/creditoversum拒/父bucket一次、overcharge保真stop及其他admitted settle/cancel/drainowner release，作者new12/legacy15/strict6.8899秒证据复用。联合仅groupcapacity父bucket一次/禁direct parent reservation代表1/1、0skip（5.6162ms），未全/root编译/矩阵/Phaser/真实ledger。

[Source42公共审批](https://github.com/lrfluobida/Cosmos/issues/43#issuecomment-5979094810)与[Source40公共审批](https://github.com/lrfluobida/Cosmos/issues/41#issuecomment-5979024302)均由Root POST+GET精确读回。预算组能力是source-only，实际旧Root未升级、无groupdelegation/claim/新feeWindow，旧v1v2/ledger1..3/snapshot3/八cases/六receipts的解释与实际费用7008623不变；group父10m保留、不扩大预算。Code41已由Root正式从EA approved40 source启动专属cos02 branch onlyhosttools/files/pure实现，in-progress/open/SOURCE_NOT_READY，无批准SHA，不budget/main。

当前42计数和原其余40task对象、C8 nativeaccepted/v1失败/8consumed/closure6/1414/40closed6audit/humanNONE、完整原分母和COS16原10m/shared150first30/原Clock保持；公开CLI、设计有界反馈和actual entry仍待验证，当时Source43入口尚未发布，不占任务；现后续登记见下。保留3a152未审40审批链后安全合入已审新sourceMain到owned docs，统一候选待same reviewer，不合metadata、不触preview/private/key，不实际升级或测试账本。

### COS43 固定迁移原生入口与准入登记

COS43登记时的历史：Root真实POST+GET精确读回[COS43/#44](https://github.com/lrfluobida/Cosmos/issues/44)（id5698693292，提供固定迁移案例的原生运行入口与准入），parent原生实际43children #2–#44/父checkbox已核。Phase design-approved-awaiting-COS41-source/open/SOURCE_NOT_READY，未来marker TRANSFER_NATIVE_ENTRY_SOURCE_READY，无批准源SHA/livecase。Source20..42 components精确marker/双SHA/source祖先要求保留；41 cold-cache receipt-chain P2未Ready，不提前code/hostprepare/receipt/claim，40/42已审，COS14draft16frozen仅scope不closed循环，outputs16/18为partial internaloperator，不fakeCOS18真实human前门/不关闭原COS16public要求。

固定新cos20-transfer-validation-1/decl3/quote2/case5m45min80calls1codingrepair+41same-sessionsemantic1、五derivedgrant400k/1.2m/2.8m/2.8m/2.8m合原parentCOS16 10m/shared150first30；requirements六T16+2stages/.preparation/topbudgetGroup，template无map/path/game/art/humanfake，oldCase8 wrapper/bytes/AC unchanged。Old closure只认证各自oldcurrentCase.declaration hash、旧六bytes不rewrite；fresh只读preflight八consumedstopped/current8/unknownreserved0/40closed6audit/feeclock/source/noowner/newroot-marker absent，不消费。Groupclaim原子ledger3→4+newcase/delegation，无独立upgrade-only；nativebootstrap新planningID/runOwnedNode/ownedcaptures/withPreparation planner及validatedtasks/executionreceipt/DAG nativeroles、production无sessionFactory、原journal/oneRepair/effectivefinish，全部actual八段/media/process/indepreview/promotion/SDKledger clock真实报告，不humanconfirmed。

COS43实施启动前边界（历史）：仅source preparation，实际账本Root独有，全部source/docs ready finalmain后Root freshfreepreflight/balance/route/operator才执行；code43尚未起，无模型/费用/新case/窗口，旧42对象与C8/closure6/7008623/1414/40closed6audit/clock/caps/actualhuman NONE原样，当前43计数含spec任务卡行。只新transferfiles+oldvalidationidentity窄seam，不patch算法；本批四doc候选待case6独审，不合未审metadata，preview/key/private未触。

### Source41 设计反馈源码审批与 Source43 入口实施

独审 TRANSFER_DESIGN_FEEDBACK_SOURCE_READY 批准 `8e5c69746b26efd41e7e3f28180c72db695a140d`，合入并清推 `6450f43188a8a8cfb9b986defe7631675aab6c22`，offline-verified-awaiting-live/open。九批准路径字节一致、与budget42/main文档无碰撞、UTF8/noBOM/LF/中文/diffcheck通过；samebytes cache/time/cold-chain三P2关闭，独审firstOnly冷恢复1/1（9.059秒）/no additional rolecall，作者同bytes/time/unknown/exhausted/strict/encoding证据复用。联合仅stopped author不能读取cold cached pass代表1/1、0skip（973.7454ms），未完整consumer/矩阵/Edge/compiler。

[Source41公共审批](https://github.com/lrfluobida/Cosmos/issues/42#issuecomment-5979614161)已由Root POST+GET精确读回。43注册时41未ready为历史；Root已正式从clean6450 source启动cos43_implementer，43 in-progress/open/SOURCE_NOT_READY，无sourceSHA/livecase/ledgerupgrade/pay。实际执行仍须自身独审与finalmain/source祖先/预算组/原时钟/未知费用/owner/rootmarker准入，内部operator不fakeHuman；原设计SDK session/grant/maxcalls/deadline/attempt和唯一codingrepair权限不变。

保留已独审4eb登记链后安全同步已审Source41 main，再仅四docs追加41 sourceReady与43实施状态，当前43计数含spec任务卡行；原其他41task对象、C8/closure6/7008623/1414/40closed6audit/clock/caps/actualhuman NONE与完整原分母保持，Preview/private ignored内容未触，无新paid/window。候选待同records43reviewer增量，未合metadata。

参考界面观察：通过 computer-use 正常启动用户提供的游戏，窗口标题为 `Plants vs. Zombies GOTY`。窗口截图在一次刷新重试后仍超时，可访问文本仅包含窗口控件，未取得菜单或玩法证据；不将启动成功写成参考验收通过。本次打开的窗口已用正常关闭快捷键关闭并核实。

参考观察补充（协调者已完成，未重跑）：`2026-10-01T18:20:50Z` 开始时无游戏窗口，root 启动后得到窗口 `18351992`，只读控件焦点为 0；Tab 触发焦点变化后 capture 仍报 `window capture timed out`，刷新 binding 再试仍同错。正常 Alt+F4 后窗口列表为空；未获得游戏画面或玩法证据，安装与素材未改，reference catalog 保持原样与未冻结状态。

## 第 1 轮：根问题与回答

1. **产品边界（已确认）**：可扩展的 2D 游戏 agent，以类《植物大战僵尸》为首个完整能力验收目标。
2. **还原目标（已回答）**：百分百还原原版核心玩法与内容规模；美术原创且可简化；角色对应关系可辨识；界面布局大体相似。具体版本、模式清单和数值精度继续展开。
3. **一句话的含义（已确认）**：开始时集中提问确认，之后自主执行，仅遇预算或关键决策问题时暂停；做好 harness engineering。
4. **资源约束（历史回答）**：最初提出 48h；最新采用 ¥200/12h。质量 > 成本 > 速度；RTX 3060 6GB；可考虑云端；指定 DeepSeek v4.1 Flash。
5. **GitHub 落点（已确认）**：[lrfluobida/Cosmos](https://github.com/lrfluobida/Cosmos)。

## 第 2 轮：回答

6. **平台（已确认）**：Windows 命令行 Cosmos，浏览器游戏与源码。
7. **时限（已更新）**：正式单次生成验证硬上限 12h，包含修复、自动验收、打包和启动检查。
8. **预算（已更新）**：验证合计 ¥150、正式单次硬上限 ¥200；80% 提示。优化目标 ¥100/6h。
9. **复用（已确认）**：允许通用模板，游戏专属实现由 Cosmos 生成。
10. **模式（已确认）**：经典 PC 版主要内容全纳入，GOTY 新增项另列。
11. **精度（已确认）**：机制和内容完整覆盖，关键数值对齐并规定容差；原作偶发 bug 单独排除。

## 第 3 轮：回答

- **Q8（已更新）**：验证 ¥150，正式单次 ¥200。
- **Q12（已更新）**：12h 硬停止，交付当前版本和差距，等待用户决定是否续跑。
- **Q13（已确认）**：背景音乐和关键音效；无角色配音和片尾 MV。
- **Q14（已确认）**：自动验收加用户最终试玩确认体验，不要求逐任务人工验收。

## 第 4 轮：参考依据与最终定稿

- **Q15（已确认）**：用户会准备可运行的经典 PC 参考版本，基准任务记录具体版本并观察核对。
- 独立审查及修订复核已通过；采用更新后的约束和实施默认值，按已有请求发布主 issue 与子任务。

## 第 5 轮：成本与时长二次穿刺

- 用户认为 ¥800 和 48h 仍高，要求重新评估；之前的额度不再作为待直接定稿方案。
- 已识别旧估算缺少 token 工作量、资产分解与关键路径测量。
- **最终选择（已确认）**：用户选择硬上限 ¥200/12h，以 ¥100/6h 为优化目标；完整生成是否达标仍需验证。
- 建议先在现有 ¥150 验证总额中，安排累计最多 ¥30 的工具、机制、美术与故障修复探针；费用、吞吐、废稿与返工用于决定新上限。
- 用户提供 API Key 后，已在临时进程环境执行共享 ¥10 上限的接口与局部规则探针；31 次调用估算 ¥0.721771，待核对预留为零，费用计入 ¥150 总额。
- 默认 high 配合 8,192 输出 token 上限出现截断；low 与关闭推理也出现实际缺陷或接口不匹配。已明确契约，完成一次真实失败的定向修复及简单视觉验证；详细记录保留全部失败。

## 定稿与实施前置

- 按 spec v1.0 的实施路线、范围、验收默认值、计时定义和任务拆分推进；依据真实验证处理具体技术缺口。
- 用户准备经典 PC 参考版本；模型与美术服务的凭据在执行付费验证前通过环境配置提供。
- 内容名册、关键数值、实际服务能力和美术路线由有界验证任务产出，不冒充已经实测。

## 更新约定

- 将调研事实、方案建议和用户已确认决策分别标清。
- issue 发布后补充真实链接；有验收证据后才将任务标为完成。
- 记录待解决问题及其依赖，供后续子代理获取必要上下文。
