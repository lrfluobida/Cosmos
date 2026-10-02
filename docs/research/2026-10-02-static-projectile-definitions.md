# COS-01：本机投射物定义表的静态基础值证据

2026-10-02。本次新增版本绑定的只读采集器、原始数据和短指令样本，供独立评审与后续伤害规则核对使用。COS-01 仍为 230 项、221 项待核实，未冻结；catalog、accepted 状态及验收分母未改。普通豌豆的基础字段值 20 不作为最终命中伤害或运行验收证据。

参考文件为 `C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe`，大小 3,838,152 字节，SHA-256 为 `c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d`。既有 FileVersion `1.2.0.1073`、ProductVersion `GOTY` 沿用 [reference.json](../../benchmarks/classic-pc/reference/reference.json) 中该指纹绑定的元数据记录；采集器重新核 SHA，不解析版本资源。

本机 PE32 的 Machine 为 `0x14c`、magic 为 `0x10b`、ImageBase 为 `0x400000`。`.data` 的 RVA 为 `0x364000`、文件起点为 `0x362a00`、raw size 为 `0xf800`；定义表起点为文件 offset `0x36af50`、RVA `0x36c550`、首选 VA `0x76c550`。stride 为 `0x0c`（12）字节，连续 type ID 0..13，共 14 条，每条三个 little-endian DWORD；末条起点为 `0x36afec`，本次采集区间为 `[0x36af50, 0x36aff8)`。

[static-projectiles.json](../../benchmarks/classic-pc/reference/static-projectiles.json) 保存全部 14×3 无符号 32 位原始词及文件 offset。字段名称及角色对应关系放在 `sourceInference` 中，来源是 UTF-8 头文件；没有 cpp 全表数量或数值对照。

| 记录内 offset | 头文件推导字段 | 限制 |
| --- | --- | --- |
| `+0x00` | `mProjectileType` | 连续 ID 与取表指令关联；角色名称来自类型枚举 |
| `+0x04` | `mImageRow` | 只保存本机原始值，未核对图像用途 |
| `+0x08` | `mDamage` | 有记录字段读取指令；不是最终伤害证明 |

| type / 枚举推导 | 文件 offset | 本机原始三 DWORD |
| --- | --- | --- |
| 0 / 普通豌豆 PROJECTILE_PEA | `0x36af50` | `[0,0,20]` |
| 1 / 冰豌豆 PROJECTILE_SNOWPEA | `0x36af5c` | `[1,0,20]` |
| 9 / PROJECTILE_BASKETBALL | `0x36afbc` | `[9,0,75]` |
| 13 / PROJECTILE_ZOMBIE_PEA | `0x36afec` | `[13,0,20]` |

前轮只读研究在 `.data` 内按 4 字节对齐、stride 12 搜索连续 ID 0..13，得到两个候选：文件 offset `0x36af50` 与 `0x36d0c8`。不能只凭连续 ID 宣称唯一。进一步检查 `.text` 内的表地址操作数及现有 `objdump.exe` 反汇编后，以下类型索引、记录首字段比较、返回地址和 `+8` 读取关系绑定到 `0x76c550`；第二候选未获得这组投射物结构关联证据。采集器复用该定位结果，不重新搜索或反汇编。

| 文件 offset / 首选 VA | 原始字节 | 静态指令关系 |
| --- | --- | --- |
| `0x93030` / `0x493c30` | `8b485c` | 从对象 `+0x5c` 读取 type |
| `0x93033` / `0x493c33` | `8d0449` | 计算 type×3 |
| `0x93036` / `0x493c36` | `390c8550c57600` | 比较 `0x76c550 + type×12` 首 DWORD 与 type |
| `0x9303d` / `0x493c3d` | `8d048550c57600` | 返回该记录地址；正常 ret 在 VA `0x493c69` |
| `0x918cf` / `0x4924cf` | `39049d50c57600` | 另一取值区间使用相同 type 与表地址 |
| `0x91949` / `0x492549` | `8b6b08` | 读取该记录 `+8`；之后仍有计算 |

`.text` 的 RVA 为 `0x1000`、文件起点为 `0x400`，以上位置按本机段映射核对。JSON 保存 11 处短指令样本，只覆盖这组必要关系，不复制完整函数。取表方法名 `Projectile::GetProjectileDef` 按头文件声明和机器码用途推导；EXE 未在本轮提供符号，另一取值区间的符号及其是否属于普通豌豆正常命中路径未确认。

语义依据固定在作者项目 `Patoke/re-plants-vs-zombies` commit `c4692036c5e11d227c8fb7c593b734dac96da028`：[Projectile.h 定义结构](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Projectile.h#L15)、[对象 type 字段 +0x5c](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Projectile.h#L41)、[取表方法声明](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/Lawn/Projectile.h#L72)、[ProjectileType 枚举](https://github.com/Patoke/re-plants-vs-zombies/blob/c4692036c5e11d227c8fb7c593b734dac96da028/ConstEnums.h#L781)。前轮这两个文件严格 UTF-8 校验通过。类型枚举的 `NUM_PROJECTILES=14` 与本次 ID 区间相符，但没有完成 cpp 定义表数量与数值对照。旧头文件地址 `0x69f1c0` 不适用于本机。

编码停止边界：前轮固定 commit 的 `Lawn/Projectile.cpp` 严格 UTF-8 解码在 byte offset 4780 的 `BD` 失败，已停止该文件的文本读取。本次未再次读取，也未使用其他编码、网页呈现或替代入口解码；不修改、转码或复制它。缺少 cpp 内容不以记忆补齐，JSON 明确记录 `numericCppComparisonPerformed=false` 和 `ordinaryPeaHitPathObserved=false`。

原始位置、字节与数字是静态观察；字段含义、角色名称和方法名称是头文件关联推导。最终伤害、护甲、倍率、冻结、splash、死亡阈值、速度、目标选择、交互、经典版等价性和运行验收仍待核对。14 条原始记录不能替代完整内容分母。

采集命令（Node.js 22.22.2，Windows）：

```powershell
node .\benchmarks\classic-pc\reference\static-projectiles.mjs 'C:\Program Files (x86)\PlantsVsZombies\PlantsVsZombies.exe'
```

采集器要求显式路径，按唯一获准 SHA 拒绝未知 build，检查 PE32、文件支持的 `.data`/`.text` 范围、14 条 ID 和短指令样本中的表地址。只向 stdout 输出 JSON，没有写文件、联网或执行参考 EXE 指令的能力；作者显式保存 stdout 为数据文件。

实施验证：实际采集 14×3 DWORD 和 11 处短指令，样本 0/9/13 与前轮字节观察一致，表地址及 `+8` 读取字节一致。EXE 在采集前后的 SHA、size、mtime、ctime 不变；小型临时未知 build 输入被拒绝（exit 1、stdout 为空）；保存 JSON 与采集 stdout 完全一致。三个新文件重新严格 UTF-8 读取，检查 LF、中文及实际 diff。未重做全段搜索、objdump、HP 17 处或旧表 318/170 项研究，未运行根 build/typecheck 或旧套件；没有游戏/UI、PAK、UTF-16LE 文本、userdata、资产、凭据、session、真实费用账本或模型 API 操作。本次新增付费调用为零。
