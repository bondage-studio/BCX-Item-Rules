import { SETTINGS_BACKUP_PREFIX, SETTINGS_EXTENSION_KEY, STORAGE_PREFIX } from "./constants";
import type { HostWindow } from "../platform/root";
import type { ActiveItemPayloadState, LocalState, RuleOriginatorSource } from "./types";
import { decodeExtensionSettingsRaw, encodeExtensionSettingsRaw } from "./extension-settings-codec";
import { isPlainObject } from "./utils";

export function getPlayerNumber(root: HostWindow): string {
  const value = root.Player && root.Player.MemberNumber;
  return value == null ? "DEFAULT" : String(value);
}

export function storageKey(root: HostWindow): string {
  return STORAGE_PREFIX + getPlayerNumber(root);
}

function settingsBackupKey(root: HostWindow): string {
  return SETTINGS_BACKUP_PREFIX + getPlayerNumber(root) + "_backup";
}

export function emptyState(): LocalState {
  return { version: 1, activePayloadIds: [], activeItemPayloads: {}, managed: {} };
}

export function loadState(root: HostWindow): LocalState {
  try {
    const extensionActiveItemPayloads = loadActiveItemPayloadsFromExtensionSettings(root);
    const raw = root.localStorage && root.localStorage.getItem(storageKey(root));
    if (!raw) {
      return {
        ...emptyState(),
        activeItemPayloads: extensionActiveItemPayloads.value,
      };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("bad state");
    return {
      version: 1,
      activePayloadIds: Array.isArray(parsed.activePayloadIds) ? parsed.activePayloadIds : [],
      activeItemPayloads: extensionActiveItemPayloads.found
        ? extensionActiveItemPayloads.value
        : normalizeActiveItemPayloads(parsed.activeItemPayloads),
      managed: parsed.managed && typeof parsed.managed === "object" ? parsed.managed : {},
    };
  } catch (error) {
    console.warn("[BCXIR] Failed to load local state; starting clean.", error);
    return emptyState();
  }
}

export function saveState(root: HostWindow, state: LocalState): void {
  try {
    root.localStorage && root.localStorage.setItem(storageKey(root), JSON.stringify(state));
    syncActiveItemPayloadsToExtensionSettings(root, state.activeItemPayloads);
  } catch (error) {
    console.warn("[BCXIR] Failed to save local state.", error);
  }
}

function loadActiveItemPayloadsFromExtensionSettings(root: HostWindow): {
  found: boolean;
  value: Record<string, ActiveItemPayloadState>;
} {
  for (const raw of [
    root.Player?.ExtensionSettings?.[SETTINGS_EXTENSION_KEY],
    root.localStorage?.getItem(settingsBackupKey(root)),
  ]) {
    try {
      const decoded = decodeExtensionSettingsRaw(root, raw);
      if (isPlainObject(decoded) && isPlainObject(decoded.activeItemPayloads)) {
        return { found: true, value: normalizeActiveItemPayloads(decoded.activeItemPayloads) };
      }
      if (isPlainObject(decoded) && isPlainObject(decoded.settings)) {
        return { found: true, value: {} };
      }
    } catch {
      // Try the next extension settings source before falling back to local state.
    }
  }
  return { found: false, value: {} };
}

function syncActiveItemPayloadsToExtensionSettings(
  root: HostWindow,
  activeItemPayloads: Record<string, ActiveItemPayloadState>,
): void {
  if (!root.Player) return;
  const active = normalizeActiveItemPayloads(activeItemPayloads);
  const currentRaw = root.Player?.ExtensionSettings?.[SETTINGS_EXTENSION_KEY];
  const backupRaw = root.localStorage?.getItem(settingsBackupKey(root));
  const decoded = decodeFirstAvailable(root, currentRaw, backupRaw);
  const settings = isPlainObject(decoded) && isPlainObject(decoded.settings)
    ? decoded.settings
    : isPlainObject(decoded)
      ? decoded
      : {};
  const document = Object.keys(active).length
    ? { v: 1, settings, activeItemPayloads: active }
    : { v: 1, settings };
  const encoded = encodeExtensionSettingsRaw(root, document);
  if (currentRaw === encoded && backupRaw === encoded) return;
  root.Player.ExtensionSettings ||= {};
  root.Player.ExtensionSettings[SETTINGS_EXTENSION_KEY] = encoded;
  root.localStorage?.setItem(settingsBackupKey(root), encoded);
  if (typeof root.ServerPlayerExtensionSettingsSync === "function") {
    root.ServerPlayerExtensionSettingsSync(SETTINGS_EXTENSION_KEY);
  }
}

function decodeFirstAvailable(root: HostWindow, ...rawValues: unknown[]): unknown | null {
  for (const raw of rawValues) {
    try {
      const decoded = decodeExtensionSettingsRaw(root, raw);
      if (decoded) return decoded;
    } catch {
      // Try the next source.
    }
  }
  return null;
}

function normalizeActiveItemPayloads(value: unknown): Record<string, ActiveItemPayloadState> {
  const out: Record<string, ActiveItemPayloadState> = {};
  if (!isPlainObject(value)) return out;
  for (const [key, raw] of Object.entries(value)) {
    if (!isPlainObject(raw) || !isPlainObject(raw.payload)) continue;
    const payload = raw.payload;
    if (payload.v !== 1 || typeof payload.id !== "string" || !Array.isArray(payload.r)) continue;
    const itemName = typeof raw.itemName === "string" ? raw.itemName.trim() : "";
    if (!itemName) continue;
    const originatorSource = normalizeOriginatorSource(raw.originatorSource);
    out[key] = {
      payload: payload as unknown as ActiveItemPayloadState["payload"],
      originatorMemberNumber: normalizeMemberNumber(raw.originatorMemberNumber),
      originatorSource,
      allowMinimalCreator: raw.allowMinimalCreator === true,
      itemName,
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
    };
  }
  return out;
}

function normalizeOriginatorSource(value: unknown): RuleOriginatorSource {
  return value === "registry" || value === "cache" ? value : "unknown";
}

function normalizeMemberNumber(value: unknown): number | null {
  const memberNumber = Number(value);
  return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
}
