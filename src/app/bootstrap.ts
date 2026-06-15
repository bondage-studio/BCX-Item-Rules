import { BCXAdapter } from "../platform/bcx-adapter";
import { buildPublicApi } from "./public-api";
import { Reporter } from "../platform/reporter";
import { getRoot } from "../platform/root";
import { RuleSynchronizer } from "../core/sync";
import { registerModSdkHooks } from "../platform/hooks";
import { ExtensionSettingsStore } from "../settings/settings-storage";
import { SettingsRegistry } from "../settings/settings-registry";
import { AuthoringSession } from "../authoring/authoring-session";
import { ItemRuleTransport } from "../platform/item-rule-transport";
import { CreatorSenderQueryTransport } from "../platform/creator-sender-query-transport";
import { UseMeQueryTransport } from "../platform/use-me-query-transport";

export function bootstrap(): void {
  const root = getRoot();
  const settingsStore = new ExtensionSettingsStore(root);
  const reporter = new Reporter(root, settingsStore);
  const creatorSenderTransport = new CreatorSenderQueryTransport(root);
  const useMeTransport = new UseMeQueryTransport(root);
  const bcx = new BCXAdapter(root, creatorSenderTransport, useMeTransport);
  const itemRuleTransport = new ItemRuleTransport(root, reporter, settingsStore);
  const synchronizer = new RuleSynchronizer(root, bcx, reporter, settingsStore, itemRuleTransport);
  itemRuleTransport.setRulesReceivedCallback(() => synchronizer.scheduleSync("item-rule-response"));
  const authoring = new AuthoringSession(root, bcx, reporter, synchronizer, settingsStore);
  const settingsRegistry = new SettingsRegistry(root, settingsStore, bcx, synchronizer, authoring, itemRuleTransport);
  authoring.setSettingsItemRulesRestore((itemName) => settingsRegistry.restoreItemRules(itemName));
  let settingsInitialized = false;

  root.BCXItemRules = buildPublicApi(root, synchronizer, settingsStore, settingsRegistry, authoring, itemRuleTransport);

  const waitForGameReady = (): void => {
    // Wait for a logged-in Player before loading settings. BC exposes a truthy
    // `Player` object at the login screen (no MemberNumber, empty ExtensionSettings),
    // so loading on `root.Player` alone reads nothing, keys the localStorage backup
    // under "DEFAULT", and latches `settingsInitialized`, permanently dropping the
    // per-member settings. MemberNumber is set together with ExtensionSettings in
    // BC's LoginResponse, so it is the reliable "settings are available" signal.
    if (root.Player?.MemberNumber != null && !settingsInitialized) {
      settingsStore.load();
      settingsRegistry.register();
      settingsInitialized = true;
    }
    if (root.Player && root.bcx && bcx.canUseBCX()) {
      registerModSdkHooks(root, synchronizer, authoring, itemRuleTransport, creatorSenderTransport, useMeTransport);
      synchronizer.startFallbackTimer();
      synchronizer.scheduleSync("startup");
      console.info("[BCXIR] Loaded.");
      return;
    }
    root.setTimeout(waitForGameReady, 500);
  };

  if (typeof root.document !== "undefined") {
    root.setTimeout(waitForGameReady, 1000);
  }
}
