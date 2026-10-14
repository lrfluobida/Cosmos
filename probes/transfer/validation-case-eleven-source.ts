import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseElevenTemplate, requireTransferCaseSevenToolchain as requireTransferCaseElevenToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseElevenSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('eleven', signal); }
export function requireTransferCaseElevenSource(source: Awaited<ReturnType<typeof captureTransferCaseElevenSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('eleven', source, signal);
}
