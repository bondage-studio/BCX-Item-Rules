import type { BCXAdapter } from "../platform/bcx-adapter";
import type { Reporter } from "../platform/reporter";
import type { HostWindow } from "../platform/root";
import { buildAuthoringPayload, buildMarker } from "./condition-export";
import { copyText } from "./clipboard";
import { VirtualBCXBridge } from "./virtual-bcx-bridge";
import { VirtualCharacterManager, VIRTUAL_MEMBER_NUMBER } from "./virtual-character";
import { VirtualRuleStore } from "./virtual-rule-store";

export type AuthoringStatus = "idle" | "active" | "finishing";

export interface AuthoringState {
  status: AuthoringStatus;
  virtualMemberNumber: number | null;
  lastMarker: string | null;
  lastError: string | null;
}

export class AuthoringSession {
  private modApi: any = null;
  private status: AuthoringStatus = "idle";
  private store: VirtualRuleStore | null = null;
  private bridge: VirtualBCXBridge;
  private characterManager: VirtualCharacterManager;
  private lastMarker: string | null = null;
  private lastError: string | null = null;
  private unsubscribeSubscreen: (() => void) | null = null;
  private sawBcxSubscreen = false;

  constructor(
    private readonly root: HostWindow,
    private readonly bcx: BCXAdapter,
    private readonly reporter: Reporter,
  ) {
    this.characterManager = new VirtualCharacterManager(root);
    this.bridge = new VirtualBCXBridge(root, VIRTUAL_MEMBER_NUMBER, () => this.store);
  }

  setModApi(modApi: any): void {
    this.modApi = modApi;
  }

  getState(): AuthoringState {
    return {
      status: this.status,
      virtualMemberNumber: this.status === "idle" ? null : VIRTUAL_MEMBER_NUMBER,
      lastMarker: this.lastMarker,
      lastError: this.lastError,
    };
  }

  async open(): Promise<boolean> {
    if (this.status !== "idle") {
      this.reporter.localMessage("BCXIR authoring is already active.", "info");
      return true;
    }
    if (!this.bcx.canUseBCX()) {
      this.lastError = "BCX is unavailable";
      this.reporter.localMessage("BCX is unavailable; cannot open BCXIR authoring.", "error");
      return false;
    }
    if (!Array.isArray(this.root.ChatRoomCharacter)) {
      this.lastError = "not in a chat room";
      this.reporter.localMessage("Enter a chat room before opening BCXIR authoring.", "error");
      return false;
    }
    try {
      const sourceRules = await this.bcx.fetchRuleConditions().catch(() => null);
      this.store = new VirtualRuleStore(sourceRules);
      this.characterManager.create();
      if (!this.bridge.install(this.modApi)) {
        throw new Error("failed to install virtual BCX query bridge");
      }
      this.status = "active";
      this.installSubscreenFinishListener();
      const opened = this.characterManager.openInformationSheet();
      this.reporter.localMessage(
        opened
          ? "Virtual BCXIR authoring character opened. Edit its BCX Rules; leaving BCX will copy the marker."
          : "Virtual BCXIR authoring character is in the room. Open its BCX Rules; leaving BCX will copy the marker.",
        "info",
      );
      return true;
    } catch (error) {
      this.lastError = String(error instanceof Error ? error.message : error);
      this.cleanup();
      this.reporter.localMessage("Failed to start BCXIR authoring: " + this.lastError, "error");
      return false;
    }
  }

  async finish(): Promise<string | null> {
    if (this.status !== "active" || !this.store) {
      this.reporter.localMessage("BCXIR authoring is not active.", "error");
      return null;
    }
    this.status = "finishing";
    try {
      const payload = buildAuthoringPayload(this.makePayloadId(), this.store.exportRules());
      const marker = buildMarker(payload);
      this.lastMarker = marker;
      const copied = await copyText(this.root, marker);
      this.reporter.localMessage(
        copied
          ? "BCXIR marker copied to clipboard. Paste it into the crafted item description."
          : "BCXIR marker generated, but clipboard copy failed. See console for the marker.",
        copied ? "info" : "error",
      );
      if (!copied) console.warn("[BCXIR] Generated marker:", marker);
      this.cleanup();
      return marker;
    } catch (error) {
      this.lastError = String(error instanceof Error ? error.message : error);
      this.reporter.localMessage("Failed to finish BCXIR authoring: " + this.lastError, "error");
      this.cleanup();
      return null;
    }
  }

  cancel(): boolean {
    if (this.status === "idle") return false;
    this.cleanup();
    this.reporter.localMessage("BCXIR authoring canceled.", "info");
    return true;
  }

  private cleanup(): void {
    this.unsubscribeSubscreen?.();
    this.unsubscribeSubscreen = null;
    this.sawBcxSubscreen = false;
    this.bridge.uninstall();
    this.characterManager.remove();
    this.store = null;
    this.status = "idle";
  }

  private installSubscreenFinishListener(): void {
    this.unsubscribeSubscreen?.();
    this.unsubscribeSubscreen = null;
    this.sawBcxSubscreen = false;
    const api = this.bcx.getApi();
    if (!api || typeof api.on !== "function") return;
    try {
      this.unsubscribeSubscreen = api.on("bcxSubscreenChange", (event: any) => {
        if (this.status !== "active") return;
        if (event?.inBcxSubscreen === true) {
          this.sawBcxSubscreen = true;
          return;
        }
        if (this.sawBcxSubscreen && event?.inBcxSubscreen === false) {
          void this.finish();
        }
      });
    } catch (error) {
      console.warn("[BCXIR] Failed to listen for BCX subscreen close.", error);
    }
  }

  private makePayloadId(): string {
    const assetName =
      this.root.CraftingItem?.Asset?.Name ||
      this.root.CraftingItem?.Name ||
      this.root.CraftingAsset?.Name ||
      "unknown";
    return "craft:" + String(assetName).replace(/[^A-Za-z0-9_-]+/g, "-") + ":" + Date.now();
  }
}
