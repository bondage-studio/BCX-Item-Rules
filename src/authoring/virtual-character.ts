import type { HostWindow } from "../platform/root";

export const VIRTUAL_MEMBER_NUMBER = 990001337;

export class VirtualCharacterManager {
  private character: any | null = null;
  private originalAllowItem: any = null;
  private permissionHookInstalled = false;

  constructor(private readonly root: HostWindow) {}

  get current(): any | null {
    return this.character;
  }

  create(): any {
    if (this.character) return this.character;
    const player = this.root.Player || {};
    const character = {
      ...player,
      ID: 999,
      Name: "BCXIR Authoring",
      Nickname: "BCXIR Authoring",
      AccountName: "BCXIR_Authoring",
      MemberNumber: VIRTUAL_MEMBER_NUMBER,
      AssetFamily: player.AssetFamily || "Female3DCG",
      Appearance: [],
      ActivePose: [],
      Effect: [],
      OnlineSharedSettings: {},
      ItemPermission: 3,
      IsPlayer: () => false,
    };
    this.character = character;
    this.installPermissionHook();
    this.insertIntoRoom(character);
    this.announceBCX(character);
    return character;
  }

  remove(): void {
    const character = this.character;
    if (!character) return;
    this.removeFromArray("ChatRoomCharacter", character);
    this.removeFromArray("ChatRoomCharacterDrawlist", character);
    this.character = null;
    this.uninstallPermissionHook();
  }

  openInformationSheet(): boolean {
    const character = this.character;
    if (!character) return false;
    try {
      this.root.InformationSheetSelection = character;
      if (typeof this.root.InformationSheetLoad === "function") {
        this.root.InformationSheetLoad(character);
      }
      if (typeof this.root.CommonSetScreen === "function") {
        this.root.CommonSetScreen("Character", "InformationSheet");
      }
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to open virtual character information sheet.", error);
      return false;
    }
  }

  private insertIntoRoom(character: any): void {
    if (!Array.isArray(this.root.ChatRoomCharacter)) this.root.ChatRoomCharacter = [];
    if (!this.root.ChatRoomCharacter.includes(character)) this.root.ChatRoomCharacter.push(character);
    if (Array.isArray(this.root.ChatRoomCharacterDrawlist) &&
      !this.root.ChatRoomCharacterDrawlist.includes(character)) {
      this.root.ChatRoomCharacterDrawlist.push(character);
      this.root.ChatRoomCharacterViewCharacterCount = this.root.ChatRoomCharacterDrawlist.length;
    }
  }

  private removeFromArray(name: string, value: any): void {
    const array = this.root[name];
    if (!Array.isArray(array)) return;
    const index = array.indexOf(value);
    if (index >= 0) array.splice(index, 1);
    if (name === "ChatRoomCharacterDrawlist") {
      this.root.ChatRoomCharacterViewCharacterCount = array.length;
    }
  }

  private installPermissionHook(): void {
    if (this.permissionHookInstalled) return;
    this.originalAllowItem = this.root.ServerChatRoomGetAllowItem;
    const memberNumber = VIRTUAL_MEMBER_NUMBER;
    const original = this.originalAllowItem;
    this.root.ServerChatRoomGetAllowItem = function allowVirtualItemAccess(a: any, b: any): boolean {
      if (a?.MemberNumber === memberNumber || b?.MemberNumber === memberNumber) return true;
      if (typeof original === "function") return original(a, b);
      return true;
    } as any;
    this.permissionHookInstalled = true;
  }

  private uninstallPermissionHook(): void {
    if (!this.permissionHookInstalled) return;
    this.root.ServerChatRoomGetAllowItem = this.originalAllowItem;
    this.originalAllowItem = null;
    this.permissionHookInstalled = false;
  }

  private announceBCX(character: any): void {
    const version = this.root.bcx?.version || this.root.bcx?.versionParsed?.major || "virtual";
    const data = {
      Type: "Hidden",
      Content: "BCXMsg",
      Sender: character.MemberNumber,
      Dictionary: {
        type: "hello",
        message: {
          version: String(version),
          request: false,
          effects: { Effect: [] },
          typingIndicatorEnable: false,
          screenIndicatorEnable: false,
        },
      },
    };
    try {
      if (typeof this.root.ChatRoomMessage === "function") this.root.ChatRoomMessage(data);
    } catch {
      /* Best effort only. */
    }
  }
}
