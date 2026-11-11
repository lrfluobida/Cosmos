import { crc32, inflateSync } from 'node:zlib';

/** Validate actual PNG chunks and decoded scanlines, not merely its eight-byte magic. */
export function requirePng(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Classic assertion screenshot is not PNG.');
  let offset = 8, width = 0, height = 0, rowBytes = 0, ended = false; const data: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    if (end > bytes.length || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error('Classic PNG chunk is corrupt.');
    const kind = bytes.toString('ascii', offset + 4, offset + 8), payload = bytes.subarray(offset + 8, end - 4);
    if (offset === 8) {
      if (kind !== 'IHDR' || size !== 13) throw new Error('Classic PNG header is missing.');
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
      const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[payload[9]], depth = payload[8];
      if (!width || width > 4096 || !height || height > 4096 || !channels || ![1, 2, 4, 8, 16].includes(depth)
        || [2, 4, 6].includes(payload[9]) && depth < 8 || payload[9] === 3 && depth === 16
        || payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) throw new Error('Unsupported classic PNG header.');
      rowBytes = Math.ceil(width * channels * depth / 8) + 1;
    } else if (kind === 'IHDR') throw new Error('Duplicate classic PNG header.');
    if (kind === 'IDAT') data.push(payload);
    offset = end;
    if (kind === 'IEND') { if (size !== 0 || offset !== bytes.length) throw new Error('Invalid classic PNG ending.'); ended = true; break; }
  }
  if (!ended || !data.length) throw new Error('Incomplete classic PNG.');
  const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: rowBytes * height });
  if (decoded.length !== rowBytes * height) throw new Error('Classic PNG scanlines are incomplete.');
  for (let y = 0; y < height; y++) if (decoded[y * rowBytes] > 4) throw new Error('Invalid classic PNG scanline.');
}
