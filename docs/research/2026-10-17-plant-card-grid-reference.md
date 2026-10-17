# COS-106：植物卡片网格显示费用

2026-10-17。状态：**数据候选待固定提交独审**。[COS-106 / #107](https://github.com/lrfluobida/Cosmos/issues/107) 直属 [COS-01 / #2](https://github.com/lrfluobida/Cosmos/issues/2)，依赖已完成的 COS105。本批复用其准入和原 consumer；基线为 `9ae22833d4ae39c9a13378a28d60cf4f2f4165cf`。专职作者 `plant_grid_implementer`、独立审阅者 `plant_grid_reviewer`、唯一合并者 `batch_reference_display_merger`。

## 来源与边界

- 用户明确确认“本机参考游戏直接截图”。原 PNG 为417×463、200657 bytes，SHA256 `b1fae4526a9d6f94b5dbd42e20df3545a94d609ae71d49562f38a64b727da888`；未裁剪、未修改。固定 reference 为 `pvz-pc-goty-1.2.0.1073-c04c524c6a37`，关联来自用户确认和已有本机指纹，图片不独立显示版本。
- 作者实际查看原图并先于双方对照保存独立转录（12:14:45Z）；12:15:52Z再次查看原图。独立审阅者也先完成盲读，再交换矩阵；48个费用读数一致。人工阅图时间不是拍摄时间；拍摄时间、具体菜单、点击过程、档案状态、解锁前提、原图鉴位置均未知。
- 图中每卡有图形和费用数字，没有逐卡名称文字。下表名称来自已审 UTF-8 `name-mappings.json`，图形身份由两人分别识别后关联其 key；数值与已有 `static-plants.json` 的 word[4] 交叉核对。没有按图片或静态表顺序推定原图鉴位置，没有重扫 EXE、重抽表或读取 UTF-16 LawnStrings。
- 每项记录为 `seed_packet_displayed_cost / sun / exact`。sun有图片数字旁的太阳符号及既有费用语义研究支持；本次未观察种植前后余额。升级卡显示值也不证明实际总扣费、前置植物或特殊模式费用规则。

## 48条独立转录与静态对照

费用列依次为作者读数 / 审阅者读数 / 既有静态值。图形说明是人工身份关联依据；`r1c1`等只表示该图的行列。稳定ID是本批手工分配：PLANT-01保留原绑定，PLANT-02..48按已确认的图形实体与key绑定。名称沿用本机已有译名，不替换为其它发行版名称。

| 图片位置 | 稳定ID | 既有名称 / key | 图形身份依据 | 费用：作者 / 审阅 / 静态 | 本事实状态 |
| --- | --- | --- | --- | --- | --- |
| r1c1 | PLANT-01 | 豌豆射手 / PEASHOOTER | 绿色单豌豆嘴 | 100 / 100 / 100 | 已核实显示费用 |
| r1c2 | PLANT-02 | 向日葵 / SUNFLOWER | 单个向日葵花盘 | 50 / 50 / 50 | 已核实显示费用 |
| r1c3 | PLANT-03 | 樱桃炸弹 / CHERRY_BOMB | 连枝红色双樱桃 | 150 / 150 / 150 | 已核实显示费用 |
| r1c4 | PLANT-04 | 坚果 / WALL_NUT | 棕色矮圆坚果 | 50 / 50 / 50 | 已核实显示费用 |
| r1c5 | PLANT-05 | 土豆地雷 / POTATO_MINE | 地面土豆与红色触头 | 25 / 25 / 25 | 已核实显示费用 |
| r1c6 | PLANT-06 | 寒冰射手 / SNOW_PEA | 蓝色豌豆嘴 | 175 / 175 / 175 | 已核实显示费用 |
| r1c7 | PLANT-07 | 大嘴花 / CHOMPER | 紫色张嘴锯齿花 | 150 / 150 / 150 | 已核实显示费用 |
| r1c8 | PLANT-08 | 双重射手 / REPEATER | 绿色豌豆嘴与后侧叶冠 | 200 / 200 / 200 | 已核实显示费用 |
| r2c1 | PLANT-09 | 小喷菇 / PUFF_SHROOM | 小型紫色蘑菇 | 0 / 0 / 0 | 已核实显示费用 |
| r2c2 | PLANT-10 | 阳光菇 / SUN_SHROOM | 黄色小蘑菇 | 25 / 25 / 25 | 已核实显示费用 |
| r2c3 | PLANT-11 | 大喷菇 / FUME_SHROOM | 粗大紫色喷口蘑菇 | 75 / 75 / 75 | 已核实显示费用 |
| r2c4 | PLANT-12 | 咬咬碑 / GRAVE_BUSTER | 灰色碑体与上缘齿状枝叶 | 75 / 75 / 75 | 已核实显示费用 |
| r2c5 | PLANT-13 | 迷糊菇 / HYPNO_SHROOM | 彩色螺旋蘑菇帽 | 75 / 75 / 75 | 已核实显示费用 |
| r2c6 | PLANT-14 | 胆小菇 / SCAREDY_SHROOM | 长柄紫色小蘑菇帽 | 25 / 25 / 25 | 已核实显示费用 |
| r2c7 | PLANT-15 | 冰川菇 / ICE_SHROOM | 蓝色冰晶蘑菇帽 | 75 / 75 / 75 | 已核实显示费用 |
| r2c8 | PLANT-16 | 末日菇 / DOOM_SHROOM | 黑灰色大蘑菇帽 | 125 / 125 / 125 | 已核实显示费用 |
| r3c1 | PLANT-17 | 莲叶 / LILY_PAD | 有缺口的圆形绿叶 | 25 / 25 / 25 | 已核实显示费用 |
| r3c2 | PLANT-18 | 窝瓜 / SQUASH | 浅绿色粗壮窝瓜 | 50 / 50 / 50 | 已核实显示费用 |
| r3c3 | PLANT-19 | 三重射手 / THREEPEATER | 三头绿色豌豆嘴 | 325 / 325 / 325 | 已核实显示费用 |
| r3c4 | PLANT-20 | 缠绕水草 / TANGLE_KELP | 深色缠绕水草 | 25 / 25 / 25 | 已核实显示费用 |
| r3c5 | PLANT-21 | 火爆辣椒 / JALAPENO | 红色长辣椒 | 125 / 125 / 125 | 已核实显示费用 |
| r3c6 | PLANT-22 | 地刺 / SPIKEWEED | 贴地褐色尖刺 | 100 / 100 / 100 | 已核实显示费用 |
| r3c7 | PLANT-23 | 火炬树桩 / TORCHWOOD | 顶部燃烧的树桩 | 175 / 175 / 175 | 已核实显示费用 |
| r3c8 | PLANT-24 | 高坚果 / TALL_NUT | 高直棕色坚果 | 125 / 125 / 125 | 已核实显示费用 |
| r4c1 | PLANT-25 | 水兵菇 / SEA_SHROOM | 蓝绿色小蘑菇 | 0 / 0 / 0 | 已核实显示费用 |
| r4c2 | PLANT-26 | 路灯花 / PLANTERN | 植物枝架包围黄色灯体 | 25 / 25 / 25 | 已核实显示费用 |
| r4c3 | PLANT-27 | 仙人掌 / CACTUS | 带刺绿色仙人掌 | 125 / 125 / 125 | 已核实显示费用 |
| r4c4 | PLANT-28 | 三叶草 / BLOVER | 四瓣风扇状绿叶 | 100 / 100 / 100 | 已核实显示费用 |
| r4c5 | PLANT-29 | 双向射手 / SPLIT_PEA | 向两侧的豌豆嘴 | 125 / 125 / 125 | 已核实显示费用 |
| r4c6 | PLANT-30 | 星星果 / STARFRUIT | 黄色五角星 | 125 / 125 / 125 | 已核实显示费用 |
| r4c7 | PLANT-31 | 南瓜头 / PUMPKIN | 橙色空心南瓜壳 | 125 / 125 / 125 | 已核实显示费用 |
| r4c8 | PLANT-32 | 磁力菇 / MAGNET_SHROOM | 红色马蹄磁铁与菇柄 | 100 / 100 / 100 | 已核实显示费用 |
| r5c1 | PLANT-33 | 卷心菜投手 / CABBAGE_PULT | 卷心菜与投掷臂 | 100 / 100 / 100 | 已核实显示费用 |
| r5c2 | PLANT-34 | 花盆 / FLOWER_POT | 棕色花盆 | 25 / 25 / 25 | 已核实显示费用 |
| r5c3 | PLANT-35 | 玉米投手 / KERNEL_PULT | 黄色玉米与投掷臂 | 100 / 100 / 100 | 已核实显示费用 |
| r5c4 | PLANT-36 | 咖啡豆 / COFFEE_BEAN | 棕色咖啡豆 | 75 / 75 / 75 | 已核实显示费用 |
| r5c5 | PLANT-37 | 大蒜 / GARLIC | 白色蒜头 | 50 / 50 / 50 | 已核实显示费用 |
| r5c6 | PLANT-38 | 萝卜伞 / UMBRELLA_LEAF | 伞状绿色叶冠 | 100 / 100 / 100 | 已核实显示费用 |
| r5c7 | PLANT-39 | 金盏花 / MARIGOLD | 白色花瓣与黄色花心 | 50 / 50 / 50 | 已核实显示费用 |
| r5c8 | PLANT-40 | 西瓜投手 / MELON_PULT | 绿色条纹西瓜与投掷臂 | 300 / 300 / 300 | 已核实显示费用 |
| r6c1 | PLANT-41 | 机枪射手 / GATLING_PEA | 多管豌豆嘴与头盔 | 250 / 250 / 250 | 已核实显示费用 |
| r6c2 | PLANT-42 | 双胞向日葵 / TWIN_SUNFLOWER | 同株双向日葵花盘 | 150 / 150 / 150 | 已核实显示费用 |
| r6c3 | PLANT-43 | 多嘴小蘑菇 / GLOOM_SHROOM | 环绕多个喷口的紫色蘑菇 | 150 / 150 / 150 | 已核实显示费用 |
| r6c4 | PLANT-44 | 猫尾草 / CATTAIL | 粉色猫脸与卷尾 | 225 / 225 / 225 | 已核实显示费用 |
| r6c5 | PLANT-45 | 冰西瓜 / WINTER_MELON | 蓝色西瓜与投掷臂 | 200 / 200 / 200 | 已核实显示费用 |
| r6c6 | PLANT-46 | 吸金菇 / GOLD_MAGNET | 黄色马蹄磁铁 | 50 / 50 / 50 | 已核实显示费用 |
| r6c7 | PLANT-47 | 钢地刺 / SPIKEROCK | 灰色岩体与银色尖刺 | 125 / 125 / 125 | 已核实显示费用 |
| r6c8 | PLANT-48 | 玉米加农炮 / COB_CANNON | 横向大玉米炮管与轮座 | 500 / 500 / 500 | 已核实显示费用 |

48条均一致，没有用静态值覆盖模糊读数。本图未见 `IMITATER / 变身茄子`；PLANT-49原样未绑定。48张卡不能代替完整名册闭合。全部植物整项与VALUE-PLANTS继续 `needs_reference`；catalog仍230条、221待核实、9政策、provisional/未冻结。

## 双类证据与本地部署

| evidence ID | 类型 | sourceRoot内直接路径 | entryIds覆盖 |
| --- | --- | --- | --- |
| `plant-card-grid-user-image` | normal_input | `evidence/local/plant-card-grid-b1fae4526a9d.png` | VALUE-PLANTS及PLANT-01..48 |
| `plant-card-grid-displayed-cost-rule` | deterministic_rule | `evidence/plant-card-grid-cost-assertions.json` | 同上，明确列出49个ID |

原图保全来源为 `E:/develop/Cosmos/.cosmos/reference-observations/plant-card-grid-b1fae4526a9d/user-grid.original.png`。作者在同一reference sourceRoot的既有ignored目录部署同字节副本；公开克隆需可信维护者部署该原件，缺图不能造占位或静默略过。本批不改ignore规则，不将图片提交Git、上传GitHub或放入生成游戏assets。唯一merger应在main部署同bytes原图后发布。

[固定断言JSON](../../benchmarks/classic-pc/reference/evidence/plant-card-grid-cost-assertions.json) 保存48条坐标、图形依据、key/type/名称来源、双方读数、静态值和各比较的actual/expected/passed。于 `2026-10-17T12:18:56.516Z` 执行105项确定性比较（48×2条费用比较，加9条原图/已有资料检查），全部通过；程序没有OCR或图像语义识别。报告SHA256为 `2f8c55efdbee4d84a8262ad2e7b5e91be381b19ed4f5a1a55d1af8dd74c41d89`。

复用的名称映射、静态表和费用语义研究hash分别为 `52240eb9b06636903e53913fda14f4968a31e17935f0c3695d7f44d7129cc9c7`、`99b5ff05ddbc05ad144ba333119d74c510f871a1995db620ec2bc394961f4a07`、`4bff414549f9680e153433c6e930806dac921cb7d7565b47f738e7007ae6b4b9`，与已审字节一致。本批未重新证明安装EXE身份。

## 原consumer与受影响验证

生产catalog仅追加48条measurement，总数49，旧 `peashooter-almanac-displayed-cost = 100` 的对象、首位顺序、两条旧证据及PLANT-01整行不变。`2026-10-17T12:19:53.344Z` 实际执行原 `readClassicEntrySource`：生产仍选择旧100，并捕获旧PNG/JSON两个原hash。

独立TEMP来源只选择新 `sunflower-seed-packet-displayed-cost / PLANT-02 / 50 / sun / exact`，原consumer真实捕获新PNG和固定JSON两个文件并核hash。另一个不放新PNG的TEMP来源以ENOENT明确拒绝；生产catalog字节未因代表选择而改变。这仅验证一条新非豌豆射手事实的读取路径，不声称consumer一次验收48条。

| 检查 | 结果 | 本机raw |
| --- | --- | --- |
| `node benchmarks/classic-pc/reference/validate.mjs` | exit0；230 entries / 221 unresolved | validator.log |
| 同命令加 `--require-frozen` | 预期exit1：benchmark is provisional; not frozen | require-frozen.log |
| `node --experimental-strip-types --test tests/reference/validate.test.mjs tests/runtime/classic-entry-input.test.ts` | 29/29通过、0失败、0skip，4224.7997ms | reference-entry-input.tap |
| 旧生产首条 + 新TEMP向日葵 + 缺新图 | exit0；生产100、新代表50、各捕获2文件；ENOENT拒绝 | consumer-read.json / consumer-read.log |

raw总索引为 `C:/Users/26557/AppData/Local/Temp/cos106-plant-card-grid-implementer/verification-index.json`；原转录、断言执行记录、consumer脚本与TEMP来源位置均在其中。部署辅助脚本初次遗漏reference路径前缀导致复制ENOENT，随后修正目标路径；未改原图或旧证据。runtime、validator、测试和依赖均无改动，复用COS105/COS104既有host/native与类型证据；未重复长链路或旧C16。

本卡固定提交仍须独立审阅实际diff，再由唯一merger集成部署；此处不提前记录审查批准或GitHub关闭。仅新增显示事实，不证明实际扣费、冷却、伤害、可用性、解锁、全部模式、完整classic、G4或human。COS01与完整参考冻结仍未完成；0新增模型调用、0新增费用、无新的实际生成。共享¥150（保留此前¥0.721771）、正式¥200/12h与目标¥100/6h不变。
