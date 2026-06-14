import type { HostWindow } from "./root";

interface MinimalCreatorEntry {
  character: any;
  refs: number;
}

export class MinimalCreatorManager {
  private readonly entries = new Map<number, MinimalCreatorEntry>();

  constructor(private readonly root: HostWindow) {}

  acquire(memberNumber: number, allowMinimalCreator: boolean): (() => void) | null {
    if (this.hasRoomCharacter(memberNumber)) return () => undefined;
    if (!allowMinimalCreator) return null;

    const existing = this.entries.get(memberNumber);
    if (existing) {
      existing.refs += 1;
      return () => this.release(memberNumber, existing.character);
    }

    const character = this.createCharacter(memberNumber);
    if (!Array.isArray(this.root.ChatRoomCharacter)) this.root.ChatRoomCharacter = [];
    this.root.ChatRoomCharacter.push(character);
    this.entries.set(memberNumber, { character, refs: 1 });
    return () => this.release(memberNumber, character);
  }

  private hasRoomCharacter(memberNumber: number): boolean {
    return Array.isArray(this.root.ChatRoomCharacter) &&
      this.root.ChatRoomCharacter.some((character: any) => character?.MemberNumber === memberNumber);
  }

  private createCharacter(memberNumber: number): any {
    const player = this.root.Player || {};
    const name = "BCXIR Creator " + memberNumber;
    return {
      ID: 0,
      Name: name,
      Nickname: name,
      AccountName: "BCXIR_Creator_" + memberNumber,
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

  private release(memberNumber: number, character: any): void {
    const entry = this.entries.get(memberNumber);
    if (!entry || entry.character !== character) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    this.entries.delete(memberNumber);
    this.removeFromArray("ChatRoomCharacter", character);
  }

  private removeFromArray(name: string, value: any): void {
    const array = this.root[name];
    if (!Array.isArray(array)) return;
    const index = array.indexOf(value);
    if (index >= 0) array.splice(index, 1);
  }
}
