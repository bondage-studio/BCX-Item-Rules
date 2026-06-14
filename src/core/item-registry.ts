import {
  REGISTRY_STORAGE_PREFIX,
  RULE_CACHE_STORAGE_PREFIX,
} from "../shared/constants";
import type { HostWindow } from "../platform/root";
import type {
  EncodedPayload,
  NormalizedPayload,
  RegistryEntry,
  RegistryState,
  RuleCacheEntry,
  RuleCacheState,
} from "../shared/types";
import { deepClone, isPlainObject, now } from "../shared/utils";
import { normalizePayload } from "./protocol";

export function normalizeItemName(name: unknown): string {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ").toLocaleLowerCase() : "";
}

export function getRegistryStorageKey(memberNumber: number | string): string {
  return REGISTRY_STORAGE_PREFIX + String(memberNumber);
}

export function getRuleCacheStorageKey(memberNumber: number | string): string {
  return RULE_CACHE_STORAGE_PREFIX + String(memberNumber);
}

export function makeRuleCacheKey(crafter: number, itemName: string): string {
  return String(crafter) + ":" + normalizeItemName(itemName);
}

function getPlayerMemberNumber(root: HostWindow): number | null {
  const memberNumber = Number(root.Player?.MemberNumber);
  return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
}

function decodeCraftDescription(root: HostWindow, description: unknown): string {
  if (typeof description !== "string") return "";
  const decoder = root.CraftingDescription?.Decode;
  if (typeof decoder !== "function") return description;
  try {
    return String(decoder(description));
  } catch {
    return description;
  }
}

export function getItemRuleName(item: any): string {
  return String(
    item?.Craft?.Name ||
    item?.Name ||
    item?.Asset?.Name ||
    item?.Asset?.Description ||
    "",
  ).trim();
}

export function getItemNameAndDescriptionConcat(root: HostWindow, item: any): string {
  const name = getItemRuleName(item);
  const description = decodeCraftDescription(root, item?.Craft?.Description);
  return [name, description].filter(Boolean).join(" | ");
}

export function isPhraseInItemName(haystack: unknown, needle: unknown): boolean {
  const source = normalizeItemName(haystack);
  const target = normalizeItemName(needle);
  return !!source && !!target && source.includes(target);
}

function normalizeRegistryEntry(value: unknown): RegistryEntry | null {
  if (!isPlainObject(value)) return null;
  const itemName = typeof value.itemName === "string" ? value.itemName.trim() : "";
  if (!itemName) return null;
  try {
    return {
      id: typeof value.id === "string" && value.id ? value.id : "registry:" + normalizeItemName(itemName),
      itemName,
      enabled: value.enabled !== false,
      selfOnly: value.selfOnly === true,
      payload: normalizePayload(value.payload),
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
    };
  } catch {
    return null;
  }
}

export function normalizeRegistryState(value: unknown): RegistryState {
  const out: RegistryState = { v: 1, entries: {} };
  const entries = isPlainObject(value) && isPlainObject(value.entries) ? value.entries : {};
  for (const raw of Object.values(entries)) {
    const entry = normalizeRegistryEntry(raw);
    if (entry) out.entries[normalizeItemName(entry.itemName)] = entry;
  }
  return out;
}

function readJsonState(root: HostWindow, key: string): unknown {
  const raw = root.localStorage?.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw);
}

function writeJsonState(root: HostWindow, key: string, value: unknown): void {
  root.localStorage?.setItem(key, JSON.stringify(value));
}

export function loadRegistry(root: HostWindow, memberNumber = getPlayerMemberNumber(root)): RegistryState {
  if (memberNumber == null) return { v: 1, entries: {} };
  try {
    return normalizeRegistryState(readJsonState(root, getRegistryStorageKey(memberNumber)));
  } catch (error) {
    console.warn("[BCXIR] Failed to load local item rule registry; using empty registry.", error);
    return { v: 1, entries: {} };
  }
}

export function saveRegistry(
  root: HostWindow,
  state: RegistryState,
  memberNumber = getPlayerMemberNumber(root),
): void {
  if (memberNumber == null) return;
  writeJsonState(root, getRegistryStorageKey(memberNumber), normalizeRegistryState(state));
}

export function listRegistryEntries(root: HostWindow, memberNumber = getPlayerMemberNumber(root)): RegistryEntry[] {
  return Object.values(loadRegistry(root, memberNumber).entries).map((entry) => deepClone(entry));
}

export function getRegisteredItem(
  root: HostWindow,
  itemName: string,
  memberNumber = getPlayerMemberNumber(root),
): RegistryEntry | null {
  return deepClone(loadRegistry(root, memberNumber).entries[normalizeItemName(itemName)] || null);
}

export function registerItemRules(
  root: HostWindow,
  itemName: string,
  payload: EncodedPayload | NormalizedPayload,
  memberNumber = getPlayerMemberNumber(root),
): RegistryEntry {
  const cleanName = itemName.trim();
  if (!cleanName) throw new Error("itemName is required");
  const normalizedPayload = normalizePayload(payload);
  const state = loadRegistry(root, memberNumber);
  const key = normalizeItemName(cleanName);
  const existing = state.entries[key];
  const entry: RegistryEntry = {
    id: existing?.id || "registry:" + key + ":" + now(),
    itemName: cleanName,
    enabled: true,
    selfOnly: existing?.selfOnly === true,
    payload: normalizedPayload,
    updatedAt: now(),
  };
  state.entries[key] = entry;
  saveRegistry(root, state, memberNumber);
  return deepClone(entry);
}

