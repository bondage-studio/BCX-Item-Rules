import type { RuleSynchronizer } from "../../core/sync";
import { isWornItemRuleLockActive } from "../../core/worn-item-lock";
import type { SettingsStore } from "../settings-storage";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  intro: 0,
  master: 2,
  useMe: 3,
  replaceInactive: 4,
  summary: 6,
  back: 7,
} as const;

export class SettingsDangerScreen extends SettingsScreen {
  constructor(
    registry: SettingsRegistryLike,
    private readonly settingsStore: SettingsStore,
    private readonly synchronizer: RuleSynchronizer,
  ) {
    super(registry);
  }

  override get title(): string {
    return this.t("danger.title");
  }

  override run(): void {
    super.run();
    const settings = this.settingsStore.get();
    const lockActive = isWornItemRuleLockActive(this.root, settings);
    this.drawLabel(ROWS.intro, this.t("danger.warning"), this.t("danger.warning.tip"));
    this.drawCheckbox(
      ROWS.master,
      this.t("danger.master"),
      lockActive ? this.t("danger.locked.tip") : this.t("danger.master.tip"),
      settings.dangerModeEnabled,
      lockActive,
    );
    this.drawCheckbox(
      ROWS.useMe,
      this.t("danger.useMe"),
      lockActive ? this.t("danger.locked.tip") : settings.dangerModeEnabled ? this.t("danger.useMe.tip") : this.t("danger.useMe.disabled.tip"),
      settings.unlockUseMeMode,
      lockActive || !settings.dangerModeEnabled,
    );
    this.drawCheckbox(
      ROWS.replaceInactive,
      this.t("danger.replaceInactive"),
      lockActive ? this.t("danger.locked.tip") : settings.dangerModeEnabled ? this.t("danger.replaceInactive.tip") : this.t("danger.replaceInactive.disabled.tip"),
      settings.useMeSuspendInactiveConflicts,
      lockActive || !settings.dangerModeEnabled,
    );
    this.drawLabel(ROWS.summary, this.t("danger.summary"));
    this.drawRowButton(ROWS.back, this.t("common.back"), this.t("settings.tooltip.back"));
  }

  override click(): void {
    super.click();
    const settings = this.settingsStore.get();
    if (isWornItemRuleLockActive(this.root, settings)) {
      if (this.rowButtonClicked(ROWS.back)) this.registry.setScreen?.("main");
      return;
    }
    if (this.checkboxClicked(ROWS.master)) {
      if (settings.dangerModeEnabled) {
        this.settingsStore.update({
          dangerModeEnabled: false,
          unlockUseMeMode: false,
          useMeSuspendInactiveConflicts: false,
          rulePermissionMode: settings.rulePermissionMode === "useMe" ? "creator" : settings.rulePermissionMode,
        });
        this.synchronizer.scheduleSync("danger-disable");
      } else if (this.confirm(this.t("danger.confirm.master"))) {
        this.settingsStore.update({ dangerModeEnabled: true });
      }
    }

    if (settings.dangerModeEnabled && this.checkboxClicked(ROWS.useMe)) {
      if (!settings.unlockUseMeMode && !this.confirm(this.t("danger.confirm.useMe"))) return;
      this.settingsStore.update({
        unlockUseMeMode: !settings.unlockUseMeMode,
        rulePermissionMode: settings.unlockUseMeMode && settings.rulePermissionMode === "useMe" ? "creator" : settings.rulePermissionMode,
      });
      this.synchronizer.scheduleSync("danger-useme-toggle");
    }

    if (settings.dangerModeEnabled && this.checkboxClicked(ROWS.replaceInactive)) {
      if (!settings.useMeSuspendInactiveConflicts && !this.confirm(this.t("danger.confirm.replaceInactive"))) return;
      this.settingsStore.update({ useMeSuspendInactiveConflicts: !settings.useMeSuspendInactiveConflicts });
      this.synchronizer.scheduleSync("danger-replace-inactive");
    }

    if (this.rowButtonClicked(ROWS.back)) this.registry.setScreen?.("main");
  }

  private confirm(message: string): boolean {
    return typeof this.root.confirm === "function" ? this.root.confirm(message) === true : true;
  }
}
