import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { execFileSync } from 'node:child_process';


export async function designCandidateBudget(mode, options) {
  // Complete readonly R3 inputs and actual TEMP budget finalization; only fetch returns synthetic SSE.
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const privateRoot = options.reportRoot ?? await mkdtemp(join(tmpdir(), 'cos137-native-budget-'));
  const r3 = options.sourceRoot;
  const confirmedRoot = options.confirmedRoot;
  assert.ok(['normal', 'correction', 'density6-correction', 'full-quote', 'full-quote-correction'].includes(mode));
  const fullQuote = mode.startsWith('full-quote'), correction = mode.endsWith('correction');
  const density = mode === 'density6-correction' ? 6 : 3;
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const reportDirectory = join(privateRoot, `${stamp}-author-finalization-${mode}`);
  await mkdir(reportDirectory, { recursive: true });
  const local = path => import(pathToFileURL(join(repo, path)).href);
  const { ordinaryHostFixture } = await local('tests/runtime/ordinary-design.fixture.ts');
  const { runProductSession } = await local('src/cli/session.ts');
  const { createBrowserHost } = await local('src/runtime/entrypoint-host.ts');
  const { executeGeneration } = await local('src/runtime/entrypoint.ts');
  const { readConfirmedRequirementsSource } = await local('src/runtime/confirmed-requirements-source.ts');
  const { createPiSession } = await local('src/providers/pi.ts');
  const { BUDGET_FINALIZATION_PROMPT } = await local('src/runtime/repair/author-protocol.ts');
  const { compactCompleteJsonRead } = await local('src/providers/json-read-display.ts');
  const { ModelRuntime } = await local('node_modules/@earendil-works/pi-coding-agent/dist/index.js');
  const originalStreamSimple = ModelRuntime.prototype.streamSimple;
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const sourceModules = ['src/roles/factory.ts', 'src/roles/provider-budget.ts', 'src/roles/author-output-budget.ts',
    'src/providers/pi.ts', 'src/providers/request-input.ts', 'src/providers/workspace-tools.ts', 'src/providers/json-read-display.ts',
    'src/runtime/orchestrator.ts', 'src/runtime/entrypoint-host.ts', 'src/runtime/repair/design-concerns.ts', 'src/runtime/repair/protocol.ts',
    'src/runtime/repair/author-protocol.ts', 'src/runtime/recovery/task-journal.ts',
    'tests/runtime/ordinary-design.fixture.ts', 'tests/providers/design-candidate-review-budget.fixture.mjs'];
  const sourceFingerprints = await Promise.all(sourceModules.map(async path => ({ path, sha256: hash(await readFile(join(repo, path))) })));
  const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const json = async path => JSON.parse(decode(await readFile(path)));
  const put = async (root, name, bytes) => {
    const target = resolve(root, name), rel = relative(resolve(root), target);
    assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, typeof bytes === 'string' ? 'utf8' : undefined);
  };
  const files = [
    'requirements/v2/draft.json', 'requirements/v2/confirmation.json',
    ...['package-lock.json', 'package.json', 'tsconfig.json', 'vite.config.ts'].map(name => `registry/captures/generic-template/v1/files/${name}`),
    'registry/captures/requirement-bundle/v2/files/_cosmos/requirement-draft.json',
    'registry/captures/requirement-bundle/v2/files/_cosmos/user-confirmation.json',
    'registry/captures/design/v1/files/_cosmos/design.json',
    'registry/captures/design/v1/files/_cosmos/acceptance-plan.json',
  ];
  const originals = new Map();
  const materials = [];
  for (const path of files) {
    const bytes = await readFile(join(r3, path));
    originals.set(path, bytes);
    materials.push({ path, sourceBytes: bytes.length, sourceSha256: hash(bytes), lines: decode(bytes).split('\n').length });
  }
  assert.equal(materials.reduce((sum, row) => sum + row.sourceBytes, 0), 170142);
  assert.equal(materials.at(-2).sourceSha256, '3b8d88f2d4a5c8dcd462b7d98b1d7d524c27e5606fc6e64c5710c14132c190dc');
  assert.equal(materials.at(-1).sourceSha256, '6be9ac8755910019a1dc9ca6996a777e1a19c2e8c4352f3b35c1639f4b81e269');
  const sourceAttachments = [];
  for (const name of ['author.json', 'author-correction-started.json', 'author-correction-response.json']) {
    const bytes = await readFile(join(r3, 'journal/task-design-room-game', name));
    await put(reportDirectory, `source-attachments/${name}`, bytes);
    sourceAttachments.push({ source: join(r3, 'journal/task-design-room-game', name), bytes: bytes.length, sha256: hash(bytes), authority: 'Original immutable source attachment only; not a TEMP journal identity.' });
  }
  const sourceAuthor = await json(join(r3, 'journal/task-design-room-game/author.json'));
  const sourceResponse = await json(join(r3, 'journal/task-design-room-game/author-correction-response.json'));
  const sourceOrigin = await json(join(r3, 'journal/task-design-room-game/origin.json'));
  const proposal = sourceAuthor.value.proposal;
  assert.deepEqual(JSON.parse(sourceResponse.value.reply), proposal);
  assert.equal(hash(sourceResponse.value.reply), sourceResponse.value.replySha256);
  assert.equal(proposal.remaining.length, 3); assert.equal(proposal.uncertainty.length, 4);
  const confirmed = await readConfirmedRequirementsSource({ root: confirmedRoot, revision: 2, specVersion: '1.0' });
  assert.deepEqual(confirmed.draftBytes, originals.get(files[0]));
  assert.deepEqual(confirmed.confirmationBytes, originals.get(files[1]));

  const findings = [
    'audio-enable-and-toggle 要求首个正常输入关闭声音；当前 acceptance-plan.json 的首击顺序没有覆盖该约束，必须保留原首击关声场景。',
    'audio-enable-and-toggle 要求每个新文档先核实匹配音频 id 再观测该 key；当前计划的 clip_sfx_collect、clip_sfx_door 观测存在缺口，需补全同 id 的存在性与 decoded 检查。',
    'collect-no-double-count 要求通过正常可见目标输入验证收集和重复点击；当前计划包含隐藏目标点击，必须从真实可点击前置状态执行并核对可见结果。',
    'save-display-and-partial-load-same-session 与 full-3of3-load-and-victory-same-session 要求 0/3 和完整进度读档覆盖；当前计划缺少完整对应输入、存档和可见断言链。',
    'open-door-victory 与 audio-enable-and-toggle 要求成功后继续操作时保持约定音乐状态；当前计划缺少继续后的真实音乐观测，按钮文本不能替代音频证据。',
    'cross-process-partial-load-once 固定唯一跨进程重开及其保存前后状态；当前计划额外重开相关前置约束缺乏原需求依据，必须保留已确认状态和唯一重开次数。',
  ];
  const lifecycle = [], selections = [], admissions = [], settlements = [], transports = [], nativeTools = [];
  const sessionFiles = [], configs = [], controllers = [];
  const authorSelections = [], authorAdmissions = [], authorSettlements = [], authorTransports = [], authorCompaction = [], authorEvents = [], authorSessionFiles = [];
  const authorPressureBytes = 81000;
  const authorPressure = '\n\nSOURCE ONLY: artificial author context pressure to exercise the original budget-finalization path.\n' + 's'.repeat(authorPressureBytes);
  const authorReadPath = 'registry/captures/generic-template/v1/files/package.json';
  let activeActor, latestAuthorAdmission, f, controller, reviewerPacket, latestAdmission, readPaths, fatal, executionResult, cliOutput = '';
  let authorCorrectionStarted, authorCorrectionResponse, authorNativeUnsent;
  const usageAssumption = fullQuote
    ? 'Conservative synthetic usage for every dispatched round: prompt_tokens=production inputBytes, completion_tokens=selected cap, cache=0; each settlement equals its full reservation quote.'
    : `Synthetic nonzero usage sensitivity scenario, not a tokenizer estimate or real provider bill: prompt_tokens=ceil(production inputBytes/${density}), cache=0; tool-call output=2048, every verdict/correction output=4096. Density6 is an optimistic synthetic sensitivity case, not inferred from the real author sample of about 4.125 bytes per input token; it does not replace failed density3 or full-quote scenarios.`;
  const taskBalance = async () => {
    const state = await controller.read(), rows = state.ledger.entries.filter(row => row.taskId === 'cos137-design-source');
    const settled = rows.reduce((sum, row) => sum + row.settledMicroCny, 0), reserved = rows.reduce((sum, row) => sum + row.reservedMicroCny, 0);
    return { revision: state.revision, settled, reserved, unknown: rows.filter(row => row.unknown).length, remaining: 1125000 - settled - reserved };
  };
  const makeVerdict = () => ({
    verdict: 'changes_requested', inputVersions: reviewerPacket.inputs,
    evidenceIds: reviewerPacket.evidence.map(row => row.evidenceId), findings,
    concernResolutions: reviewerPacket.designConcernReview.concerns.map((concern, index) => {
      const host = index === 0 || index === 3, boundary = index === 5 || index === 6;
      const rationale = host
        ? 'COSMOS-DESIGN 的当前最终 _cosmos/design.json 和 _cosmos/acceptance-plan.json 已在本次 capture 后通过实际 host 结构校验；该结果解决最终结构是否再检查的问题，不证明十项 gameplay AC、四项 experience EX 或音频顺序已满足。'
        : boundary
        ? '原确认 requirement-draft.json 的完整 AC/EX 与 task COSMOS-DESIGN 分工要求独立检查最终设计；当前仅完成 SOURCE 假评审协议演练，DOM 下游实现与实际游戏成功未被证明，六条 findings 仍必须修订。'
        : '当前 _cosmos/acceptance-plan.json 的 audio-enable-and-toggle、collect-no-double-count、save-display-and-partial-load-same-session、full-3of3-load-and-victory-same-session、cross-process-partial-load-once 及成功继续步骤仍有上述六项输入顺序、前置状态或音频证据缺口，完整语义与绝对计数不能视为已解决。';
      return { concernId: concern.concernId, concernText: proposal[concern.field][concern.index], status: host || boundary ? 'resolved' : 'unresolved',
        basis: host ? 'host_evidence' : boundary ? 'fixed_input' : 'captured_output', rationale, acceptanceIds: ['COSMOS-DESIGN'],
        inputVersions: host ? reviewerPacket.inputs : boundary ? [reviewerPacket.inputs.find(ref => ref.artifactId === 'requirement-draft')] : [reviewerPacket.inputs.find(ref => ref.artifactId === 'design')],
        evidenceIds: host ? reviewerPacket.evidence.map(row => row.evidenceId) : [], evidenceRefs: host ? reviewerPacket.evidence.map(row => row.source) : [] };
    }),
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
    assert.ok(new URL(request.url).pathname.endsWith('/chat/completions'));
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('authorization'), 'Bearer offline-cos137-native-only');
    if (activeActor === 'author') {
      assert.ok(latestAuthorAdmission && !reviewerPacket);
      const rawBody = await request.text(), body = JSON.parse(rawBody), index = authorTransports.length;
      assert.equal(body.model, 'deepseek-flash'); assert.equal(body.max_tokens, latestAuthorAdmission.maxOutputTokens);
      const user = body.messages.filter(row => row.role === 'user').at(-1);
      const userText = typeof user?.content === 'string' ? user.content : user?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n');
      const finalization = userText === BUDGET_FINALIZATION_PROMPT;
      const phase = finalization ? 'budget-finalization' : index < 2 ? 'ordinary' : 'unexpected-native-turn';
      const record = { round: index + 1, phase, requestId: latestAuthorAdmission.requestId, inputBytes: latestAuthorAdmission.inputBytes,
        cap: body.max_tokens, quote: latestAuthorAdmission.estimatedMaxCostMicroCny, bodyBytes: Buffer.byteLength(rawBody), bodySha256: hash(rawBody),
        bodyFile: join(reportDirectory, `author-http/${index + 1}-body.json`), toolNames: body.tools?.map(tool => tool.function.name) ?? [], lastUserText: userText };
      authorTransports.push(record); await put(reportDirectory, `author-http/${index + 1}-body.json`, rawBody);
      let delta, finish_reason, usage;
      if (finalization) {
        assert.equal(index, 2); assert.deepEqual(body.tools ?? [], []); assert.equal(body.max_tokens, 4096);
        const started = await json(join(f.root, 'journal/task-cos137-design-source/author-correction-started.json'));
        assert.equal(started.value.kind, 'budget_finalization'); assert.equal(started.value.used, 1);
        assert.equal(started.value.unsent.code, 'author_review_reserve'); assert.equal(started.value.originalReply, undefined);
        assert.equal(started.value.unsent.requests, 3); assert.equal(started.value.unsent.maxRequests, 32);
        usage = { prompt_tokens: 29440, completion_tokens: 765, prompt_cache_hit_tokens: 0 };
        delta = { content: sourceResponse.value.reply }; finish_reason = 'stop';
      } else {
        assert.ok(index < 2, 'Unexpected summary or ordinary turn: stop and report; do not disable compaction or change budget.');
        assert.ok(body.tools?.some(tool => tool.function.name === 'read'));
        usage = index === 0 ? { prompt_tokens: 103616, completion_tokens: 4096, prompt_cache_hit_tokens: 0 }
          : { prompt_tokens: 103297, completion_tokens: 4096, prompt_cache_hit_tokens: 25 };
        delta = { reasoning_content: 'SOURCE author retains seeded original outputs and reads the frozen generic package before its original budget boundary.',
          tool_calls: [{ index: 0, id: `author-read-${index}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: authorReadPath }) } }] };
        finish_reason = 'tool_calls';
      }
      usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
      const syntheticCost = Math.ceil((usage.prompt_tokens - usage.prompt_cache_hit_tokens) * 2 + usage.completion_tokens * 8 + usage.prompt_cache_hit_tokens * 0.04);
      assert.ok(syntheticCost <= latestAuthorAdmission.estimatedMaxCostMicroCny);
      assert.ok(usage.completion_tokens <= body.max_tokens);
      Object.assign(record, { usage, syntheticCost });
      const chunk = { id: `offline-cos137-author-${index + 1}`, model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason }], usage };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    }
    assert.ok(reviewerPacket && latestAdmission, 'Only the current native reviewer may reach intercepted fetch.');
    const rawBody = await request.text(), body = JSON.parse(rawBody), index = transports.length;
    assert.equal(body.model, 'deepseek-flash'); assert.equal(body.max_tokens, latestAdmission.maxOutputTokens);
    await put(reportDirectory, `http/${index + 1}-body.json`, rawBody);
    const toolMessages = body.messages.filter(row => row.role === 'tool');
    if (index >= 1) {
      assert.equal(toolMessages.length, readPaths.length);
      for (const [toolIndex, path] of readPaths.entries()) {
        const text = decode(await readFile(join(configs[0].workspace, path)));
        const expected = compactCompleteJsonRead({ content: [{ type: 'text', text }] }, { path }).content[0].text;
        const actual = toolMessages.find(row => row.tool_call_id === `source-read-${toolIndex}`);
        assert.ok(actual, `Missing actual HTTP tool response for ${path}`);
        assert.equal(actual.content, expected, `HTTP tool response altered or truncated ${path}`);
      }
    }
    const usage = { prompt_tokens: fullQuote ? latestAdmission.inputBytes : Math.ceil(latestAdmission.inputBytes / density),
      completion_tokens: fullQuote ? latestAdmission.maxOutputTokens : index === 0 ? 2048 : 4096,
      prompt_cache_hit_tokens: 0 };
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    assert.ok(usage.completion_tokens <= latestAdmission.maxOutputTokens);
    let delta, finish_reason;
    if (index === 0) {
      delta = { reasoning_content: 'SOURCE fixture reads all frozen files and current host evidence before the complete negative verdict.',
        tool_calls: readPaths.map((path, index) => ({ index, id: `source-read-${index}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path }) } })) };
      finish_reason = 'tool_calls';
    } else {
      assert.ok(index === 1 || correction && index === 2, 'No extra native reviewer request is authorized by this fixture.');
      const verdict = makeVerdict();
      if (correction && index === 1) verdict.concernResolutions.pop();
      delta = { reasoning_content: 'SOURCE fake verdict retains all six specification gaps.', content: JSON.stringify(verdict) };
      finish_reason = 'stop';
    }
    transports.push({ round: index + 1, requestId: latestAdmission.requestId, bodyBytes: Buffer.byteLength(rawBody), bodySha256: hash(rawBody),
      bodyFile: join(reportDirectory, `http/${index + 1}-body.json`), maxTokens: body.max_tokens, toolResults: toolMessages.map(row => ({ id: row.tool_call_id, bytes: Buffer.byteLength(row.content), sha256: hash(row.content) })), usage });
    const chunk = { id: `offline-cos137-${mode}-${index + 1}`, model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason }], usage };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  };

  try {
    const hooks = [];
    f = await ordinaryHostFixture({ after: callback => hooks.push(callback), diagnostic() {} }, {
      productionDefault: true,
      sessionFactory: async (config, fallback) => {
        const packet = JSON.parse(config.context);
        if (packet.role === 'cosmos') return { close: async () => {}, prompt: async () => ({ text: JSON.stringify({ tasks: [
          { taskId: 'cos137-design-source', policyId: 'game-design', role: 'design', objective: sourceOrigin.prepared.task.objective, acceptanceIds: ['COSMOS-DESIGN'], dependsOn: [] },
          { taskId: 'cos137-art-source', policyId: 'game-art', role: 'art', objective: 'SOURCE downstream must remain undispatched.', acceptanceIds: ['COSMOS-MEDIA'], dependsOn: ['cos137-design-source'] },
          { taskId: 'cos137-code-source', policyId: 'game-code', role: 'coding', objective: 'SOURCE downstream must remain undispatched.', acceptanceIds: confirmed.draft.acceptance.filter(item => !item.acceptanceId.startsWith('COSMOS-')).map(item => item.acceptanceId), dependsOn: ['cos137-design-source', 'cos137-art-source'] },
        ] }) }) };
        if (packet.role === 'design' && packet.taskId === 'cos137-design-source') {
          await put(config.workspace, 'authors/design/design.json', originals.get(files.at(-2)));
          await put(config.workspace, 'authors/design/acceptance-plan.json', originals.get(files.at(-1)));
          assert.equal(config.maxRequests, 32); assert.equal(config.maxOutputTokens, 32768); assert.equal(config.readonlyMaxOutputTokens, 4096);
          assert.equal(config.ordinaryDesignFinalizationPolicy, 'budget-followup/1');
          assert.equal(typeof config.requestCompaction, 'function'); assert.equal(typeof config.requestCompactionAdmission, 'function');
          await put(reportDirectory, 'author-packet.json', JSON.stringify(packet, null, 2) + '\n');
          const session = await createPiSession({ ...config, systemPrompt: config.systemPrompt + authorPressure, env: { DEEPSEEK_API_KEY: 'offline-cos137-native-only' },
            requestOutputLimit: async (request, signal) => {
              const row = { attempt: authorSelections.length + 1, ...request, before: await taskBalance() }; authorSelections.push(row);
              try { row.selected = await config.requestOutputLimit(request, signal); row.quote = request.inputBytes * 2 + row.selected * 8; return row.selected; }
              catch (error) { row.rejected = { code: error.code, message: error.message }; row.floorQuote = request.inputBytes * 2 + 8192 * 8; throw error; }
            },
            requestCompaction: async (...args) => {
              const row = { kind: 'selection', bounds: args[0] }; authorCompaction.push(row);
              row.result = await config.requestCompaction(...args); return row.result;
            },
            requestCompactionAdmission: async (...args) => {
              const row = { kind: 'admission', bounds: args[0] }; authorCompaction.push(row);
              row.result = await config.requestCompactionAdmission(...args); return row.result;
            },
            budget: {
              beforeRequest: async request => {
                const before = await taskBalance();
                await config.budget.beforeRequest(request);
                const after = await taskBalance(), durable = (await controller.read()).requests.find(row => row.requestId === request.requestId);
                assert.ok(durable.admittedAt); assert.equal(after.reserved, before.reserved + request.estimatedMaxCostMicroCny);
                assert.ok(before.settled + before.reserved + request.estimatedMaxCostMicroCny + 375000 <= 1125000);
                activeActor = 'author'; latestAuthorAdmission = { ...request }; authorAdmissions.push({ ...request, before, after, admittedAt: durable.admittedAt });
              },
              afterResponse: async response => {
                const before = await taskBalance(); await config.budget.afterResponse(response); const after = await taskBalance();
                authorSettlements.push({ ...response, before, after, chargedMicroCny: after.settled - before.settled });
                assert.equal(after.reserved, 0); assert.equal(after.unknown, 0);
              },
            },
          });
          session.subscribe(event => { if (event.type.startsWith('compaction') || event.type === 'agent_settled') authorEvents.push({ type: event.type, reason: event.reason, errorMessage: event.errorMessage }); });
          authorSessionFiles.push(session.sessionFile); return session;
        }
        assert.equal(packet.role, 'reviewer'); assert.equal(packet.taskId, 'cos137-design-source');
        reviewerPacket = packet; configs.push({ ...config, tools: config.tools.map(tool => tool.name) });
        assert.equal(config.maxRequests, 16); assert.equal(config.maxOutputTokens, 8192); assert.equal(config.requestTimeoutMs, 120000);
        assert.equal(config.requestCompaction, undefined); assert.deepEqual(packet.tools, ['read']);
        assert.deepEqual(packet.designConcernReview.proposal, proposal); assert.equal(packet.designConcernReview.concerns.length, 7);
        assert.equal(packet.designConcernReview.authorSources.length, 3); assert.equal(packet.designConcernReview.originalReply, undefined);
        assert.deepEqual(packet.designConcernReview.authorSources.map(row => row.location).sort(), ['author', 'author-correction-started', 'author-correction-response'].map(stage => `journal/task-cos137-design-source/${stage}.json`).sort());
        assert.equal(packet.budget.allocationMicroCny, 1125000); assert.equal(packet.budget.committedMicroCny, 544313);
        assert.equal(packet.evidence.length, 1); assert.equal(packet.evidence[0].outcome, 'passed');
        readPaths = [...files, ...packet.evidence.map(row => row.source.location)];
        assert.equal(readPaths.length, 11);
        for (const path of files) assert.deepEqual(await readFile(join(config.workspace, path)), originals.get(path));
        await put(reportDirectory, 'review-packet.json', JSON.stringify(packet, null, 2) + '\n');
        await put(reportDirectory, 'review-system.txt', config.systemPrompt);
        const session = await createPiSession({ ...config, env: { DEEPSEEK_API_KEY: 'offline-cos137-native-only' },
          requestOutputLimit: async (request, signal) => {
            const row = { attempt: selections.length + 1, ...request, before: await taskBalance() }; selections.push(row);
            try { row.selected = await config.requestOutputLimit(request, signal); row.quote = request.inputBytes * 2 + row.selected * 8; return row.selected; }
            catch (error) { row.rejected = { code: error.code, message: error.message }; row.floorQuote = request.inputBytes * 2 + 4096 * 8; throw error; }
          },
          budget: {
            beforeRequest: async request => {
              const before = await taskBalance();
              assert.equal(before.unknown, 0); assert.ok(before.settled + before.reserved + request.estimatedMaxCostMicroCny <= 1125000);
              assert.equal(request.estimatedMaxCostMicroCny, request.inputBytes * 2 + request.maxOutputTokens * 8);
              await config.budget.beforeRequest(request);
              const after = await taskBalance();
              assert.equal(after.reserved, before.reserved + request.estimatedMaxCostMicroCny);
              const admission = (await controller.read()).requests.find(row => row.requestId === request.requestId);
              assert.ok(admission?.admittedAt);
              activeActor = 'reviewer'; latestAdmission = { ...request }; admissions.push({ ...request, before, after, admittedAt: admission.admittedAt });
            },
            afterResponse: async response => {
              const before = await taskBalance(); await config.budget.afterResponse(response); const after = await taskBalance();
              assert.equal(after.reserved, 0); assert.equal(after.unknown, 0);
              settlements.push({ ...response, before, after, chargedMicroCny: after.settled - before.settled });
            },
          },
        });
        sessionFiles.push(session.sessionFile); return session;
      },
    });
    const prepare = f.host.prepare.bind(f.host);
    f.host.prepare = async (...args) => {
      const result = await prepare(...args);
      for (const name of ['package-lock.json', 'package.json', 'tsconfig.json', 'vite.config.ts']) await put(f.root, `toolchain/${name}`, originals.get(`registry/captures/generic-template/v1/files/${name}`));
      return result;
    };
    f.host.execute = input => executeGeneration({ ...input, createHost: async hostInput => {
      controller = hostInput.controller; controllers.push(controller);
      const host = await createBrowserHost({ ...hostInput, ...f.hostOptions });
      assert.equal(host.ordinaryDesignRevisionPolicy, 'independent-review/2');
      const create = host.roleFactory;
      host.roleFactory = async input => {
        lifecycle.push({ role: input.role, taskId: input.task.taskId });
        if (input.role === 'reviewer') {
          assert.equal(input.task.budget.allocationMicroCny, 1125000);
          assert.deepEqual(authorSettlements.map(row => row.chargedMicroCny), [240000, 239313, 65000]);
          assert.equal(authorAdmissions.length, 3); assert.equal(authorSelections.length, 4);
          assert.equal(authorSelections[2].rejected.code, 'author_review_reserve');
          assert.deepEqual(Object.fromEntries(Object.entries(await taskBalance()).filter(([key]) => key !== 'revision')), { settled: 544313, reserved: 0, unknown: 0, remaining: 580687 });
          authorCorrectionStarted = (await json(join(f.root, 'journal/task-cos137-design-source/author-correction-started.json'))).value;
          authorCorrectionResponse = (await json(join(f.root, 'journal/task-cos137-design-source/author-correction-response.json'))).value;
          assert.equal(authorCorrectionStarted.kind, 'budget_finalization'); assert.equal(authorCorrectionResponse.kind, 'budget_finalization');
          assert.equal(authorCorrectionStarted.originalReply, undefined);
          assert.equal(authorCorrectionResponse.reply, sourceResponse.value.reply);
          assert.equal(authorCorrectionResponse.replySha256, sourceResponse.value.replySha256);
          assert.equal(authorCorrectionStarted.unsent.native.file, authorSessionFiles[0]);
          const native = (await readFile(authorSessionFiles[0], 'utf8')).trim().split('\n').map(line => JSON.parse(line));
          authorNativeUnsent = native.find(entry => entry.id === authorCorrectionStarted.unsent.native.entryId);
          assert.equal(authorNativeUnsent.message.stopReason, 'error');
          assert.equal(authorCorrectionStarted.unsent.requestId, authorSelections[2].requestId);
          assert.equal(native.filter(entry => entry.message?.role === 'toolResult').length, 2);
        }
        return create(input);
      };
      return host;
    } });
    executionResult = await runProductSession({ command: 'new', root: f.root, host: f.host, requirementsFrom: { root: confirmedRoot, revision: 2 },
      limits: { limitMicroCny: 5000000, durationMs: 180000 }, input: Readable.from([]), output: new Writable({ write(chunk, _encoding, done) { cliOutput += chunk.toString(); done(); } }) });
    for (const path of sessionFiles) {
      const native = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      const rows = native.filter(row => row.type === 'message' && row.message?.role === 'toolResult').map(row => row.message);
      assert.equal(rows.length, 11);
      for (const [index, path] of readPaths.entries()) {
        const row = rows.find(row => row.toolCallId === `source-read-${index}`);
        assert.ok(row); assert.equal(!!row.isError, false); assert.equal(row.details?.truncation, undefined); assert.equal(row.content.length, 1);
        assert.equal(row.content[0].type, 'text'); assert.doesNotMatch(row.content[0].text, /\[Showing lines |more lines in file|exceeds .* limit/);
        const source = await readFile(join(configs[0].workspace, path));
        const expected = compactCompleteJsonRead({ content: [{ type: 'text', text: decode(source) }] }, { path }).content[0].text;
        assert.equal(row.content[0].text, expected);
        nativeTools.push({ path, toolCallId: row.toolCallId, sourceBytes: source.length, sourceSha256: hash(source), readBytes: Buffer.byteLength(expected), readSha256: hash(expected), isError: false, truncated: false });
      }
    }
    assert.equal(nativeTools.slice(0, 10).reduce((sum, row) => sum + row.readBytes, 0), 152817);
    assert.equal(nativeTools[8].readBytes, 22636); assert.equal(nativeTools[9].readBytes, 39384);
    assert.ok(admissions.length <= 16); assert.equal(transports.length, admissions.length); assert.equal(settlements.length, admissions.length);
    assert.equal(lifecycle.filter(row => row.role === 'design').length, 1); assert.equal(lifecycle.filter(row => ['art', 'coding'].includes(row.role)).length, 0);
    assert.equal(ModelRuntime.prototype.streamSimple, originalStreamSimple);
  } catch (error) { fatal = { name: error.name, message: error.message, stack: error.stack }; }
  finally { globalThis.fetch = originalFetch; for (const owner of controllers) await owner.close().catch(() => {}); }

  const state = f ? await json(join(f.root, 'snapshot.json')).catch(() => null) : null;
  const task = state?.tasks?.find(row => row.taskId === 'cos137-design-source');
  let expectedOutcomeVerified = false, reviewReceipt, correctionReceipt;
  try {
    if (task && !fatal) {
      if (correction && mode !== 'density6-correction') {
        assert.equal(task.state, 'waiting_user'); assert.equal(task.review.verdict, 'pending');
        assert.equal(transports.length, 2); assert.equal(selections.length, 3);
        assert.equal(selections[2].rejected.code, 'review_output_budget');
      } else {
        assert.equal(task.state, 'needs_changes'); assert.equal(task.review.verdict, 'changes_requested');
        assert.equal(transports.length, correction ? 3 : 2);
        reviewReceipt = await json(join(f.root, 'journal/task-cos137-design-source/review.json'));
        assert.equal(reviewReceipt.value.verdict.concernResolutions.length, 7);
        assert.deepEqual(reviewReceipt.value.verdict.findings, findings);
        assert.deepEqual(reviewReceipt.value.verdict.concernResolutions.map(row => row.concernText), [...proposal.remaining, ...proposal.uncertainty]);
      }
      if (correction) {
        correctionReceipt = await json(join(task.attempts.at(-1).sessionRef, 'review-correction.json'));
        assert.equal(correctionReceipt.used, 1);
      }
      expectedOutcomeVerified = true;
    }
  } catch (error) { fatal = { name: error.name, message: error.message, stack: error.stack }; }
  const report = { scope: 'Free SOURCE native capacity only. All model replies and usage synthetic; no real model judgment, provider call or generated-game acceptance.',
    mode, sourcePathVersion: 'actual-author-budget-finalization/1', startedAt: stamp, repository: repo, commit, sourceFingerprints, reportDirectory, tempRoot: f?.root, confirmedSource: confirmed.source, originalSource: r3,
    grantMicroCny: 1125000, initialSettledMicroCny: 544313, initialAvailableMicroCny: 580687, usageAssumption,
    originalAuthorSource: { proposalSha256: hash(JSON.stringify(proposal)), replySha256: sourceResponse.value.replySha256, replyBytes: Buffer.byteLength(sourceResponse.value.reply), remaining: 3, uncertainty: 4 },
    sourceAttachments, materials, sourceBytes: materials.reduce((sum, row) => sum + row.sourceBytes, 0),
    reviewerPolicy: { version: 'independent-review/2', maxRequests: configs[0]?.maxRequests, requestTimeoutMs: configs[0]?.requestTimeoutMs, outputFloor: 4096, outputMaximum: 8192, cleanupMs: 5000,
      deadlineDurationMs: 180000, revisionMinimumRemainingMs: 185000, authorRequests: 32, protocolCorrections: 1, revisions: 1 },
    fetchInterceptedOnly: true, originalStreamSimplePreserved: ModelRuntime.prototype.streamSimple === originalStreamSimple,
    authorSource: { usageAssumption: 'Actual TEMP admissions and settlements using explicit fake SSE usage: 240000 + 239313 + 65000 = 544313 microCNY. No imported history. Ordinary outputs4096 each; second cacheRead25 yields the one-microCNY remainder; readonly output765.',
      pressure: { scope: 'Artificial author-only system context pressure; not part of reviewer input or a claim about R3 author capacity.', paddingBytes: authorPressureBytes, addedSystemBytes: Buffer.byteLength(authorPressure) },
      readPath: authorReadPath, selections: authorSelections, admissions: authorAdmissions, settlements: authorSettlements, transports: authorTransports,
      compaction: authorCompaction, events: authorEvents, nativeSessionFiles: authorSessionFiles, correctionStarted: authorCorrectionStarted, correctionResponse: authorCorrectionResponse, nativeUnsent: authorNativeUnsent },
    lifecycle, selections, admissions, settlements, transports, nativeTools, nativeSessionFiles: sessionFiles,
    firstRejected: selections.find(row => row.rejected) ?? null, actualNativeRequestAttempts: selections.length,
    finalTask: task && { taskId: task.taskId, state: task.state, review: task.review, attempts: task.attempts, handoff: task.handoff },
    finalLedgerRows: state?.ledger.entries, expectedOutcomeVerified, reviewReceipt, correctionReceipt, executionResult, fatal };
  await put(reportDirectory, 'report.json', JSON.stringify(report, null, 2) + '\n');
  await put(reportDirectory, 'cli-output.txt', cliOutput);
  return report;
}
