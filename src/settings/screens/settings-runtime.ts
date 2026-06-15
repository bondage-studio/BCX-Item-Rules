import {
  clearRuleCache,
  deleteCachedItemRules,
  listRuleCacheEntries,
  loadRegistry,
  normalizeRegistryState,
  saveRegistry,
} from "../../core/item-registry";
import type { RuleSynchronizer } from "../../core/sync";
import {
  canModifyCacheEntry,
  canModifyRegisteredItem,
  hasLockedCacheEntries,
  hasLockedRegistryEntries,
  isWornItemRuleLockActive,
} from "../../core/worn-item-lock";
import type { SettingsStore } from "../settings-storage";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  permissionMode: 0,
  lockWorn: 1,
  foreign: 2,
  respond: 3,
  request: 4,
  back: 7,
} as const;

const CACHE_ACTIONS = {
  deleteEntry: { col: 0, labelKey: "runtime.deleteCache", tooltipKey: "runtime.deleteCache.tip" },
  clearCache: { col: 1, labelKey: "runtime.clearCache", tooltipKey: "runtime.clearCache.tip" },
} as const;

const REGISTRY_ACTIONS = {
  exportRules: { col: 0, labelKey: "runtime.exportRules", tooltipKey: "runtime.exportRules.tip" },
  importRules: { col: 1, labelKey: "runtime.importRules", tooltipKey: "runtime.importRules.tip" },
} as const;

const SETTINGS_ACTIONS = {
  exportSettings: { col: 0, labelKey: "runtime.exportSettings", tooltipKey: "runtime.exportSettings.tip" },
  importSettings: { col: 1, labelKey: "runtime.importSettings", tooltipKey: "runtime.importSettings.tip" },
} as const;

