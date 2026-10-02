# COS-01：本机僵尸定义表的静态基础值证据

2026-10-02。本次新增只读采集器和版本绑定的原始数据，供独立评审及后续规则核对使用。现有 COS-01 记录仍为 230 项、221 项待核实，未冻结；本次没有改动 catalog、验收分母或 accepted 状态，也没有游戏运行证据。

参考文件为 `C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe`，大小 3,838,152 字节，SHA-256 为 `c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d`。既有 Windows 版本元数据记录为 FileVersion `1.2.0.1073`、ProductVersion `GOTY`，见 [reference.json](../../benchmarks/classic-pc/reference/reference.json)。采集器重新核对指纹；版本字符串沿用该指纹绑定的既有记录，不解析版本资源。

本机原始字节观察：PE 起点 `0x100`，Machine `0x14c`，PE32 magic `0x10b`，ImageBase `0x400000`。`.data` 的 RVA 为 `0x364000`、文件起点为 `0x362a00`、raw size 为 `0xf800`。僵尸定义表位于文件 offset `0x3680d8`、RVA `0x3696d8`、首选 VA `0x7696d8`，每条 `0x1c`（28）字节，七个 little-endian DWORD。

前一轮只读研究在 `.text`、`.rdata`、`.data`、`.rsrc` 的文件支持区间内按 4 字节对齐搜索：首条 `+0x00=0`、`+0x08=1`、`+0x0c=1`、`+0x10=1`、`+0x14=4000`，并检查后续七条 type ID 为 1..7、stride 为 `0x1c`。这些匹配条件下只有一个候选；继续读取后得到连续 ID 0..33，共 34 条，全部 `+0x18` 地址值落在文件支持的 `.rdata` 内。表区间为 `[0x3680d8, 0x368490)`，末条起点 `0x368474`；下一位置原始词为 `[2,4,7,3,15,21,12]`，不再延续 ID。这里复用已经通过的定位证据，采集器固定读取该版本的地址，不重新搜索整个 EXE。

[static-zombies.json](../../benchmarks/classic-pc/reference/static-zombies.json) 保存 34 条、每条七个无符号 32 位原始词及文件 offset。字段名称、角色标识及用途来自固定源码的结构推导；原始 `table.rows[].words` 与 `sourceInference` 分开记录。没有解码任何名称指针指向的文本。

| 记录内 offset | 源码推导字段 | 证据与限制 |
| --- | --- | --- |
| `+0x00` | `mZombieType` | 实际 ID 0..33，与源码类型枚举对齐 |
| `+0x04` | `mReanimationType` | 原始值已保存，未做动画枚举数值对照 |
| `+0x08` | `mZombieValue` | 已做源码数值对照；不是生命值证据 |
| `+0x0c` | `mStartingLevel` | 定义表基础值；不是实际出现关卡证据 |
| `+0x10` | `mFirstAllowedWave` | 定义表基础值；不是实际波次组成证据 |
| `+0x14` | `mPickWeight` | 定义表基础权重；不是实际出怪概率证据 |
| `+0x18` | `mZombieName` | 只检查指针范围，未解码指向文本 |

以下标识为源码推导，七词为本机原始 DWORD 观察：

| type / 源码标识 | 文件 offset | 原始七词 |
| --- | --- | --- |
| 0 / ZOMBIE_NORMAL | `0x3680d8` | `[0,21,1,1,1,4000,7578272]` |
| 19 / ZOMBIE_YETI | `0x3682ec` | `[19,92,4,40,1,1,7577944]` |
| 32 / ZOMBIE_REDEYE_GARGANTUAR | `0x368458` | `[32,55,10,48,15,6000,7577852]` |
| 33 / ZOMBIE_ZOMBATAR | `0x368474` | `[33,21,1,1,1,0,7577828]` |

结构与类型依据固定在作者项目 `Patoke/re-plants-vs-zombies` 的 commit `c4692036c5e11d227c8fb7c593b734dac96da028`：[Zombie.h 第 404–415 行](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Zombie.h#L404)、[Zombie.cpp 第 20–55 行](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Zombie.cpp#L20)、[ConstEnums.h 第 1347–1392 行](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/ConstEnums.h#L1347)。前轮研究严格以 UTF-8 读取这三个文件，只在内存中处理，没有复制到游戏工程。

前轮按实际 ZombieType 枚举值对齐，忽略枚举注释中的额外 console 项，得到 34 条定义及 `NUM_ZOMBIE_TYPES=34`。本机 `+0x00,+0x08,+0x0c,+0x10,+0x14` 五列共 34×5=170 项与固定源码零差异。动画枚举定义不在当时限定的三个文件中，所以 `+0x04` 没有参与数值对照；`+0x18` 只验证地址范围。实施阶段复用这轮已经通过的研究结果，没有重新做 170 项对照；采集器不联网，不声称执行了源码对照。

该作者项目沿用旧版反编译并补充 GOTY，见其 [README 来源说明](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/README.md)。源码旁的旧地址 `0x69da80` 不可直接用于本机；本机位置依据实际记录和 PE 段映射确定。源码提供结构与语义线索，不能由项目版本名推定本机 GOTY 与经典版完全等价。

34 条中包含 Zombatar 及特殊头部变体，不能作为经典完整内容或可选单位分母。`mZombieValue` 不作为 HP；startingLevel、firstAllowedWave 和 pickWeight 不替代实际出怪规则。仍待运行或人工核对：生命、伤害、速度、模式选择、实际波次、目标选择、交互及经典版等价性；动画枚举数值语义也未核对。原始 offset 和数值置信度高，字段及角色含义属于源码推导，运行验收和冻结状态保持待核实。

采集命令（Node.js 22.22.2，Windows）：

```powershell
node .\benchmarks\classic-pc\reference\static-zombies.mjs 'C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe'
```

采集器必须接收显式路径，按唯一获准 SHA 拒绝未知 build，再检查 PE32、段和文件范围、固定表边界、type ID 0..33 及名称指针范围。成功仅向 stdout 输出 JSON；错误退出码为 1 且 stdout 为空。作者显式保存本次 stdout 为数据文件，采集器没有写文件功能。

实施验证：实际采集得到 34×7 DWORD；样本 0/19/33 与前轮独立字节观察一致，EXE 在采集前后的 SHA、size、mtime、ctime 不变。小型临时未知 build 输入被拒绝（exit 1、无 JSON 输出）。保存 JSON 与采集 stdout 完全一致；新增三个文件重新以严格 UTF-8 读取，检查 LF、中文与实际 diff。没有改动植物文件，也没有运行根 build/typecheck 或旧套件；没有游戏启动、UI、userdata、PAK、UTF-16LE 文本、资产、模型 API、session 或真实费用账本操作。本次新增付费调用为零。