export function updateRegisteredItem(
  root: HostWindow,
  currentItemName: string,
  patch: Partial<Pick<RegistryEntry, "itemName" | "enabled" | "selfOnly" | "payload">>,
  memberNumber = getPlayerMemberNumber(root),
): RegistryEntry | null {
  const state = loadRegistry(root, memberNumber);
  const currentKey = normalizeItemName(currentItemName);
  const existing = state.entries[currentKey];
  if (!existing) return null;
  const nextName = typeof patch.itemName === "string" && patch.itemName.trim()
    ? patch.itemName.trim()
    : existing.itemName;
  const next: RegistryEntry = {
    ...existing,
    itemName: nextName,
    enabled: patch.enabled === undefined ? existing.enabled : patch.enabled !== false,
    selfOnly: patch.selfOnly === undefined ? existing.selfOnly === true : patch.selfOnly === true,
    payload: patch.payload === undefined ? existing.payload : normalizePayload(patch.payload),
    updatedAt: now(),
  };
  delete state.entries[currentKey];
  state.entries[normalizeItemName(nextName)] = next;
  saveRegistry(root, state, memberNumber);
  return deepClone(next);
}

export function deleteRegisteredItem(
  root: HostWindow,
  itemName: string,
  memberNumber = getPlayerMemberNumber(root),
): boolean {
  const state = loadRegistry(root, memberNumber);
  const key = normalizeItemName(itemName);
  if (!state.entries[key]) return false;
  delete state.entries[key];
  saveRegistry(root, state, memberNumber);
  return true;
}

export function clearRegistry(root: HostWindow, memberNumber = getPlayerMemberNumber(root)): void {
  if (memberNumber == null) return;
  root.localStorage?.removeItem(getRegistryStorageKey(memberNumber));
}

export function findMatchingRegistryEntry(
  root: HostWindow,
  itemOrName: any,
  memberNumber = getPlayerMemberNumber(root),
): RegistryEntry | null {
  const itemText = typeof itemOrName === "string"
    ? itemOrName
    : getItemNameAndDescriptionConcat(root, itemOrName);
  for (const entry of Object.values(loadRegistry(root, memberNumber).entries)) {
    if (entry.enabled && isPhraseInItemName(itemText, entry.itemName)) return deepClone(entry);
  }
  return null;
}

function normalizeRuleCacheEntry(value: unknown): RuleCacheEntry | null {
  if (!isPlainObject(value)) return null;
  const crafter = Number(value.crafter);
  const itemName = typeof value.itemName === "string" ? value.itemName.trim() : "";
  if (!Number.isFinite(crafter) || crafter <= 0 || !itemName) return null;
  try {
    return {
      cacheKey: makeRuleCacheKey(crafter, itemName),
      crafter,
      itemName,
      payload: normalizePayload(value.payload),
      updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0,
    };
  } catch {
    return null;
  }
}

export function normalizeRuleCacheState(value: unknown): RuleCacheState {
  const out: RuleCacheState = { v: 1, entries: {} };
  const entries = isPlainObject(value) && isPlainObject(value.entries) ? value.entries : {};
  for (const raw of Object.values(entries)) {
    const entry = normalizeRuleCacheEntry(raw);
    if (entry) out.entries[entry.cacheKey] = entry;
  }
  return out;
}

export function loadRuleCache(root: HostWindow, memberNumber = getPlayerMemberNumber(root)): RuleCacheState {
  if (memberNumber == null) return { v: 1, entries: {} };
  try {
    return normalizeRuleCacheState(readJsonState(root, getRuleCacheStorageKey(memberNumber)));
  } catch (error) {
    console.warn("[BCXIR] Failed to load item rule cache; using empty cache.", error);
    return { v: 1, entries: {} };
  }
}

export function saveRuleCache(
  root: HostWindow,
  state: RuleCacheState,
  memberNumber = getPlayerMemberNumber(root),
): void {
  if (memberNumber == null) return;
  writeJsonState(root, getRuleCacheStorageKey(memberNumber), normalizeRuleCacheState(state));
}

export function getCachedItemRules(root: HostWindow, crafter: number, itemName: string): RuleCacheEntry | null {
  return deepClone(loadRuleCache(root).entries[makeRuleCacheKey(crafter, itemName)] || null);
}

export function listRuleCacheEntries(root: HostWindow): RuleCacheEntry[] {
  return Object.values(loadRuleCache(root).entries)
    .map((entry) => deepClone(entry))
    .sort((a, b) => a.itemName.localeCompare(b.itemName) || a.crafter - b.crafter);
}

export function cacheItemRules(
  root: HostWindow,
  crafter: number,
  itemName: string,
  payload: EncodedPayload | NormalizedPayload,
): RuleCacheEntry {
  const cleanName = itemName.trim();
  if (!cleanName) throw new Error("itemName is required");
  const state = loadRuleCache(root);
  const entry: RuleCacheEntry = {
    cacheKey: makeRuleCacheKey(crafter, cleanName),
    crafter,
    itemName: cleanName,
    payload: normalizePayload(payload),
    updatedAt: now(),
  };
  state.entries[entry.cacheKey] = entry;
  saveRuleCache(root, state);
  return deepClone(entry);
}

export function clearRuleCache(root: HostWindow): void {
  const memberNumber = getPlayerMemberNumber(root);
  if (memberNumber == null) return;
  root.localStorage?.removeItem(getRuleCacheStorageKey(memberNumber));
}

export function deleteCachedItemRules(root: HostWindow, cacheKey: string): boolean {
  const state = loadRuleCache(root);
  if (!state.entries[cacheKey]) return false;
  delete state.entries[cacheKey];
  saveRuleCache(root, state);
  return true;
}
