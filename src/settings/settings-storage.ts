import type { HostWindow } from "../platform/root";
import type { BCXIRSettings } from "../shared/types";
import { deepClone, isPlainObject } from "../shared/utils";
import { filterSettingsPatchForWornItemLock } from "../core/worn-item-lock";
import { readCloudDocument, saveCloudDocument } from "../shared/cloud-document";

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
  applyMyRulesToNonPluginUsers: false,
  removeMyRulesFromNonPluginUsers: false,
  showTransportMessages: true,
};

export interface SettingsStore {
  get(): BCXIRSettings;
  update(patch: Partial<Omit<BCXIRSettings, "v">>): BCXIRSettings;
  save(settings: BCXIRSettings): void;
  load(): BCXIRSettings;
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
    applyMyRulesToNonPluginUsers: source.applyMyRulesToNonPluginUsers === true,
    removeMyRulesFromNonPluginUsers: source.removeMyRulesFromNonPluginUsers === true,
    showTransportMessages: source.showTransportMessages !== false,
  };
}


export class ExtensionSettingsStore implements SettingsStore {
  private current: BCXIRSettings = deepClone(DEFAULT_SETTINGS);
  private warnedLoadFailure = false;

  constructor(private readonly root: HostWindow) {}

  get(): BCXIRSettings {
    return deepClone(this.current);
  }

  load(): BCXIRSettings {
    try {
      const settings = readCloudDocument(this.root).settings;
      if (isPlainObject(settings)) {
        this.current = normalizeSettings(settings);
        return this.get();
      }
    } catch (error) {
      if (!this.warnedLoadFailure) {
        this.warnedLoadFailure = true;
        console.warn("[BCXIR] Failed to load settings; using defaults.", error);
      }
    }
    this.current = deepClone(DEFAULT_SETTINGS);
    return this.get();
  }

  save(settings: BCXIRSettings): void {
    this.current = normalizeSettings(settings);
    try {
      saveCloudDocument(this.root, { settings: this.current });
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
