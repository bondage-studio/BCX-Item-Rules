import type { BCXAdapter } from "../../platform/bcx-adapter";
import type { SettingsStore } from "../settings-storage";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  enabled: 1,
  itemOnly: 2,
  conflicts: 3,
  invalid: 4,
  debug: 5,
  fallback: 6,
} as const;

export class SettingsMainScreen extends SettingsScreen {
  constructor(
    registry: SettingsRegistryLike,
    private readonly settingsStore: SettingsStore,
    private readonly bcx: BCXAdapter,
    private readonly onSettingsChanged: () => void,
  ) {
    super(registry);
  }

  override run(): void {
    super.run();
    const settings = this.settingsStore.get();
    const bcxStatus = this.bcx.canUseBCX() ? "BCX available" : "BCX unavailable";

    this.drawLabel(0, "Runtime status: " + bcxStatus);
    this.drawCheckbox(
      ROWS.enabled,
      "Enable BCXIR runtime rule sync",
      "When disabled, BCXIR releases rules it manages and stops applying item payloads.",
      settings.enabled,
    );
    this.drawCheckbox(
      ROWS.itemOnly,
      "Only scan worn Item-category assets",
      "Default portable behavior. Disable only if a future authoring workflow stores BCXIR markers on other worn categories.",
      settings.scanItemCategoryOnly,
    );
    this.drawCheckbox(
      ROWS.conflicts,
      "Show conflict messages",
      "Display local messages when existing rules or equal-priority item payloads prevent application.",
      settings.showConflictMessages,
    );
    this.drawCheckbox(
      ROWS.invalid,
      "Show invalid payload messages",
      "Display local messages when malformed crafted item metadata is ignored.",
      settings.showInvalidPayloadMessages,
    );
    this.drawCheckbox(
      ROWS.debug,
      "Enable debug logging",
      "Write additional BCXIR sync details to the browser console.",
      settings.debugLogging,
    );
    this.drawCheckbox(
      ROWS.fallback,
      "Enable low-frequency fallback sync",
      "Keep the periodic safety scan active in addition to BC hook-triggered syncs.",
      settings.fallbackSyncEnabled,
    );
  }

  override click(): void {
    super.click();
    const settings = this.settingsStore.get();
    if (this.checkboxClicked(ROWS.enabled)) this.update({ enabled: !settings.enabled });
    if (this.checkboxClicked(ROWS.itemOnly)) this.update({ scanItemCategoryOnly: !settings.scanItemCategoryOnly });
    if (this.checkboxClicked(ROWS.conflicts)) this.update({ showConflictMessages: !settings.showConflictMessages });
    if (this.checkboxClicked(ROWS.invalid)) this.update({ showInvalidPayloadMessages: !settings.showInvalidPayloadMessages });
    if (this.checkboxClicked(ROWS.debug)) this.update({ debugLogging: !settings.debugLogging });
    if (this.checkboxClicked(ROWS.fallback)) this.update({ fallbackSyncEnabled: !settings.fallbackSyncEnabled });
  }

  private update(patch: Parameters<SettingsStore["update"]>[0]): void {
    this.settingsStore.update(patch);
    this.onSettingsChanged();
  }
}
