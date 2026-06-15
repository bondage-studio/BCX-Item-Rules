import { SETTINGS_BACKUP_PREFIX, SETTINGS_EXTENSION_KEY } from "../shared/constants";
import type { HostWindow } from "../platform/root";
import type { BCXIRSettings } from "../shared/types";
import { decodeExtensionSettingsRaw, encodeExtensionSettingsRaw } from "../shared/extension-settings-codec";
import { deepClone, isPlainObject } from "../shared/utils";
import { filterSettingsPatchForWornItemLock } from "../core/worn-item-lock";

export const DEFAULT_SETTINGS: BCXIRSettings = {
  v: 1,
  enabled: true,
  scanItemCategoryOnly: true,
  showConflictMessages: true,
  showInvalidPayloadMessages: true,
  debugLogging: false,
  fallbackSyncEnabled: true,
  rulePermissionMode: "creator",
  allowCachedOfflineCreator: true,
  dangerModeEnabled: false,
  unlockUseMeMode: false,
  useMeSuspendInactiveConflicts: false,
  lockWornItemRules: false,
  allowForeignItemRules: true,
  respondToRuleRequests: true,
  autoRequestForeignRules: true,
  showTransportMessages: true,
};

export interface SettingsStore {
  get(): BCXIRSettings;
  update(patch: Partial<Omit<BCXIRSettings, "v">>): BCXIRSettings;
  save(settings: BCXIRSettings): void;
  load(): BCXIRSettings;
}

export function getSettingsBackupKey(root: HostWindow): string {
  const number = root.Player?.MemberNumber == null ? "DEFAULT" : String(root.Player.MemberNumber);
  return SETTINGS_BACKUP_PREFIX + number + "_backup";
}

export function normalizeSettings(value: unknown): BCXIRSettings {
  const source = isPlainObject(value) ? value : {};
  const dangerModeEnabled = source.dangerModeEnabled === true;
  const unlockUseMeMode = dangerModeEnabled && source.unlockUseMeMode === true;
  const rulePermissionMode = source.rulePermissionMode === "self"
    ? "self"
    : source.rulePermissionMode === "useMe" && unlockUseMeMode
      ? "useMe"
      : "creator";
  return {
    v: 1,
    enabled: source.enabled !== false,
    scanItemCategoryOnly: source.scanItemCategoryOnly !== false,
    showConflictMessages: source.showConflictMessages !== false,
    showInvalidPayloadMessages: source.showInvalidPayloadMessages !== false,
    debugLogging: source.debugLogging === true,
    fallbackSyncEnabled: source.fallbackSyncEnabled !== false,
    rulePermissionMode,
    allowCachedOfflineCreator: source.allowCachedOfflineCreator !== false,
    dangerModeEnabled,
    unlockUseMeMode,
    useMeSuspendInactiveConflicts: dangerModeEnabled && source.useMeSuspendInactiveConflicts === true,
    lockWornItemRules: source.lockWornItemRules === true,
    allowForeignItemRules: source.allowForeignItemRules !== false,
    respondToRuleRequests: source.respondToRuleRequests !== false,
    autoRequestForeignRules: source.autoRequestForeignRules !== false,
    showTransportMessages: source.showTransportMessages !== false,
  };
}

function decodeSettings(root: HostWindow, raw: unknown): BCXIRSettings | null {
  const decoded = decodeExtensionSettingsRaw(root, raw);
  if (!decoded) return null;
  const settings = isPlainObject(decoded) && isPlainObject(decoded.settings) ? decoded.settings : decoded;
  return normalizeSettings(settings);
}

function encodeSettings(root: HostWindow, settings: BCXIRSettings): string {
  const activeItemPayloads = readExistingActiveItemPayloads(root);
  const document = activeItemPayloads
    ? { v: 1, settings: normalizeSettings(settings), activeItemPayloads }
    : { v: 1, settings: normalizeSettings(settings) };
  return encodeExtensionSettingsRaw(root, document);
}

function readExistingActiveItemPayloads(root: HostWindow): unknown | null {
  for (const raw of [
    root.Player?.ExtensionSettings?.[SETTINGS_EXTENSION_KEY],
    root.localStorage?.getItem(getSettingsBackupKey(root)),
  ]) {
    try {
      const decoded = decodeExtensionSettingsRaw(root, raw);
      if (isPlainObject(decoded) && isPlainObject(decoded.activeItemPayloads)) return decoded.activeItemPayloads;
    } catch {
      // Preserve settings saves even if the previous document cannot be decoded.
    }
  }
  return null;
}

export class ExtensionSettingsStore implements SettingsStore {
  private current: BCXIRSettings = deepClone(DEFAULT_SETTINGS);
  private warnedLoadFailure = false;

  constructor(private readonly root: HostWindow) {}

  get(): BCXIRSettings {
    return deepClone(this.current);
  }

  load(): BCXIRSettings {
    const extensionRaw = this.root.Player?.ExtensionSettings?.[SETTINGS_EXTENSION_KEY];
    const backupRaw = this.root.localStorage?.getItem(getSettingsBackupKey(this.root));
    for (const raw of [extensionRaw, backupRaw]) {
      try {
        const parsed = decodeSettings(this.root, raw);
        if (parsed) {
          this.current = parsed;
          return this.get();
        }
      } catch (error) {
        if (!this.warnedLoadFailure) {
          this.warnedLoadFailure = true;
          console.warn("[BCXIR] Failed to load settings; using defaults.", error);
        }
      }
    }
    this.current = deepClone(DEFAULT_SETTINGS);
    return this.get();
  }

  save(settings: BCXIRSettings): void {
    this.current = normalizeSettings(settings);
    try {
      const encoded = encodeSettings(this.root, this.current);
      this.root.Player.ExtensionSettings ||= {};
      this.root.Player.ExtensionSettings[SETTINGS_EXTENSION_KEY] = encoded;
      this.root.localStorage?.setItem(getSettingsBackupKey(this.root), encoded);
      if (typeof this.root.ServerPlayerExtensionSettingsSync === "function") {
        this.root.ServerPlayerExtensionSettingsSync(SETTINGS_EXTENSION_KEY);
      }
    } catch (error) {
      console.warn("[BCXIR] Failed to save settings.", error);
    }
  }

  update(patch: Partial<Omit<BCXIRSettings, "v">>): BCXIRSettings {
    const filteredPatch = filterSettingsPatchForWornItemLock(this.root, this.current, patch);
    const next = normalizeSettings({ ...this.current, ...filteredPatch, v: 1 });
    this.save(next);
    return this.get();
  }
}
