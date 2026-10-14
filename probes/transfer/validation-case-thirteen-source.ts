import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseThirteenTemplate, requireTransferCaseSevenToolchain as requireTransferCaseThirteenToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseThirteenSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('thirteen', signal); }
export function requireTransferCaseThirteenSource(source: Awaited<ReturnType<typeof captureTransferCaseThirteenSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('thirteen', source, signal);
}
