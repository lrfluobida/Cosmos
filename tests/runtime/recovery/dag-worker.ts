import { dagFixture } from './dag-fixture.ts';
import { executeTaskDag } from '../../../src/runtime/orchestrator.ts';
const fixture = await dagFixture(process.argv[2], true, process.argv[3]);
try { await executeTaskDag(fixture.options); } finally { await fixture.controller.close(); }
