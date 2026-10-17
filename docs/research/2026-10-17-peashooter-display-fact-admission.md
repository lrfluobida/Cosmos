# COS-105：豌豆射手图鉴显示费用准入

2026-10-17。状态：**数据候选待固定提交独审**。计划 `986f5c7db6a9562621fc0c644c3b363200267a97` 经 `reference_cost_evidence_reviewer` 批准 `APPROVED_ADMISSION_PLAN`，Root已授权免费实施。任务为 [COS-105 / #106](https://github.com/lrfluobida/Cosmos/issues/106)，父 [COS-01 / #2](https://github.com/lrfluobida/Cosmos/issues/2) 仍未完成；执行与合并顺序见[计划](../plans/2026-10-17-peashooter-display-fact-admission.md)。

## 1. 本次可核实的事实

用户提供的图鉴卡片直接显示“豌豆射手”“花费：100”“伤害：中等”“恢复时间：短”。本次只登记 `PLANT-01 / almanac_displayed_cost = 100 / sun / exact`。图片直接给出标签“花费”；单位sun来自[已审本机静态费用链](2026-10-17-reference-plant-cost-consumers.md)，不声称图片另有“阳光”文字。

| 项目 | 原始事实、推导与限制 |
| --- | --- |
| 原图 | PNG，112374 bytes、301×456，无变换；SHA256 `802061930a0fa895b52028b197c372ca31581106383e4b84df201f63df9d81f0`。 |
| 来源关联 | 用户直接响应“已指定本机参考游戏→图鉴→豌豆射手”的截图请求。收到的是卡片区域；图片本身不显示EXE版本、完整窗口或图鉴格位。 |
| 固定reference | `pvz-pc-goty-1.2.0.1073-c04c524c6a37`；版本关联依靠请求/回复上下文及已有本机指纹，不从卡片自行推断。 |
| 阅图与拍摄时间 | 作者 `reference_display_fact_implementer` 于 `2026-10-17T11:06:41Z` 实际打开保全PNG并人工读数。`observedAt`指阅图时间；`captureTime: null`。 |
| 输入过程 | 真实过程为请求、用户上传、保全及人工阅图；没有取得点击轨迹，未声称观察鼠标进入图鉴的每一步。 |
| 身份绑定 | 人工把此前未绑定的稳定ID `PLANT-01` 分配给可见豌豆射手，与已有type0/PEASHOOTER名称证据对应。编号不表示图鉴顺序；位置与解锁前提为null。 |
| 分类文字 | “中等”“短”仅保留为可见原文，不推导伤害数值、冷却秒数或射击间隔。 |
| 机制边界 | 没有种植前后余额，不证明实际扣费；没有证明可用性、解锁、完整模式分支或跨发行版等价。 |

独立reviewer已实际看过原图，给出 `APPROVED_VISUAL_DISPLAY_FACT`。该结论允许此窄显示事实的登记准备，不替代本次catalog、文件捕获与固定提交的最终独审。

`PLANT-01` 与 `VALUE-PLANTS` 整项仍为 `needs_reference`。目录仍230条、221待核实、9政策、provisional/未冻结；单条measurement不完成任何整项、COS01、完整经典验收、G4或最终human。

## 2. 原始证据的部署与直接读取

原PNG私有保全于 `E:/develop/Cosmos/.cosmos/reference-observations/peashooter-card-802061930a0f/user-card.original.png`。部署到可信sourceRoot `benchmarks/classic-pc/reference/` 下的 `evidence/local/peashooter-card-802061930a0f.png`，逐字节相等；只新增 `/benchmarks/classic-pc/reference/evidence/local/` Git忽略规则。原图不提交Git、不上传GitHub，也不进入生成游戏assets。

| evidence ID | 类型 | sourceRoot内直接路径 | 同时覆盖 |
| --- | --- | --- | --- |
| `peashooter-almanac-user-card` | normal_input | `evidence/local/peashooter-card-802061930a0f.png` | VALUE-PLANTS、PLANT-01 |
| `peashooter-almanac-displayed-cost-rule` | deterministic_rule | `evidence/peashooter-almanac-displayed-cost-assertions.json` | VALUE-PLANTS、PLANT-01 |

两条证据使用同一reference ID；normal_input直接指向原PNG，确定性证据直接指向[固定断言JSON](../../benchmarks/classic-pc/reference/evidence/peashooter-almanac-displayed-cost-assertions.json)。原 `readClassicEntrySource` 捕获这两个文件的实际bytes，不依赖递归跟随本文链接。

**私有原图是本地运行前置。** 公开克隆不包含该图；可信维护者需要把同hash原件部署到上述安全相对路径。图不存在时原consumer应明确失败，不能造占位PNG、静默略过这条measurement或退回空事实。正常发布由唯一merger在main部署同hash原图后验证；此文不提供下载或上传原游戏媒体的渠道。

私有intake记录SHA256为 `46c9bcbd1dc619853e4bd779ac0703a71b4bd5dc91ed97759ff9e4fa61faefab`，视觉独审记录SHA256为 `087179b684e49cd9d34474f98117dfc438849c3c27b4e9d5582d3e93666da5d0`。公共JSON只保留必要事实与hash；原时间、输入和版本未知边界仍可独立审查。

## 3. 确定性依据与复核范围

于 `2026-10-17T11:08:08.300Z` 执行只读断言并形成固定报告，SHA256 `8887568ba15916573a5849fd7466ffc216fe49ff1c522aa15b6c6d8674ac23e2`。20项比较均依据本次实际读取或明确标为人工抄录的可见字段，报告分别保存actual、expected和计算出的passed。程序没有执行OCR，也不声称程序自行理解图片内容。

- 当前EXE仍为3838152 bytes，SHA256 `c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d`，匹配固定reference。
- 只重新读取必要字段：0-based文件偏移 `0x36b000` 的DWORD为0；`0x36b010` 的四字节为 `64 00 00 00`、little-endian DWORD为100。
- 已有 `static-plants.json` type0的第4号word（从0计）为100；已有 `name-mappings.json` 对应type0/PEASHOOTER/豌豆射手。表、名称映射与静态消费者研究均复用 `f6659a98ca19f6639e73b5a03ea0b42ea6ef7086` 已审字节，报告保留其实际hash。
- 原图读数与静态值相等仅支持本条显示值交叉核对。已审静态研究中的扣减调用关系不等同于本次玩家实际扣费。

未重抽53行植物表、未重做调用链研究、未重读UTF-16 LawnStrings、未启动或附加原游戏。安装目录只读，无凭据/模型/付费操作。断言执行脚本与原输出位于作者worktree的 `.cosmos/cos105-admission/check-static-and-write.mjs` 和 `static-assertions.log`，供独审实际阅读。

## 4. 验证与剩余工作

原结构校验 `node benchmarks/classic-pc/reference/validate.mjs` exit0，输出230 entries / 221 unresolved；`--require-frozen` exit1，明确 `benchmark is provisional; not frozen`。没有改validator或冻结规则。

`2026-10-17T11:09:33.409Z` 的只读实测使用原 `readClassicEntrySource` 和 `selectClassicEntry`：选择 `peashooter-almanac-displayed-cost`、100/sun/exact；`source.files.size=2`，PNG与固定报告hash分别为本记录所列值；reference JSON SHA为 `e5777e648af52b17dd74e63e32466728d4343de1d6d17eb9e4a289b098325bd7`，catalog SHA为 `19237a3c8f6d3b543bf971b70322c790e09fa9d89beb0d575454fa70ea3ef287`。独立TEMP副本只放相同reference/catalog/断言报告、不放PNG，原consumer以ENOENT拒绝，未跳选或降级。脚本为 `.cosmos/cos105-admission/read-consumer-and-missing.ts`，原结果为 `consumer-read.json`。

生产数据增长使旧测试把真实目录误作空/合成输入。只修改获准四个fixture/test：TEMP来源只复制reference/catalog，清除旧证据关联，选定对象明确标为Synthetic plant fixture；空分支显式置空，合成分支写自身证据，不复制私有PNG。原行为断言与runtime保持。

| 检查 | 实际结果与私有raw |
| --- | --- |
| 首次3文件回归 | `node --experimental-strip-types --test tests/runtime/classic-entry-input.test.ts tests/runtime/classic-entry-host.test.ts tests/cli/classic-entry-session.test.ts`：0/40、40失败、0skip、7120.9101ms，`fixture-red.tap`。生产非空使null/未执行断言失败；复制全reference后mkdir evidence触发EEXIST。 |
| 隔离来源后相同回归 | 39/40、1失败、0skip、163135.9055ms，`fixture-green.tap`。唯一 `entry-input` 用例在“保留独立raw”断言失败；原失败报告未被该测试保留，不能确认其根因。 |
| 该失败的独立记录 | 使用原fixture/原断言检查并保存中间报告，1/1、0skip、14351.3621ms，`entry-input-diagnostic.tap/.json`；原persistent与独立entry各调用1次，缺输入被归为insufficient_evidence，独立raw保留。该次失败没有复现，不把通过重跑称为已确认修复其根因。 |
| 原测试定向重跑与共享fixture代表 | `node --experimental-strip-types --test --test-name-pattern='^independent entry-input \|^generic host binds two immutable plans\|^selected production caller writes both policies' tests/runtime/classic-entry-host.test.ts tests/runtime/generic-persistent-host.test.ts tests/runtime/classic-policy-host.test.ts`：3/3、0skip、12279.4975ms，`fixture-affected.tap`。与前述40项重叠，不累加计数；没有为这次重跑再改源码或断言。 |
| 参考validator用例 | `node --test tests/reference/validate.test.mjs` 首次15/16、0skip、222.4266ms，`reference-validator-tests.tap`；Root授权两行修正后16/16、0skip、266.3338ms，`reference-validator-green.tap`。 |
| 生产类型检查 | `npm run typecheck` exit0，`typecheck.log`。 |
| 额外严格测试类型检查 | 四个TS测试文件用 `tsc --noEmit --strict --module NodeNext --moduleResolution NodeNext --target ES2022 --allowImportingTsExtensions --skipLibCheck` 检查，exit2、五诊断；父986的隔离git archive用同一编译器与选项同样exit2，去行列号后输出逐字一致。`test-typecheck.log`、`test-typecheck-baseline.log/.json`；没有新增类型诊断，也没有改既有无关写法。 |

必要范围补充：`tests/reference/validate.test.mjs` 的两个负例原先按kind取第一条证据，现会误改生产证据。交互负例因此真实失败；测量负例仍通过却损坏了错误对象。Root按该证据授权只在两处查找增加 `refs.includes(x.id)`，明确修改addEvidence返回的fixture记录；原断言与validator未改。测试文件均严格UTF-8/LF，中文与其他行保持。

私有证据总索引：作者worktree `.cosmos/cos105-admission/verification-index.json`。这些程序测试的参考来源明确为empty/synthetic fixture，不能代替用户原图的事实证据。最终独审须实际打开原PNG、固定JSON及登记diff；唯一merger还需在main本地部署同hash原图，核原consumer与Git未跟踪后发布。

本次只覆盖参考资料准入和原consumer读取，没有新的runtime/runner行为、native/browser/付费运行或C16操作。既有COS104原生SOURCE证据复用；旧文档中的“measurements为空”是其源码发布时状态。共享¥150含既有¥0.721771、正式¥200/12h、目标¥100/6h保持。
