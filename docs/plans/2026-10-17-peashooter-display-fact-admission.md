# 豌豆射手图鉴显示费用准入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本任务已有专职 implementer、独立 reviewer 和唯一 merger，按以下检查点交接。

**Goal:** 将用户提供的豌豆射手图鉴卡片与已审静态依据整理为一条 `almanac_displayed_cost = 100 / sun / exact` 的参考事实，供 COS104 原 consumer 只读消费。

**Architecture:** 原 PNG 仅部署在同一 reference sourceRoot 的 ignored `evidence/local/`；公开 catalog 直接引用 PNG 和固定 JSON 断言报告。人工将未绑定的 `PLANT-01` 分配给已见豌豆射手及已有 type 0 / PEASHOOTER，保留整项待核实状态；事实准入经固定提交独审后由唯一 merger 发布。

**Tech Stack:** UTF-8 JSON/Markdown、Node.js 22、现有 reference validator、TypeScript `readClassicEntrySource` / `selectClassicEntry`；无新增 runtime 功能。

---

## 固定输入、角色与边界

- 任务：[COS-105 / #106](https://github.com/lrfluobida/Cosmos/issues/106)，id5897622933，原生父 [COS-01 / #2](https://github.com/lrfluobida/Cosmos/issues/2) id5650981929。发布收尾后本卡closed(completed)、父目标子项[x]，父#2仍open；根#1直接100、#2直接1/完成1、总任务105。
- 实施基线：`f6659a98ca19f6639e73b5a03ea0b42ea6ef7086`。implementer `reference_display_fact_implementer` 使用 managed worktree `E:/CodexData/.codex/worktrees/cos-05-cli/Cosmos`、分支 `codex/peashooter-display-fact`；reviewer `reference_cost_evidence_reviewer`；唯一 merger `batch_reference_display_merger`。作者提交、不写main、不push；merger只整合已审SHA。
- 复用 [观察契约](../benchmark/observation-contract.md)、[COS104契约](../specs/classic-entry-acceptance.md)、[已审费用消费者研究](../research/2026-10-17-reference-plant-cost-consumers.md)、[名称映射](../research/2026-10-15-reference-name-mapping.md) 和 [主spec第4B节](../specs/cosmos-spec.md#4b-验收默认值与边界)。Root发布的issue正文为本次完整规格，不新增需求访谈。
- 原图私有保全：`E:/develop/Cosmos/.cosmos/reference-observations/peashooter-card-802061930a0f/user-card.original.png`，112374 bytes，301×456，SHA256 `802061930a0fa895b52028b197c372ca31581106383e4b84df201f63df9d81f0`。同目录 `intake-v1.json` 的SHA256为 `46c9bcbd1dc619853e4bd779ac0703a71b4bd5dc91ed97759ff9e4fa61faefab`。
- Root与reviewer已实际阅图，视觉结论 `APPROVED_VISUAL_DISPLAY_FACT`。作者也已实际打开原PNG：名称“豌豆射手”、花费“100”、伤害“中等”、恢复时间“短”可读。后两项只保留分类原文，不生成数值measurement。
- reference ID固定为 `pvz-pc-goty-1.2.0.1073-c04c524c6a37`。关联依据是用户直接响应“指定本机参考游戏→图鉴→豌豆射手”的截图请求；图片本身不含完整窗口、版本、图鉴格位、点击轨迹或拍摄时间。`captureTime: null`；`observedAt`只记实际阅图/登记时间并注明含义，不冒充拍摄时间。
- 仅准入图鉴显示费用。图片直接显示“花费”；单位sun由已审本机静态费用链支持。实际种植扣费、伤害数值、冷却秒数、可用性、位置、解锁、全模式和全版本等价仍未知。
- `PLANT-01`是人工分配的稳定ID，不是图鉴顺序。`PLANT-01`、`VALUE-PLANTS`均保持 `needs_reference`；230条、221待核实、9政策、provisional/未冻结及完整经典/human未完成保持。
- 0模型、0付费、无UI/native/browser或实际C16操作；不读UTF-16 LawnStrings、不重抽植物表、不重复原native SOURCE。安装目录只读，原图不得进入Git/GitHub或游戏assets。共享¥150含既有¥0.721771，正式¥200/12h、目标¥100/6h保持。

## 文件与职责

| 阶段 | 文件 | 必要变更 |
| --- | --- | --- |
| 计划 | 本文件、`PROGRESS.md`、`docs/specs/cosmos-issues.md`、`docs/specs/github-issues.json` | 固定执行步骤、角色、task105及COS01子任务元数据；其余任务不变。 |
| 数据 | `.gitignore` | 仅增加 `/benchmarks/classic-pc/reference/evidence/local/`。 |
| 数据 | `benchmarks/classic-pc/reference/evidence/local/peashooter-card-802061930a0f.png` | 私有ignored文件，逐字节复制原图；不提交。 |
| 数据 | `benchmarks/classic-pc/reference/evidence/peashooter-almanac-displayed-cost-assertions.json` | 固定人工读数、来源/时间边界、原图hash、当前必要静态断言的实际读值与结果。 |
| 数据 | `benchmarks/classic-pc/reference/catalog.json` | 只绑定PLANT-01有限身份、添加两类证据和一条measurement。 |
| 文档 | `docs/research/2026-10-17-peashooter-display-fact-admission.md` | 事实、推导、未知、私有原图部署要求、复核命令与真实验证结果。 |
| 文档 | `docs/benchmark/observation-contract.md` | 只更新开头“当前没有参考玩法测量结果”的资料状态，契约规则不改。 |
| 必要测试 | `tests/runtime/generic-persistent-host.fixture.ts`、`tests/runtime/classic-entry-input.test.ts`、`tests/runtime/classic-entry-host.test.ts`、`tests/cli/classic-entry-session.test.ts` | 仅在记录真实失败后隔离生产资料与空/合成来源，保留原行为断言。 |
| Root追加授权 | `tests/reference/validate.test.mjs` | 实际15/16暴露按kind误选生产证据；仅两行增加refs.includes(x.id)，固定修改本用例生成的fixture证据。 |

额外文件或runtime修改须先向Root提交具体依据。所有文本写前严格检测UTF-8，保留LF和未涉及的中文；写后复读并检查diff。

### Task 1：提交计划与任务登记

**Files:** 新本计划；修改 `PROGRESS.md`、`docs/specs/cosmos-issues.md`、`docs/specs/github-issues.json`。

- [x] 核验指定worktree干净，从固定基线建立独立分支；完整读任务、契约、相关任务卡和原图。
- [x] 增加COS105计划/登记，核JSON、105个唯一task ID、COS01子任务1、根直接100；旧104个任务除COS01新增child metadata外逐对象保持。
- [x] 运行 `git diff --check` 并复读四文件中文；严格UTF-8/LF及JSON语义对比通过，生产measurements仍为0。
- [x] 提交 `docs: plan peashooter displayed cost admission`。交Root固定SHA，由已有独立reviewer检查完整计划和任务范围。
- [x] 等待计划 `APPROVED` 和Root实施消息后进入Task 2。该检查点是既定独审流程，不重复索取用户授权；此时不改catalog、不改ignore、不部署原图。

### Task 2：部署私有原图与形成确定性记录

**Files:** `.gitignore`、ignored PNG、新 `benchmarks/classic-pc/reference/evidence/peashooter-almanac-displayed-cost-assertions.json`、新研究文档。

- [x] 再打开原图核实可见字段；记录本次实际阅图/登记时间及 `captureTime: null`，正常输入元数据如实写请求→用户上传→人工阅图过程，不补造点击事件。
- [x] 只读核原PNG SHA/bytes/IHDR尺寸及intake SHA；加入唯一ignore规则，复制到同一sourceRoot的 `evidence/local/peashooter-card-802061930a0f.png`。源/目标bytes完全相等后检查Git忽略及未跟踪。

```powershell
git check-ignore -v benchmarks/classic-pc/reference/evidence/local/peashooter-card-802061930a0f.png
git ls-files -- benchmarks/classic-pc/reference/evidence/local/
```

预期：第一条定位新增ignore规则；第二条无输出。不得 `git add -f`，不得上传图片或用假占位代替缺失输入。

- [x] 复用已审静态研究和现有UTF-8 `static-plants.json` / `name-mappings.json`，仅必要只读复核当前EXE身份及type 0/费用字段：3838152 bytes、SHA `c04c524c6a3720bce00b7f2900c61d5810534dabf9926641c12921f53ac29f8d`，文件偏移0x36b000 DWORD=0、0x36b010四字节 `64000000` / DWORD=100。不重跑整表/调用链研究。
- [x] 固定断言JSON记录：referenceId、observedAt及含义、captureTime、PNG实际hash/bytes/width/height、人工读数与reader身份、来源关联依据、type0/PEASHOOTER/豌豆射手映射、固定研究commit/路径、静态实际读值/预期值/比较结果、未知边界。每个机器断言依据实际读取计算，不能硬编码 `pass` 冒充执行；人工可读性声明明确标为人工，不声称OCR或程序理解图片。
- [x] 研究文档解释本地原图输入是生产consumer准入前置，仓库公开克隆没有该图时应报错；给出hash和安全相对位置供可信维护者部署，不嵌入图片、私有对话或原游戏媒体。

### Task 3：最小登记一条measurement并验证原consumer

**Files:** `benchmarks/classic-pc/reference/catalog.json`、`docs/benchmark/observation-contract.md`、新研究文档。

- [x] 给PLANT-01设置可见label/referenceName“豌豆射手”及有限人工绑定说明（type0/PEASHOOTER、位置与解锁未知、ID不是顺序）；保留requirements/status和其他229条。不根据槽位编号自动推导。
- [x] 添加 `peashooter-almanac-user-card`（normal_input，直接PNG路径）和 `peashooter-almanac-displayed-cost-rule`（deterministic_rule，直接JSON路径）。各自referenceId相同、entryIds都是 `["VALUE-PLANTS", "PLANT-01"]`、status为pass；`preconditions`、`steps`、`expected`、`observed`均是非空字符串并含真实过程和未知边界。
- [x] 仅添加以下measurement，`method`补入真实阅图/静态语义及时间边界；`verified_for_reference`在作者分支是待最终独审的登记候选，主线发布须完成Task 5。

```json
{
  "id": "peashooter-almanac-displayed-cost",
  "entryId": "VALUE-PLANTS",
  "entityId": "PLANT-01",
  "metric": "almanac_displayed_cost",
  "status": "verified_for_reference",
  "value": 100,
  "unit": "sun",
  "method": "人工读取固定原PNG的豌豆射手图鉴花费100；sun语义复用已审本机type0静态费用链。截图拍摄时间与逐步点击未知，不证明实际扣费。",
  "tolerance": "exact",
  "evidenceRefs": ["peashooter-almanac-user-card", "peashooter-almanac-displayed-cost-rule"]
}
```

- [x] 观察契约只更新当前资料状态为一条显示费用事实、全目录未冻结；运行原命令并保留退出码：

```powershell
node benchmarks/classic-pc/reference/validate.mjs
node benchmarks/classic-pc/reference/validate.mjs --require-frozen
```

预期：普通结构校验exit0、230/221；require-frozen exit1且包含 `benchmark is provisional; not frozen`。结构通过不替代事实独审。

- [x] 用以下实际脚本运行原只读consumer；把输出保存在私有证据目录并在研究文档记录命令、时间、结果。缺图负例在独立TEMP副本，生产PNG保持原字节。

```powershell
@'
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readClassicEntrySource, selectClassicEntry } from './src/runtime/classic-entry-input.ts';
import { removeOwned } from './src/artifacts/paths.ts';
const source = await readClassicEntrySource();
const selected = await selectClassicEntry();
assert.deepEqual(selected, source.selection);
assert.equal(selected.measurement.id, 'peashooter-almanac-displayed-cost');
assert.equal(selected.measurement.metric, 'almanac_displayed_cost');
assert.equal(selected.measurement.value, 100);
assert.equal(selected.measurement.unit, 'sun');
assert.equal(selected.measurement.tolerance, 'exact');
assert.equal(source.files.size, 2);
for (const record of selected.evidence) {
  assert.equal(createHash('sha256').update(source.files.get(record.path)).digest('hex'), record.sha256);
}
assert.equal(selected.evidence[0].sha256, '802061930a0fa895b52028b197c372ca31581106383e4b84df201f63df9d81f0');
const missing = await mkdtemp(join(tmpdir(), 'cos105-missing-png-'));
try {
  await mkdir(join(missing, 'evidence'));
  await writeFile(join(missing, 'reference.json'), source.referenceBytes);
  await writeFile(join(missing, 'catalog.json'), source.catalogBytes);
  const report = selected.evidence[1];
  await writeFile(join(missing, report.path), source.files.get(report.path));
  await assert.rejects(readClassicEntrySource(missing), /ENOENT|not exist|missing/i);
} finally { await removeOwned(tmpdir(), missing); }
console.log(JSON.stringify({ selection: selected, missingPngRejected: true }, null, 2));
'@ | node --experimental-strip-types --input-type=module
```

预期：只选真实100、两个直接文件均捕获并hash一致；没有PNG的副本拒绝，不跳选、不降为空事实。

### Task 4：只修复资料增长影响的测试夹具

**Files:** 前述四个允许的fixture/test；另按实际失败取得Root授权，修改 `tests/reference/validate.test.mjs` 的两处fixture对象查找。原断言、validator与runtime保持。

- [x] 数据完成后先运行以下受影响测试并保存原始失败，区分生产非空导致的空事实断言失败和复制 `evidence/` 后 `mkdir` 的EEXIST：

```powershell
node --experimental-strip-types --test tests/runtime/classic-entry-input.test.ts tests/runtime/classic-entry-host.test.ts tests/cli/classic-entry-session.test.ts
```

- [x] 如失败，最小隔离TEMP来源：空事实分支显式置 `measurements/evidence` 为空；合成分支显式替换为原synthetic事实和证据，保证创建目录可重复。不得依赖真实私有PNG，不能把真实图片标为synthetic或降低原断言、skip测试。测试标题准确区分empty fixture与production input。
- [x] 重跑相同定向测试；若改共享fixture，再跑直接受影响的最小现有用例。运行 `npm run typecheck` 检查允许的TS改动；无runtime变更，不重跑native或无关全套。原COS104通过证据按无delta复用，结果不相加。

### Task 5：固定数据提交、独审与合并交接

**Files:** 本计划、研究文档、`PROGRESS.md`、任务卡与GitHub映射，按真实进展同步。

- [x] 更新结果：读数、实体关联依据、当前hash及验证输出、失败后修复（如有）、模型0/费用0；明确数据候选待独审。复读中文、`git diff --check`、JSON解析、目录230/221/9、只一measurement及两条证据，并检查原图未跟踪。
- [x] 作者提交数据候选并报告精确SHA、文件清单、命令/退出码/私有raw位置和已知缺口，向Root交接。独立reviewer实际打开原PNG、JSON、diff和consumer文件字节，先核事实/契约后质量；不能以作者摘要或validator0替代审查。若有finding在作者分支修复，再审受影响提交。
- [x] 最终独审批准后，唯一merger整合批准SHA，在main同一sourceRoot部署同hash ignored PNG，复用Task 3只读consumer/缺图拒绝及Git未跟踪检查；只有merger push。私有raw是部署前置，不从公开仓库虚构获取。
- [x] Root发布后更新issue与父checkbox；COS105只按本条显示事实范围完成，COS01/fullclassic/G4/human保持未完成。原实际C16、账本和预算不变。

## 2026-10-17 实施候选与证据

计划 `986f5c7db6a9562621fc0c644c3b363200267a97` 已由 `reference_cost_evidence_reviewer` 独审 `APPROVED_ADMISSION_PLAN`；Root随后批准数据实施。以下保存作者候选阶段的验证记录，作者没有写main或push；最终批准与发布见下一节。事实与命令详情见[研究记录](../research/2026-10-17-peashooter-display-fact-admission.md)，私有证据索引为作者worktree `.cosmos/cos105-admission/verification-index.json`。

- 原PNG与部署件逐字节相等、Git明确ignored/未跟踪；20项本次读取/人工抄录比较通过。报告hash `8887568ba15916573a5849fd7466ffc216fe49ff1c522aa15b6c6d8674ac23e2`，原图hash保持；图鉴显示费用与实体有限绑定之外的未知不变。
- 原validator exit0，require-frozen exit1；原consumer实际选出100/sun/exact并捕获两个直接文件，独立缺PNG副本ENOENT拒绝。catalog230/221/9、PLANT-01与VALUE-PLANTS needs_reference保持。
- 三测试文件首次0/40（7120.9101ms）保留；空/合成来源隔离后39/40（163135.9055ms）。唯一entry-input无raw断言失败未复现，原失败的前置报告未保留，不声称确定根因。独立诊断1/1及原entry-input与共享fixture两健康代表3/3（12279.4975ms）通过，重叠不累加；没有再改其源码或断言。raw为 `fixture-red.tap`、`fixture-green.tap`、`entry-input-diagnostic.tap/.json`、`fixture-affected.tap`。
- 参考validator测试首次15/16（222.4266ms）：交互负例误选真实生产证据；同构测量负例因此产生错误对象假通过。Root授权两行精确限定fixture refs，最终16/16（266.3338ms），无skip，原断言不变；raw为 `reference-validator-tests.tap`、`reference-validator-green.tap`。
- `npm run typecheck` exit0。额外严格测试tsc exit2的五诊断在父986隔离git archive以相同编译器/选项全部复现，去行列后输出一致；没有新诊断，也未修无关类型写法。raw为 `typecheck.log`、`test-typecheck.log`、`test-typecheck-baseline.log/.json`。
- 未改runtime/runner，无native/browser/模型/paid或C16操作，原预算及未完成状态保持。该候选阶段尚未执行最终独审与sole merger在main的部署/验证/发布。

## 2026-10-17 最终批准与主线发布

固定数据 `726fc291fce83701c0eb49011d138444fd4d7f6f` 经 `reference_cost_evidence_reviewer` 独立 `APPROVED_DISPLAY_FACT_ADMISSION`、无actionable finding；Root批准后，唯一merger从已发布计划986f5c7快进合入该固定SHA。main同sourceRoot部署的ignored原PNG与保全件逐字节一致，Git未跟踪；14个集成文件与批准blob逐字节一致。

main于 `2026-10-17T11:25:37.857Z` 执行原 `readClassicEntrySource` / `selectClassicEntry`：100/sun/exact、两个批准hash、230/221/9及两个needs_reference保持；独立缺PNG副本ENOENT拒绝。原validator exit0、require-frozen预期exit1。批准的源码、测试和依赖无delta，作者回归按原范围复用，未重复native或付费验证。主线私有索引 `.cosmos/cos105-admission/merge-verification-index.json` 保存本次部署和读取证据。

数据SHA已push并经远端读回。本卡scoped complete/closed；Root已精确读回[完成评论](https://github.com/lrfluobida/Cosmos/issues/106#issuecomment-6233357668)、#106 closed(completed)、父目标checkbox[x]及#2直接1/完成1，父#2仍open。单条显示事实不完成PLANT-01、VALUE-PLANTS、COS01、fullclassic、G4或human；中间失败与strict既有诊断保持记录。
