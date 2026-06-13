import { STORAGE_PREFIX } from "./constants";
import type { HostWindow } from "../platform/root";
import type { LocalState } from "./types";

export function getPlayerNumber(root: HostWindow): string {
  const value = root.Player && root.Player.MemberNumber;
  return value == null ? "DEFAULT" : String(value);
}

export function storageKey(root: HostWindow): string {
  return STORAGE_PREFIX + getPlayerNumber(root);
}

export function emptyState(): LocalState {
  return { version: 1, activePayloadIds: [], managed: {} };
}

export function loadState(root: HostWindow): LocalState {
  try {
    const raw = root.localStorage && root.localStorage.getItem(storageKey(root));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("bad state");
    return {
      version: 1,
      activePayloadIds: Array.isArray(parsed.activePayloadIds) ? parsed.activePayloadIds : [],
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
  } catch (error) {
    console.warn("[BCXIR] Failed to save local state.", error);
  }
}
