import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const categories = ['environments', 'adventure', 'mini_games', 'vasebreaker', 'i_zombie',
  'survival', 'plants', 'zombies', 'special_levels', 'second_pass', 'endless', 'garden',
  'shop', 'almanac', 'unlocks', 'saves', 'core_rules', 'critical_values', 'presentation', 'runtime'];
const essential = ['ENV-DAY', 'ENV-NIGHT', 'ENV-POOL', 'ENV-FOG', 'ENV-ROOF',
  'BOSS', 'SPECIAL-FIFTH', 'SPECIAL-TENTH', 'SPECIAL-CENSUS', 'SECOND-PASS',
  'SECOND-PASS-ENCOUNTERS', 'ENDLESS-VASE', 'ENDLESS-IZ', 'ENDLESS-SURV',
  'GARDEN-CENSUS', 'SHOP-CENSUS', 'ALMANAC', 'CORRESPONDENCE', 'INTERACTIONS',
  'UNLOCK-GRAPH', 'SAVE-NEW', 'SAVE-CROSS-LEVEL', 'SAVE-RESUME', 'VALUE-PLANTS',
  'VALUE-ZOMBIES', 'VALUE-WAVES', 'VALUE-ECONOMY', 'VALUE-STATUS', 'VALUE-ENDLESS'];
const evidenceKinds = ['normal_input', 'deterministic_rule'];
const policyIds = ['CORRESPONDENCE', 'LAYOUT', 'ART', 'AUDIO', 'STARTUP', 'OFFLINE',
  'PERFORMANCE', 'STABILITY', 'USER-ACCEPTANCE'];

