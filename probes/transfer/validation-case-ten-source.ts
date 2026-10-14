import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseTenTemplate, requireTransferCaseSevenToolchain as requireTransferCaseTenToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseTenSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('ten', signal); }
export function requireTransferCaseTenSource(source: Awaited<ReturnType<typeof captureTransferCaseTenSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('ten', source, signal);
}
