import type { HostWindow } from "../platform/root";
import type { VirtualRuleStore } from "./virtual-rule-store";

const READY_TIMEOUT_MS = 2000;
const READY_POLL_MS = 50;

export interface VirtualBCXEndpointDiagnostics {
  bcxVersionReady: boolean;
  lastInboundType: string | null;
  lastOutboundType: string | null;
  lastQuery: string | null;
  messageCount: number;
  queryCount: number;
}

export class VirtualBCXEndpoint {
  private active = false;
  private ready = false;
  private lastInboundType: string | null = null;
  private lastOutboundType: string | null = null;
  private lastQuery: string | null = null;
  private messageCount = 0;
  private queryCount = 0;

  constructor(
    private readonly root: HostWindow,
    private readonly memberNumber: number,
    private readonly getStore: () => VirtualRuleStore | null,
  ) {}

  get bcxVersionReady(): boolean {
    return this.ready || this.getBCXVersion() !== null;
  }

  activate(): void {
    this.active = true;
    this.ready = false;
  }

  deactivate(): void {
    if (this.active) this.sendGoodbye();
    this.active = false;
    this.ready = false;
  }

  getDiagnostics(): VirtualBCXEndpointDiagnostics {
    return {
      bcxVersionReady: this.bcxVersionReady,
      lastInboundType: this.lastInboundType,
      lastOutboundType: this.lastOutboundType,
      lastQuery: this.lastQuery,
      messageCount: this.messageCount,
      queryCount: this.queryCount,
    };
  }

  handleHiddenMessage(type: string, message: any): void {
    if (!this.active) return;
    this.lastInboundType = "chat:" + type;
    this.messageCount += 1;
    switch (type) {
      case "hello":
        if (message?.request === true) this.sendHello(false);
        break;
      case "goodbye":
        this.sendHello(false);
        break;
      case "query":
        this.answerQuery(message);
        break;
      case "somethingChanged":
      case "ChatRoomStatusEvent":
      case "queryAnswer":
        break;
      default:
        break;
    }
  }

  handleBeep(type: string, message: any): void {
    if (!this.active) return;
    this.lastInboundType = "beep:" + type;
    this.messageCount += 1;
    switch (type) {
      case "versionCheck":
        this.sendBeep("versionResponse", {
          status: "current",
          supporterStatus: undefined,
          supporterSecret: undefined,
        });
        break;
      case "supporterCheck":
        this.sendBeep("supporterCheckResult", {
          memberNumber: typeof message?.memberNumber === "number" ? message.memberNumber : this.memberNumber,
          status: undefined,
        });
        break;
      default:
        break;
    }
  }

  sendHello(request = false): void {
    if (!this.active) return;
    this.deliverHidden("hello", {
      version: this.getOwnBCXVersion(),
      request,
      effects: { Effect: [] },
      typingIndicatorEnable: false,
      screenIndicatorEnable: false,
    });
  }

  sendSomethingChanged(): void {
    if (!this.active) return;
    this.deliverHidden("somethingChanged", undefined);
  }

  async waitUntilReady(timeoutMs = READY_TIMEOUT_MS): Promise<boolean> {
    const start = Date.now();
    this.sendHello(false);
    while (Date.now() - start <= timeoutMs) {
      if (this.getBCXVersion() !== null) {
        this.ready = true;
        return true;
      }
      await this.sleep(READY_POLL_MS);
    }
    return false;
  }

  private answerQuery(query: any): void {
    if (!query || typeof query.id !== "string" || typeof query.query !== "string") return;
    const answer = this.makeAnswer(query);
    this.deliverHidden("queryAnswer", answer);
  }

  private makeAnswer(query: any): any {
    try {
      this.lastQuery = query.query;
      this.queryCount += 1;
      const store = this.getStore();
      const result = store?.handleQuery(query.query, query.data);
      if (result !== undefined && this.isMutatingQuery(query.query)) {
        this.defer(() => this.sendSomethingChanged());
      }
      return {
        id: query.id,
        ok: result !== undefined,
        data: result,
      };
    } catch (error) {
      return {
        id: query.id,
        ok: false,
        data: String(error instanceof Error ? error.message : error),
      };
    }
  }

  private sendGoodbye(): void {
    this.deliverHidden("goodbye", undefined);
  }

  private deliverHidden(type: string, message: unknown): void {
    this.lastOutboundType = "chat:" + type;
    const data = {
      Type: "Hidden",
      Content: "BCXMsg",
      Sender: this.memberNumber,
      Dictionary: {
        type,
        message,
      },
    };
    this.defer(() => {
      try {
        if (typeof this.root.ChatRoomMessage === "function") this.root.ChatRoomMessage(data);
      } catch (error) {
        console.warn("[BCXIR] Failed to deliver virtual BCX hidden message.", error);
      }
    });
  }

  private sendBeep(type: string, message: unknown): void {
    this.lastOutboundType = "beep:" + type;
    const data = {
      MemberNumber: this.memberNumber,
      BeepType: "BCX",
      Message: {
        BCX: {
          type,
          message,
        },
      },
    };
    this.defer(() => {
      try {
        if (typeof this.root.ServerAccountBeep === "function") this.root.ServerAccountBeep(data);
      } catch (error) {
        console.warn("[BCXIR] Failed to deliver virtual BCX beep.", error);
      }
    });
  }

  private getBCXVersion(): string | null {
    try {
      if (typeof this.root.bcx?.getCharacterVersion === "function") {
        const version = this.root.bcx.getCharacterVersion(this.memberNumber);
        return typeof version === "string" && version ? version : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  private getOwnBCXVersion(): string {
    const version = this.root.bcx?.version;
    if (typeof version === "string" && version) return version;
    const parsed = this.root.bcx?.versionParsed;
    if (parsed && typeof parsed === "object") {
      const major = Number(parsed.major) || 0;
      const minor = Number(parsed.minor) || 0;
      const patch = Number(parsed.patch) || 0;
      return `${major}.${minor}.${patch}`;
    }
    return "virtual";
  }

  private isMutatingQuery(type: string): boolean {
    return [
      "conditionCategoryUpdate",
      "conditionSetLimit",
      "conditionUpdate",
      "conditionUpdateMultiple",
      "ruleCreate",
      "ruleDelete",
    ].includes(type);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = typeof this.root.setTimeout === "function" ? this.root.setTimeout : setTimeout;
      timer(resolve, ms);
    });
  }

  private defer(callback: () => void): void {
    if (typeof this.root.setTimeout === "function") {
      this.root.setTimeout(callback, 0);
    } else {
      callback();
    }
  }
}