// Structural guard only. Independent review must judge factual truth and full census closure.
export function validate(reference, catalog) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const list = value => Array.isArray(value) ? value : [];
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const entries = list(catalog.entries);
  const sources = new Map(list(reference.sources).map(x => [x.id, x]));
  const evidence = new Map(list(catalog.evidence).map(x => [x.id, x]));
  const ids = new Set(entries.map(x => x.id));
  const frozen = reference.frozen === true || catalog.frozen === true || catalog.status === 'frozen';
  check(reference.schemaVersion === 1 && catalog.schemaVersion === 1, 'unsupported schemaVersion');
  check(nonempty(reference.referenceId) && reference.referenceId === catalog.referenceId, 'referenceId mismatch');
  check(typeof reference.frozen === 'boolean' && typeof catalog.frozen === 'boolean', 'frozen must be boolean');
  check(['provisional', 'frozen'].includes(catalog.status), 'invalid catalog status');
  check(reference.frozen === catalog.frozen && (catalog.status === 'frozen') === catalog.frozen, 'inconsistent freeze flags');
  check(sources.size === list(reference.sources).length, 'duplicate source ID');
  check(evidence.size === list(catalog.evidence).length, 'duplicate evidence ID');
  check(ids.size === entries.length, 'duplicate entry ID');
  for (const category of categories) check(entries.some(x => x.category === category), `missing category ${category}`);
  for (const id of essential) check(ids.has(id), `missing required entry ${id}`);
  for (let stage = 1; stage <= 5; stage++) {
    for (let level = 1; level <= 10; level++) {
      const id = `ADV-${stage}-${String(level).padStart(2, '0')}`;
      check(entries.some(x => x.id === id && x.category === 'adventure'), `missing required adventure slot ${id}`);
    }
  }
  for (const [category, count] of Object.entries(catalog.candidateCounts ?? {})) {
    check(Number.isInteger(count) && count > 0, `invalid candidate count ${category}`);
    check(entries.filter(x => x.category === category).length === count, `candidate count mismatch ${category}`);
  }
  for (const source of sources.values()) {
    check(nonempty(source.id) && nonempty(source.location) && nonempty(source.edition), `incomplete source ${source.id}`);
    check(Object.keys(source.anchors ?? {}).length > 0, `missing source anchors ${source.id}`);
    check(['requirement', 'verified_for_edition'].includes(source.status), `invalid source status ${source.id}`);
  }
  for (const row of [...entries, ...list(catalog.exclusions)]) {
    check(nonempty(row.id) && nonempty(row.label), 'entry requires ID and label');
    check(list(row.sourceRefs).length > 0, `missing source anchor ${row.id}`);
    for (const ref of list(row.sourceRefs)) {
      check(nonempty(sources.get(ref.sourceId)?.anchors?.[ref.anchor]), `unresolved source anchor ${row.id}: ${ref.sourceId}/${ref.anchor}`);
    }
  }
  for (const item of evidence.values()) {
    check(item.referenceId === reference.referenceId, `evidence referenceId mismatch ${item.id}`);
    check(evidenceKinds.includes(item.kind), `invalid evidence kind ${item.id}`);
    check(item.status === 'pass', `evidence is not pass ${item.id}`);
    for (const field of ['path', 'observedAt', 'preconditions', 'steps', 'expected', 'observed']) {
      check(nonempty(item[field]), `missing evidence ${field}: ${item.id}`);
    }
    check(list(item.entryIds).length > 0 && item.entryIds.every(id => ids.has(id)), `invalid evidence entryIds ${item.id}`);
  }
  for (const row of entries) {
    check(['needs_reference', 'verified_for_reference', 'requirement_defined'].includes(row.status), `invalid entry status ${row.id}`);
    if (row.status === 'requirement_defined') {
      check(policyIds.includes(row.id) && row.kind === 'acceptance_policy' && row.sourceRefs.some(x => x.sourceId === 'SPEC'), `invalid acceptance policy ${row.id}`);
    }
    const refs = list(row.evidenceRefs).map(id => evidence.get(id));
    check(refs.every(Boolean), `unresolved evidence reference ${row.id}`);
    if (row.status === 'verified_for_reference') {
      for (const kind of evidenceKinds) check(refs.some(x => x?.kind === kind && x.entryIds?.includes(row.id)), `missing ${kind} evidence ${row.id}`);
      if (row.kind === 'candidate_slot' || row.kind === 'required_slot') check(nonempty(row.referenceName), `unresolved entry name ${row.id}`);
    }
    if (frozen) check(['verified_for_reference', 'requirement_defined'].includes(row.status), `unresolved entry ${row.id}`);
  }
  const measurements = list(catalog.measurements);
  check(new Set(measurements.map(x => x.id)).size === measurements.length, 'duplicate measurement ID');
  for (const value of measurements) {
    check(ids.has(value.entryId), `invalid measurement entryId ${value.id}`);
    check(['needs_reference', 'verified_for_reference'].includes(value.status), `invalid measurement status ${value.id}`);
    if (value.status === 'verified_for_reference') {
      check(Number.isFinite(value.value) && nonempty(value.unit) && nonempty(value.metric) && nonempty(value.method), `invalid verified measurement ${value.id}`);
      check(['exact', 'timing'].includes(value.tolerance), `invalid measurement tolerance ${value.id}`);
      check(list(value.evidenceRefs).length > 0 && value.evidenceRefs.every(id => evidence.has(id)), `missing measurement evidence ${value.id}`);
    }
    if (frozen) check(value.status === 'verified_for_reference', `unresolved measurement ${value.id}`);
  }
  if (frozen) {
    check(reference.installation?.runtimeObserved === true, 'reference runtime observation missing');
    check(list(reference.blockers).length === 0, 'unresolved reference blockers');
    check(catalog.closure?.complete === true && list(catalog.closure?.unresolved).length === 0, 'unresolved census closure');
    check(list(catalog.closure?.referenceEvidenceRefs).length > 0 && catalog.closure.referenceEvidenceRefs.every(id => evidence.has(id)), 'missing census closure evidence');
    check(reference.freezeReview?.status === 'approved' && nonempty(reference.freezeReview?.reviewer) && nonempty(reference.freezeReview?.evidencePath), 'independent freeze review missing');
    for (const row of entries.filter(x => x.category === 'critical_values')) {
      check(measurements.some(x => x.entryId === row.id && x.status === 'verified_for_reference'), `missing measurements ${row.id}`);
    }
    const pairs = new Set();
    for (const pair of list(catalog.interactions)) {
      check(entries.some(x => x.id === pair.plantId && x.category === 'plants') && entries.some(x => x.id === pair.zombieId && x.category === 'zombies'), 'invalid interaction unit');
      check(nonempty(pair.rule) && list(pair.evidenceRefs).length > 0 && pair.evidenceRefs.every(id => evidence.has(id)), 'missing interaction rule/evidence');
      const key = `${pair.plantId}/${pair.zombieId}`;
      check(!pairs.has(key), `duplicate interaction ${key}`);
      pairs.add(key);
    }
    for (const plant of entries.filter(x => x.category === 'plants')) {
      for (const zombie of entries.filter(x => x.category === 'zombies')) check(pairs.has(`${plant.id}/${zombie.id}`), `unresolved interaction ${plant.id}/${zombie.id}`);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
    const reference = read('reference.json');
    const catalog = read('catalog.json');
    const errors = validate(reference, catalog);
    if (process.argv.includes('--require-frozen') && catalog.frozen !== true) errors.push('benchmark is provisional; not frozen');
    if (errors.length) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      const unresolved = catalog.entries.filter(x => x.status === 'needs_reference').length;
      console.log(`Valid ${catalog.status} inventory: ${catalog.entries.length} entries; ${unresolved} unresolved. This is not gameplay acceptance.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
