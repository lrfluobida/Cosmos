# COS01：变身茄子图鉴文字补证

2026-10-18。沿用[COS01 / #2](https://github.com/lrfluobida/Cosmos/issues/2#issuecomment-6246535240)，基线 `0553bdb8120ae3708a1d5fd9b93e1c8895d6ae90`；固定数据 `5944074b0b2a6575ddbd6532b7e441e1e8023358` 已独审并集成main。总任务106不变，COS01仍open。

## 显示文字与身份

作者于 `2026-10-18T06:27:29Z` 实际打开未编辑原PNG，先读金色标题“变身茄子”与首段蓝字“变身茄子允许你在同一个关卡使用两份相同的植物！”，再核既有UTF-8 `name-mappings.json` 的typeId48/IMITATER/变身茄子。首段为逐字转录，仅合并图片换行。Root回传独立reviewer先阅图、后核映射的结果与作者一致；这不替代固定diff独审。

用户直接响应同一本机参考图鉴补图请求，来源关联复用该请求/回复上下文与既有固定reference。`observedAt`为实际阅图时间，拍摄时间、点击序列、图鉴格位、档案状态和解锁前提未知；图片本身不证明EXE版本。人工把稳定ID PLANT-49绑定该名称与既有身份，编号不代表图鉴顺序。

## 两条证据

| evidence ID | 类型 | reference sourceRoot内路径 | 覆盖 |
| --- | --- | --- | --- |
| `imitater-almanac-user-card` | normal_input | `evidence/local/imitater-card-85b835860efb.png` | 仅PLANT-49 |
| `imitater-almanac-text-rule` | deterministic_rule | `evidence/imitater-almanac-assertions.json` | 仅PLANT-49 |

原PNG307×462、109746 bytes，SHA256 `85b835860efb54014617651b07cd9ab66a8cb08d1fd7f7673565512a61645ef8`，保全于 `E:/develop/Cosmos/.cosmos/reference-observations/imitater-card-85b835860efb/user-card.original.png`。作者与唯一merger已分别在工作副本和main的既有ignored目录部署同字节原图。图片不入Git、GitHub或生成游戏assets。

[固定JSON](../../benchmarks/classic-pc/reference/evidence/imitater-almanac-assertions.json)保存转录、身份及9项一致性比较，于 `2026-10-18T06:30:09.389Z` 实际执行并全部通过。比较覆盖原图/部署字节、hash、尺寸和已审UTF-8映射的reference/type/key/名称；程序没有OCR或游戏机制验证。本次没有重读UTF-16资源或EXE。

## 验证与边界

本批只补PLANT-49名称及显示说明，不新增数值measurement。图中没有价格或冷却，不用静态0补价格；“两份”不解释成最多种两株。实际选卡、可模仿对象范围、变身时长和具体机制仍未知；下方趣味故事不登记为当前规则。

旧49条measurement、旧证据和其他229条目逐对象保持。现有49候选植物槽位均有名称绑定；目录仍230项、221待核实、9政策、provisional/未冻结，所有植物与VALUE-PLANTS整项仍needs_reference。

`2026-10-18T06:32:10.001Z` 记录的验证结果：原validator exit0（230 entries / 221 unresolved）；`--require-frozen`预期exit1（benchmark is provisional; not frozen）；reference/entry-input现有测试29/29、0失败、0skip（4063.0229ms）。原consumer仍选择旧 `peashooter-almanac-displayed-cost = 100`，捕获两旧文件且hash保持；新PNG/JSON通过其直接路径读取，引用只覆盖PLANT-49。上述对象不变断言通过。作者raw索引位于 `E:/CodexData/.codex/worktrees/cos-05-cli/Cosmos/.cosmos/imitater-admission/verification-index.json`，同目录保存执行脚本与三份原始日志。

无runtime/schema/测试/依赖改动，复用无delta的host/native/类型证据；无TEMP伪数值、模型调用、新费用、实际生成或C16操作。原共享¥150、正式¥200/12h与目标¥100/6h保持。

## 主线集成

`imitater_reference_reviewer` 对固定六文件diff、原图与转录独立复核，结论APPROVED（本批data/docs范围）、无finding。Root批准该数据SHA后，唯一merger `imitater_reference_merger` 快进合入main。

`2026-10-18T06:39:42.511Z` 主线短核验通过：新增PNG与JSON实际可读、只引用PLANT-49，原PNG字节一致，JSON SHA256 `2b67357aec4c1b1438034c858d0c7886654fe41353aef58c319eb512d84f98dc` 与批准版本一致；旧49数值、4证据及229条目逐对象保持。原consumer实际读取旧100及两旧hash，validator exit0、require-frozen预期exit1，原PNG ignored且未跟踪，六文件UTF-8及中文正确。主线私有回执 `.cosmos/imitater-admission/merge-verification-index.json` 保存时间、路径、hash及两份原始日志；作者29/29按无delta复用，未重跑测试整包。COS01仍open、#2直接2/完成2、总任务106及完整冻结边界保持。
