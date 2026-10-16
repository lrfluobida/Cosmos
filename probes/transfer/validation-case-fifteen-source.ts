import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseFifteenTemplate, requireTransferCaseSevenToolchain as requireTransferCaseFifteenToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseFifteenSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('fifteen', signal); }
export function requireTransferCaseFifteenSource(source: Awaited<ReturnType<typeof captureTransferCaseFifteenSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('fifteen', source, signal);
}
