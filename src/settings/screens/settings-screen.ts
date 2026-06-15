import type { HostWindow } from "../../platform/root";
import { t, type I18nKey } from "../../shared/i18n";

export interface SettingsRegistryLike {
  root: HostWindow;
  exit(): void;
  setScreen?(screen: string, options?: { itemName?: string | null }): void;
}

export abstract class SettingsScreen {
  protected static readonly START_X = 550;
  protected static readonly START_Y = 205;
  protected static readonly ROW_H = 68;
  protected static readonly LABEL_W = 600;
  protected static readonly VALUE_X = 1180;
  protected readonly elementIds = new Set<string>();

  constructor(protected readonly registry: SettingsRegistryLike) {}

  get root(): HostWindow {
    return this.registry.root;
  }

  get title(): string {
    return this.t("settings.title");
  }

  load(): void {
    /* Extension point. */
  }

  unload(): void {
    /* Extension point. */
  }

  run(): void {
    const root = this.root;
    this.drawTitle();
    root.DrawButton(1815, 75, 90, 90, "", "White", "Icons/Exit.png", this.t("settings.exit"));
  }

  click(): void {
    if (this.mouseIn(1815, 75, 90, 90)) this.exit();
  }

  exit(): void {
    this.registry.exit();
  }

  protected mouseIn(x: number, y: number, w: number, h: number): boolean {
    return this.root.MouseIn(x, y, w, h);
  }

  protected rowY(row: number): number {
    return SettingsScreen.START_Y + SettingsScreen.ROW_H * row;
  }

  protected drawLabel(row: number, label: string, description?: string): void {
    const y = this.rowY(row);
    const hovering = this.mouseIn(SettingsScreen.START_X, y - 32, SettingsScreen.LABEL_W, 64);
    this.drawTextFitLeft(label, SettingsScreen.START_X, y, SettingsScreen.LABEL_W, hovering ? "Red" : "Black", "Gray");
    if (hovering && description) this.drawTooltip(description);
  }

  protected drawCheckbox(
    row: number,
    label: string,
    description: string,
    value: boolean,
    disabled = false,
  ): void {
    const y = this.rowY(row);
    const labelX = SettingsScreen.START_X;
    const boxX = SettingsScreen.VALUE_X;
    const hovering = this.mouseIn(labelX, y - 32, SettingsScreen.LABEL_W + 64, 64);
    this.drawTextFitLeft(label, labelX, y, SettingsScreen.LABEL_W, hovering ? "Red" : "Black", "Gray");
    this.root.DrawCheckbox(boxX, y - 32, 64, 64, "", value, disabled);
    if (hovering) this.drawTooltip(description);
  }

  protected checkboxClicked(row: number): boolean {
    return this.mouseIn(SettingsScreen.VALUE_X, this.rowY(row) - 32, 64, 64);
  }

  protected drawButton(x: number, y: number, w: number, h: number, label: string, tooltip?: string, disabled = false): void {
    this.root.DrawButton(x, y, w, h, label, disabled ? "#ddd" : "White", "", tooltip || label, disabled);
  }

  protected drawRowButton(row: number, label: string, tooltip?: string, disabled = false): void {
    this.drawButton(SettingsScreen.VALUE_X, this.rowY(row) - 32, 300, 64, label, tooltip, disabled);
  }

  protected drawSelector(row: number, label: string, description: string, value: string, disabled = false): void {
    const y = this.rowY(row);
    const hovering = this.mouseIn(SettingsScreen.START_X, y - 32, SettingsScreen.LABEL_W + 420, 64);
    this.drawTextFitLeft(label, SettingsScreen.START_X, y, SettingsScreen.LABEL_W, hovering ? "Red" : "Black", "Gray");
    if (typeof this.root.DrawBackNextButton === "function") {
      this.root.DrawBackNextButton(SettingsScreen.VALUE_X, y - 32, 360, 64, value, disabled ? "#ddd" : "White", "", () => this.t("common.previous"), () => this.t("common.next"), disabled);
    } else {
      this.root.DrawButton(SettingsScreen.VALUE_X, y - 32, 360, 64, value, disabled ? "#ddd" : "White", "", this.t("common.previousNext"), disabled);
    }
    if (hovering) this.drawTooltip(description);
  }

  protected selectorClicked(row: number): boolean {
    return this.mouseIn(SettingsScreen.VALUE_X, this.rowY(row) - 32, 360, 64);
  }

