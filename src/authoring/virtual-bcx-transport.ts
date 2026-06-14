import type { HostWindow } from "../platform/root";
import type { VirtualBCXEndpoint } from "./virtual-bcx-endpoint";

export interface VirtualBCXTransportDiagnostics {
  transportActive: boolean;
  nativeRoomActive: boolean | null;
}

export class VirtualBCXTransport {
  private installed = false;
  private active = false;
  private endpoint: VirtualBCXEndpoint | null = null;
  private nativeRoomActive: boolean | null = null;

  constructor(
    private readonly root: HostWindow,
    private readonly memberNumber: number,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  getDiagnostics(): VirtualBCXTransportDiagnostics {
    return {
      transportActive: this.active,
      nativeRoomActive: this.nativeRoomActive,
    };
  }

  install(modApi: any): boolean {
    if (this.installed) return true;
    if (!modApi || typeof modApi.hookFunction !== "function") return false;
    try {
      modApi.hookFunction("ServerSend", 10, (args: any[], next: (args: any[]) => unknown) => {
        const handled = this.handleServerSend(args, next);
        if (handled.didHandle) return handled.result;
        return next(args);
      });
      modApi.hookFunction("ServerPlayerIsInChatRoom", 10, (args: any[], next: (args: any[]) => unknown) => {
        const nativeResult = !!next(args);
        this.nativeRoomActive = nativeResult;
        return this.active ? true : nativeResult;
      });
      this.installed = true;
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to install virtual BCX transport.", error);
      return false;
    }
  }

  activate(endpoint: VirtualBCXEndpoint): void {
    this.endpoint = endpoint;
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
    this.endpoint = null;
  }

  private handleServerSend(
    args: any[],
    next: (args: any[]) => unknown,
  ): { didHandle: boolean; result?: unknown } {
    if (!this.active || !this.endpoint) return { didHandle: false };
    const messageType = args[0];
    const payload = args[1];
    if (messageType === "ChatRoomChat" && payload?.Content === "BCXMsg" && payload?.Type === "Hidden") {
      return this.handleHiddenChat(payload, args, next);
    }
    if (messageType === "AccountBeep" && payload?.Message?.BCX) {
      return this.handleAccountBeep(payload);
    }
    return { didHandle: false };
  }

  private handleHiddenChat(
    payload: any,
    args: any[],
    next: (args: any[]) => unknown,
  ): { didHandle: boolean; result?: unknown } {
    const type = payload.Dictionary?.type;
    if (typeof type !== "string") return { didHandle: false };
    const target = payload.Target;
    if (target === this.memberNumber) {
      this.endpoint?.handleHiddenMessage(type, payload.Dictionary?.message);
      return { didHandle: true, result: undefined };
    }
    if (target == null) {
      if (this.nativeRoomActive === false) {
        this.endpoint?.handleHiddenMessage(type, payload.Dictionary?.message);
        return { didHandle: true, result: undefined };
      }
      const result = next(args);
      this.endpoint?.handleHiddenMessage(type, payload.Dictionary?.message);
      return { didHandle: true, result };
    }
    return { didHandle: false };
  }

  private handleAccountBeep(payload: any): { didHandle: boolean; result?: unknown } {
    if (payload.MemberNumber !== this.memberNumber) return { didHandle: false };
    const type = payload.Message?.BCX?.type;
    if (typeof type !== "string") return { didHandle: false };
    this.endpoint?.handleBeep(type, payload.Message.BCX.message);
    return { didHandle: true, result: undefined };
  }
}
