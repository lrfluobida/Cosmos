# COS-01：本机植物费用字段的静态消费者证据

2026-10-17。状态：**candidate / deterministic-only，正常输入观察待补**。本记录属于 [COS-01 / #2](https://github.com/lrfluobida/Cosmos/issues/2) 的参考研究；没有新增功能任务或测量准入任务。它补充费用字段与本机代码的关系，不能作为 `verified_for_reference`、参考冻结或完整经典验收通过的声明。

## 1. 复用范围与身份

复用 [10-02 植物定义表研究](2026-10-02-static-plant-definitions.md)、[原始表](../../benchmarks/classic-pc/reference/static-plants.json) 和 [10-15 名称对应](2026-10-15-reference-name-mapping.md)。既有表的 53 条记录、318 项源码对照和名称采集没有重做，也没有重读 UTF-16LE LawnStrings。已有名称证据将本机 type 0 对应到 `PEASHOOTER` / 豌豆射手；这不自动绑定 catalog 的 `PLANT-01` 或其他槽位。

本轮以只读文件句柄核验 `C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe`：大小 **3,838,152 字节**，完整 SHA-256 为 `c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d`，与 [固定参考](../../benchmarks/classic-pc/reference/reference.json) 一致。reference ID 为 `pvz-pc-goty-1.2.0.1073-c04c524c6a37`；GOTY `1.2.0.1073` 的版本标签复用该指纹绑定的既有元数据。

完整 EXE 为身份校验加载到内存；结构研究只检查 PE 结构、必要代码范围和 type 0 的一条原始记录。未启动或附加原程序、读取进程内存、操作 UI、读取存档、提取媒体、修改安装或调用付费服务；没有复制完整 EXE 到其他位置。原生观察通道尚未恢复，本记录不改变这一边界。

## 2. 地址与字段

文件偏移是从文件开头计算的 **0-based 字节偏移**；下文 VA 是 PE 的**首选虚拟地址**，不是实际进程地址。PE32 ImageBase 为 `0x400000`。`.text` 的 RVA / 文件起点为 `0x1000 / 0x400`，所以本文代码范围的 `VA = fileOffset + 0x400c00`。`.data` 的 RVA / 文件起点为 `0x364000 / 0x362a00`。映射定义见 [Microsoft PE 格式说明](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)。

植物表沿用已核对的位置：文件 `0x36b000`、RVA `0x36c600`、首选 VA `0x76c600`，stride `0x24`，每条九个 little-endian DWORD。type 0 的费用候选位于文件 `0x36b010`，四字节为 `64 00 00 00`，整数值为 **100**。本轮只复核该条记录，没有重新抽取整表。

## 3. 新增本机调用关系

下列函数名是固定一手逆向项目与本机局部控制流共同支持的语义推导；原始观察是地址、字节、操作数及跳转关系。源码旧地址不用于定位本机函数，也不据此声称整个 binary 与源码等价。

| 文件范围 / 首选 VA | 本机观察与推导 |
| --- | --- |
| `0x80cd0..0x80d2e` / `0x4818d0` | 表 helper 先检查 type 不超过 52，计算 `type * 9 * 4`，比较记录首 DWORD 与 type，返回 `0x76c600 + type * 36`。对应 `GetPlantDefinition`。 |
| `0x8b240..0x8b2ec` / `0x48be40` | 费用查询候选对应 `Plant::GetCost`。模式值 `0x14/0x18` 的特殊费用比较只涉及 type `7/10/23/54/55`；后续 switch 范围是 type `56..74`，模仿者分支比较 type `48`。type 0 均不匹配，最终调用表 helper，再读取返回记录的 `+0x10`，得到 100。 |
| `0x35860..0x358b9` / `0x436460` | 当前费用查询候选对应 `Board::GetCurrentPlantCost`。先调用基础费用查询，之后只有 type `40..47` 会继续检查模式和加价。type 0 在文件 `0x35892` 的 `75 22` 跳到 `0x358b6`，保留 EAX 的 100 并返回。 |
| `0x25786..0x25799` / `0x426386` | 普通卡槽种植形状的调用方从 cursor 字段取 type/模仿者参数；`0x2578c` 调用当前费用查询，`mov ebx,eax` 保存费用，`0x25793` 调用 VA `0x433f70`，随后检查返回值。前方有免费条件、cursor 类型和传送带形状的守卫；这些名称仍属于局部语义推导。 |
| `0x33370..0x333b4` / `0x433f70` | 资源扣减候选对应 `TakeSunMoney`。成功分支 `sub esi,ebx` 后写回对象字段 `+0x5578`，返回 true；失败分支不执行这处减法。字段的“阳光”语义由源码及上述调用关系推导，没有读取运行时余额。 |
| 文件 `0xb318e` / `0x4b3d8e` | 卡牌绘制形状的消费者调用基础费用查询，随后把返回值传入格式化调用。同一局部还出现当前费用调用 `0xb311d`。没有追踪图鉴入口或取得实际可见文本。 |

源码依据固定为 `Patoke/re-plants-vs-zombies` commit `c4692036c5e11d227c8fb7c593b734dac96da028`：

- [Plant.cpp / GetCost](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Plant.cpp#L5048) 提供基础费用、特殊种子和模仿者分支的语义线索。
- [Board.cpp](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Board.cpp) 中 `GetCurrentPlantCost`、`PlantUsesAcceleratedPricing`、`MouseDownWithPlant`、`TakeSunMoney` 提供当前费用、升级植物无尽加价及扣费关系的线索。
- [SeedPacket.cpp](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/SeedPacket.cpp) 中 `DrawSeedPacket` 区分基础费用和当前费用的显示。它不能证明本机图鉴或卡牌实际显示了该值。

这些源码经严格 UTF-8 解码后仅在内存中查看。费用数值来自本机字节，不把其他 build 的数值直接套到本机。

## 4. 最小只读复核示例

以下 Python 标准库示例只读原 EXE，在内存中核对身份、短 slice 和相对调用目标；不写文件、不运行或附加原 binary。它不是反汇编器，不验证完整控制流或正常输入，也不读取 PAK、名称文本或 318 项旧对照。短指令核对通过只能支持本节限定的静态观察。

```python
from pathlib import Path
import hashlib
import struct

data = Path(r"C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe").read_bytes()
assert len(data) == 3838152
assert hashlib.sha256(data).hexdigest() == (
    "c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d"
)
samples = {
    0x36b010: "64000000",
    0x80cd0: "83f93477368d04c9390c8500c676008d048500c676007446",
    0x8b240: "518b15f89477008b921c09000083fa14740583fa18753c",
    0x8b293: "8d50c883fa12773c",
    0x8b2d7: "83f830750583f9ff75028bc8e8e859ffff8b401059c3",
    0x35860: "5153568bd8e8d65905008bf0",
    0x35892: "7522",
    0x358b4: "8bc65e5b59c3",
    0x25786: "8b4e2c8b4628e8cf0001008bd8e8d8db000084c0",
    0x33380: "3bd87f0c2bf389b778550000b0015ec3",
}
for offset, expected_hex in samples.items():
    expected = bytes.fromhex(expected_hex)
    assert data[offset:offset + len(expected)] == expected, hex(offset)

# This file's .text mapping: preferred VA = file offset + 0x400c00.
calls = {
    0x8b2e3: 0x4818d0,
    0x35865: 0x48be40,
    0x2578c: 0x436460,
    0x25793: 0x433f70,
    0xb311d: 0x436460,
    0xb318e: 0x48be40,
}
for offset, target_va in calls.items():
    assert data[offset] == 0xe8
    relative = struct.unpack_from("<i", data, offset + 1)[0]
    assert offset + 0x400c00 + 5 + relative == target_va, hex(offset)
assert 0x35892 + 2 + struct.unpack_from("<b", data, 0x35893)[0] == 0x358b6
assert struct.unpack_from("<I", data, 0x36b000)[0] == 0
assert struct.unpack_from("<I", data, 0x36b010)[0] == 100
print("Static samples and address arithmetic passed; runtime remains unobserved.")
```

研究阶段七处短字节断言于 `2026-10-17T17:57:52.648751+08:00` 全部通过。文档落盘后实际执行本文示例，身份、10 处短 slice、6 处 rel32、1 处 rel8 及两个表字段断言通过，输出 `Static samples and address arithmetic passed; runtime remains unobserved.`。该例补充模式前缀、switch 范围、两处绘制调用及 type 0 返回跳转；与既有样本重叠的检查不累加为新的玩法通过数。

## 5. 候选范围与剩余缺口

| 字段 | 当前可记录的范围 |
| --- | --- |
| `entryId` | `VALUE-PLANTS` |
| 具体对象 | 本机 `seedType=0 / PEASHOOTER / 豌豆射手`，复用已有静态名称对应 |
| `entityId` | 尚未绑定。`PLANT-01..49` 是候选槽位，不能按 type 或数组顺序自动指定。 |
| 候选指标 / 数值 / 单位 / 容差 | `sun_cost / 100 / sun / exact`；这是待正常观察和独立审查的候选，不是生产 measurement。 |
| 拟观察条件 | 普通种子卡槽种植、合法空格、无免费种植条件、非传送带；排除同时收集阳光等余额变化。 |

**基础费用、显示费用和实际扣费分别成立才分别记录。** 本机两层费用查询对 type 0 的静态路径返回 100；扣减形状的调用关系增加了语义依据，但没有证明玩家已通过正常输入走到该路径。卡牌绘制调用也不证明图鉴入口、可见名称、实际显示值、解锁状态或可用性。未覆盖完整模式分支、其他植物、模仿者、升级价、实际余额和经典版等价性。

成为已核实测量前仍需按 [参考观察契约](../benchmark/observation-contract.md) 完成：

1. 通过正常菜单、卡牌或图鉴操作保存豌豆射手的可见名称、位置与前提，明确绑定一个 catalog 植物对象。
2. 若指标为实际 `sun_cost`，正常选卡并在合法空格种植，保存费用显示和种植前后阳光余额，排除其他收支。若仅观察显示值，指标只能表述为显示费用，不能顺带证明扣费机制。
3. 将正常输入记录与本静态推导整理成可访问、固定版本的两类证据；每类均使用同一 reference ID，并同时覆盖 `VALUE-PLANTS` 和最终植物 `entityId`。本记录不自行为其分配生产证据 ID。
4. 独立评审实际打开原始观察、字节断言和对象绑定，确认事实范围；目录结构校验或 [COS104 单条 consumer](../specs/classic-entry-acceptance.md) 的 SOURCE 通过不能代替该审查。

生产 catalog 的 measurements、230 项分母、221 个待参考条目、provisional/未冻结状态保持不变。COS-01、完整经典生成和最终用户体验均未完成。
