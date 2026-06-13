import {
  appendPayloadToDescription,
  decodePayload,
  encodePayload,
  parsePayloadsFromDescription,
  readPayloadsFromItem,
  stripMarkers,
} from "../core/protocol";
import { MARKER_PREFIX, VERSION } from "../shared/constants";
import { collectDesiredRulesFromAppearance } from "../core/scanner";
import type { SettingsRegistry } from "../settings/settings-registry";
import type { SettingsStore } from "../settings/settings-storage";
import type { RuleSynchronizer } from "../core/sync";
import type { AuthoringSession } from "../authoring/authoring-session";

export function buildPublicApi(
  synchronizer: RuleSynchronizer,
  settingsStore: SettingsStore,
  settingsRegistry: SettingsRegistry,
  authoring?: AuthoringSession,
) {
  return {
    version: VERSION,
    markerPrefix: MARKER_PREFIX,
    encodePayload,
    decodePayload,
    stripMarkers,
    appendPayloadToDescription,
    parsePayloadsFromDescription,
    readPayloadsFromItem,
    collectDesiredRulesFromAppearance,
    syncNow: (reason?: string) => synchronizer.syncNow(reason),
    scheduleSync: (reason?: string) => synchronizer.scheduleSync(reason),
    getSettings: () => settingsStore.get(),
    updateSettings: (patch: Parameters<SettingsStore["update"]>[0]) => {
      const next = settingsStore.update(patch);
      synchronizer.startFallbackTimer();
      synchronizer.scheduleSync("settings-api");
      return next;
    },
    openSettings: () => settingsRegistry.open(),
    openAuthoring: () => authoring?.open() ?? Promise.resolve(false),
    finishAuthoring: () => authoring?.finish() ?? Promise.resolve(null),
    cancelAuthoring: () => authoring?.cancel() ?? false,
    getAuthoringState: () => authoring?.getState() ?? {
      status: "idle",
      virtualMemberNumber: null,
      lastMarker: null,
      lastError: "authoring unavailable",
    },
  };
}