  protected drawWideButton(row: number, label: string, tooltip?: string, disabled = false): void {
    this.drawButton(SettingsScreen.START_X, this.rowY(row) - 32, 700, 64, label, tooltip, disabled);
  }

  protected wideButtonClicked(row: number): boolean {
    return this.mouseIn(SettingsScreen.START_X, this.rowY(row) - 32, 700, 64);
  }

  protected rowButtonClicked(row: number): boolean {
    return this.mouseIn(SettingsScreen.VALUE_X, this.rowY(row) - 32, 300, 64);
  }

  protected createTextInput(id: string, value = "", maxLength = "255"): void {
    if (this.root.document?.getElementById(id)) return;
    if (typeof this.root.ElementCreateInput === "function") {
      this.root.ElementCreateInput(id, "text", value, maxLength);
    } else if (this.root.document) {
      const input = this.root.document.createElement("input");
      input.id = id;
      input.type = "text";
      input.value = value;
      this.root.document.body?.appendChild(input);
    }
    this.elementIds.add(id);
  }

  protected positionTextInput(id: string, row: number, label: string, description: string, width = 600): void {
    const y = this.rowY(row);
    const hovering = this.mouseIn(SettingsScreen.START_X, y - 32, SettingsScreen.LABEL_W, 64);
    this.drawTextFitLeft(label, SettingsScreen.START_X, y, SettingsScreen.LABEL_W, hovering ? "Red" : "Black", "Gray");
    if (typeof this.root.ElementPosition === "function") {
      this.root.ElementPosition(id, SettingsScreen.VALUE_X + width / 2, y, width);
    }
    if (hovering) this.drawTooltip(description);
  }

  protected hideElement(id: string): void {
    if (typeof this.root.ElementPosition === "function") {
      this.root.ElementPosition(id, -9999, -9999, 1);
    }
  }

  protected elementValue(id: string): string {
    if (typeof this.root.ElementValue === "function") return String(this.root.ElementValue(id) || "");
    const element = this.root.document?.getElementById(id) as HTMLInputElement | null;
    return element?.value || "";
  }

  protected setElementValue(id: string, value: string): void {
    if (typeof this.root.ElementSetValue === "function") {
      this.root.ElementSetValue(id, value);
      return;
    }
    const element = this.root.document?.getElementById(id) as HTMLInputElement | null;
    if (element) element.value = value;
  }

  protected drawTooltip(text: string): void {
    this.withTextAlign("center", () => {
      this.root.DrawRect(300, 850, 1400, 65, "#FFFF88");
      this.root.DrawEmptyRect(300, 850, 1400, 65, "black", 2);
      this.root.DrawTextFit(text, 1000, 883, 1360, "black");
    });
  }

  protected drawTitle(): void {
    this.drawTextFitLeft("- " + this.title + " -", 180, 130, 1200, "Black", "Gray");
  }

  protected drawTextFitLeft(
    text: string,
    leftX: number,
    y: number,
    width: number,
    color = "Black",
    outline?: string,
  ): void {
    this.withTextAlign("left", () => {
      this.root.DrawTextFit(text, leftX, y, width, color, outline);
    });
  }

  protected withTextAlign<T>(align: CanvasTextAlign, callback: () => T): T {
    const canvas = this.getGameCanvas();
    if (canvas && typeof canvas.save === "function" && typeof canvas.restore === "function") {
      canvas.save();
      canvas.textAlign = align;
      try {
        return callback();
      } finally {
        canvas.restore();
      }
    }
    const previousAlign = canvas?.textAlign;
    if (canvas) canvas.textAlign = align;
    try {
      return callback();
    } finally {
      if (canvas && previousAlign) canvas.textAlign = previousAlign;
    }
  }

  private getGameCanvas(): CanvasRenderingContext2D | undefined {
    if (typeof MainCanvas !== "undefined" && MainCanvas) return MainCanvas;
    return this.root.MainCanvas;
  }

  protected cleanupElements(): void {
    for (const id of this.elementIds) {
      if (typeof this.root.ElementRemove === "function") this.root.ElementRemove(id);
      else this.root.document?.getElementById(id)?.remove();
    }
    this.elementIds.clear();
  }

  protected t(key: I18nKey, values?: Record<string, string | number | boolean | null | undefined>): string {
    return t(this.root, key, values);
  }
}
