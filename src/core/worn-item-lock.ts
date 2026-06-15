import type { HostWindow } from "../platform/root";
import type { BCXIRSettings } from "../shared/types";
import { getCachedItemRules, getItemRuleName, findMatchingRegistryEntry, makeRuleCacheKey, normalizeItemName } from "./item-registry";
import { isWearerItem } from "./scanner";

export interface WornItemRuleLockState {
  enabled: boolean;
  active: boolean;
  protectedItemCount: number;
  registryItemNames: Set<string>;
  cacheKeys: Set<string>;
  remoteItemKeys: Set<string>;
}

const LOCKED_SETTING_KEYS = new Set([
  "rulePermissionMode",
  "dangerModeEnabled",
  "unlockUseMeMode",
  "useMeSuspendInactiveConflicts",
  "allowCachedOfflineCreator",
  "lockWornItemRules",
]);

export function getWornItemRuleLockState(root: HostWindow, settings: Pick<BCXIRSettings, "lockWornItemRules" | "scanItemCategoryOnly">): WornItemRuleLockState {
  const state: WornItemRuleLockState = {
    enabled: settings.lockWornItemRules === true,
    active: false,
    protectedItemCount: 0,
    registryItemNames: new Set(),
    cacheKeys: new Set(),
    remoteItemKeys: new Set(),
  };
  if (!state.enabled) return state;

  const playerNumber = normalizeMemberNumber(root.Player?.MemberNumber);
  const appearance = Array.isArray(root.Player?.Appearance) ? root.Player.Appearance : [];
  for (const item of appearance) {
    if (!isWearerItem(item, { scanItemCategoryOnly: settings.scanItemCategoryOnly })) continue;
    const itemName = getItemRuleName(item);
    if (!itemName) continue;
    const crafter = normalizeMemberNumber(item?.Craft?.MemberNumber);
    if (playerNumber != null && crafter === playerNumber) {
      const entry = findMatchingRegistryEntry(root, item);
      if (!entry) continue;
      state.registryItemNames.add(normalizeItemName(entry.itemName));
      state.protectedItemCount += 1;
      continue;
    }
    if (crafter == null) continue;
    const cacheKey = makeRuleCacheKey(crafter, itemName);
    state.remoteItemKeys.add(cacheKey);
    const cached = getCachedItemRules(root, crafter, itemName);
    if (cached) state.cacheKeys.add(cached.cacheKey);
    state.protectedItemCount += 1;
  }
  state.active = state.protectedItemCount > 0;
  return state;
}

export function isWornItemRuleLockActive(root: HostWindow, settings: BCXIRSettings): boolean {
  return getWornItemRuleLockState(root, settings).active;
}

export function canModifyRegisteredItem(root: HostWindow, settings: BCXIRSettings, itemName: string): boolean {
  const lock = getWornItemRuleLockState(root, settings);
  return !lock.active || !lock.registryItemNames.has(normalizeItemName(itemName));
}

export function canModifyCacheEntry(root: HostWindow, settings: BCXIRSettings, cacheKey: string): boolean {
  const lock = getWornItemRuleLockState(root, settings);
  return !lock.active || !lock.cacheKeys.has(cacheKey);
}

export function canRefreshRemoteItemRules(root: HostWindow, settings: BCXIRSettings, crafter: number, itemName: string): boolean {
  const lock = getWornItemRuleLockState(root, settings);
  return !lock.active || !lock.remoteItemKeys.has(makeRuleCacheKey(crafter, itemName));
}

export function hasLockedRegistryEntries(root: HostWindow, settings: BCXIRSettings): boolean {
  return getWornItemRuleLockState(root, settings).registryItemNames.size > 0;
}

export function hasLockedCacheEntries(root: HostWindow, settings: BCXIRSettings): boolean {
  return getWornItemRuleLockState(root, settings).cacheKeys.size > 0;
}

export function filterSettingsPatchForWornItemLock<T extends Record<string, unknown>>(
  root: HostWindow,
  current: BCXIRSettings,
  patch: T,
): Partial<T> {
  if (!isWornItemRuleLockActive(root, current)) return patch;
  const next: Partial<T> = { ...patch };
  for (const key of LOCKED_SETTING_KEYS) delete next[key];
  return next;
}

function normalizeMemberNumber(value: unknown): number | null {
  const memberNumber = Number(value);
  return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
}
