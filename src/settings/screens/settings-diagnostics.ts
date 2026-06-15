import { clearRegistry } from "../../core/item-registry";
import { hasLockedRegistryEntries, isWornItemRuleLockActive } from "../../core/worn-item-lock";
import type { AuthoringSession } from "../../authoring/authoring-session";
import type { BCXAdapter } from "../../platform/bcx-adapter";
import type { ItemRuleTransport } from "../../platform/item-rule-transport";
import type { RuleSynchronizer } from "../../core/sync";
import type { SettingsStore } from "../settings-storage";
import { DEFAULT_SETTINGS } from "../settings-storage";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  bcx: 0,
  sync: 1,
  counts: 2,
  queue: 3,
  messages1: 4,
  messages2: 5,
  transport: 6,
  debug: 7,
  fallback: 8,
  cachedOffline: 9,
  actions: 9,
  advancedActions: 10,
} as const;

const ACTIONS = {
  syncNow: { col: 0, row: 0, labelKey: "diagnostics.syncNow", tooltipKey: "diagnostics.syncNow.tip" },
  retry: { col: 1, row: 0, labelKey: "diagnostics.retry", tooltipKey: "diagnostics.retry.tip" },
  report: { col: 0, row: 1, labelKey: "diagnostics.report", tooltipKey: "diagnostics.report.tip" },
  back: { col: 1, row: 1, labelKey: "common.back", tooltipKey: "settings.tooltip.back" },
} as const;

const ADVANCED_ACTIONS = {
  reset: { col: 0, row: 3, labelKey: "diagnostics.reset", tooltipKey: "diagnostics.reset.tip" },
  deleteRegistry: { col: 1, row: 3, labelKey: "diagnostics.deleteRules", tooltipKey: "diagnostics.deleteRules.tip" },
  disableCleanup: { col: 0, row: 4, labelKey: "diagnostics.disableCleanup", tooltipKey: "diagnostics.disableCleanup.tip" },
  disableSharing: { col: 1, row: 4, labelKey: "diagnostics.disableSharing", tooltipKey: "diagnostics.disableSharing.tip" },
} as const;

const LEFT_X = 380;
const LEFT_LABEL_W = 560;
const LEFT_CHECKBOX_X = 965;
const RIGHT_X = 1090;
const ACTION_W = 250;
const ACTION_GAP = 24;
const ACTION_ROW_H = 74;
const ACTION_START_Y = 340;

export class SettingsDiagnosticsScreen extends SettingsScreen {
  constructor(
    registry: SettingsRegistryLike,
    private readonly settingsStore: SettingsStore,
    private readonly bcx: BCXAdapter,
    private readonly synchronizer: RuleSynchronizer,
    private readonly authoring?: AuthoringSession,
    private readonly itemRuleTransport?: ItemRuleTransport,
  ) {
    super(registry);
  }

  override get title(): string {
    return this.t("diagnostics.title");
  }

  override run(): void {
    super.run();
    const settings = this.settingsStore.get();
    const sync = this.synchronizer.getDiagnostics();
    const transport = this.itemRuleTransport?.getDiagnostics() || {};
    const queue = this.bcx.getQueryQueueDiagnostics();
    const authoring = this.authoring?.getState();
    const lockActive = isWornItemRuleLockActive(this.root, settings);
    this.drawLeftLabel(ROWS.bcx, this.t("diagnostics.bcx", {
      bcx: this.bcx.canUseBCX() ? this.t("common.available") : this.t("common.unavailable"),
      authoring: authoring?.status || this.t("common.none"),
    }));
    this.drawLeftLabel(ROWS.sync, this.t("diagnostics.sync", {
      result: String(sync.lastSyncResult || this.t("common.notRun")),
      reason: String(sync.lastSyncReason || this.t("common.none")),
    }));
    this.drawLeftLabel(ROWS.counts, this.t("diagnostics.counts", {
      payloads: String(sync.activePayloadCount || 0),
      managed: String(sync.managedRuleCount || 0),
      pending: String(transport.pendingRequestCount || 0),
    }));
    this.drawLeftLabel(ROWS.queue, this.t("diagnostics.queue", {
      active: String(queue?.activeLabel || this.t("common.none")),
      waiting: String(queue?.queueLength || 0),
      processed: String(queue?.processedCount || 0),
    }), String(queue?.lastError || this.t("common.none")));
    this.drawLeftCheckbox(ROWS.messages1, this.t("diagnostics.conflicts"), this.t("diagnostics.conflicts.tip"), settings.showConflictMessages);
    this.drawLeftCheckbox(ROWS.messages2, this.t("diagnostics.invalid"), this.t("diagnostics.invalid.tip"), settings.showInvalidPayloadMessages);
    this.drawLeftCheckbox(ROWS.transport, this.t("diagnostics.transport"), this.t("diagnostics.transport.tip"), settings.showTransportMessages);
    this.drawLeftCheckbox(ROWS.debug, this.t("diagnostics.debug"), this.t("diagnostics.debug.tip"), settings.debugLogging);
    this.drawLeftCheckbox(ROWS.fallback, this.t("diagnostics.fallback"), this.t("diagnostics.fallback.tip"), settings.fallbackSyncEnabled);
    this.drawLeftCheckbox(
      ROWS.cachedOffline,
      this.t("diagnostics.cachedOffline"),
      lockActive ? this.t("diagnostics.locked.tip") : this.t("diagnostics.cachedOffline.tip"),
      settings.allowCachedOfflineCreator,
      lockActive,
    );
    this.drawActionButtons();
    if (authoring?.status && authoring.status !== "idle") {
      this.drawActionButton(ACTIONS.report, this.t("diagnostics.cancelAuth"), this.t("diagnostics.cancelAuth.tip"));
    }
    this.drawAdvancedActions();
  }

