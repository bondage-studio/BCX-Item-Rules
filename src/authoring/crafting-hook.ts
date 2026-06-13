import type { HostWindow } from "../platform/root";
import type { AuthoringSession } from "./authoring-session";

const LABEL_ID = "bcxir-crafting-rules-label";
const BUTTON_ID = "bcxir-crafting-rules-button";

export class CraftingAuthoringHook {
  private registered = false;

  constructor(
    private readonly root: HostWindow,
    private readonly session: AuthoringSession,
  ) {}

  register(modApi: any): boolean {
    if (this.registered) return true;
    if (!modApi || typeof modApi.hookFunction !== "function") return false;
    try {
      modApi.hookFunction("CraftingModeSet", 1, (args: any[], next: (args: any[]) => unknown) => {
        const result = next(args);
        this.refreshButton();
        return result;
      });
      modApi.hookFunction("CraftingResize", 1, (args: any[], next: (args: any[]) => unknown) => {
        const result = next(args);
        this.refreshButton();
        return result;
      });
      modApi.hookFunction("CraftingEventListeners._ChangeDescription", 1, (args: any[], next: (args: any[]) => unknown) => {
        const result = next(args);
        this.refreshButton();
        return result;
      });
      this.registered = true;
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to register crafting authoring hooks.", error);
      return false;
    }
  }

  refreshButton(): void {
    const document = this.root.document;
    if (!document) return;
    const rightPanelId = this.root.CraftingID?.rightPanel;
    const rightPanel = typeof rightPanelId === "string" ? document.getElementById(rightPanelId) : null;
    if (!rightPanel) {
      this.removeButton();
      return;
    }
    if (document.getElementById(LABEL_ID)) return;
    const label = document.createElement("label");
    label.id = LABEL_ID;
    label.className = "crafting-label";
    label.style.cssText = "grid-template-columns: min-content auto";
    const button = this.createButton();
    label.appendChild(button);
    const span = document.createElement("span");
    span.append("BCXIR Rules");
    label.appendChild(span);
    rightPanel.appendChild(label);
  }

  removeButton(): void {
    this.root.document?.getElementById(LABEL_ID)?.remove();
  }

  private createButton(): HTMLButtonElement {
    const document = this.root.document;
    let button: HTMLButtonElement;
    if (this.root.ElementButton && typeof this.root.ElementButton.Create === "function") {
      button = this.root.ElementButton.Create(BUTTON_ID, () => {
        void this.session.open();
      });
    } else {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.addEventListener("click", () => {
        void this.session.open();
      });
    }
    button.type = "button";
    button.title = "BCXIR Rules";
    button.style.setProperty("height", "calc(0.75 * var(--menu-button-size))");
    button.style.setProperty("width", "calc(0.75 * var(--menu-button-size))");
    button.style.setProperty("background-image", "url(\"Icons/Preference.png\")");
    return button;
  }
}
