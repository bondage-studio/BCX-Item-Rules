import type { BCXAdapter } from "../../platform/bcx-adapter";
import type { SettingsStore } from "../settings-storage";
import { listRegistryEntries, listRuleCacheEntries } from "../../core/item-registry";
import type { RuleSynchronizer } from "../../core/sync";
import type { ItemRuleTransport } from "../../platform/item-rule-transport";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  status: 0,
  counts: 1,
  sync: 2,
  enabled: 3,
  itemRules: 4,
  runtime: 5,
  diagnostics: 6,
} as const;

export class SettingsMainScreen extends SettingsScreen {
  constructor(
    registry: SettingsRegistryLike,
    private readonly settingsStore: SettingsStore,
    private readonly bcx: BCXAdapter,
    private readonly synchronizer: RuleSynchronizer,
    private readonly itemRuleTransport: ItemRuleTransport | undefined,
    private readonly onSettingsChanged: () => void,
  ) {
    super(registry);
  }

  override run(): void {
    super.run();
    const settings = this.settingsStore.get();
    const sync = this.synchronizer.getDiagnostics();
    const transport = this.itemRuleTransport?.getDiagnostics() || {};
    const bcxStatus = "BCX " + (this.bcx.canUseBCX() ? this.t("common.available") : this.t("common.unavailable"));
    const registryCount = listRegistryEntries(this.root).length;
    const cacheCount = listRuleCacheEntries(this.root).length;
    const syncStatus = String(sync.lastSyncResult || this.t("common.notRun"));

    this.drawLabel(ROWS.status, this.t("main.status", { status: bcxStatus }));
    this.drawLabel(ROWS.counts, this.t("main.counts", { registered: registryCount, cached: cacheCount }));
    this.drawLabel(ROWS.sync, this.t("main.sync", { result: syncStatus, pending: String(transport.pendingRequestCount || 0) }));
    this.drawCheckbox(
      ROWS.enabled,
      this.t("main.enable"),
      this.t("main.enable.tip"),
      settings.enabled,
    );
    this.drawWideButton(ROWS.itemRules, this.t("main.itemRules"), this.t("main.itemRules.tip"));
    this.drawWideButton(ROWS.runtime, this.t("main.runtime"), this.t("main.runtime.tip"));
    this.drawWideButton(ROWS.diagnostics, this.t("main.diagnostics"), this.t("main.diagnostics.tip"));
  }

  override click(): void {
    super.click();
    const settings = this.settingsStore.get();
    if (this.checkboxClicked(ROWS.enabled)) this.update({ enabled: !settings.enabled });
    if (this.wideButtonClicked(ROWS.itemRules)) this.registry.setScreen?.("itemRules");
    if (this.wideButtonClicked(ROWS.runtime)) this.registry.setScreen?.("runtime");
    if (this.wideButtonClicked(ROWS.diagnostics)) this.registry.setScreen?.("diagnostics");
  }

  private update(patch: Parameters<SettingsStore["update"]>[0]): void {
    this.settingsStore.update(patch);
    this.onSettingsChanged();
  }
}
