# COS-01：本机僵尸初始化 HP 的静态指令证据

2026-10-02。本次保存少量初始化指令样本及版本绑定的只读采集器，供独立评审和后续规则核对使用。COS-01 仍为 230 项、221 项待核实，未冻结；catalog、accepted 状态及验收分母未改。这是静态赋值证据，没有运行观测，不证明最终有效 HP、合计耐久或死亡阈值。

参考文件为 `C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe`，大小 3,838,152 字节，SHA-256 为 `c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d`。既有 FileVersion `1.2.0.1073`、ProductVersion `GOTY` 来自 [reference.json](../../benchmarks/classic-pc/reference/reference.json) 中该指纹绑定的元数据记录；采集器重新核 SHA，不解析版本资源。

本机 PE32 的 Machine 为 `0x14c`、magic 为 `0x10b`、ImageBase 为 `0x400000`。`.text` 的 RVA 为 `0x1000`、文件起点为 `0x400`、raw size 为 `0x308600`，在该段内 `VA = 文件 offset + 0x400c00`。前轮只读研究将首选 VA `0x557c90..0x559b34`（右端不含）、文件 offset `0x157090..0x158f34` 的代码区间高置信对应到 `Zombie::ZombieInitialize`；方法名称与区间用途属于源码推导，EXE 没有在本轮提供该符号。

[static-health.json](../../benchmarks/classic-pc/reference/static-health.json) 只保存 17 处短指令样本，包含原始字节和位置；没有复制完整函数。`immediateStores` 从已检查的指令操作数读取目标对象 offset 与立即数，成员名称及角色类型另放在 `sourceInference` 中。

| 文件 offset / 首选 VA | 原始指令字节 | 静态操作数观察 | 固定源码推导 |
| --- | --- | --- | --- |
| `0x1570b1` / `0x557cb1` | `33f6` | `xor esi,esi` | 初始零寄存器 |
| `0x157299` / `0x557e99` | `89b3dc000000` | `[ebx+0xdc] = esi` | shield 初始清零 |
| `0x15729f` / `0x557e9f` | `89b3d0000000` | `[ebx+0xd0] = esi` | helmet 初始清零 |
| `0x157350` / `0x557f50` | `c783c80000000e010000` | `[ebx+0xc8] = 270` | 默认 body 基础 HP |
| `0x1573d6` / `0x557fd6` | `c783d000000072010000` | `[ebx+0xd0] = 370` | type 2 路障的 helmet 基础 HP |
| `0x157436` / `0x558036` | `c783dc0000004c040000` | `[ebx+0xdc] = 1100` | type 6 铁门的 shield 基础 HP |

这些不是单独数字匹配。前轮在 `.text` 里筛选直接 DWORD immediate 写入的 opcode、目标 offset `0xc8` 和值 270，此编码条件下只有一处；现有 `objdump.exe` 的只读反汇编进一步显示该区间的 prologue、初始化字段、类型分支和共同尾部。VA `0x557fa5` 的 `83f902753b` 比较 type 2，VA `0x558025` 的 `83f9067526` 比较 type 6，随后分别到对应装备赋值。ESI 清零与 register store 的零值解释沿用前轮反汇编及源码关联，采集器不进行寄存器数据流分析或执行指令。

VA `0x557f6a` 的 `e851fcffff` 调用目标为 `0x557bc0`。目标代码在 VA `0x557bc5` 计算 `type × 7`，再以四字节比例读取并返回地址 `0x7696d8 + type × 28`，同时比较该记录的首 DWORD 与 type。`0x7696d8` 对应已定位的本机 [僵尸定义表](2026-10-02-static-zombie-definitions.md)，因此初始化区间与类型表有直接机器码连接。采集器从相对 call operand 算目标，并核对短 helper 样本中的表地址，不重新搜索或采集整张定义表。

尾部样本 VA `0x559a4a..0x559a7a` 中，读取 `+0xd0/+0xc8/+0xdc` 后分别写入 `+0xd4/+0xcc/+0xe0`，与 helmet/body/shield 的三个 max-health 字段对应。正常返回指令位于 VA `0x559b11`，尾部断言路径至 `0x559b33`；采集器只验证已列短样本，不声称穷尽该区间的控制流。

固定源码来自作者项目 `Patoke/re-plants-vs-zombies` 的 commit `c4692036c5e11d227c8fb7c593b734dac96da028`：[Zombie.h 成员 offset](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Zombie.h#L132)、[ZombieInitialize 入口](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Zombie.cpp#L87)、[初始零值和基础 HP 分支](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Zombie.cpp#L152)、[定义查询](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Zombie.cpp#L71)、[max-health 复制](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Zombie.cpp#L877)。前轮源码严格 UTF-8 读取，只在内存中处理。源码注释的 GOTY 地址 `0x5329a0` 不适用于本机；本机位置通过操作数、类型分支、定义表调用及复制关系共同定位。

body、helmet 和 shield 是不同基础字段，不能把这几个值直接相加作为已验证耐久。后续类型和模式分支可覆盖或缩放字段，例如固定源码的 [模式处理](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Zombie.cpp#L849)；本轮未穷尽这些分支。伤害、受伤规则、死亡阈值、速度、目标选择、交互、经典版与本机 GOTY 等价性仍待核对，未因基础赋值相同改为已验收。

采集命令（Node.js 22.22.2，Windows）：

```powershell
node .\benchmarks\classic-pc\reference\static-health.mjs 'C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe'
```

采集器要求显式文件路径，按唯一获准 SHA 拒绝未知 build，检查 PE32、段和文件范围，再按本机地址核对短指令样本。只向 stdout 输出 JSON，没有写文件、联网、执行参考 EXE 指令或调用 objdump 的能力；作者显式保存本次 stdout 为数据文件。实施复用前轮定位结果，没有重做完整 `.text` 唯一性搜索、objdump 研究、植物 318 项或僵尸 170 项对照。

实施验证：17 个样本匹配既有调查的字节，立即数为 270/370/1100，definition call 目标与表地址一致；EXE 在采集前后的 SHA、size、mtime、ctime 不变。小型临时未知 build 输入被拒绝（exit 1、stdout 为空）；保存 JSON 与采集 stdout 完全一致。三个新文件重新以严格 UTF-8 读取，检查 LF、中文及实际 diff。未改其他参考文件，未运行根 build/typecheck 或旧套件；没有游戏/UI、调试注入、写内存、PAK、UTF-16LE 文本、userdata、资产、session、凭据或真实费用账本操作。本次新增付费调用为零。
