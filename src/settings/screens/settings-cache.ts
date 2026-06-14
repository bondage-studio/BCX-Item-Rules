import { clearRuleCache, deleteCachedItemRules, listRuleCacheEntries } from "../../core/item-registry";
import type { RuleSynchronizer } from "../../core/sync";
import type { SettingsStore } from "../settings-storage";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  respond: 0,
  request: 1,
  selector: 3,
  details: 4,
  deleteEntry: 5,
  clearCache: 6,
  back: 7,
} as const;

export class SettingsCacheScreen extends SettingsScreen {
  private index = 0;

  constructor(
    registry: SettingsRegistryLike,
    private readonly settingsStore: SettingsStore,
    private readonly synchronizer: RuleSynchronizer,
  ) {
    super(registry);
  }

  override get title(): string {
    return "BCXIR Cache";
  }

  override run(): void {
    super.run();
    const settings = this.settingsStore.get();
    const entries = listRuleCacheEntries(this.root);
    const current = entries[this.index] || null;
    this.drawCheckbox(ROWS.respond, "Respond to rule requests", "Allow others to request payloads for your registered non-self-only items.", settings.respondToRuleRequests);
    this.drawCheckbox(ROWS.request, "Auto request remote rules", "Request missing payloads for other people's crafted items.", settings.autoRequestForeignRules, settings.allowForeignItemRules === false);
    if (current) {
      this.root.DrawBackNextButton?.(550, this.rowY(ROWS.selector) - 32, 700, 64, current.itemName, "White", "", () => "Previous", () => "Next");
      this.drawLabel(ROWS.details, "Crafter: " + current.crafter + " / Rules: " + current.payload.r.length);
      this.drawRowButton(ROWS.deleteEntry, "Delete Cache", "Delete this cached remote item payload.");
    } else {
      this.drawLabel(ROWS.selector, "No cached remote item rules.");
    }
    this.drawRowButton(ROWS.clearCache, "Clear Cache", "Delete all cached remote item rules.");
    this.drawRowButton(ROWS.back, "Back", "Return to BCXIR settings.");
  }

  override click(): void {
    super.click();
    const settings = this.settingsStore.get();
    const entries = listRuleCacheEntries(this.root);
    const current = entries[this.index] || null;
    if (this.checkboxClicked(ROWS.respond)) this.update({ respondToRuleRequests: !settings.respondToRuleRequests });
    if (settings.allowForeignItemRules !== false && this.checkboxClicked(ROWS.request)) this.update({ autoRequestForeignRules: !settings.autoRequestForeignRules });
    if (current && this.root.MouseIn(550, this.rowY(ROWS.selector) - 32, 700, 64)) {
      this.index = this.getNewIndexFromNextPrevClick(900, this.index, entries.length);
    }
    if (current && this.rowButtonClicked(ROWS.deleteEntry)) {
      deleteCachedItemRules(this.root, current.cacheKey);
      this.synchronizer.scheduleSync("cache-delete");
      this.index = 0;
    }
    if (this.rowButtonClicked(ROWS.clearCache) && this.confirm("Clear all remote cache?")) {
      clearRuleCache(this.root);
      this.synchronizer.scheduleSync("cache-clear");
      this.index = 0;
    }
    if (this.rowButtonClicked(ROWS.back)) this.registry.setScreen?.("main");
  }

  private update(patch: Parameters<SettingsStore["update"]>[0]): void {
    this.settingsStore.update(patch);
    this.synchronizer.scheduleSync("cache-settings");
  }

  private confirm(message: string): boolean {
    return typeof this.root.confirm === "function" ? this.root.confirm(message) === true : true;
  }

  private getNewIndexFromNextPrevClick(midpoint: number, currentIndex: number, listLength: number): number {
    if (listLength <= 0) return 0;
    return Number(this.root.MouseX) <= midpoint
      ? (listLength + currentIndex - 1) % listLength
      : (currentIndex + 1) % listLength;
  }
}
