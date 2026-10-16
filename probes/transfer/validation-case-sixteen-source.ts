import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseSixteenTemplate, requireTransferCaseSevenToolchain as requireTransferCaseSixteenToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseSixteenSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('sixteen', signal); }
export function requireTransferCaseSixteenSource(source: Awaited<ReturnType<typeof captureTransferCaseSixteenSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('sixteen', source, signal);
}
