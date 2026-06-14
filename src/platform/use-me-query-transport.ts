import { QUERY_TIMEOUT_MS } from "../shared/constants";
import type { HostWindow } from "./root";

interface PendingUseMeQuery {
  sender: number;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timeout: number;
  release: () => void;
}

interface UseMeOperatorEntry {
  character: any;
  refs: number;
  restore: (() => void) | null;
}

const USE_ME_OPERATOR_MEMBER_NUMBER = 990001339;

export class UseMeQueryTransport {
  private installed = false;
  private sequence = 0;
  private readonly pending = new Map<string, PendingUseMeQuery>();
  private operator: UseMeOperatorEntry | null = null;

  constructor(private readonly root: HostWindow) {}

  install(modApi: any): boolean {
    if (this.installed) return true;
    if (!modApi || typeof modApi.hookFunction !== "function") return false;
    try {
      modApi.hookFunction("ServerSend", 19, (args: any[], next: (args: any[]) => unknown) => {
        if (this.handleServerSend(args)) return undefined;
        return next(args);
      });
      this.installed = true;
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to install useMe query transport.", error);
      return false;
    }
  }

  queryUseMe(type: string, data: unknown, timeoutMs = QUERY_TIMEOUT_MS): Promise<unknown> {
    if (typeof this.root.ChatRoomMessage !== "function") {
      return Promise.reject(new Error("BC ChatRoomMessage is unavailable"));
    }
    const release = this.acquireOperator();
    if (!release) return Promise.reject(new Error("BCXIR useMe operator is unavailable"));

    const sender = this.getOperatorMemberNumber();
    const id = this.makeQueryId(type);
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

  private acquireOperator(): (() => void) | null {
    if (this.operator) {
      this.operator.refs += 1;
      return () => this.releaseOperator(this.operator?.character);
    }

    const character = this.createOperatorCharacter();
    if (!Array.isArray(this.root.ChatRoomCharacter)) this.root.ChatRoomCharacter = [];
    this.root.ChatRoomCharacter.push(character);
    this.operator = {
      character,
      refs: 1,
      restore: this.patchTemporaryAuthority(character.MemberNumber),
    };
    return () => this.releaseOperator(character);
  }

  private releaseOperator(character: any): void {
    const entry = this.operator;
    if (!entry || entry.character !== character) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    this.operator = null;
    entry.restore?.();
    this.removeFromArray("ChatRoomCharacter", character);
  }

  private patchTemporaryAuthority(memberNumber: number): () => void {
    const root = this.root;
    const player = root.Player || {};
    const previousAllowItem = root.ServerChatRoomGetAllowItem;
    const previousIsOwnedByMemberNumber = player.IsOwnedByMemberNumber;
    const hadWhiteList = Array.isArray(player.WhiteList);
    const previousWhiteList = hadWhiteList ? player.WhiteList.slice() : null;
    let patchedAllowItem: any = null;
    let patchedIsOwnedByMemberNumber: any = null;

    if (!Array.isArray(player.WhiteList)) player.WhiteList = [];
    if (!player.WhiteList.includes(memberNumber)) player.WhiteList.push(memberNumber);

    if (typeof previousAllowItem === "function") {
      patchedAllowItem = function patchedServerChatRoomGetAllowItem(this: any, source: any, target: any): boolean {
        if (source?.MemberNumber === memberNumber && target === root.Player) return true;
        return previousAllowItem.apply(this, arguments as any);
      };
      root.ServerChatRoomGetAllowItem = patchedAllowItem;
    }

    if (typeof previousIsOwnedByMemberNumber === "function") {
      patchedIsOwnedByMemberNumber = function patchedPlayerIsOwnedByMemberNumber(this: any, value: any): boolean {
        if (Number(value) === memberNumber) return true;
        return previousIsOwnedByMemberNumber.apply(this, arguments as any);
      };
      player.IsOwnedByMemberNumber = patchedIsOwnedByMemberNumber;
    }

    return () => {
      if (patchedAllowItem && root.ServerChatRoomGetAllowItem === patchedAllowItem) root.ServerChatRoomGetAllowItem = previousAllowItem;
      if (patchedIsOwnedByMemberNumber && player.IsOwnedByMemberNumber === patchedIsOwnedByMemberNumber) player.IsOwnedByMemberNumber = previousIsOwnedByMemberNumber;
      if (previousWhiteList) player.WhiteList = previousWhiteList;
      else if (!hadWhiteList) delete player.WhiteList;
    };
  }

  private getOperatorMemberNumber(): number {
    const playerNumber = Number(this.root.Player?.MemberNumber);
    if (Number.isFinite(playerNumber) && playerNumber === USE_ME_OPERATOR_MEMBER_NUMBER) {
      return USE_ME_OPERATOR_MEMBER_NUMBER + 1;
    }
    return USE_ME_OPERATOR_MEMBER_NUMBER;
  }

  private createOperatorCharacter(): any {
    const player = this.root.Player || {};
    const memberNumber = this.getOperatorMemberNumber();
    return {
      ID: 0,
      Name: "BCXIR Please Use Me",
      Nickname: "BCXIR Please Use Me",
      AccountName: "BCXIR_UseMe",
      MemberNumber: memberNumber,
      AssetFamily: player.AssetFamily || "Female3DCG",
      Appearance: [],
      ActivePose: [],
      Effect: [],
      OnlineSharedSettings: {},
      ItemPermission: 3,
      IsPlayer: () => false,
    };
  }

  private removeFromArray(name: string, value: any): void {
    const array = this.root[name];
    if (!Array.isArray(array)) return;
    const index = array.indexOf(value);
    if (index >= 0) array.splice(index, 1);
  }

  private makeQueryId(type: string): string {
    this.sequence = (this.sequence + 1) % 1000000;
    return [
      "bcxir-useme",
      String(this.root.Player?.MemberNumber || 0),
      type.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40),
      String(Date.now()),
      String(this.sequence),
    ].join(":");
  }
}