const LEFT_X = 260;
const LEFT_LABEL_W = 420;
const LEFT_SELECTOR_X = 700;
const LEFT_SELECTOR_W = 280;
const LEFT_CHECKBOX_X = 916;
const RIGHT_X = 1120;
const RIGHT_PANEL_W = 660;
const RIGHT_BUTTON_W = 300;
const RIGHT_GAP = 40;
const RIGHT_SELECTOR_W = RIGHT_PANEL_W;
const RIGHT_CACHE_ROW = 0;
const RIGHT_CACHE_DETAIL_ROW = 1;
const RIGHT_CACHE_ACTION_ROW = 2;
const RIGHT_REGISTRY_ACTION_ROW = 4;
const RIGHT_SETTINGS_ACTION_ROW = 5;

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
    const lockActive = isWornItemRuleLockActive(this.root, settings);
    const currentCacheLocked = currentCache ? !canModifyCacheEntry(this.root, settings, currentCache.cacheKey) : false;

    this.drawLeftSelector(
      ROWS.permissionMode,
      this.t("runtime.permissionMode"),
      lockActive ? this.t("runtime.permissionMode.locked.tip") : this.t("runtime.permissionMode.tip"),
      this.permissionModeLabel(settings.rulePermissionMode),
      lockActive,
    );
    this.drawLeftCheckbox(
      ROWS.lockWorn,
      this.t("runtime.lockWorn"),
      lockActive ? this.t("runtime.lockWorn.active.tip") : this.t("runtime.lockWorn.tip"),
      settings.lockWornItemRules,
      lockActive,
    );
    this.drawLeftCheckbox(ROWS.foreign, this.t("runtime.foreign"), this.t("runtime.foreign.tip"), settings.allowForeignItemRules);
    this.drawLeftCheckbox(ROWS.respond, this.t("runtime.respond"), this.t("runtime.respond.tip"), settings.respondToRuleRequests);
    this.drawLeftCheckbox(ROWS.request, this.t("runtime.request"), this.t("runtime.request.tip"), settings.autoRequestForeignRules, settings.allowForeignItemRules === false);

    if (currentCache) {
      this.drawCacheSelector(currentCache.itemName);
      this.drawRightLabel(RIGHT_CACHE_DETAIL_ROW, this.t("runtime.cacheDetails", { crafter: currentCache.crafter, rules: currentCache.payload.r.length }));
      this.drawCacheActions(Boolean(currentCache), currentCacheLocked, hasLockedCacheEntries(this.root, settings));
    } else {
      this.drawRightLabel(RIGHT_CACHE_ROW, this.t("runtime.noCache"));
      this.drawCacheActions(false, false, hasLockedCacheEntries(this.root, settings));
    }

    this.drawImportExportActions();
    this.drawButton(RIGHT_X + RIGHT_PANEL_W - 300, this.rowY(ROWS.back) - 32, 300, 64, this.t("common.back"), this.t("settings.tooltip.back"));
  }

  override click(): void {
    super.click();
    const settings = this.settingsStore.get();
    const cacheEntries = listRuleCacheEntries(this.root);
    const currentCache = cacheEntries[this.cacheIndex] || null;

    const lockActive = isWornItemRuleLockActive(this.root, settings);
    if (!lockActive && this.leftSelectorClicked(ROWS.permissionMode)) {
      this.update({ rulePermissionMode: this.nextPermissionMode(settings.rulePermissionMode, settings.dangerModeEnabled && settings.unlockUseMeMode) });
    }
    if (!lockActive && this.leftCheckboxClicked(ROWS.lockWorn)) this.update({ lockWornItemRules: !settings.lockWornItemRules });
    if (this.leftCheckboxClicked(ROWS.foreign)) this.update({ allowForeignItemRules: !settings.allowForeignItemRules });
    if (this.leftCheckboxClicked(ROWS.respond)) this.update({ respondToRuleRequests: !settings.respondToRuleRequests });
    if (settings.allowForeignItemRules !== false && this.leftCheckboxClicked(ROWS.request)) this.update({ autoRequestForeignRules: !settings.autoRequestForeignRules });

    if (currentCache && this.mouseIn(RIGHT_X, this.rowY(RIGHT_CACHE_ROW) - 32, RIGHT_SELECTOR_W, 64)) {
      this.cacheIndex = this.getNewIndexFromNextPrevClick(this.cacheIndex, cacheEntries.length);
    }
    if (currentCache && canModifyCacheEntry(this.root, settings, currentCache.cacheKey) && this.actionClicked(RIGHT_CACHE_ACTION_ROW, CACHE_ACTIONS.deleteEntry)) {
      deleteCachedItemRules(this.root, currentCache.cacheKey);
      this.synchronizer.scheduleSync("runtime-cache-delete");
      this.cacheIndex = 0;
    }
    if (!hasLockedCacheEntries(this.root, settings) && this.actionClicked(RIGHT_CACHE_ACTION_ROW, CACHE_ACTIONS.clearCache) && this.confirm(this.t("runtime.confirm.clearCache"))) {
      clearRuleCache(this.root);
      this.synchronizer.scheduleSync("runtime-cache-clear");
      this.cacheIndex = 0;
    }

    if (this.actionClicked(RIGHT_REGISTRY_ACTION_ROW, REGISTRY_ACTIONS.exportRules)) this.copyJson(loadRegistry(this.root));
    if (!hasLockedRegistryEntries(this.root, settings) && this.actionClicked(RIGHT_REGISTRY_ACTION_ROW, REGISTRY_ACTIONS.importRules)) this.importRegistry();
    if (this.actionClicked(RIGHT_SETTINGS_ACTION_ROW, SETTINGS_ACTIONS.exportSettings)) this.copyJson(this.settingsStore.get());
    if (this.actionClicked(RIGHT_SETTINGS_ACTION_ROW, SETTINGS_ACTIONS.importSettings)) this.importSettings();

    if (this.mouseIn(RIGHT_X + RIGHT_PANEL_W - 300, this.rowY(ROWS.back) - 32, 300, 64)) this.registry.setScreen?.("main");
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

  private drawLeftSelector(row: number, label: string, description: string, value: string, disabled = false): void {
    const y = this.rowY(row);
    const hovering = this.mouseIn(LEFT_X, y - 32, LEFT_SELECTOR_X + LEFT_SELECTOR_W - LEFT_X, 64);
    this.drawTextFitLeft(label, LEFT_X, y, LEFT_LABEL_W, hovering ? "Red" : "Black", "Gray");
    if (typeof this.root.DrawBackNextButton === "function") {
      this.root.DrawBackNextButton(LEFT_SELECTOR_X, y - 32, LEFT_SELECTOR_W, 64, value, disabled ? "#ddd" : "White", "", () => this.t("common.previous"), () => this.t("common.next"), disabled);
    } else {
      this.root.DrawButton(LEFT_SELECTOR_X, y - 32, LEFT_SELECTOR_W, 64, value, disabled ? "#ddd" : "White", "", this.t("common.previousNext"), disabled);
    }
    if (hovering) this.drawTooltip(description);
  }

  private drawLeftCheckbox(row: number, label: string, description: string, value: boolean, disabled = false): void {
    const y = this.rowY(row);
    const hovering = this.mouseIn(LEFT_X, y - 32, LEFT_CHECKBOX_X + 64 - LEFT_X, 64);
    this.drawTextFitLeft(label, LEFT_X, y, LEFT_LABEL_W, hovering ? "Red" : "Black", "Gray");
    this.root.DrawCheckbox(LEFT_CHECKBOX_X, y - 32, 64, 64, "", value, disabled);
    if (hovering) this.drawTooltip(description);
  }

  private leftSelectorClicked(row: number): boolean {
    return this.mouseIn(LEFT_SELECTOR_X, this.rowY(row) - 32, LEFT_SELECTOR_W, 64);
  }

  private leftCheckboxClicked(row: number): boolean {
    return this.mouseIn(LEFT_CHECKBOX_X, this.rowY(row) - 32, 64, 64);
  }

  private drawCacheActions(hasCurrentCache: boolean, currentCacheLocked: boolean, clearLocked: boolean): void {
    const y = this.rowY(RIGHT_CACHE_ACTION_ROW) - 32;
    this.drawButton(
      this.actionX(CACHE_ACTIONS.deleteEntry),
      y,
      RIGHT_BUTTON_W,
      64,
      this.t(CACHE_ACTIONS.deleteEntry.labelKey),
      currentCacheLocked ? this.t("runtime.lockedCache.tip") : this.t(CACHE_ACTIONS.deleteEntry.tooltipKey),
      !hasCurrentCache || currentCacheLocked,
    );
    this.drawButton(
      this.actionX(CACHE_ACTIONS.clearCache),
      y,
      RIGHT_BUTTON_W,
      64,
      this.t(CACHE_ACTIONS.clearCache.labelKey),
      clearLocked ? this.t("runtime.lockedCache.clear.tip") : this.t(CACHE_ACTIONS.clearCache.tooltipKey),
      clearLocked,
    );
  }

  private drawImportExportActions(): void {
    const registryY = this.rowY(RIGHT_REGISTRY_ACTION_ROW) - 32;
    const settingsY = this.rowY(RIGHT_SETTINGS_ACTION_ROW) - 32;
    this.drawButton(this.actionX(REGISTRY_ACTIONS.exportRules), registryY, RIGHT_BUTTON_W, 64, this.t(REGISTRY_ACTIONS.exportRules.labelKey), this.t(REGISTRY_ACTIONS.exportRules.tooltipKey));
    const registryLocked = hasLockedRegistryEntries(this.root, this.settingsStore.get());
    this.drawButton(
      this.actionX(REGISTRY_ACTIONS.importRules),
      registryY,
      RIGHT_BUTTON_W,
      64,
      this.t(REGISTRY_ACTIONS.importRules.labelKey),
      registryLocked ? this.t("runtime.lockedRegistry.tip") : this.t(REGISTRY_ACTIONS.importRules.tooltipKey),
      registryLocked,
    );
    this.drawButton(this.actionX(SETTINGS_ACTIONS.exportSettings), settingsY, RIGHT_BUTTON_W, 64, this.t(SETTINGS_ACTIONS.exportSettings.labelKey), this.t(SETTINGS_ACTIONS.exportSettings.tooltipKey));
    this.drawButton(this.actionX(SETTINGS_ACTIONS.importSettings), settingsY, RIGHT_BUTTON_W, 64, this.t(SETTINGS_ACTIONS.importSettings.labelKey), this.t(SETTINGS_ACTIONS.importSettings.tooltipKey));
  }

  private drawCacheSelector(itemName: string): void {
    const y = this.rowY(RIGHT_CACHE_ROW) - 32;
    if (typeof this.root.DrawBackNextButton === "function") {
      this.root.DrawBackNextButton(RIGHT_X, y, RIGHT_SELECTOR_W, 64, itemName, "White", "", () => this.t("common.previous"), () => this.t("common.next"));
    } else {
      this.root.DrawButton(RIGHT_X, y, RIGHT_SELECTOR_W, 64, itemName, "White", "", this.t("common.previousNext"));
    }
  }

  private drawRightLabel(row: number, label: string): void {
    this.drawTextFitLeft(label, RIGHT_X, this.rowY(row), RIGHT_PANEL_W, "Black", "Gray");
  }

  private actionClicked(row: number, action: { col: number }): boolean {
    return this.mouseIn(this.actionX(action), this.rowY(row) - 32, RIGHT_BUTTON_W, 64);
  }

  private actionX(action: { col: number }): number {
    return RIGHT_X + action.col * (RIGHT_BUTTON_W + RIGHT_GAP);
  }

  private importRegistry(): void {
    const input = this.promptJson(this.t("runtime.prompt.registry"));
    if (!input) return;
    const incoming = normalizeRegistryState(JSON.parse(input));
    const current = loadRegistry(this.root);
    for (const [key, entry] of Object.entries(incoming.entries)) {
      if (!canModifyRegisteredItem(this.root, this.settingsStore.get(), entry.itemName)) continue;
      if (!current.entries[key]) current.entries[key] = entry;
    }
    saveRegistry(this.root, current);
    this.synchronizer.scheduleSync("registry-import");
  }

  private importSettings(): void {
    const input = this.promptJson(this.t("runtime.prompt.settings"));
    if (!input) return;
    this.settingsStore.update(JSON.parse(input));
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

  private getNewIndexFromNextPrevClick(currentIndex: number, listLength: number): number {
    if (listLength <= 0) return 0;
    return Number(this.root.MouseX) <= RIGHT_X + RIGHT_SELECTOR_W / 2
      ? (listLength + currentIndex - 1) % listLength
      : (currentIndex + 1) % listLength;
  }
}
