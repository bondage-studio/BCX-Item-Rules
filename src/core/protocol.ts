import { MAX_ENCODED_LENGTH } from "../shared/constants";
import type { EncodedPayload, EncodedRule, NormalizedPayload, NormalizedRule } from "../shared/types";
import { deepClone, isPlainObject } from "../shared/utils";

export interface LZStringLike {
  compressToEncodedURIComponent(value: string): string;
  decompressFromEncodedURIComponent(value: string): string | null;
}

let codecOverride: LZStringLike | null = null;

export function setCodecForTests(codec: LZStringLike | null): void {
  codecOverride = codec;
}

function getLZString(): LZStringLike {
  if (codecOverride) return codecOverride;
  const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const lz = (root as any).LZString || (globalThis as any).LZString;
  if (
    !lz ||
    typeof lz.compressToEncodedURIComponent !== "function" ||
    typeof lz.decompressFromEncodedURIComponent !== "function"
  ) {
    throw new Error("LZString is unavailable");
  }
  return lz;
}

function normalizeRequirements(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) throw new Error("requirements must be object or null");
  return deepClone(value);
}

export function normalizeRuleEntry(entry: unknown): NormalizedRule {
  if (!isPlainObject(entry)) throw new Error("rule entry must be an object");
  const rule = typeof entry.k === "string" ? entry.k.trim() : "";
  if (!rule) throw new Error("rule entry is missing k");
  const priority = Number.isFinite(Number(entry.p)) ? Number(entry.p) : 0;
  const customData = entry.d === undefined ? undefined : deepClone(entry.d);
  if (customData !== undefined && !isPlainObject(customData)) {
    throw new Error("rule customData must be an object");
  }
  return {
    k: rule,
    e: entry.e === 0 ? 0 : 1,
    l: entry.l === 0 ? 0 : 1,
    d: customData as Record<string, unknown> | undefined,
    q: normalizeRequirements(entry.q),
    t: entry.t === undefined ? null : (entry.t === null ? null : Number(entry.t)),
    tr: entry.tr === 1 ? 1 : 0,
    p: priority,
  };
}

export function normalizePayload(payload: unknown): NormalizedPayload {
  if (!isPlainObject(payload)) throw new Error("payload must be an object");
  if (payload.v !== 1) throw new Error("unsupported payload version");
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) throw new Error("payload is missing id");
  if (!Array.isArray(payload.r)) throw new Error("payload rules must be an array");
  return {
    v: 1,
    id,
    r: payload.r.map(normalizeRuleEntry),
  };
}

export function encodePayload(payload: EncodedPayload | NormalizedPayload): string {
  const normalized = normalizePayload(payload);
  const encoded = getLZString().compressToEncodedURIComponent(JSON.stringify(normalized));
  if (!encoded || encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error("encoded BCXIR payload is empty or too large");
  }
  return encoded;
}

export function decodePayload(encoded: string): NormalizedPayload {
  if (typeof encoded !== "string" || !encoded.trim()) throw new Error("encoded payload is empty");
  const json = getLZString().decompressFromEncodedURIComponent(encoded.trim());
  if (!json) throw new Error("payload decompression failed");
  return normalizePayload(JSON.parse(json));
}

export type { EncodedPayload, EncodedRule, NormalizedPayload, NormalizedRule };
