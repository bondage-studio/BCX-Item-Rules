import type { HostWindow } from "../platform/root";
import type { VirtualRuleStore } from "./virtual-rule-store";

export class VirtualBCXBridge {
  private installed = false;
  private active = false;

  constructor(
    private readonly root: HostWindow,
    private readonly memberNumber: number,
    private readonly getStore: () => VirtualRuleStore | null,
  ) {}

  install(modApi: any): boolean {
    if (this.installed) {
      this.active = true;
      return true;
    }
    if (!modApi || typeof modApi.hookFunction !== "function") return false;
    try {
      modApi.hookFunction("ServerSend", 10, (args: any[], next: (args: any[]) => unknown) => {
        if (this.shouldHandleServerSend(args)) {
          this.answerQuery(args[1].Dictionary.message);
          return undefined;
        }
        return next(args);
      });
      this.installed = true;
      this.active = true;
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to install virtual BCX bridge.", error);
      return false;
    }
  }

  uninstall(): void {
    this.active = false;
  }

  private shouldHandleServerSend(args: any[]): boolean {
    if (!this.active) return false;
    const messageType = args[0];
    const payload = args[1];
    return messageType === "ChatRoomChat" &&
      payload?.Content === "BCXMsg" &&
      payload?.Type === "Hidden" &&
      payload?.Target === this.memberNumber &&
      payload?.Dictionary?.type === "query" &&
      payload?.Dictionary?.message &&
      typeof payload.Dictionary.message.id === "string" &&
      typeof payload.Dictionary.message.query === "string";
  }

  private answerQuery(query: any): void {
    const deliver = () => {
      const answer = this.makeAnswer(query);
      const data = {
        Type: "Hidden",
        Content: "BCXMsg",
        Sender: this.memberNumber,
        Dictionary: {
          type: "queryAnswer",
          message: answer,
        },
      };
      try {
        if (typeof this.root.ChatRoomMessage === "function") {
          this.root.ChatRoomMessage(data);
        }
      } catch (error) {
        console.warn("[BCXIR] Failed to deliver virtual BCX answer.", error);
      }
    };
    if (typeof this.root.setTimeout === "function") {
      this.root.setTimeout(deliver, 0);
    } else {
      deliver();
    }
  }

  private makeAnswer(query: any): any {
    try {
      const store = this.getStore();
      const result = store?.handleQuery(query.query, query.data);
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
}
