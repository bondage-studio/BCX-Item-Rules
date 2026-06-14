import {
  clearRuleCache,
  deleteCachedItemRules,
  listRuleCacheEntries,
  loadRegistry,
  normalizeRegistryState,
  saveRegistry,
} from "../../core/item-registry";
import type { RuleSynchronizer } from "../../core/sync";
import type { SettingsStore } from "../settings-storage";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  permissionMode: 0,
  foreign: 1,
  respond: 2,
  request: 3,
  selector: 4,
  details: 5,
  cacheActions: 6,
  registryActions: 7,
  settingsActions: 8,
  back: 9,
} as const;

const CACHE_ACTIONS = {
  deleteEntry: { x: 550, w: 300, labelKey: "runtime.deleteCache", tooltipKey: "runtime.deleteCache.tip" },
  clearCache: { x: 880, w: 300, labelKey: "runtime.clearCache", tooltipKey: "runtime.clearCache.tip" },
} as const;

const REGISTRY_ACTIONS = {
  exportRules: { x: 550, w: 300, labelKey: "runtime.exportRules", tooltipKey: "runtime.exportRules.tip" },
  importRules: { x: 880, w: 300, labelKey: "runtime.importRules", tooltipKey: "runtime.importRules.tip" },
} as const;

const SETTINGS_ACTIONS = {
  exportSettings: { x: 550, w: 300, labelKey: "runtime.exportSettings", tooltipKey: "runtime.exportSettings.tip" },
  importSettings: { x: 880, w: 300, labelKey: "runtime.importSettings", tooltipKey: "runtime.importSettings.tip" },
} as const;

export class SettingsRuntimeScreen extends SettingsScreen {
  private cacheIndex = 0;

  constructor(
    registry: SettingsRegistryLike,
    private readonly settingsStore: SettingsStore,
    private readonly synchronizer: RuleSynchronizer,
  ) {
    super(registry);
  }

  override get title(): string {
    return this.t("runtime.title");
  }

  override run(): void {
    super.run();
    const settings = this.settingsStore.get();
    const cacheEntries = listRuleCacheEntries(this.root);
    const currentCache = cacheEntries[this.cacheIndex] || null;

    this.drawSelector(
      ROWS.permissionMode,
      this.t("runtime.permissionMode"),
      this.t("runtime.permissionMode.tip"),
      this.permissionModeLabel(settings.rulePermissionMode),
    );
    this.drawCheckbox(ROWS.foreign, this.t("runtime.foreign"), this.t("runtime.foreign.tip"), settings.allowForeignItemRules);
    this.drawCheckbox(ROWS.respond, this.t("runtime.respond"), this.t("runtime.respond.tip"), settings.respondToRuleRequests);
    this.drawCheckbox(ROWS.request, this.t("runtime.request"), this.t("runtime.request.tip"), settings.autoRequestForeignRules, settings.allowForeignItemRules === false);

    if (currentCache) {
      this.root.DrawBackNextButton?.(550, this.rowY(ROWS.selector) - 32, 700, 64, currentCache.itemName, "White", "", () => this.t("common.previous"), () => this.t("common.next"));
      this.drawLabel(ROWS.details, this.t("runtime.cacheDetails", { crafter: currentCache.crafter, rules: currentCache.payload.r.length }));
      this.drawCacheActions(Boolean(currentCache));
    } else {
      this.drawLabel(ROWS.selector, this.t("runtime.noCache"));
      this.drawCacheActions(false);
    }

    this.drawImportExportActions();
    this.drawRowButton(ROWS.back, this.t("common.back"), this.t("settings.tooltip.back"));
  }

  override click(): void {
    super.click();
    const settings = this.settingsStore.get();
    const cacheEntries = listRuleCacheEntries(this.root);
    const currentCache = cacheEntries[this.cacheIndex] || null;

    if (this.selectorClicked(ROWS.permissionMode)) {
      this.update({ rulePermissionMode: this.nextPermissionMode(settings.rulePermissionMode, settings.unlockUseMeMode) });
    }
    if (this.checkboxClicked(ROWS.foreign)) this.update({ allowForeignItemRules: !settings.allowForeignItemRules });
    if (this.checkboxClicked(ROWS.respond)) this.update({ respondToRuleRequests: !settings.respondToRuleRequests });
    if (settings.allowForeignItemRules !== false && this.checkboxClicked(ROWS.request)) this.update({ autoRequestForeignRules: !settings.autoRequestForeignRules });

    if (currentCache && this.root.MouseIn(550, this.rowY(ROWS.selector) - 32, 700, 64)) {
      this.cacheIndex = this.getNewIndexFromNextPrevClick(900, this.cacheIndex, cacheEntries.length);
    }
    if (currentCache && this.actionClicked(ROWS.cacheActions, CACHE_ACTIONS.deleteEntry)) {
      deleteCachedItemRules(this.root, currentCache.cacheKey);
      this.synchronizer.scheduleSync("runtime-cache-delete");
      this.cacheIndex = 0;
    }
    if (this.actionClicked(ROWS.cacheActions, CACHE_ACTIONS.clearCache) && this.confirm(this.t("runtime.confirm.clearCache"))) {
      clearRuleCache(this.root);
      this.synchronizer.scheduleSync("runtime-cache-clear");
      this.cacheIndex = 0;
    }

    if (this.actionClicked(ROWS.registryActions, REGISTRY_ACTIONS.exportRules)) this.copyJson(loadRegistry(this.root));
    if (this.actionClicked(ROWS.registryActions, REGISTRY_ACTIONS.importRules)) this.importRegistry();
    if (this.actionClicked(ROWS.settingsActions, SETTINGS_ACTIONS.exportSettings)) this.copyJson(this.settingsStore.get());
    if (this.actionClicked(ROWS.settingsActions, SETTINGS_ACTIONS.importSettings)) this.importSettings();

    if (this.rowButtonClicked(ROWS.back)) this.registry.setScreen?.("main");
  }

