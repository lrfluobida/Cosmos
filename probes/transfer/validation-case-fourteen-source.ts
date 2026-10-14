import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseFourteenTemplate, requireTransferCaseSevenToolchain as requireTransferCaseFourteenToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseFourteenSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('fourteen', signal); }
export function requireTransferCaseFourteenSource(source: Awaited<ReturnType<typeof captureTransferCaseFourteenSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('fourteen', source, signal);
}
