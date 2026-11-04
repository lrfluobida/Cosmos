import { crc32, inflateRawSync } from 'node:zlib';
import { fundingHash } from './public-validation-funding-validation.ts';

const limit = 512 * 1024;
function check(ok: unknown): asserts ok {
  if (!ok) throw new Error('Unsupported or inconsistent official billing export.');
}
const utf8 = (b: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(b);
const hour = 3600000;
export const billingHour = hour;
export const bucketIso = (ms: number) => new Date(ms + 8 * hour).toISOString().slice(0, 19) + '+08:00';
const usageHeader = 'user_id,start_time_iso,end_time_iso,model,name,api_key_name,api_key,type,price,amount';
const costHeader = 'user_id,start_time_iso,end_time_iso,model,name,wallet_type,cost,currency';
// Two flat CSV members only. Read the central directory, verify local lengths, CRC and non-overlapping members.
function members(zip: Buffer, names: string[]) {
  check(zip.length >= 22 && zip.length <= limit);
  const end = zip.length - 22;
  check(
    zip.readUInt32LE(end) === 0x06054b50 &&
      zip.readUInt32LE(end + 4) === 0 &&
      zip.readUInt16LE(end + 8) === 2 &&
      zip.readUInt16LE(end + 10) === 2 &&
      zip.readUInt16LE(end + 20) === 0
  );
  let pos = zip.readUInt32LE(end + 16);
  const directory = pos,
    output = new Map<string, string>(),
    ranges: [number, number][] = [];
  check(pos + zip.readUInt32LE(end + 12) === end);
  for (let i = 0; i < 2; i++) {
    check(pos + 46 <= end && zip.readUInt32LE(pos) === 0x02014b50);
    const flags = zip.readUInt16LE(pos + 8),
      method = zip.readUInt16LE(pos + 10),
      crc = zip.readUInt32LE(pos + 16);
    const packed = zip.readUInt32LE(pos + 20),
      size = zip.readUInt32LE(pos + 24),
      n = zip.readUInt16LE(pos + 28),
      loc = zip.readUInt32LE(pos + 42);
    const name = utf8(zip.subarray(pos + 46, pos + 46 + n));
    check(
      names.includes(name) &&
        !output.has(name) &&
        !(flags & ~0x808) &&
        (method === 0 || method === 8) &&
        size <= limit &&
        zip.readUInt16LE(pos + 34) === 0 &&
        loc + 30 <= directory &&
        zip.readUInt32LE(loc) === 0x04034b50 &&
        zip.readUInt16LE(loc + 6) === flags &&
        zip.readUInt16LE(loc + 8) === method &&
        zip.readUInt16LE(loc + 26) === n &&
        utf8(zip.subarray(loc + 30, loc + 30 + n)) === name
    );
    const data = loc + 30 + n + zip.readUInt16LE(loc + 28),
      stop = data + packed;
    check(stop <= directory);
    let extent = stop;
    if (flags & 8) {
      let p = stop;
      if (zip.readUInt32LE(p) === 0x08074b50) p += 4;
      check(
        p + 12 <= directory &&
          zip.readUInt32LE(p) === crc &&
          zip.readUInt32LE(p + 4) === packed &&
          zip.readUInt32LE(p + 8) === size
      );
      extent = p + 12;
    } else
      check(
        zip.readUInt32LE(loc + 14) === crc &&
          zip.readUInt32LE(loc + 18) === packed &&
          zip.readUInt32LE(loc + 22) === size
      );
    const bytes =
      method === 0 ? zip.subarray(data, stop) : inflateRawSync(zip.subarray(data, stop), { maxOutputLength: limit });
    check(bytes.length === size && crc32(bytes) === crc);
    ranges.push([loc, extent]);
    output.set(name, utf8(bytes));
    pos += 46 + n + zip.readUInt16LE(pos + 30) + zip.readUInt16LE(pos + 32);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  check(pos === end && ranges[0][0] === 0 && ranges[0][1] === ranges[1][0] && ranges[1][1] === directory);
  return output;
}
// The observed provider dialect uses simple unquoted fields; reject unexplained quoting/extra rows instead of guessing.
function rows(raw: string, header: string) {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  check(lines.shift() === header && lines.length > 0 && lines.length <= 2048);
  return lines.map((line) => {
    const cells = line.split(',');
    check(!/["\r\x00]/.test(line) && cells.length === header.split(',').length && cells.every((s) => s.length <= 256));
    return cells;
  });
}
const unit = 10000000000000000n;
function decimal(s: string) {
  check(/^(0|[1-9]\d{0,9})(\.\d{1,16})?$/.test(s));
  const [w, f = ''] = s.split('.');
  return BigInt(w) * unit + BigInt(f.padEnd(16, '0'));
}
const dimensions = ['request_count', 'input_cache_miss_tokens', 'input_cache_hit_tokens', 'output_tokens'] as const;
export interface BillingBucket {
  startAt: string;
  count: number;
  miss: number;
  hit: number;
  output: number;
  cnyE16: string;
}
export function parseFundingBillingExport(
  zip: Buffer,
  e: { startAt: string; endAt: string; accountSha256: string; keySha256: string; model: string }
) {
  const from = Date.parse(e.startAt),
    to = Date.parse(e.endAt);
  check(from % hour === 0 && to % hour === 0 && to > from && to - from <= 24 * hour);
  const date = bucketIso(from).slice(0, 10);
  check(bucketIso(to - 1).startsWith(date));
  const names = ['amount', 'cost'].map((prefix) => prefix + '-' + date + '_' + date + '.csv'),
    files = members(zip, names);
  const amount = rows(files.get(names[0])!, usageHeader),
    costs = rows(files.get(names[1])!, costHeader);
  const bucket = (r: string[]) => {
    const t = Date.parse(r[1]);
    check(
      fundingHash(r[0]) === e.accountSha256 &&
        r[3] === e.model &&
        r[4] === e.model &&
        t >= from &&
        t < to &&
        t % hour === 0 &&
        r[1] === bucketIso(t) &&
        r[2] === bucketIso(t + hour)
    );
    return new Date(t).toISOString();
  };
  const values = new Map<string, { value: number; price: bigint }>(),
    money = new Map<string, bigint>();
  for (const r of amount) {
    const start = bucket(r),
      key = fundingHash(JSON.stringify([r[5], r[6]])),
      dim = r[7] as (typeof dimensions)[number];
    check(key === e.keySha256 && dimensions.includes(dim) && /^(0|[1-9]\d{0,12})$/.test(r[9]));
    const price = dim === 'request_count' ? (check(r[8] === ''), 0n) : decimal(r[8]);
    check(price === [0n, 10000000000n, 200000000n, 40000000000n][dimensions.indexOf(dim)]);
    const id = start + '/' + dim;
    check(!values.has(id));
    values.set(id, { value: Number(r[9]), price });
  }
  for (const r of costs) {
    const start = bucket(r);
    check(!money.has(start) && r[5] === 'Paid' && r[7] === 'CNY');
    money.set(start, decimal(r[6]));
  }
  const result: BillingBucket[] = [];
  for (let t = from; t < to; t += hour) {
    const startAt = new Date(t).toISOString(),
      dims = dimensions.map((d) => values.get(startAt + '/' + d));
    check(dims.every((d) => d !== undefined));
    const cost = dims.reduce((s, x) => s + BigInt(x!.value) * x!.price, 0n);
    check(cost === money.get(startAt));
    result.push({
      startAt,
      count: dims[0]!.value,
      miss: dims[1]!.value,
      hit: dims[2]!.value,
      output: dims[3]!.value,
      cnyE16: String(cost),
    });
  }
  return {
    buckets: result,
    rates: [...values].map(([k, v]) => [k, String(v.price)]).sort(),
    costSourceSha256: fundingHash(files.get(names[1])!),
  };
}
