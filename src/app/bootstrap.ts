import { BCXAdapter } from "../platform/bcx-adapter";
import { buildPublicApi } from "./public-api";
import { Reporter } from "../platform/reporter";
import { getRoot } from "../platform/root";
import { RuleSynchronizer } from "../core/sync";
import { registerModSdkHooks } from "../platform/hooks";
import { ExtensionSettingsStore } from "../settings/settings-storage";
import { SettingsRegistry } from "../settings/settings-registry";
import { AuthoringSession } from "../authoring/authoring-session";

export function bootstrap(): void {
  const root = getRoot();
  const settingsStore = new ExtensionSettingsStore(root);
  const reporter = new Reporter(root, settingsStore);
  const bcx = new BCXAdapter(root);
  const synchronizer = new RuleSynchronizer(root, bcx, reporter, settingsStore);
  const settingsRegistry = new SettingsRegistry(root, settingsStore, bcx, synchronizer);
  const authoring = new AuthoringSession(root, bcx, reporter);
  let settingsInitialized = false;

  root.BCXItemRules = buildPublicApi(synchronizer, settingsStore, settingsRegistry, authoring);

  const waitForGameReady = (): void => {
    if (root.Player && !settingsInitialized) {
      settingsStore.load();
      settingsRegistry.register();
      settingsInitialized = true;
    }
    if (root.Player && root.bcx && bcx.canUseBCX()) {
      registerModSdkHooks(root, synchronizer, authoring);
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
