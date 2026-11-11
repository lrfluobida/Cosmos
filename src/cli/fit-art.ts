import { basename, dirname, resolve } from 'node:path';
import { regularFile, safePath, within } from '../artifacts/paths.ts';
import { selectApprovedDesign } from '../runtime/approved-design-source.ts';
import { selectArtDraftSelection } from '../runtime/art-draft-source.ts';
import { fitArtFrame } from '../runtime/art-layer-fit.ts';
import { validateDeclaredMedia } from '../runtime/entrypoint-media.ts';
import { ordinaryDraftSha256 } from '../runtime/ordinary-profile-source.ts';
import { publishReceipt } from '../runtime/recovery/receipt-file.ts';
import { readRunSnapshot } from './control.ts';

const decode = (bytes: Buffer) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const file = (path: string) => regularFile(dirname(path), basename(path));

/** Local authoring command. No run is created, resumed, funded or approved here. */
export async function fitArtSelection(inputPath: string, mappingPath: string, outputPath: string) {
  const input = resolve(inputPath), output = resolve(outputPath);
  const manifestBytes = await file(input), manifest = decode(manifestBytes);
  if (!['ordinary-art-draft-selection/1', 'ordinary-art-draft-selection/2'].includes(manifest?.formatVersion)
    || typeof manifest.base?.location !== 'string') throw new Error('Fit a v1 or v2 art selection manifest.');
  const state = await readRunSnapshot(manifest.base.location);
  if (state.formatVersion !== 1 || !state.designDraftReview || !state.requirementsSource) throw new Error('Fit requires an approved design and original confirmation.');
  if (within(state.requirementsSource.root, output)) throw new Error('Write the fit outside the requirements run.');
  await safePath(dirname(output), basename(output));
  const target = { root: output };
  const approved = await selectApprovedDesign(state.designDraftReview.location, state.requirementsSource, target, state.designDraftReview);
  const selected = await selectArtDraftSelection(input, approved, state.requirementsSource, target);
  if (selected.proof.manifestSha256 !== ordinaryDraftSha256(manifestBytes)) throw new Error('Art selection changed during fitting setup.');
  const { characters } = validateDeclaredMedia(decode(selected.bytes), decode(approved.files.get('_cosmos/design.json')!), 'draft-subset');
  const { scenario } = decode(approved.files.get('_cosmos/acceptance-plan.json')!);
  const result = await fitArtFrame(scenario, characters, decode(await file(resolve(mappingPath))));
  const report = { input: selected.reference, inputSha256: selected.proof.sha256, ...result };
  if (!result.before.deficit) return { ...report, outcome: 'already-matched' };
  if (result.after.deficit) return { ...report, outcome: 'no-match-within-search' };
  const fit = { inputSha256: selected.proof.sha256, mapping: result.mapping, changes: result.changes };
  await publishReceipt(output, { formatVersion: 'ordinary-art-draft-selection/3', base: selected.proof.base, overlays: selected.overlays, fit });
  return { ...report, outcome: 'unreviewed-fit', output };
}