  private update(patch: Parameters<SettingsStore["update"]>[0]): void {
    this.settingsStore.update(patch);
    this.synchronizer.startFallbackTimer();
    this.synchronizer.scheduleSync("settings");
  }

  private permissionModeLabel(mode: string): string {
    if (mode === "useMe") return this.t("runtime.permission.useMe");
    return mode === "creator" ? this.t("runtime.permission.creator") : this.t("runtime.permission.self");
  }

  private nextPermissionMode(mode: string, unlockUseMeMode: boolean): "creator" | "self" | "useMe" {
    const modes: Array<"creator" | "self" | "useMe"> = unlockUseMeMode ? ["creator", "self", "useMe"] : ["creator", "self"];
    const index = modes.indexOf(mode as "creator" | "self" | "useMe");
    return modes[(index + 1) % modes.length];
  }

  private drawCacheActions(hasCurrentCache: boolean): void {
    const y = this.rowY(ROWS.cacheActions) - 32;
    this.drawButton(CACHE_ACTIONS.deleteEntry.x, y, CACHE_ACTIONS.deleteEntry.w, 64, this.t(CACHE_ACTIONS.deleteEntry.labelKey), this.t(CACHE_ACTIONS.deleteEntry.tooltipKey), !hasCurrentCache);
    this.drawButton(CACHE_ACTIONS.clearCache.x, y, CACHE_ACTIONS.clearCache.w, 64, this.t(CACHE_ACTIONS.clearCache.labelKey), this.t(CACHE_ACTIONS.clearCache.tooltipKey));
  }

  private drawImportExportActions(): void {
    const registryY = this.rowY(ROWS.registryActions) - 32;
    const settingsY = this.rowY(ROWS.settingsActions) - 32;
    this.drawButton(REGISTRY_ACTIONS.exportRules.x, registryY, REGISTRY_ACTIONS.exportRules.w, 64, this.t(REGISTRY_ACTIONS.exportRules.labelKey), this.t(REGISTRY_ACTIONS.exportRules.tooltipKey));
    this.drawButton(REGISTRY_ACTIONS.importRules.x, registryY, REGISTRY_ACTIONS.importRules.w, 64, this.t(REGISTRY_ACTIONS.importRules.labelKey), this.t(REGISTRY_ACTIONS.importRules.tooltipKey));
    this.drawButton(SETTINGS_ACTIONS.exportSettings.x, settingsY, SETTINGS_ACTIONS.exportSettings.w, 64, this.t(SETTINGS_ACTIONS.exportSettings.labelKey), this.t(SETTINGS_ACTIONS.exportSettings.tooltipKey));
    this.drawButton(SETTINGS_ACTIONS.importSettings.x, settingsY, SETTINGS_ACTIONS.importSettings.w, 64, this.t(SETTINGS_ACTIONS.importSettings.labelKey), this.t(SETTINGS_ACTIONS.importSettings.tooltipKey));
  }

  private actionClicked(row: number, action: { x: number; w: number }): boolean {
    return this.mouseIn(action.x, this.rowY(row) - 32, action.w, 64);
  }

  private importRegistry(): void {
    const input = this.promptJson(this.t("runtime.prompt.registry"));
    if (!input) return;
    const incoming = normalizeRegistryState(JSON.parse(input));
    const current = loadRegistry(this.root);
    for (const [key, entry] of Object.entries(incoming.entries)) {
      if (!current.entries[key]) current.entries[key] = entry;
    }
    saveRegistry(this.root, current);
    this.synchronizer.scheduleSync("registry-import");
  }

  private importSettings(): void {
    const input = this.promptJson(this.t("runtime.prompt.settings"));
    if (!input) return;
    this.settingsStore.save(JSON.parse(input));
    this.synchronizer.startFallbackTimer();
    this.synchronizer.scheduleSync("settings-import");
  }

  private promptJson(message: string): string | null {
    if (typeof this.root.prompt !== "function") return null;
    const input = this.root.prompt(message, "");
    return typeof input === "string" && input.trim() ? input.trim() : null;
  }

  private copyJson(value: unknown): void {
    const text = JSON.stringify(value, null, 2);
    const clipboard = this.root.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      void clipboard.writeText(text).catch(() => undefined);
      return;
    }
    if (typeof this.root.prompt === "function") this.root.prompt(this.t("runtime.prompt.export"), text);
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
