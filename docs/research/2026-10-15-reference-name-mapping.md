# COS-01：本机资源名称与定义表的静态对应

2026-10-15。参考 ID：`pvz-pc-goty-1.2.0.1073-c04c524c6a37`。本记录将已独立审阅的名称采集结果整理为可复用定位，补充 [资源调查](2026-10-01-reference-resources.md) 与植物、僵尸定义表。名称属于本机静态证据；可见名册、经典版归属、有效玩法和参考冻结仍待核实。

## 1. 来源、授权与身份边界

用户本轮明确允许对 `main.pak` 内 `properties/LawnStrings.txt` 做一次只读 UTF-16LE 解析，提取名称和标识符。原条目的编码与字节保持不变；该授权不扩展到其他非 UTF-8 文本。EXE 中已定位的名称字段按二进制结构读取：53 个植物字段为严格 UTF-16LE，34 个僵尸字段为严格 UTF-8，均有界读取至空终止符。仓库文档和整理后的 JSON 均使用 UTF-8。

采集发生于北京时间 **2026-10-15 00:37:58**，复用既有 PAK 条目定位、PE 段映射及 [植物原始表](../../benchmarks/classic-pc/reference/static-plants.json)、[僵尸原始表](../../benchmarks/classic-pc/reference/static-zombies.json)。以只读句柄读取 PAK，内存 XOR `0xF7` 后严格解码；名称标识符与资源键按完全相等匹配，没有按记忆改名或模糊匹配。

| 来源定位 | 值 |
| --- | --- |
| 安装目录 | `C:\Program Files (x86)\PlantsVsZombies` |
| PAK 条目目录记录偏移 / 长度 | `48,930` / `40` 字节 |
| LawnStrings 数据偏移 / 长度 | `37,881,636` / `109,726` 字节 |
| XOR 后完整条目 SHA-256 | `1c04c11a52e316109e5b92ed1fdc0f8fe8a71f68d4559446e080d83f78e99ac8` |
| 私有审计结果 `.cosmos/reference-name-check-2026-10-15/name-mappings.json` SHA-256 | `d4b3241cabbfca7ff810b022c1f9887e8da8d1debbfd12818df444cb47cc7883` |
| 同目录 `parse-local-names.mjs` SHA-256 | `98de5142921c02afe266482fc6921fdcf68af991e264618047d61f131c7813ea` |

既有 [reference.json](../../benchmarks/classic-pc/reference/reference.json) 记录 EXE 为 GOTY `1.2.0.1073`，历史完整 SHA-256 为 `c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d`。此次没有重新计算完整 EXE 或 PAK 哈希。当前采集核对了文件大小、PE 头/段、87 条定义的 ID 与名称指针；266 个选定读取范围的前后摘要相等，EXE/PAK 的 size、mtime、ctime、birthtime 前后相等。这只证明上述检查范围与记录一致，不能表述为重新证明整文件身份。

## 2. 名称对应与复用方式

[name-mappings.json](../../benchmarks/classic-pc/reference/name-mappings.json) 保存全部 87 条名称指针记录和 167 个选定资源标签，省去私有审计中的重复标签及逐次读取摘要。它是参考证据数据，不是目标游戏内容清单。每条单位记录保留种类、原始 type ID、定义记录偏移、名称指针、名称字段文件偏移、原始键和匹配状态；标签另存原文、行号和字节定位，用 `key` 连接。

所有文件偏移从文件开头按 **0-based 字节**计算；`namePointer` 是 EXE 中记录的首选 VA。`keyLine` 从解码文本第一行按 **1-based 行号**计算。`keyPayloadByteOffset`、`valuePayloadByteOffset` 相对含 BOM 的 LawnStrings 条目开头，`valueByteLength` 为 UTF-16LE 标签字节数；对应 PAK 位置为 `37,881,636 + 条目内偏移`。

