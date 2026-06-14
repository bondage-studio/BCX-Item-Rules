import { QUERY_TIMEOUT_MS } from "../shared/constants";
import type { HostWindow } from "./root";
import { MinimalCreatorManager } from "./minimal-creator";

export interface CreatorSenderContext {
  memberNumber: number;
  allowMinimalCreator?: boolean;
}

interface PendingCreatorQuery {
  sender: number;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timeout: number;
  release: () => void;
}

export class CreatorSenderQueryTransport {
  private installed = false;
  private sequence = 0;
  private readonly pending = new Map<string, PendingCreatorQuery>();
  private readonly creators: MinimalCreatorManager;

  constructor(private readonly root: HostWindow) {
    this.creators = new MinimalCreatorManager(root);
  }

  install(modApi: any): boolean {
    if (this.installed) return true;
    if (!modApi || typeof modApi.hookFunction !== "function") return false;
    try {
      modApi.hookFunction("ServerSend", 20, (args: any[], next: (args: any[]) => unknown) => {
        if (this.handleServerSend(args)) return undefined;
        return next(args);
      });
      this.installed = true;
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to install creator sender query transport.", error);
      return false;
    }
  }

  queryAsSender(
    type: string,
    data: unknown,
    context: CreatorSenderContext,
    timeoutMs = QUERY_TIMEOUT_MS,
  ): Promise<unknown> {
    const sender = Number(context.memberNumber);
    if (!Number.isFinite(sender) || sender <= 0) {
      return Promise.reject(new Error("Invalid creator sender"));
    }
    if (typeof this.root.ChatRoomMessage !== "function") {
      return Promise.reject(new Error("BC ChatRoomMessage is unavailable"));
    }

    const release = this.creators.acquire(sender, context.allowMinimalCreator === true);
    if (!release) {
      return Promise.reject(new Error("Creator is not available in the room"));
    }

    const id = this.makeQueryId(sender, type);
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        this.pending.delete(id);
        release();
      };
      const timeout = this.root.setTimeout(() => {
        cleanup();
        reject(new Error("Timed out"));
      }, timeoutMs);
      this.pending.set(id, {
        sender,
        resolve: (value) => {
          this.root.clearTimeout(timeout);
          cleanup();
          resolve(value);
        },
        reject: (error) => {
          this.root.clearTimeout(timeout);
          cleanup();
          reject(error);
        },
        timeout,
        release,
      });

      try {
        this.root.ChatRoomMessage({
          Type: "Hidden",
          Content: "BCXMsg",
          Sender: sender,
          Dictionary: {
            type: "query",
            message: {
              id,
              query: type,
              data,
            },
          },
        });
      } catch (error) {
        const pending = this.pending.get(id);
        if (pending) {
          this.root.clearTimeout(pending.timeout);
          this.pending.delete(id);
          pending.release();
        }
        reject(error);
      }
    });
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  private handleServerSend(args: any[]): boolean {
    const messageType = args[0];
    const payload = args[1];
    if (messageType !== "ChatRoomChat" || payload?.Content !== "BCXMsg" || payload?.Type !== "Hidden") {
      return false;
    }
    if (payload.Dictionary?.type !== "queryAnswer") return false;
    const message = payload.Dictionary?.message;
    const id = typeof message?.id === "string" ? message.id : "";
    const pending = this.pending.get(id);
    if (!pending) return false;
    if (Number(payload.Target) !== pending.sender) return false;

    if (message.ok === true) pending.resolve(message.data);
    else pending.reject(message.data || new Error("BCX query rejected"));
    return true;
  }

  private makeQueryId(sender: number, type: string): string {
    this.sequence = (this.sequence + 1) % 1000000;
    return [
      "bcxir-creator",
      String(this.root.Player?.MemberNumber || 0),
      String(sender),
      type.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40),
      String(Date.now()),
      String(this.sequence),
    ].join(":");
  }
}
