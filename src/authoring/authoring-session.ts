import type { BCXAdapter } from "../platform/bcx-adapter";
import type { Reporter } from "../platform/reporter";
import type { HostWindow } from "../platform/root";
import type { RuleSynchronizer } from "../core/sync";
import { getRegisteredItem, registerItemRules } from "../core/item-registry";
import { canModifyRegisteredItem } from "../core/worn-item-lock";
import type { RegistryEntry } from "../shared/types";
import type { SettingsStore } from "../settings/settings-storage";
import { buildAuthoringPayload } from "./condition-export";
import { VirtualBCXEndpoint } from "./virtual-bcx-endpoint";
import { VirtualBCXTransport } from "./virtual-bcx-transport";
import { VirtualCharacterManager, VIRTUAL_MEMBER_NUMBER } from "./virtual-character";
import { VirtualRuleStore } from "./virtual-rule-store";

export type AuthoringStatus = "idle" | "active" | "finishing";

export interface AuthoringState {
  status: AuthoringStatus;
  virtualMemberNumber: number | null;
  lastRegisteredItem: string | null;
  lastError: string | null;
  bcxVersionReady: boolean;
  transportActive: boolean;
  bridgeActive: boolean;
  nativeRoomActive: boolean | null;
  lastInboundType: string | null;
  lastOutboundType: string | null;
  lastQuery: string | null;
  queryCount: number;
  messageCount: number;
  lastInitStep: string | null;
}

export interface AuthoringOpenOptions {
  itemName?: string;
  returnTo?: "screen" | "settingsItemRules";
}

interface ScreenSnapshot {
  module: string;
  screen: string;
}

export class AuthoringSession {
  private modApi: any = null;
  private status: AuthoringStatus = "idle";
  private store: VirtualRuleStore | null = null;
  private endpoint: VirtualBCXEndpoint;
  private transport: VirtualBCXTransport;
  private characterManager: VirtualCharacterManager;
  private lastRegisteredItem: string | null = null;
  private lastError: string | null = null;
  private lastInitStep: string | null = null;
  private unsubscribeSubscreen: (() => void) | null = null;
  private sawBcxSubscreen = false;
  private returnScreen: ScreenSnapshot | null = null;
  private returnTo: "screen" | "settingsItemRules" = "screen";
  private restoreSettingsItemRules: ((itemName?: string | null) => void) | null = null;
  private restoreAfterBcxExitTimers: number[] = [];
  private pendingItemName: string | null = null;

  constructor(
    private readonly root: HostWindow,
    private readonly bcx: BCXAdapter,
    private readonly reporter: Reporter,
    private readonly synchronizer: RuleSynchronizer,
    private readonly settingsStore?: SettingsStore,
  ) {
    this.characterManager = new VirtualCharacterManager(root);
    this.endpoint = new VirtualBCXEndpoint(root, VIRTUAL_MEMBER_NUMBER, () => this.store);
    this.transport = new VirtualBCXTransport(root, VIRTUAL_MEMBER_NUMBER);
  }

  setModApi(modApi: any): void {
    this.modApi = modApi;
  }

  setSettingsItemRulesRestore(callback: ((itemName?: string | null) => void) | null): void {
    this.restoreSettingsItemRules = callback;
  }

  getState(): AuthoringState {
    const transport = this.transport.getDiagnostics();
    const endpoint = this.endpoint.getDiagnostics();
    return {
      status: this.status,
      virtualMemberNumber: this.status === "idle" ? null : VIRTUAL_MEMBER_NUMBER,
      lastRegisteredItem: this.lastRegisteredItem,
      lastError: this.lastError,
      bcxVersionReady: endpoint.bcxVersionReady,
      transportActive: transport.transportActive,
      bridgeActive: transport.transportActive,
      nativeRoomActive: transport.nativeRoomActive,
      lastInboundType: endpoint.lastInboundType,
      lastOutboundType: endpoint.lastOutboundType,
      lastQuery: endpoint.lastQuery,
      queryCount: endpoint.queryCount,
      messageCount: endpoint.messageCount,
      lastInitStep: this.lastInitStep,
    };
  }