| 记录类别 | 原始记录数 | 精确匹配资源键的记录数 | 匹配到的不同键数 |
| --- | --- | --- | --- |
| 植物 | 53 | 53 | 52 |
| 僵尸 | 34 | 33 | 27 |
| 合计 | 87 | 86 | 79 |

| 种类 / type ID | 原始键 | 本机资源标签 | EXE 名称字段偏移 | 资源键行号 / 标签偏移 |
| --- | --- | --- | --- | --- |
| 植物 / 0 | `PEASHOOTER` | 豌豆射手 | `0x32ca1c` | 13 / 340 |
| 植物 / 1 | `SUNFLOWER` | 向日葵 | `0x32ca08` | 19 / 448 |
| 植物 / 48 | `IMITATER` | 变身茄子 | `0x32c5e4` | 303 / 6,172 |
| 植物 / 7、52 | `REPEATER` | 双重射手 | `0x32c98c` | 37 / 786 |
| 僵尸 / 0、26–31 | `ZOMBIE` | 普通僵尸 | `0x338ca0` | 330 / 6,680 |
| 僵尸 / 33 | `ZOMBATAR_FLAG_ZOMBIE` | 未找到同名资源键 | `0x338ae4` | 无 |

`IMITATER` 的本机标签按原文保留为“变身茄子”；既有静态表文档使用的“模仿者”是源码对应说明。共享键不能拆成多个已确认可选角色；未匹配的 Zombatar 字段也不能由其他名称补齐。type ID 和资源顺序均不自动对应 catalog 的 `PLANT-01..49`、`ZOMBIE-01..26` 槽位。

## 3. 资源标签范围与待核实项

LawnStrings 中观察到 **1,072 次键声明、1,071 个不同键**；`CURRENCY_STRING` 在第 7、10 行重复。整理数据仅保留 167 个不同键：83 个单位相关标签、62 个模式相关标签、10 个额外 `I_ZOMBIE_*` 标签、12 个菜单相关键（含 `LOCALE`）。这些分类用于定位，不是角色或模式的验收分母。

- 15 个 `SURVIVAL_*` 标签覆盖五个场景的 NORMAL、HARD、ENDLESS 键；这不证明有 15 个可见或可达生存模式。额外挑战、无尽及 GOTY 标签的实际入口与经典归属仍未知。
- 标签原文及空格保留，例如 `SCARY_POTTER_ENDLESS` 与 `I_ZOMBIE_ENDLESS` 的空格没有规范化。多行 `STORE_UPGRADE_SLOTS` 未导出，保留遗漏原因和定位；没有导出角色介绍等完整创作文本。
- LawnStrings 的 `LOCALE` 为 `English_United States`；旧 `default.xml` 配置为 `Chinese_China`。两者均为静态字段，不能确定实际界面显示语言，`installation.uiLanguage` 仍为 `null`。
- 用户本轮报告游戏已窗口化、主菜单全部模式已解锁；协调代理两次捕获超时，尚无可读画面。这是用户提供的操作状态，不是本次取得的主菜单、图鉴或正常输入证据；本次整理没有重新启动游戏或重复截图。

## 4. 验证与 COS-01 状态

本次整理复用已独立审阅的采集结果：审阅覆盖全部 167 个标签、87 条记录与旧表对应，并抽核 9 处原始字段。落盘后对全部精简记录与审计输入逐项比较，核对键连接、计数、未匹配项、UTF-8、中文和实际 diff。未重读参考安装、重跑采集或复制美术、音频、游戏代码；没有付费 API 调用。

catalog 仍为 **230 项：176 个槽位、45 个要求、9 个已定义验收政策**，其中 **221 项 `needs_reference`**；`provisional`、未冻结，COS-01 未完成。此次没有为槽位填写名称或提升验收状态。可见名册、经典版归属、规则、关键数值、交互、购买/解锁、存档链与完整覆盖仍需正常输入证据和独立审阅；本次名称对应不替代这些工作。
