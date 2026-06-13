export function now(): number {
  return Date.now();
}

export function deepClone<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = stableNormalize((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

export function sameStable(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}
