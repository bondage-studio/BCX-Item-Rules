import type { HostWindow } from "../../platform/root";

export interface SettingsRegistryLike {
  root: HostWindow;
  exit(): void;
}

export abstract class SettingsScreen {
  protected static readonly START_X = 180;
  protected static readonly START_Y = 205;
  protected static readonly ROW_H = 78;

  constructor(protected readonly registry: SettingsRegistryLike) {}

  get root(): HostWindow {
    return this.registry.root;
  }

  get title(): string {
    return "BCXIR Settings";
  }

  load(): void {
    /* Extension point. */
  }

  unload(): void {
    /* Extension point. */
  }

  run(): void {
    const root = this.root;
    root.MainCanvas.textAlign = "left";
    root.DrawText("- " + this.title + " -", 125, 125, "Black", "Gray");
    root.DrawButton(1815, 75, 90, 90, "", "White", "Icons/Exit.png", "Exit");
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
    const hovering = this.mouseIn(SettingsScreen.START_X, y - 32, 1320, 64);
    this.root.DrawTextFit(label, SettingsScreen.START_X, y, 1320, hovering ? "Red" : "Black", "Gray");
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
    const boxX = 1420;
    const hovering = this.mouseIn(labelX, y - 32, 1300, 64);
    this.root.DrawTextFit(label, labelX, y, 1180, hovering ? "Red" : "Black", "Gray");
    this.root.DrawCheckbox(boxX, y - 32, 64, 64, "", value, disabled);
    if (hovering) this.drawTooltip(description);
  }

  protected checkboxClicked(row: number): boolean {
    return this.mouseIn(1420, this.rowY(row) - 32, 64, 64);
  }

  protected drawButton(x: number, y: number, w: number, h: number, label: string, tooltip?: string): void {
    this.root.DrawButton(x, y, w, h, "", "White", "", tooltip || label);
    this.root.DrawTextFit(label, x + 10, y + h / 2, w - 20, "Black");
  }

  protected drawTooltip(text: string): void {
    this.root.DrawRect(300, 850, 1400, 65, "#FFFF88");
    this.root.DrawEmptyRect(300, 850, 1400, 65, "black", 2);
    this.root.DrawTextFit(text, 306, 883, 1388, "black");
  }
}
