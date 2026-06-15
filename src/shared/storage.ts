import { STORAGE_PREFIX } from "./constants";
import type { HostWindow } from "../platform/root";
import type { ActiveItemPayloadState, LocalState, RuleOriginatorSource, TargetAppearanceState, TargetManagedRuleState } from "./types";
import { isPlainObject } from "./utils";
import { getPlayerNumber, readCloudDocument, saveCloudDocument } from "./cloud-document";

export function storageKey(root: HostWindow): string {
  return STORAGE_PREFIX + getPlayerNumber(root);
}

export function emptyState(): LocalState {
  return {
    version: 1,
    activePayloadIds: [],
    activeItemPayloads: {},
    managed: {},
    targetAppearances: {},
    targetManaged: {},
  };
}

export function loadState(root: HostWindow): LocalState {
  try {
    const cloud = readCloudDocument(root);
    const raw = root.localStorage && root.localStorage.getItem(storageKey(root));
    if (!raw) {
      return {
        ...emptyState(),
        activeItemPayloads: normalizeActiveItemPayloads(cloud.activeItemPayloads),
        managed: isPlainObject(cloud.managed) ? cloud.managed : {},
        targetManaged: normalizeTargetManaged(cloud.targetManaged),
      };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("bad state");
    return {
      version: 1,
      activePayloadIds: Array.isArray(parsed.activePayloadIds) ? parsed.activePayloadIds : [],
      activeItemPayloads: isPlainObject(cloud.activeItemPayloads)
        ? normalizeActiveItemPayloads(cloud.activeItemPayloads)
        : normalizeActiveItemPayloads(parsed.activeItemPayloads),
      managed: isPlainObject(cloud.managed)
        ? cloud.managed
        : parsed.managed && typeof parsed.managed === "object" ? parsed.managed : {},
      targetAppearances: normalizeTargetAppearances(parsed.targetAppearances),
      targetManaged: isPlainObject(cloud.targetManaged)
        ? normalizeTargetManaged(cloud.targetManaged)
        : normalizeTargetManaged(parsed.targetManaged),
    };
  } catch (error) {
    console.warn("[BCXIR] Failed to load local state; starting clean.", error);
    return emptyState();
  }
}

export function saveState(root: HostWindow, state: LocalState): void {
  try {
    root.localStorage && root.localStorage.setItem(storageKey(root), JSON.stringify(state));
    saveCloudDocument(root, {
      activeItemPayloads: normalizeActiveItemPayloads(state.activeItemPayloads),
      managed: state.managed,
      targetManaged: normalizeTargetManaged(state.targetManaged),
    }, { replace: ["activeItemPayloads", "managed", "targetManaged"] });
  } catch (error) {
    console.warn("[BCXIR] Failed to save local state.", error);
  }
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

function normalizeTargetAppearances(value: unknown): Record<string, TargetAppearanceState> {
  const out: Record<string, TargetAppearanceState> = {};
  if (!isPlainObject(value)) return out;
  for (const [key, raw] of Object.entries(value)) {
    if (!isPlainObject(raw)) continue;
    const memberNumber = normalizeMemberNumber(raw.memberNumber);
    const desiredHash = typeof raw.desiredHash === "string" ? raw.desiredHash : "";
    if (memberNumber == null || !desiredHash) continue;
    out[key] = {
      memberNumber,
      desiredHash,
      itemKeys: normalizeStringArray(raw.itemKeys),
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
    };
  }
  return out;
}

function normalizeTargetManaged(value: unknown): Record<string, TargetManagedRuleState> {
  const out: Record<string, TargetManagedRuleState> = {};
  if (!isPlainObject(value)) return out;
  for (const [key, raw] of Object.entries(value)) {
    if (!isPlainObject(raw) || !isPlainObject(raw.lastApplied)) continue;
    const targetMemberNumber = normalizeMemberNumber(raw.targetMemberNumber);
    const ruleId = typeof raw.ruleId === "string" ? raw.ruleId.trim() : "";
    if (targetMemberNumber == null || !ruleId) continue;
    out[key] = {
      targetMemberNumber,
      ruleId,
      lastApplied: raw.lastApplied as unknown as TargetManagedRuleState["lastApplied"],
      payloadIds: normalizeStringArray(raw.payloadIds),
      itemKeys: normalizeStringArray(raw.itemKeys),
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
    };
  }
  return out;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))).sort();
}