  override click(): void {
    super.click();
    const settings = this.settingsStore.get();
    if (this.leftCheckboxClicked(ROWS.messages1)) this.settingsStore.update({ showConflictMessages: !settings.showConflictMessages });
    if (this.leftCheckboxClicked(ROWS.messages2)) this.settingsStore.update({ showInvalidPayloadMessages: !settings.showInvalidPayloadMessages });
    if (this.leftCheckboxClicked(ROWS.transport)) this.settingsStore.update({ showTransportMessages: !settings.showTransportMessages });
    if (this.leftCheckboxClicked(ROWS.debug)) this.settingsStore.update({ debugLogging: !settings.debugLogging });
    if (this.leftCheckboxClicked(ROWS.fallback)) {
      this.settingsStore.update({ fallbackSyncEnabled: !settings.fallbackSyncEnabled });
      this.synchronizer.startFallbackTimer();
    }
    if (!isWornItemRuleLockActive(this.root, settings) && this.leftCheckboxClicked(ROWS.cachedOffline) && this.confirm(this.t("diagnostics.confirm.cachedOffline"))) {
      this.settingsStore.update({ allowCachedOfflineCreator: !settings.allowCachedOfflineCreator });
      this.synchronizer.scheduleSync("diagnostics-cached-offline");
    }
    if (this.actionClicked(ACTIONS.syncNow)) void this.synchronizer.syncNow("diagnostics");
    if (this.actionClicked(ACTIONS.retry)) {
      this.itemRuleTransport?.clearCooldowns();
      this.synchronizer.scheduleSync("diagnostics-retry");
    }
    const authoring = this.authoring?.getState();
    if (this.actionClicked(ACTIONS.report)) {
      if (authoring?.status && authoring.status !== "idle") this.authoring?.cancel();
      else this.copyReport();
    }
    if (this.actionClicked(ACTIONS.back)) this.registry.setScreen?.("main");
    if (this.advancedActionClicked(ADVANCED_ACTIONS.reset) && this.confirm(this.t("diagnostics.confirm.reset"))) this.settingsStore.save(DEFAULT_SETTINGS);
    if (!hasLockedRegistryEntries(this.root, settings) && this.advancedActionClicked(ADVANCED_ACTIONS.deleteRegistry) && this.confirm(this.t("diagnostics.confirm.deleteRules"))) {
      clearRegistry(this.root);
      this.synchronizer.scheduleSync("registry-clear");
    }
    if (this.advancedActionClicked(ADVANCED_ACTIONS.disableCleanup) && this.confirm(this.t("diagnostics.confirm.disableCleanup"))) {
      this.settingsStore.update({ enabled: false });
      void this.synchronizer.releaseManagedRules("diagnostics-disable");
    }
    if (this.advancedActionClicked(ADVANCED_ACTIONS.disableSharing) && this.confirm(this.t("diagnostics.confirm.disableSharing"))) {
      this.settingsStore.update({
        allowForeignItemRules: false,
        respondToRuleRequests: false,
        autoRequestForeignRules: false,
        showTransportMessages: false,
      });
      this.itemRuleTransport?.clearCooldowns();
      this.synchronizer.scheduleSync("diagnostics-disable-sharing");
    }
  }

