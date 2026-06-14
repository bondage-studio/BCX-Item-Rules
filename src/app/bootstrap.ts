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

export function bootstrap(): void {
  const root = getRoot();
  const settingsStore = new ExtensionSettingsStore(root);
  const reporter = new Reporter(root, settingsStore);
  const creatorSenderTransport = new CreatorSenderQueryTransport(root);
  const bcx = new BCXAdapter(root, creatorSenderTransport);
  const itemRuleTransport = new ItemRuleTransport(root, reporter, settingsStore);
  const synchronizer = new RuleSynchronizer(root, bcx, reporter, settingsStore, itemRuleTransport);
  itemRuleTransport.setRulesReceivedCallback(() => synchronizer.scheduleSync("item-rule-response"));
  const authoring = new AuthoringSession(root, bcx, reporter, synchronizer);
  const settingsRegistry = new SettingsRegistry(root, settingsStore, bcx, synchronizer, authoring, itemRuleTransport);
  authoring.setSettingsItemRulesRestore((itemName) => settingsRegistry.restoreItemRules(itemName));
  let settingsInitialized = false;

  root.BCXItemRules = buildPublicApi(root, synchronizer, settingsStore, settingsRegistry, authoring, itemRuleTransport);

  const waitForGameReady = (): void => {
    if (root.Player && !settingsInitialized) {
      settingsStore.load();
      settingsRegistry.register();
      settingsInitialized = true;
    }
    if (root.Player && root.bcx && bcx.canUseBCX()) {
      registerModSdkHooks(root, synchronizer, authoring, itemRuleTransport, creatorSenderTransport);
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
