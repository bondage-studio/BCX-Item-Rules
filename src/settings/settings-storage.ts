import { SETTINGS_BACKUP_PREFIX, SETTINGS_EXTENSION_KEY } from "../shared/constants";
import type { HostWindow } from "../platform/root";
import type { BCXIRSettings } from "../shared/types";
import { deepClone, isPlainObject } from "../shared/utils";

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

function getLz(root: HostWindow): Pick<NonNullable<Window["LZString"]>, "compressToBase64" | "decompressFromBase64"> | null {
  const lz = root.LZString || (globalThis as any).LZString;
  if (
    lz &&
    typeof lz.compressToBase64 === "function" &&
    typeof lz.decompressFromBase64 === "function"
  ) {
    return lz;
  }
  return null;
}

export function normalizeSettings(value: unknown): BCXIRSettings {
  const source = isPlainObject(value) ? value : {};
  return {
    v: 1,
    enabled: source.enabled !== false,
    scanItemCategoryOnly: source.scanItemCategoryOnly !== false,
    showConflictMessages: source.showConflictMessages !== false,
    showInvalidPayloadMessages: source.showInvalidPayloadMessages !== false,
    debugLogging: source.debugLogging === true,
    fallbackSyncEnabled: source.fallbackSyncEnabled !== false,
    rulePermissionMode: source.rulePermissionMode === "self" ? "self" : "creator",
    allowCachedOfflineCreator: source.allowCachedOfflineCreator !== false,
    allowForeignItemRules: source.allowForeignItemRules !== false,
    respondToRuleRequests: source.respondToRuleRequests !== false,
    autoRequestForeignRules: source.autoRequestForeignRules !== false,
    showTransportMessages: source.showTransportMessages !== false,
  };
}

function decodeSettings(root: HostWindow, raw: unknown): BCXIRSettings | null {
  if (typeof raw !== "string" || !raw) return null;
  const lz = getLz(root);
  if (!lz) throw new Error("LZString base64 codec is unavailable");
  const json = lz.decompressFromBase64(raw);
  if (!json) throw new Error("settings decompression failed");
  return normalizeSettings(JSON.parse(json));
}

function encodeSettings(root: HostWindow, settings: BCXIRSettings): string {
  const lz = getLz(root);
  if (!lz) throw new Error("LZString base64 codec is unavailable");
  const encoded = lz.compressToBase64(JSON.stringify(normalizeSettings(settings)));
  if (typeof encoded !== "string" || !encoded) throw new Error("settings compression failed");
  return encoded;
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
    const next = normalizeSettings({ ...this.current, ...patch, v: 1 });
    this.save(next);
    return this.get();
  }
}