  private drawActionButtons(): void {
    this.drawActionButton(ACTIONS.syncNow, this.t(ACTIONS.syncNow.labelKey), this.t(ACTIONS.syncNow.tooltipKey));
    this.drawActionButton(ACTIONS.retry, this.t(ACTIONS.retry.labelKey), this.t(ACTIONS.retry.tooltipKey));
    this.drawActionButton(ACTIONS.report, this.t(ACTIONS.report.labelKey), this.t(ACTIONS.report.tooltipKey));
    this.drawActionButton(ACTIONS.back, this.t(ACTIONS.back.labelKey), this.t(ACTIONS.back.tooltipKey));
  }

  private drawAdvancedActions(): void {
    this.drawActionButton(ADVANCED_ACTIONS.reset, this.t(ADVANCED_ACTIONS.reset.labelKey), this.t(ADVANCED_ACTIONS.reset.tooltipKey));
    const registryLocked = hasLockedRegistryEntries(this.root, this.settingsStore.get());
    this.drawActionButton(
      ADVANCED_ACTIONS.deleteRegistry,
      this.t(ADVANCED_ACTIONS.deleteRegistry.labelKey),
      registryLocked ? this.t("diagnostics.lockedRegistry.tip") : this.t(ADVANCED_ACTIONS.deleteRegistry.tooltipKey),
      registryLocked,
    );
    this.drawActionButton(ADVANCED_ACTIONS.disableCleanup, this.t(ADVANCED_ACTIONS.disableCleanup.labelKey), this.t(ADVANCED_ACTIONS.disableCleanup.tooltipKey));
    this.drawActionButton(ADVANCED_ACTIONS.disableSharing, this.t(ADVANCED_ACTIONS.disableSharing.labelKey), this.t(ADVANCED_ACTIONS.disableSharing.tooltipKey));
  }

  private drawActionButton(action: { col: number; row: number }, label: string, tooltip: string, disabled = false): void {
    const { x, y } = this.actionRect(action);
    this.drawButton(x, y, ACTION_W, 64, label, tooltip, disabled);
  }

  private actionClicked(action: { col: number; row: number }): boolean {
    const { x, y } = this.actionRect(action);
    return this.mouseIn(x, y, ACTION_W, 64);
  }

  private advancedActionClicked(action: { col: number; row: number }): boolean {
    return this.actionClicked(action);
  }

  private actionRect(action: { col: number; row: number }): { x: number; y: number } {
    return {
      x: RIGHT_X + action.col * (ACTION_W + ACTION_GAP),
      y: ACTION_START_Y + action.row * ACTION_ROW_H,
    };
  }

  private drawLeftLabel(row: number, label: string, description?: string): void {
    const y = this.rowY(row);
    const hovering = this.mouseIn(LEFT_X, y - 32, LEFT_LABEL_W, 64);
    this.drawTextFitLeft(label, LEFT_X, y, LEFT_LABEL_W, hovering ? "Red" : "Black", "Gray");
    if (hovering && description) this.drawTooltip(description);
  }

  private drawLeftCheckbox(row: number, label: string, description: string, value: boolean, disabled = false): void {
    const y = this.rowY(row);
    const hovering = this.mouseIn(LEFT_X, y - 32, LEFT_LABEL_W + 64, 64);
    this.drawTextFitLeft(label, LEFT_X, y, LEFT_LABEL_W, hovering ? "Red" : "Black", "Gray");
    this.root.DrawCheckbox(LEFT_CHECKBOX_X, y - 32, 64, 64, "", value, disabled);
    if (hovering) this.drawTooltip(description);
  }

  private leftCheckboxClicked(row: number): boolean {
    return this.mouseIn(LEFT_CHECKBOX_X, this.rowY(row) - 32, 64, 64);
  }

  private copyReport(): void {
    const text = JSON.stringify({
      settings: this.settingsStore.get(),
      sync: this.synchronizer.getDiagnostics(),
      transport: this.itemRuleTransport?.getDiagnostics() || {},
      queue: this.bcx.getQueryQueueDiagnostics(),
      authoring: this.authoring?.getState() || null,
      bcxAvailable: this.bcx.canUseBCX(),
    }, null, 2);
    const clipboard = this.root.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") void clipboard.writeText(text).catch(() => undefined);
    else if (typeof this.root.prompt === "function") this.root.prompt(this.t("diagnostics.prompt.report"), text);
  }

  private confirm(message: string): boolean {
    return typeof this.root.confirm === "function" ? this.root.confirm(message) === true : true;
  }
}
