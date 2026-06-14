import {
  deleteRegisteredItem,
  listRegistryEntries,
  registerItemRules,
  updateRegisteredItem,
} from "../../core/item-registry";
import type { RuleSynchronizer } from "../../core/sync";
import type { AuthoringSession } from "../../authoring/authoring-session";
import type { RegistryEntry } from "../../shared/types";
import { SettingsScreen, type SettingsRegistryLike } from "./settings-screen";

const NAME_INPUT_ID = "bcxir-item-rules-name";

export class SettingsItemRulesScreen extends SettingsScreen {
  private entries: RegistryEntry[] = [];
  private index = 0;

  constructor(
    registry: SettingsRegistryLike,
    private readonly synchronizer: RuleSynchronizer,
    private readonly authoring?: AuthoringSession,
    private readonly initialItemName?: string | null,
  ) {
    super(registry);
  }

  override get title(): string {
    return this.t("item.title");
  }

  override load(): void {
    this.createTextInput(NAME_INPUT_ID, "");
    this.reloadEntries();
    this.selectInitialItem();
    this.loadCurrentIntoElements();
  }

  override unload(): void {
    this.saveCurrent();
    this.cleanupElements();
  }

  override run(): void {
    super.run();
    const current = this.currentEntry;

    this.root.MainCanvas.textAlign = "center";
    if (current) {
      if (typeof this.root.DrawBackNextButton === "function") {
        this.root.DrawBackNextButton(550, this.rowY(0) - 32, 600, 64, current.itemName, "White", "", () => this.t("common.previous"), () => this.t("common.next"));
      } else {
        this.root.DrawButton(550, this.rowY(0) - 32, 600, 64, current.itemName, "White", "", this.t("common.previousNext"));
      }
      this.root.DrawButton(1180 - 4, this.rowY(0) - 32 - 4, 72, 72, "", "White", "", this.t("item.delete.tip"));
      this.root.DrawImageResize?.("Icons/Trash.png", 1180, this.rowY(0) - 32, 64, 64);
    } else {
      this.root.DrawTextFit(this.t("item.empty"), 780, this.rowY(0), 600, "#CBC3E3", "Black");
    }
    this.root.DrawButton(1340 - 4, this.rowY(0) - 32 - 4, 72, 72, "", "White", "", this.t("item.create.tip"));
    this.root.DrawImageResize?.("Icons/Plus.png", 1340, this.rowY(0) - 32, 64, 64);
    this.root.MainCanvas.textAlign = "left";

    if (current) {
      this.positionTextInput(NAME_INPUT_ID, 2, this.t("item.name"), this.t("item.name.tip"), 600);
      this.drawCheckbox(3, this.t("item.enabled"), this.t("item.enabled.tip"), current.enabled);
      this.drawCheckbox(4, this.t("item.selfOnly"), this.t("item.selfOnly.tip"), current.selfOnly);
      this.drawLabel(5, this.t("item.rulesUpdated", { rules: current.payload.r.length, updated: this.formatDate(current.updatedAt) }));
      this.drawRowButton(6, this.t("item.edit"), this.t("item.edit.tip"));
    } else {
      this.hideElement(NAME_INPUT_ID);
      this.drawLabel(2, this.t("item.createFirst"));
    }
    this.drawRowButton(7, this.t("common.back"), this.t("settings.tooltip.back"));
  }

  override click(): void {
    super.click();
    const current = this.currentEntry;
    if (current && this.root.MouseIn(550, this.rowY(0) - 32, 600, 64)) {
      this.saveCurrent();
      this.index = this.getNewIndexFromNextPrevClick(850, this.index, this.entries.length);
      this.loadCurrentIntoElements();
      return;
    }
    if (current && this.root.MouseIn(1180, this.rowY(0) - 32, 64, 64)) {
      deleteRegisteredItem(this.root, current.itemName);
      this.synchronizer.scheduleSync("settings-item-delete");
      this.reloadEntries();
      this.loadCurrentIntoElements();
      return;
    }
    if (this.root.MouseIn(1340, this.rowY(0) - 32, 64, 64)) {
      this.saveCurrent();
      const entry = registerItemRules(this.root, this.makeNewItemName(), this.makeEmptyPayload());
      this.synchronizer.scheduleSync("settings-item-create");
      this.reloadEntries();
      this.index = this.entries.findIndex((candidate) => candidate.id === entry.id);
      this.loadCurrentIntoElements();
      return;
    }
    if (current && this.checkboxClicked(3)) {
      updateRegisteredItem(this.root, current.itemName, { enabled: !current.enabled });
      this.synchronizer.scheduleSync("settings-item-toggle");
      this.reloadEntries();
      this.loadCurrentIntoElements();
      return;
    }
    if (current && this.checkboxClicked(4)) {
      updateRegisteredItem(this.root, current.itemName, { selfOnly: !current.selfOnly });
      this.synchronizer.scheduleSync("settings-item-self-only");
      this.reloadEntries();
      this.loadCurrentIntoElements();
      return;
    }
    if (current && this.rowButtonClicked(6)) {
      this.saveCurrent();
      const itemName = this.currentEntry?.itemName || current.itemName;
      void this.authoring?.open({ itemName, returnTo: "settingsItemRules" });
      return;
    }
    if (this.rowButtonClicked(7)) {
      this.saveCurrent();
      this.registry.setScreen?.("main");
    }
  }

  private get currentEntry(): RegistryEntry | null {
    return this.entries[this.index] || null;
  }

  private reloadEntries(): void {
    this.entries = listRegistryEntries(this.root).sort((a, b) => a.itemName.localeCompare(b.itemName));
    if (this.index >= this.entries.length) this.index = Math.max(0, this.entries.length - 1);
  }

  private selectInitialItem(): void {
    const itemName = this.initialItemName?.trim().toLocaleLowerCase();
    if (!itemName) return;
    const index = this.entries.findIndex((entry) => entry.itemName.toLocaleLowerCase() === itemName);
    if (index >= 0) this.index = index;
  }

  private loadCurrentIntoElements(): void {
    this.setElementValue(NAME_INPUT_ID, this.currentEntry?.itemName || "");
  }

  private saveCurrent(): void {
    const current = this.currentEntry;
    if (!current) return;
    const itemName = this.elementValue(NAME_INPUT_ID).trim();
    if (!itemName || itemName === current.itemName) return;
    const updated = updateRegisteredItem(this.root, current.itemName, { itemName });
    if (!updated) return;
    this.synchronizer.scheduleSync("settings-item-rename");
    this.reloadEntries();
    this.index = this.entries.findIndex((entry) => entry.id === updated.id);
    if (this.index < 0) this.index = 0;
  }

  private makeNewItemName(): string {
    let index = this.entries.length + 1;
    const names = new Set(this.entries.map((entry) => entry.itemName.toLocaleLowerCase()));
    while (names.has(this.t("item.defaultName", { index }).toLocaleLowerCase())) index += 1;
    return this.t("item.defaultName", { index });
  }

  private makeEmptyPayload() {
    return {
      v: 1 as const,
      id: "registry:empty:" + Date.now(),
      r: [],
    };
  }

  private getNewIndexFromNextPrevClick(midpoint: number, currentIndex: number, listLength: number): number {
    if (listLength <= 0) return 0;
    const mouseX = Number(this.root.MouseX);
    if (mouseX <= midpoint) return (listLength + currentIndex - 1) % listLength;
    return (currentIndex + 1) % listLength;
  }

  private formatDate(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return this.t("common.unknown");
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return String(value);
    }
  }
}
