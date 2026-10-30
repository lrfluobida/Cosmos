/** Reject values that JSON.stringify would drop, coerce or execute through a getter/toJSON. */
export function requireAuthorJson(value: unknown, label: string, parents = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || parents.has(value)) throw new Error(`${label} accepts JSON data only.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== (Array.isArray(value) ? Array.prototype : Object.prototype)) throw new Error(`${label} requires plain JSON containers.`);
  parents.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value) && (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)))) throw new Error(`${label} requires dense JSON arrays.`);
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error(`${label} accepts enumerable JSON data only.`);
    requireAuthorJson(descriptor.value, label, parents);
  }
  parents.delete(value);
}
