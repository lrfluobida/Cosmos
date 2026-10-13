import { captureFixedTransferCodingSource, requireFixedTransferCodingSource } from './validation-case-seven-source.ts';
export { requireTransferCaseSevenTemplate as requireTransferCaseNineTemplate, requireTransferCaseSevenToolchain as requireTransferCaseNineToolchain } from './validation-case-seven-source.ts';
export function captureTransferCaseNineSource(signal?: AbortSignal) { return captureFixedTransferCodingSource('nine', signal); }
export function requireTransferCaseNineSource(source: Awaited<ReturnType<typeof captureTransferCaseNineSource>>, signal?: AbortSignal) {
  return requireFixedTransferCodingSource('nine', source, signal);
}
