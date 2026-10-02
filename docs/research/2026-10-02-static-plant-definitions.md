# COS-01：本机植物定义表的静态基础值证据

2026-10-02。本次新增只读采集器和版本绑定的原始数据，供独立评审及后续数值核对使用。没有改动 catalog、验收分母、accepted 状态或冻结记录；没有游戏运行证据，不能据此宣布经典基准还原通过。

参考文件为 `C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe`，大小 3,838,152 字节，SHA-256 为 `c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d`。既有 Windows 版本元数据记录为 FileVersion `1.2.0.1073`、ProductVersion `GOTY`，见 [reference.json](../../benchmarks/classic-pc/reference/reference.json)。采集器重新核对文件指纹；版本字符串沿用该指纹绑定的既有记录，采集器不解析版本资源。

本机原始字节观察：PE 起点 `0x100`，Machine `0x14c`，PE32 magic `0x10b`，ImageBase `0x400000`，四个段。`.data` 的 RVA 为 `0x364000`、文件起点为 `0x362a00`、raw size 为 `0xf800`。候选表起点为文件 offset `0x36b000`、RVA `0x36c600`、首选 VA `0x76c600`，每条 `0x24`（36）字节，九个 little-endian DWORD。

实际观察到连续 seed ordinal `0..52`，共 53 条；末条起点 `0x36b750`，表区间为 `[0x36b000, 0x36b774)`。调查时下一位置不再延续 ordinal。53 条的 `+0x04` 均为零，`+0x20` 均是落在文件支持的 `.rdata` 内的地址值；首条该值为 `0x72e01c`，对应文件 offset `0x32ca1c`。未解码名称指针指向的文本。

[static-plants.json](../../benchmarks/classic-pc/reference/static-plants.json) 保存全部 53 条、每条九个无符号 32 位原始词及文件 offset。`sourceInference` 与原始 `table.rows[].words` 分开记录：字段名称及角色对应关系来自源码结构推导，不能当作本机运行观测。

| 记录内 offset | 源码推导的字段 | 本轮证据与限制 |
| --- | --- | --- |
| `+0x00` | `mSeedType` | 0..52 连续；与显式 seed enum 对齐 |
| `+0x04` | `mPlantImage` | 全部原始值为 0；指针用途来自源码 |
| `+0x08` | `mReanimationType` | 原始枚举词已保存；未核对完整动画枚举语义 |
| `+0x0c` | `mPacketIndex` | 已参与固定源码数值对照 |
| `+0x10` | `mSeedCost` | 基础费用的高置信推导；有效费用仍需核对 |
| `+0x14` | `mRefreshTime` | 基础计数的高置信推导；未换算成秒 |
| `+0x18` | `mSubClass` | 已对照源码 normal=0、shooter=1 |
| `+0x1c` | `mLaunchRate` | 通用动作计数参数；不是伤害或固定攻击间隔 |
| `+0x20` | `mPlantName` | 原始指针通过段范围检查；角色名由源码推导 |

下表只展示少量定位样本；名称为源码推导，三个数值列为本机原始 DWORD 观察。

| seed / 源码对应角色 | 文件 offset | `+0x10` | `+0x14` | `+0x1c` |
| --- | --- | --- | --- | --- |
| 0 / 豌豆射手 | `0x36b000` | 100 | 750 | 150 |
| 1 / 向日葵 | `0x36b024` | 50 | 750 | 2500 |
| 2 / 樱桃炸弹 | `0x36b048` | 150 | 5000 | 0 |
| 3 / 坚果 | `0x36b06c` | 50 | 3000 | 0 |
| 47 / 玉米加农炮 | `0x36b69c` | 500 | 5000 | 600 |
| 48 / 模仿者 | `0x36b6c0` | 0 | 750 | 0 |
| 52 / SEED_LEFTPEATER 特殊项 | `0x36b750` | 200 | 750 | 150 |

结构与名称依据固定在作者项目 `Patoke/re-plants-vs-zombies` 的 commit `c4692036c5e11d227c8fb7c593b734dac96da028`：[Plant.h 第 302–315 行](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Plant.h#L302)、[Plant.cpp 第 25–79 行](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Plant.cpp#L25)、[ConstEnums.h 第 1042–1097 行](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/ConstEnums.h#L1042)。这些源码均通过严格 UTF-8 检查，只在内存中读取，没有复制到游戏工程。

前一轮只读调查按显式 seed enum 对齐，对照 53 条 × 六个字段（seed、packet index、cost、refresh、subclass、launch rate），共 318 项，结果零差异。初次正则要求逗号后有空格，漏掉源码 `REANIM_TWIN_SUNFLOWER,1` 的一条，导致其后假错位；改为允许零空格并按枚举值对齐后修正。该假错位不是 EXE 与源码差异。本次实现复用已经通过的固定源码对照证据，没有重新做整轮研究；采集器不联网，也不声称自己重新执行了 318 项源码对照。

此项目沿用旧版反编译并补充 GOTY 功能，见其 [README 来源说明](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/README.md)。源码表旁的旧地址 `0x69f2b0` 不可直接用于本机；本机位置通过原始记录匹配和 PE 段映射确定。源码仅为结构和语义线索，基础数值以本机原始字节为观察来源，不能由源码版本名推定经典版与本机 GOTY 完全等价。

53 条定义包含 `EXPLODE_O_NUT`、`GIANT_WALLNUT`、`SPROUT`、`LEFTPEATER` 等特殊用途项，不能作为 53 个可选植物或完整内容分母。模仿者基础 cost 为零不能解释为免费：源码 [GetCost](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Plant.cpp#L5048) 和 [GetRefreshTime](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Plant.cpp#L5139) 有目标植物及模式分支；[动作更新](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Plant.cpp#L938) 有随机量、初始计数和不同动作处理。这些是源码推导线索，尚未证明本机所有分支的运行结果。

仍待运行或人工核对：计数与实际秒数的换算、首次和后续动作节奏、随机范围、模式和升级费用变化、模仿行为、伤害、生命、命中和组合交互，以及经典主要内容与本机 GOTY 的差异。结构、offset 和原始数值置信度高；基础费用和 refresh 的含义为高置信推导；完整玩法及验收状态保持待核实。

采集命令（Node.js 22.22.2，Windows）：

```powershell
node .\benchmarks\classic-pc\reference\static-plants.mjs 'C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe'
```

采集器必须接收显式路径，按唯一获准 SHA 拒绝未知 build，再检查 PE32、段和文件范围、表边界、seed 0..52、零列及名称指针范围。成功仅向 stdout 输出 JSON；错误退出码为 1 且 stdout 为空。作者显式保存本次 stdout 为数据文件，采集器没有写文件功能。

实施验证：实际采集成功，53 条记录完整，样本 0/48/52 的九个原始词与前轮独立 PowerShell 字节观察一致；采集前后 EXE SHA、size、mtime 和 ctime 不变。小型临时未知 build 输入被拒绝（exit 1、无 JSON 输出）。新增三文件重新以严格 UTF-8 读取并检查 LF 与中文；检查实际 diff，只提交这三文件。没有运行根 build/typecheck 或旧套件，没有启动游戏、读取 userdata、解码 UTF-16LE LawnStrings、解析 PAK 美术/音频、调用模型 API 或访问真实费用账本。本次新增付费调用为零。
