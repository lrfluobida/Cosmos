import type { ArtifactReference } from '../../src/contracts/types.ts';
import type { AcceptancePlan, Scalar, Step } from '../../src/acceptance/plan.ts';

/** Frozen human-playable input path. Observations never mutate the generated game. */
export function createPilotAcceptance(artifact: ArtifactReference, url: string, runId: string, reportId: string): AcceptancePlan {
  const steps: Step[] = [];
  let sequence = 0;
  const id = (name: string) => `${String(++sequence).padStart(3, '0')}-${name}`;
  const click = (name: string) => steps.push({ id: id(name), kind: 'locator-click', selector: `[data-testid="${name}"]`, timeoutMs: 5000 });
  const check = (acceptanceId: string, path: string, expected: Scalar, timeoutMs = 3000) => steps.push({
    id: id(path.replaceAll('.', '-')), kind: 'wait-for', acceptanceId,
    observation: { kind: 'debug', path: path.split('.') }, expected, timeoutMs,
  });
  const status = (acceptanceId: string, expected: string) => steps.push({ id: id('visible-status'), kind: 'wait-for', acceptanceId,
    observation: { kind: 'text', selector: '[data-testid="status"]' }, expected, timeoutMs: 5000 });
  const place = (role: string, lane: number, column: number) => {
    click(`card-${role}`);
    steps.push({ id: id(`place-${role}-${lane}-${column}`), kind: 'mouse-click', selector: 'canvas',
      x: (250 + (column + 0.5) * 140) / 1280, y: (210 + (lane + 0.5) * 110) / 720 });
  };
  const initial = (acceptanceId: string) => {
    check(acceptanceId, 'state', 'playing'); check(acceptanceId, 'resources', 300);
    for (const field of ['unitCount', 'enemyCount', 'projectileCount', 'wave', 'placed.producer', 'placed.shooter', 'placed.defender', 'kills.normal', 'kills.armored', 'events.defenderHits']) check(acceptanceId, field, 0);
    for (const role of ['producer', 'shooter', 'defender']) check(acceptanceId, `cooldowns.${role}`, true);
    check(acceptanceId, 'lastRejection', 'none');
  };

  status('PILOT-START', '准备开始'); check('PILOT-START', 'state', 'title'); check('PILOT-SAVE', 'save.victories', 0);
  click('start'); status('PILOT-START', '防守中');
  check('PILOT-START', 'resources', 300); check('PILOT-START', 'audio.muted', false);
  check('PILOT-START', 'media.loadedCharacters', 5); check('PILOT-START', 'media.loadedAudio', 6);
  check('PILOT-START', 'media.audioStarted.bgm', true);

  // Spend via normal cards. No producer means the resource boundary remains stable.
  place('shooter', 0, 1);
  place('shooter', 1, 1);
  check('PILOT-COOLDOWN', 'lastRejection', 'cooldown');
  check('PILOT-COOLDOWN', 'resources', 200); check('PILOT-COOLDOWN', 'unitCount', 1);
  check('PILOT-COOLDOWN', 'cooldowns.shooter', true, 5000);
  place('shooter', 1, 1); check('PILOT-COOLDOWN', 'placed.shooter', 2);
  check('PILOT-COOLDOWN', 'cooldowns.shooter', true, 5000);
  place('shooter', 2, 1); check('PILOT-RESOURCE', 'resources', 0);
  place('defender', 0, 5);
  check('PILOT-RESOURCE', 'lastRejection', 'resources');
  check('PILOT-RESOURCE', 'resources', 0); check('PILOT-RESOURCE', 'unitCount', 3);

  click('restart'); initial('PILOT-RESTART');
  // Producer income funds the third shooter and the blocker. These are normal game mechanics.
  place('producer', 0, 0); check('PILOT-MECHANISMS', 'placed.producer', 1);
  place('shooter', 0, 1); check('PILOT-MECHANISMS', 'cooldowns.shooter', true, 5000);
  place('shooter', 1, 1); check('PILOT-MECHANISMS', 'resources', 100, 12_000);
  place('shooter', 2, 1); check('PILOT-MECHANISMS', 'placed.shooter', 3);
  check('PILOT-MECHANISMS', 'resources', 75, 16_000);
  place('defender', 0, 5); check('PILOT-MECHANISMS', 'placed.defender', 1);
  check('PILOT-MECHANISMS', 'events.defenderHits', 1, 25_000);
  check('PILOT-VICTORY', 'state', 'victory', 60_000); status('PILOT-VICTORY', '胜利');
  check('PILOT-VICTORY', 'kills.normal', 3); check('PILOT-VICTORY', 'kills.armored', 3);
  check('PILOT-VICTORY', 'enemyCount', 0); check('PILOT-VICTORY', 'wave', 2);
  for (const name of ['idle', 'attack', 'death']) check('PILOT-MECHANISMS', `media.statesSeen.${name}`, true);
  for (const name of ['place', 'shoot', 'hit', 'victory']) check('PILOT-VICTORY', `media.audioStarted.${name}`, true);
  check('PILOT-SAVE', 'save.victories', 1);
  click('mute'); check('PILOT-SAVE', 'audio.muted', true);
  // A visible same-origin link performs a full document load, exercising storage persistence.
  click('return-title'); status('PILOT-SAVE', '准备开始'); check('PILOT-SAVE', 'state', 'title');
  check('PILOT-SAVE', 'save.victories', 1); check('PILOT-SAVE', 'audio.muted', true);

  click('start'); check('PILOT-DEFEAT', 'state', 'playing');
  // Deliberate failure: the player leaves the board empty and waits for an actual breach.
  check('PILOT-DEFEAT', 'state', 'defeat', 55_000); status('PILOT-DEFEAT', '失败');
  check('PILOT-DEFEAT', 'media.audioStarted.defeat', true);
  check('PILOT-DEFEAT', 'unitCount', 0); check('PILOT-DEFEAT', 'kills.normal', 0);
  click('restart'); initial('PILOT-RESTART');
  check('PILOT-SAVE', 'save.victories', 1); check('PILOT-SAVE', 'audio.muted', true);
  return {
    formatVersion: '1.0.0', projectId: 'cos10-pilot', taskId: 'COS-10', runId, reportId,
    specVersion: '1.0', artifact, url, viewport: { width: 1280, height: 720 },
    acceptanceIds: ['PILOT-START', 'PILOT-RESOURCE', 'PILOT-COOLDOWN', 'PILOT-MECHANISMS', 'PILOT-VICTORY', 'PILOT-DEFEAT', 'PILOT-RESTART', 'PILOT-SAVE'],
    steps,
  };
}
