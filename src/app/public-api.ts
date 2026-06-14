import {
  decodePayload,
  encodePayload,
} from "../core/protocol";
import { VERSION } from "../shared/constants";
import { collectDesiredRulesFromAppearance } from "../core/scanner";
import type { SettingsRegistry } from "../settings/settings-registry";
import type { SettingsStore } from "../settings/settings-storage";
import type { RuleSynchronizer } from "../core/sync";
import type { AuthoringSession } from "../authoring/authoring-session";
import type { ItemRuleTransport } from "../platform/item-rule-transport";
import type { HostWindow } from "../platform/root";
import {
  clearRuleCache,
  deleteCachedItemRules,
  deleteRegisteredItem,
  listRuleCacheEntries,
  listRegistryEntries,
  registerItemRules,
  updateRegisteredItem,
} from "../core/item-registry";

export function buildPublicApi(
  root: HostWindow,
  synchronizer: RuleSynchronizer,
  settingsStore: SettingsStore,
  settingsRegistry: SettingsRegistry,
  authoring?: AuthoringSession,
  itemRuleTransport?: ItemRuleTransport,
) {
  return {
    version: VERSION,
    encodePayload,
    decodePayload,
    collectDesiredRulesFromAppearance,
    getRegistry: () => listRegistryEntries(root),
    getRuleCache: () => listRuleCacheEntries(root),
    registerItemRules: (itemName: string, payload: Parameters<typeof registerItemRules>[2]) => {
      const entry = registerItemRules(root, itemName, payload);
      synchronizer.scheduleSync("registry-api");
      return entry;
    },
    deleteRegisteredItem: (itemName: string) => {
      const deleted = deleteRegisteredItem(root, itemName);
      synchronizer.scheduleSync("registry-api");
      return deleted;
    },
    updateRegisteredItem: (itemName: string, patch: Parameters<typeof updateRegisteredItem>[2]) => {
      const entry = updateRegisteredItem(root, itemName, patch);
      synchronizer.scheduleSync("registry-api");
      return entry;
    },
    requestItemRules: (item: any, targetOverride?: number | string) => itemRuleTransport?.requestItemRules(item, targetOverride) ?? null,
    clearRuleCache: () => {
      clearRuleCache(root);
      synchronizer.scheduleSync("cache-api");
    },
    deleteCachedItemRules: (cacheKey: string) => {
      const deleted = deleteCachedItemRules(root, cacheKey);
      synchronizer.scheduleSync("cache-api");
      return deleted;
    },
    clearRequestCooldowns: () => itemRuleTransport?.clearCooldowns(),
    releaseManagedRules: (reason?: string) => synchronizer.releaseManagedRules(reason || "api-release"),
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
    openAuthoring: (options?: Parameters<NonNullable<typeof authoring>["open"]>[0]) => authoring?.open(options) ?? Promise.resolve(false),
    finishAuthoring: () => authoring?.finish() ?? Promise.resolve(null),
    cancelAuthoring: () => authoring?.cancel() ?? false,
    getAuthoringState: () => authoring?.getState() ?? {
      status: "idle",
      virtualMemberNumber: null,
      lastRegisteredItem: null,
      lastError: "authoring unavailable",
      bcxVersionReady: false,
      transportActive: false,
      bridgeActive: false,
      nativeRoomActive: null,
      lastInboundType: null,
      lastOutboundType: null,
      lastQuery: null,
      queryCount: 0,
      messageCount: 0,
      lastInitStep: null,
    },
  };
}
