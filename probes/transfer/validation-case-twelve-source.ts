import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseTwelveTemplate, requireTransferCaseSevenToolchain as requireTransferCaseTwelveToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseTwelveSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('twelve', signal); }
export function requireTransferCaseTwelveSource(source: Awaited<ReturnType<typeof captureTransferCaseTwelveSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('twelve', source, signal);
}
