export function invalid(field: string): never {
  throw new Error(`Invalid media spec: ${field}`);
}

export function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid('object');
  const record = value as Record<string, unknown>;
  if (keys && Object.keys(record).some((key) => !keys.includes(key))) invalid('unknown field');
  return record;
}

export function number(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isInteger(value))) invalid('number out of bounds');
  return value;
}

export function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) invalid('array length');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) invalid('sparse array');
  return value;
}

export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(value)) invalid('identifier');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value)) invalid('reserved filename');
  return value;
}

export function color(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) invalid('hex color');
  return value;
}

export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid('boolean');
  return value;
}

export function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) invalid('enum');
  return value as T;
}

export function unique(values: string[]): void {
  if (new Set(values).size !== values.length) invalid('duplicate identifier');
}
