import { SETTINGS_BACKUP_PREFIX, SETTINGS_EXTENSION_KEY } from "./constants";
import type { CloudDocument, RegistryState, RegistryTombstone } from "./types";
import { decodeExtensionSettingsRaw, encodeExtensionSettingsRaw } from "./extension-settings-codec";
import type { HostWindow } from "../platform/root";
import { deepClone, isPlainObject } from "./utils";

const DEVICE_ID_KEY = "BCXIR_device_id";

export interface SaveCloudDocumentOptions {
  replace?: Array<"activeItemPayloads" | "managed" | "targetManaged" | "registry" | "registryTombstones">;
}

export function getPlayerNumber(root: HostWindow): string {
  const value = root.Player && root.Player.MemberNumber;
  return value == null ? "DEFAULT" : String(value);
}

export function getSettingsBackupKey(root: HostWindow): string {
  return SETTINGS_BACKUP_PREFIX + getPlayerNumber(root) + "_backup";
}

export function readCloudDocument(root: HostWindow): CloudDocument {
  for (const raw of [
    root.Player?.ExtensionSettings?.[SETTINGS_EXTENSION_KEY],
    root.localStorage?.getItem(getSettingsBackupKey(root)),
  ]) {
    try {
      const decoded = decodeExtensionSettingsRaw(root, raw);
      const normalized = normalizeCloudDocument(decoded);
      if (normalized) return normalized;
    } catch {
      // Try the backup source before falling back to an empty document.
    }
  }
  return emptyCloudDocument();
}

export function saveCloudDocument(
  root: HostWindow,
  patch: Partial<CloudDocument>,
  options: SaveCloudDocumentOptions = {},
): CloudDocument {
  const current = readCloudDocument(root);
  const next = mergeCloudDocument(current, normalizeCloudDocument(patch) || emptyCloudDocument(), options);
  next.meta = {
    updatedAt: Date.now(),
    deviceId: getDeviceId(root),
  };
  const encoded = encodeExtensionSettingsRaw(root, next);
  root.Player.ExtensionSettings ||= {};
  root.Player.ExtensionSettings[SETTINGS_EXTENSION_KEY] = encoded;
  root.localStorage?.setItem(getSettingsBackupKey(root), encoded);
  if (typeof root.ServerPlayerExtensionSettingsSync === "function") {
    root.ServerPlayerExtensionSettingsSync(SETTINGS_EXTENSION_KEY);
  }
  return deepClone(next);
}

export function normalizeCloudDocument(value: unknown): CloudDocument | null {
  if (!isPlainObject(value)) return null;
  const out = emptyCloudDocument();
  out.settings = isPlainObject(value.settings)
    ? deepClone(value.settings as CloudDocument["settings"])
    : looksLikeLegacySettings(value)
      ? deepClone(value as CloudDocument["settings"])
      : undefined;
  out.registry = normalizeRegistry(value.registry);
  out.registryTombstones = normalizeRegistryTombstones(value.registryTombstones);
  out.activeItemPayloads = isPlainObject(value.activeItemPayloads)
    ? deepClone(value.activeItemPayloads as CloudDocument["activeItemPayloads"])
    : undefined;
  out.managed = isPlainObject(value.managed)
    ? deepClone(value.managed as CloudDocument["managed"])
    : undefined;
  out.targetManaged = isPlainObject(value.targetManaged)
    ? deepClone(value.targetManaged as CloudDocument["targetManaged"])
    : undefined;
  if (isPlainObject(value.meta)) {
    out.meta = {
      updatedAt: Number.isFinite(Number(value.meta.updatedAt)) ? Number(value.meta.updatedAt) : 0,
      deviceId: typeof value.meta.deviceId === "string" ? value.meta.deviceId : "",
    };
  }
  return out;
}

function emptyCloudDocument(): CloudDocument {
  return { v: 1 };
}

function mergeCloudDocument(
  current: CloudDocument,
  patch: CloudDocument,
  options: SaveCloudDocumentOptions,
): CloudDocument {
  const replace = new Set(options.replace || []);
  const next: CloudDocument = { v: 1 };
  next.settings = patch.settings !== undefined ? deepClone(patch.settings) : deepClone(current.settings);
  next.registry = replace.has("registry")
    ? deepClone(patch.registry)
    : mergeUpdatedEntries(current.registry, patch.registry, "entries");
  next.registryTombstones = replace.has("registryTombstones")
    ? deepClone(patch.registryTombstones)
    : mergeUpdatedMaps(current.registryTombstones, patch.registryTombstones);
  next.activeItemPayloads = replace.has("activeItemPayloads")
    ? deepClone(patch.activeItemPayloads)
    : mergeUpdatedMaps(current.activeItemPayloads, patch.activeItemPayloads);
  next.managed = replace.has("managed")
    ? deepClone(patch.managed)
    : mergeUpdatedMaps(current.managed, patch.managed);
  next.targetManaged = replace.has("targetManaged")
    ? deepClone(patch.targetManaged)
    : mergeUpdatedMaps(current.targetManaged, patch.targetManaged);
  return stripEmptyCloudDocument(next);
}

function mergeUpdatedEntries<T extends { updatedAt?: number }>(
  current: { v: 1; entries: Record<string, T> } | undefined,
  patch: { v: 1; entries: Record<string, T> } | undefined,
  key: "entries",
): { v: 1; entries: Record<string, T> } | undefined {
  const merged = mergeUpdatedMaps(current?.[key], patch?.[key]);
  return merged ? { v: 1, entries: merged } : undefined;
}

function mergeUpdatedMaps<T extends { updatedAt?: number }>(
  current: Record<string, T> | undefined,
  patch: Record<string, T> | undefined,
): Record<string, T> | undefined {
  if (current === undefined && patch === undefined) return undefined;
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(current || {})) out[key] = deepClone(value);
  for (const [key, value] of Object.entries(patch || {})) {
    const previous = out[key];
    if (!previous || Number(value.updatedAt || 0) >= Number(previous.updatedAt || 0)) {
      out[key] = deepClone(value);
    }
  }
  return out;
}

function stripEmptyCloudDocument(document: CloudDocument): CloudDocument {
  const next = deepClone(document);
  return next;
}

function normalizeRegistry(value: unknown): CloudDocument["registry"] {
  if (!isPlainObject(value) || !isPlainObject(value.entries)) return undefined;
  return { v: 1, entries: deepClone(value.entries as RegistryState["entries"]) };
}

function normalizeRegistryTombstones(value: unknown): Record<string, RegistryTombstone> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, RegistryTombstone> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isPlainObject(raw)) continue;
    const itemName = typeof raw.itemName === "string" ? raw.itemName.trim() : key;
    const updatedAt = Number(raw.updatedAt);
    const deletedAt = Number(raw.deletedAt);
    if (!itemName || !Number.isFinite(updatedAt) || !Number.isFinite(deletedAt)) continue;
    out[key] = { itemName, updatedAt, deletedAt };
  }
  return Object.keys(out).length ? out : undefined;
}

function looksLikeLegacySettings(value: Record<string, unknown>): boolean {
  return value.v === 1 && (
    "enabled" in value ||
    "rulePermissionMode" in value ||
    "allowForeignItemRules" in value ||
    "respondToRuleRequests" in value
  );
}

function getDeviceId(root: HostWindow): string {
  const existing = root.localStorage?.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = [
    "bcxir",
    String(Date.now()),
    String(Math.floor(Math.random() * 1000000000)),
  ].join("-");
  root.localStorage?.setItem(DEVICE_ID_KEY, next);
  return next;
}
