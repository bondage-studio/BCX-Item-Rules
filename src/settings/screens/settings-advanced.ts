import { clearRegistry } from "../../core/item-registry";
import type { RuleSynchronizer } from "../../core/sync";
import type { ItemRuleTransport } from "../../platform/item-rule-transport";
import type { SettingsStore } from "../settings-storage";
import { DEFAULT_SETTINGS } from "../settings-storage";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  cachedOffline: 0,
  resetSettings: 2,
  deleteRegistry: 3,
  disableCleanup: 4,
  disableSharing: 5,
  back: 7,
} as const;

export class SettingsAdvancedScreen extends SettingsScreen {
  constructor(
    registry: SettingsRegistryLike,
    private readonly settingsStore: SettingsStore,
    private readonly synchronizer: RuleSynchronizer,
    private readonly itemRuleTransport?: ItemRuleTransport,
  ) {
    super(registry);
  }

  override get title(): string {
    return "BCXIR Advanced";
  }

  override run(): void {
    super.run();
    const settings = this.settingsStore.get();
    this.drawCheckbox(ROWS.cachedOffline, "Allow cached offline creator", "Use trusted cache to create a minimal local creator identity for BCX checks.", settings.allowCachedOfflineCreator);
    this.drawWideButton(ROWS.resetSettings, "Reset BCXIR settings", "Restore default settings.");
    this.drawWideButton(ROWS.deleteRegistry, "Delete all registered item rules", "Delete local item-rule registry.");
    this.drawWideButton(ROWS.disableCleanup, "Disable BCXIR and cleanup", "Disable runtime and release managed rules.");
    this.drawWideButton(ROWS.disableSharing, "Disable all sharing", "Disable responding to and requesting remote item rules.");
    this.drawRowButton(ROWS.back, "Back", "Return to BCXIR settings.");
  }

  override click(): void {
    super.click();
    const settings = this.settingsStore.get();
    if (this.checkboxClicked(ROWS.cachedOffline) && this.confirm("Change cached offline creator behavior?")) {
      this.settingsStore.update({ allowCachedOfflineCreator: !settings.allowCachedOfflineCreator });
      this.synchronizer.scheduleSync("advanced-cached-offline");
    }
    if (this.wideButtonClicked(ROWS.resetSettings) && this.confirm("Reset BCXIR settings?")) this.settingsStore.save(DEFAULT_SETTINGS);
    if (this.wideButtonClicked(ROWS.deleteRegistry) && this.confirm("Delete all registered item rules?")) {
      clearRegistry(this.root);
      this.synchronizer.scheduleSync("registry-clear");
    }
    if (this.wideButtonClicked(ROWS.disableCleanup) && this.confirm("Disable BCXIR and release managed rules?")) {
      this.settingsStore.update({ enabled: false });
      void this.synchronizer.releaseManagedRules("advanced-disable");
    }
    if (this.wideButtonClicked(ROWS.disableSharing) && this.confirm("Disable all BCXIR remote sharing?")) {
      this.settingsStore.update({
        allowForeignItemRules: false,
        respondToRuleRequests: false,
        autoRequestForeignRules: false,
        showTransportMessages: false,
      });
      this.itemRuleTransport?.clearCooldowns();
      this.synchronizer.scheduleSync("advanced-disable-sharing");
    }
    if (this.rowButtonClicked(ROWS.back)) this.registry.setScreen?.("main");
  }

  private confirm(message: string): boolean {
    return typeof this.root.confirm === "function" ? this.root.confirm(message) === true : true;
  }
}
