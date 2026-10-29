import type { ArtifactReference } from '../../contracts/types.ts';

export interface DesignConcernReferenceIssue {
  row: number; field: 'evidenceIds' | 'evidenceRefs' | 'inputVersions'; referenceIndex?: number;
  reason: 'evidence_ids_must_be_empty' | 'evidence_refs_must_be_empty' | 'duplicate_input_reference' | 'unauthorized_input_reference' | 'missing_current_capture';
}

/** Only validated reference-channel failures supply these numeric locations and
 * finite reasons. Neither reply values nor arbitrary exception text is copied. */
export class DesignConcernReferenceError extends Error {
  readonly correctionDiagnostic: string;
  constructor(message: 'Design resolution references an unauthorized input or stale output.' | 'Design resolution must reference the current capture.',
    issues: DesignConcernReferenceIssue[], capture: ArtifactReference) {
    super(message);
    const prefix = '\n\nDesign concern reference diagnostic: Correct the listed reference fields using the frozen packet. For fixed_input and captured_output, evidenceIds and evidenceRefs must be empty arrays. fixed_input permits only requirement.sources, task.inputs and task.context.interfaces; a capture is not allowed merely because it is the current output. captured_output permits only task.artifacts and task.inputs, must include designConcernReview.capture, and excludes interfaces. Input references must be unique and exactly match an allowed fixed reference. host_evidence remains a separate channel requiring actual current passing host proof. Reuse already complete frozen evidence reads in this same session; read missing or incomplete evidence as needed. Preserve independent judgment, genuine findings and unresolved concerns; this diagnostic does not determine the verdict.\n';
    const omittedCapture = '1 current capture reference omitted; use the exact designConcernReview.capture in the original fixed packet.';
    const listed: { path: string; reason: DesignConcernReferenceIssue['reason'] }[] = [];
    const render = (captureText: string) => prefix + `Issues: ${JSON.stringify(listed)}\n${issues.length - listed.length} issues omitted; check all rows against the original protocol.\n${captureText}`;
    for (const issue of issues) {
      listed.push({ path: `$.concernResolutions[${issue.row}].${issue.field}${issue.referenceIndex === undefined ? '' : `[${issue.referenceIndex}]`}`, reason: issue.reason });
      if (Buffer.byteLength(render(omittedCapture), 'utf8') > 4096) { listed.pop(); break; }
    }
    const withCapture = render(`Current capture: ${JSON.stringify(capture)}`);
    this.correctionDiagnostic = Buffer.byteLength(withCapture, 'utf8') <= 4096 ? withCapture : render(omittedCapture);
  }
}
