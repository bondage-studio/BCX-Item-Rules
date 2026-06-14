import type { HostWindow } from "../platform/root";

export const VIRTUAL_MEMBER_NUMBER = 990001337;

export class VirtualCharacterManager {
  private character: any | null = null;
  private originalAllowItem: any = null;
  private permissionHookInstalled = false;
  private previousInformationSheetSelection: any = null;
  private hadPreviousInformationSheetSelection = false;

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
    return character;
  }

  remove(): void {
    const character = this.character;
    if (!character) return;
    this.restoreInformationSheetSelection(character);
    this.removeFromArray("ChatRoomCharacter", character);
    this.removeFromArray("ChatRoomCharacterDrawlist", character);
    this.character = null;
    this.uninstallPermissionHook();
  }

  openInformationSheet(): boolean {
    const character = this.character;
    if (!character) return false;
    try {
      if (!this.hadPreviousInformationSheetSelection) {
        this.previousInformationSheetSelection = this.root.InformationSheetSelection;
        this.hadPreviousInformationSheetSelection = true;
      }
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

  private restoreInformationSheetSelection(character: any): void {
    if (this.isVirtualSelection(this.root.InformationSheetSelection, character)) {
      const previous = this.isVirtualSelection(this.previousInformationSheetSelection, character)
        ? null
        : this.previousInformationSheetSelection;
      this.root.InformationSheetSelection = previous || this.root.Player || null;
    }
    this.previousInformationSheetSelection = null;
    this.hadPreviousInformationSheetSelection = false;
  }

  private isVirtualSelection(selection: any, character: any): boolean {
    return selection === character || selection?.MemberNumber === VIRTUAL_MEMBER_NUMBER;
  }

  openBCXMenuFromInformationSheet(): boolean {
    if (!this.character || typeof this.root.InformationSheetClick !== "function") return false;
    const previousX = this.root.MouseX;
    const previousY = this.root.MouseY;
    try {
      this.root.MouseX = 1820;
      this.root.MouseY = 690;
      this.root.InformationSheetClick();
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to auto-open virtual character BCX menu.", error);
      return false;
    } finally {
      this.root.MouseX = previousX;
      this.root.MouseY = previousY;
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

}
