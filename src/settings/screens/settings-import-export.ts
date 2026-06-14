import {
  loadRegistry,
  normalizeRegistryState,
  saveRegistry,
} from "../../core/item-registry";
import type { RuleSynchronizer } from "../../core/sync";
import type { SettingsStore } from "../settings-storage";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const ROWS = {
  exportAll: 0,
  importAll: 1,
  exportSettings: 3,
  importSettings: 4,
  back: 6,
} as const;

export class SettingsImportExportScreen extends SettingsScreen {
  constructor(
    registry: SettingsRegistryLike,
    private readonly settingsStore: SettingsStore,
    private readonly synchronizer: RuleSynchronizer,
  ) {
    super(registry);
  }

  override get title(): string {
    return "BCXIR Import Export";
  }

  override run(): void {
    super.run();
    this.drawWideButton(ROWS.exportAll, "Export registered item rules", "Copy registry backup JSON to clipboard.");
    this.drawWideButton(ROWS.importAll, "Import registered item rules", "Merge registry backup JSON from a prompt.");
    this.drawWideButton(ROWS.exportSettings, "Export settings", "Copy BCXIR settings JSON to clipboard.");
    this.drawWideButton(ROWS.importSettings, "Import settings", "Import BCXIR settings JSON.");
    this.drawRowButton(ROWS.back, "Back", "Return to BCXIR settings.");
  }

  override click(): void {
    super.click();
    if (this.wideButtonClicked(ROWS.exportAll)) this.copyJson(loadRegistry(this.root));
    if (this.wideButtonClicked(ROWS.importAll)) this.importRegistry();
    if (this.wideButtonClicked(ROWS.exportSettings)) this.copyJson(this.settingsStore.get());
    if (this.wideButtonClicked(ROWS.importSettings)) this.importSettings();
    if (this.rowButtonClicked(ROWS.back)) this.registry.setScreen?.("main");
  }

  private importRegistry(): void {
    const input = this.promptJson("Paste registry backup JSON:");
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
    const input = this.promptJson("Paste BCXIR settings JSON:");
    if (!input) return;
    this.settingsStore.save(JSON.parse(input));
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
    if (typeof this.root.prompt === "function") this.root.prompt("BCXIR export JSON:", text);
  }
}