  async open(options: AuthoringOpenOptions = {}): Promise<boolean> {
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
      this.clearRestoreAfterBcxExitTimers();
      this.pendingItemName = this.cleanItemName(options.itemName);
      this.returnTo = options.returnTo === "settingsItemRules" ? "settingsItemRules" : "screen";
      this.returnScreen = this.captureCurrentScreen();
      this.lastInitStep = "fetch-rules";
      const sourceRules = await this.bcx.fetchRuleConditions().catch(() => null);
      this.store = new VirtualRuleStore(sourceRules, (ruleId) => this.makeDefaultCustomData(ruleId));
      this.importExistingItemRules();
      this.lastInitStep = "transport";
      if (!this.transport.install(this.modApi)) {
        throw new Error("failed to install virtual BCX transport");
      }
      this.endpoint.activate();
      this.transport.activate(this.endpoint);
      this.lastInitStep = "character";
      this.characterManager.create();
      this.lastInitStep = "hello";
      if (!await this.endpoint.waitUntilReady()) {
        throw new Error("virtual BCX initialization failed");
      }
      this.status = "active";
      this.lastInitStep = "ready";
      this.installSubscreenFinishListener();
      this.lastInitStep = "open-information-sheet";
      const opened = this.characterManager.openInformationSheet();
      if (opened) this.scheduleAutoOpenBCXMenu();
      this.reporter.localMessage(
        opened
          ? "Virtual BCXIR authoring character opened. BCXIR will try to enter its BCX menu automatically."
          : "Virtual BCXIR authoring character is in the room. Open its BCX Rules; leaving BCX will register item rules locally.",
        "info",
      );
      return true;
    } catch (error) {
      this.lastError = String(error instanceof Error ? error.message : error);
      this.cleanup({ restoreScreen: true });
      this.reporter.localMessage("Failed to start BCXIR authoring: " + this.lastError, "error");
      return false;
    }
  }

  async finish(): Promise<RegistryEntry | null> {
    if (this.status !== "active" || !this.store) {
      this.reporter.localMessage("BCXIR authoring is not active.", "error");
      return null;
    }
    this.status = "finishing";
    try {
      const payload = buildAuthoringPayload(this.makePayloadId(), this.store.exportRules());
      const itemName = this.confirmItemName();
      if (this.settingsStore && !canModifyRegisteredItem(this.root, this.settingsStore.get(), itemName)) {
        throw new Error("item rules are locked while this item is worn");
      }
      const entry = registerItemRules(this.root, itemName, payload);
      this.lastRegisteredItem = entry.itemName;
      this.reporter.localMessage("BCXIR rules registered locally for item: " + entry.itemName + ".", "info");
      this.synchronizer.scheduleSync("authoring-register");
      this.cleanup({ restoreScreen: true });
      return entry;
    } catch (error) {
      this.lastError = String(error instanceof Error ? error.message : error);
      this.reporter.localMessage("Failed to finish BCXIR authoring: " + this.lastError, "error");
      this.cleanup({ restoreScreen: true });
      return null;
    }
  }

  cancel(): boolean {
    if (this.status === "idle") return false;
    this.cleanup({ restoreScreen: true });
    this.reporter.localMessage("BCXIR authoring canceled.", "info");
    return true;
  }

  private cleanup(options: { restoreScreen?: boolean } = {}): void {
    const screenToRestore = options.restoreScreen ? this.returnScreen : null;
    const shouldRestoreItemRules = options.restoreScreen && this.returnTo === "settingsItemRules";
    const itemNameToRestore = this.pendingItemName || this.lastRegisteredItem;
    this.unsubscribeSubscreen?.();
    this.unsubscribeSubscreen = null;
    this.sawBcxSubscreen = false;
    this.transport.deactivate();
    this.endpoint.deactivate();
    this.characterManager.remove();
    this.store = null;
    this.status = "idle";
    this.returnScreen = null;
    this.returnTo = "screen";
    this.pendingItemName = null;
    if (screenToRestore) this.restoreScreen(screenToRestore);
    if (shouldRestoreItemRules) this.scheduleRestoreSettingsItemRules(itemNameToRestore);
  }

  private scheduleAutoOpenBCXMenu(): void {
    if (typeof this.root.setTimeout !== "function") {
      this.tryAutoOpenBCXMenu();
      return;
    }
    this.root.setTimeout(() => this.tryAutoOpenBCXMenu(), 0);
  }

  private tryAutoOpenBCXMenu(): void {
    if (this.status !== "active") return;
    const opened = this.characterManager.openBCXMenuFromInformationSheet();
    if (!opened) {
      this.reporter.localMessage("Open the virtual character's BCX button to edit BCXIR rules.", "info");
    }
  }

  private scheduleRestoreSettingsItemRules(itemName?: string | null): void {
    const restore = (): void => {
      try {
        this.restoreSettingsItemRules?.(itemName);
      } catch (error) {
        console.warn("[BCXIR] Failed to restore Item Rules settings page.", error);
      }
    };
    if (typeof this.root.setTimeout !== "function") {
      restore();
      return;
    }
    this.restoreAfterBcxExitTimers.push(this.root.setTimeout(restore, 0));
    this.restoreAfterBcxExitTimers.push(this.root.setTimeout(restore, 100));
  }

  private clearRestoreAfterBcxExitTimers(): void {
    if (typeof this.root.clearTimeout === "function") {
      for (const timer of this.restoreAfterBcxExitTimers) this.root.clearTimeout(timer);
    }
    this.restoreAfterBcxExitTimers = [];
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
    const itemName = this.getSuggestedItemName() || "unknown";
    return "craft:" + String(itemName).replace(/[^A-Za-z0-9_-]+/g, "-") + ":" + Date.now();
  }

  private importExistingItemRules(): void {
    if (!this.pendingItemName || !this.store) return;
    const entry = getRegisteredItem(this.root, this.pendingItemName);
    if (!entry) return;
    this.store.importPayload(entry.payload);
  }

  private getSuggestedItemName(): string {
    if (this.pendingItemName) return this.pendingItemName;
    return String(
      this.root.CraftingItem?.Name ||
      this.root.CraftingItem?.Craft?.Name ||
      this.root.CraftingAsset?.Name ||
      this.root.CraftingItem?.Asset?.Name ||
      "",
    ).trim();
  }

  private confirmItemName(): string {
    const suggested = this.getSuggestedItemName();
    if (this.pendingItemName) return this.pendingItemName;
    if (typeof this.root.prompt === "function") {
      const input = this.root.prompt("Register BCXIR rules for crafted item name:", suggested);
      if (input === null) throw new Error("item rule registration canceled");
      const clean = input.trim();
      if (clean) return clean;
    }
    if (suggested) return suggested;
    throw new Error("could not determine crafted item name");
  }

  private cleanItemName(value: unknown): string | null {
    const clean = typeof value === "string" ? value.trim() : "";
    return clean || null;
  }

  private makeDefaultCustomData(ruleId: string): Record<string, unknown> | undefined {
    const definition = this.bcx.getRuleDefinition(ruleId);
    const dataDefinition = definition?.dataDefinition;
    if (!dataDefinition || typeof dataDefinition !== "object") return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries<any>(dataDefinition)) {
      const defaultValue = entry?.default;
      out[key] = typeof defaultValue === "function" ? defaultValue() : defaultValue;
    }
    return out;
  }

  private captureCurrentScreen(): ScreenSnapshot | null {
    const moduleName = typeof this.root.CurrentModule === "string" ? this.root.CurrentModule : "";
    const screenName = typeof this.root.CurrentScreen === "string" ? this.root.CurrentScreen : "";
    if (!moduleName || !screenName) return null;
    return { module: moduleName, screen: screenName };
  }

  private restoreScreen(snapshot: ScreenSnapshot): void {
    const currentModule = typeof this.root.CurrentModule === "string" ? this.root.CurrentModule : "";
    const currentScreen = typeof this.root.CurrentScreen === "string" ? this.root.CurrentScreen : "";
    if (currentModule === snapshot.module && currentScreen === snapshot.screen) return;
    try {
      if (typeof this.root.CommonSetScreen === "function") {
        this.root.CommonSetScreen(snapshot.module, snapshot.screen);
      }
    } catch (error) {
      console.warn("[BCXIR] Failed to restore screen after authoring.", error);
    }
  }
}
