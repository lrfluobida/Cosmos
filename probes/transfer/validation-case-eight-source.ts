import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseEightTemplate, requireTransferCaseSevenToolchain as requireTransferCaseEightToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseEightSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('eight', signal); }
export function requireTransferCaseEightSource(source: Awaited<ReturnType<typeof captureTransferCaseEightSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('eight', source, signal);
}
