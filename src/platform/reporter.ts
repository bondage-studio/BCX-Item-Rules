import type { HostWindow } from "./root";
import type { SettingsStore } from "../settings/settings-storage";

export type ReportKind = "conflict" | "invalid-payload" | "error" | "info";

export class Reporter {
  private lastReportKey = "";

  constructor(
    private readonly root: HostWindow,
    private readonly settingsStore?: SettingsStore,
  ) {}

  private shouldShow(kind: ReportKind): boolean {
    const settings = this.settingsStore?.get();
    if (kind === "conflict" && settings?.showConflictMessages === false) return false;
    if (kind === "invalid-payload" && settings?.showInvalidPayloadMessages === false) return false;
    return true;
  }

  localMessage(message: string, kind: ReportKind = "info"): void {
    console.warn("[BCXIR]", message);
    if (!this.shouldShow(kind)) return;
    try {
      if (typeof this.root.ChatRoomSendLocal === "function") {
        this.root.ChatRoomSendLocal("[BCXIR] " + message, 8000);
      } else if (typeof this.root.InfoBeep === "function") {
        this.root.InfoBeep("[BCXIR] " + message, 8000);
      }
    } catch {
      /* Best effort only. */
    }
  }

  reportOnce(kind: string, messages: string[], reportKind: ReportKind = "info"): void {
    if (!messages.length) return;
    const key = kind + ":" + messages.join("|");
    if (key === this.lastReportKey) return;
    this.lastReportKey = key;
    this.localMessage(
      messages.slice(0, 4).join(" | ") + (messages.length > 4 ? " | ..." : ""),
      reportKind,
    );
  }
}
