import {
  ITEM_RULE_BEEP_TYPE,
  ITEM_RULE_MESSAGE_FLAG,
  ITEM_RULE_PROTOCOL_VERSION,
  ITEM_RULE_REQUEST_COMMAND,
  ITEM_RULE_REQUEST_COOLDOWN_MS,
  ITEM_RULE_REQUEST_MAX_COOLDOWN_MS,
  ITEM_RULE_RESPONSE_COMMAND,
} from "../shared/constants";
import type { HostWindow } from "./root";
import type { NormalizedPayload } from "../shared/types";
import {
  cacheItemRules,
  findMatchingRegistryEntry,
  getItemNameAndDescriptionConcat,
  getItemRuleName,
  isPhraseInItemName,
  makeRuleCacheKey,
} from "../core/item-registry";
import { normalizePayload } from "../core/protocol";
import { isWearerItem } from "../core/scanner";
import { canRefreshRemoteItemRules } from "../core/worn-item-lock";
import { loadState, saveState } from "../shared/storage";
import { deepClone, isPlainObject, now } from "../shared/utils";
import { Reporter } from "./reporter";
import type { SettingsStore } from "../settings/settings-storage";

type ItemRuleCommand = typeof ITEM_RULE_REQUEST_COMMAND | typeof ITEM_RULE_RESPONSE_COMMAND;

interface ItemRuleMessage {
  v: 1;
  command: ItemRuleCommand;
  requestId: string;
  itemName: string;
  item?: any;
  payload?: NormalizedPayload;
}

interface CommandArg {
  name: string;
  value: unknown;
}

interface BCXIRCommandEnvelope {
  IsBCXIR: true;
  type: "command";
  target: number;
  version: number;
  command: {
    name: ItemRuleCommand;
    args: CommandArg[];
  };
}

interface PendingRequest {
  requestId: string;
  crafter: number;
  itemName: string;
  cacheKey: string;
  sentAt: number;
}

interface RequestCooldown {
  failures: number;
  nextAllowedAt: number;
  lastSentAt: number;
}

export class ItemRuleTransport {
  private installed = false;
  private pending = new Map<string, PendingRequest>();
  private cooldowns = new Map<string, RequestCooldown>();
  private onRulesReceived: (() => void) | null = null;
  private lastInboundType: string | null = null;
  private lastOutboundType: string | null = null;

  constructor(
    private readonly root: HostWindow,
    private readonly reporter: Reporter,
    private readonly settingsStore?: SettingsStore,
  ) {}

  install(modApi: any): boolean {
    if (this.installed) return true;
    if (!modApi || typeof modApi.hookFunction !== "function") return false;
    try {
      modApi.hookFunction("ServerAccountBeep", 10, (args: any[], next: (args: any[]) => unknown) => {
        if (this.handleIncomingBeep(args[0])) return undefined;
        return next(args);
      });
      this.installed = true;
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to install item rule transport.", error);
      return false;
    }
  }

  setRulesReceivedCallback(callback: (() => void) | null): void {
    this.onRulesReceived = callback;
  }

  requestItemRules(item: any, targetOverride?: number | string): string | null {
    this.expirePending();
    const settings = this.settingsStore?.get();
    if (settings?.allowForeignItemRules === false || settings?.autoRequestForeignRules === false) {
      this.debug("Item rule request skipped by settings.");
      return null;
    }
    const crafter = targetOverride == null
      ? this.getItemCrafterMemberNumber(item)
      : this.normalizeMemberNumber(targetOverride);
    const player = Number(this.root.Player?.MemberNumber);
    const itemName = getItemRuleName(item);
    if (crafter == null) {
      this.debug("Item rule request skipped; missing crafter member number.", { itemName });
      return null;
    }
    if (!itemName) {
      this.debug("Item rule request skipped; missing item name.", { crafter });
      return null;
    }
    if (Number.isFinite(player) && player === crafter) {
      this.debug("Item rule request skipped; item was crafted by the local player.", { crafter, itemName });
      return null;
    }
    if (settings && !canRefreshRemoteItemRules(this.root, settings, crafter, itemName)) {
      this.debug("Item rule request skipped; worn item rule lock is active.", { crafter, itemName });
      return null;
    }

    const cacheKey = makeRuleCacheKey(crafter, itemName);
    const cooldown = this.cooldowns.get(cacheKey);
    if (cooldown && cooldown.nextAllowedAt > now()) {
      this.debug("Item rule request cooled down.", {
        crafter,
        itemName,
        nextAllowedInMs: cooldown.nextAllowedAt - now(),
        failures: cooldown.failures,
      });
      return null;
    }

    const requestId = this.makeRequestId(crafter, itemName);
    this.pending.set(requestId, {
      requestId,
      crafter,
      itemName,
      cacheKey,
      sentAt: now(),
    });
    this.noteRequestSent(cacheKey);

    const message: ItemRuleMessage = {
      v: ITEM_RULE_PROTOCOL_VERSION,
      command: ITEM_RULE_REQUEST_COMMAND,
      requestId,
      itemName,
      item: this.makePortableItemBundle(item),
    };
    if (!this.sendBeep(crafter, message)) {
      this.pending.delete(requestId);
      this.noteRequestFailed(cacheKey);
      return null;
    }
    this.debug("Item rule request sent.", { target: crafter, requestId, itemName });
    return requestId;
  }

  getPendingCount(): number {
    this.expirePending();
    return this.pending.size;
  }

  clearCooldowns(): void {
    this.pending.clear();
    this.cooldowns.clear();
  }

  getDiagnostics(): Record<string, unknown> {
    this.expirePending();
    return {
      pendingRequestCount: this.pending.size,
      cooldownCount: this.cooldowns.size,
      lastInboundType: this.lastInboundType,
      lastOutboundType: this.lastOutboundType,
    };
  }

  private handleIncomingBeep(data: any): boolean {
    const message = this.extractMessage(data);
    if (!message) return false;
    const sender = Number(data?.MemberNumber);
    if (!Number.isFinite(sender) || sender <= 0) return true;
    if (message.command === ITEM_RULE_REQUEST_COMMAND) {
      this.lastInboundType = ITEM_RULE_REQUEST_COMMAND;
      this.handleRequest(sender, message);
      return true;
    }
    if (message.command === ITEM_RULE_RESPONSE_COMMAND) {
      this.lastInboundType = ITEM_RULE_RESPONSE_COMMAND;
      this.handleResponse(sender, message);
      return true;
    }
    return true;
  }

  private extractMessage(data: any): ItemRuleMessage | null {
    if (!data || data.BeepType !== ITEM_RULE_BEEP_TYPE) return null;
    const envelope = data.Message;
    if (!isPlainObject(envelope) || envelope[ITEM_RULE_MESSAGE_FLAG] !== true) return null;
    if (envelope.type !== "command" || envelope.version !== ITEM_RULE_PROTOCOL_VERSION) return null;
    const commandData = envelope.command;
    if (!isPlainObject(commandData)) return null;
    const command = commandData.name;
    if (command !== ITEM_RULE_REQUEST_COMMAND && command !== ITEM_RULE_RESPONSE_COMMAND) return null;
    const args = Array.isArray(commandData.args) ? commandData.args : [];
    const requestId = this.getArg(args, "requestId", "string");
    const itemName = this.getArg(args, "itemName", "string");
    if (!requestId || !itemName) return null;
    const message: ItemRuleMessage = {
      v: ITEM_RULE_PROTOCOL_VERSION,
      command,
      requestId,
      itemName,
      item: this.getArg(args, "item"),
    };
    const payload = this.getArg(args, "payload");
    if (payload !== undefined) {
      try {
        message.payload = normalizePayload(payload);
      } catch (error) {
        console.warn("[BCXIR] Ignoring malformed item rule response payload.", error);
        this.debug("Malformed item rule response payload ignored.", { requestId, itemName });
        return null;
      }
    }
    return message;
  }

  private handleRequest(sender: number, message: ItemRuleMessage): void {
    if (this.settingsStore?.get().respondToRuleRequests === false) {
      this.debug("Item rule request ignored; responses disabled.", { sender, requestId: message.requestId });
      return;
    }
    const itemText = message.item
      ? getItemNameAndDescriptionConcat(this.root, message.item)
      : message.itemName;
    const entry = findMatchingRegistryEntry(this.root, itemText);
    this.debug("Item rule request received.", { sender, requestId: message.requestId, itemName: message.itemName, matched: !!entry });
    if (!entry) return;
    if (entry.selfOnly) {
      this.debug("Item rule request ignored; entry is self-only.", { sender, itemName: entry.itemName });
      return;
    }
    this.sendBeep(sender, {
      v: ITEM_RULE_PROTOCOL_VERSION,
      command: ITEM_RULE_RESPONSE_COMMAND,
      requestId: message.requestId,
      itemName: entry.itemName,
      payload: entry.payload,
    });
  }

  private handleResponse(sender: number, message: ItemRuleMessage): void {
    this.expirePending();
    const pending = this.pending.get(message.requestId);
    if (!pending) {
      this.debug("Item rule response ignored; no pending request.", { sender, requestId: message.requestId });
      return;
    }
    if (pending.crafter !== sender) {
      this.debug("Item rule response ignored; sender is not expected crafter.", {
        sender,
        expected: pending.crafter,
        requestId: message.requestId,
      });
      return;
    }
    if (!message.payload) {
      this.debug("Item rule response ignored; missing payload.", { sender, requestId: message.requestId });
      return;
    }
    const settings = this.settingsStore?.get();
    if (settings && !canRefreshRemoteItemRules(this.root, settings, sender, pending.itemName)) {
      this.pending.delete(message.requestId);
      this.debug("Item rule response ignored; worn item rule lock is active.", {
        sender,
        requestId: message.requestId,
        itemName: pending.itemName,
      });
      return;
    }
    if (!isPhraseInItemName(pending.itemName, message.itemName) && !isPhraseInItemName(message.itemName, pending.itemName)) {
      this.debug("Item rule response ignored; item name mismatch.", {
        requestId: message.requestId,
        pendingItemName: pending.itemName,
        responseItemName: message.itemName,
      });
      return;
    }
    cacheItemRules(this.root, sender, pending.itemName, message.payload);
    this.freezeFreshPayloadIfCurrentlyWorn(sender, pending.itemName, message.payload);
    this.pending.delete(message.requestId);
    this.cooldowns.delete(pending.cacheKey);
    this.debug("Item rule response cached.", { sender, requestId: message.requestId, itemName: pending.itemName });
    if (this.settingsStore?.get().showTransportMessages !== false) {
      this.reporter.localMessage("Received BCXIR rules for " + pending.itemName + ".", "info");
    }
    this.onRulesReceived?.();
  }

  private sendBeep(target: number, message: ItemRuleMessage): boolean {
    try {
      if (typeof this.root.ServerSend !== "function") return false;
      this.root.ServerSend("AccountBeep", {
        MemberNumber: target,
        BeepType: ITEM_RULE_BEEP_TYPE,
        IsSecret: true,
        Message: this.toEnvelope(target, message),
      });
      this.lastOutboundType = message.command;
      return true;
    } catch (error) {
      console.warn("[BCXIR] Failed to send item rule beep.", error);
      return false;
    }
  }

  private makePortableItemBundle(item: any): any {
    return {
      Group: item?.Asset?.Group?.Name,
      Name: item?.Asset?.Name || item?.Name,
      Color: deepClone(item?.Color),
      Craft: item?.Craft ? deepClone(item.Craft) : undefined,
      Property: item?.Property ? deepClone(item.Property) : undefined,
    };
  }

  private freezeFreshPayloadIfCurrentlyWorn(crafter: number, itemName: string, payload: NormalizedPayload): void {
    const settings = this.settingsStore?.get();
    if (settings?.allowForeignItemRules === false) return;
    const appearance = Array.isArray(this.root.Player?.Appearance) ? this.root.Player.Appearance : [];
    const isWorn = appearance.some((item: any) => {
      if (!isWearerItem(item, { scanItemCategoryOnly: settings?.scanItemCategoryOnly })) return false;
      return this.normalizeMemberNumber(item?.Craft?.MemberNumber) === crafter &&
        makeRuleCacheKey(crafter, getItemRuleName(item)) === makeRuleCacheKey(crafter, itemName);
    });
    if (!isWorn) return;
    const state = loadState(this.root);
    const itemKey = makeRuleCacheKey(crafter, itemName);
    if (state.activeItemPayloads[itemKey]) return;
    state.activeItemPayloads[itemKey] = {
      payload: deepClone(payload),
      originatorMemberNumber: crafter,
      originatorSource: "cache",
      allowMinimalCreator: settings?.allowCachedOfflineCreator !== false,
      itemName,
      updatedAt: now(),
    };
    saveState(this.root, state);
  }

  private toEnvelope(target: number, message: ItemRuleMessage): BCXIRCommandEnvelope {
    const args: CommandArg[] = [
      { name: "requestId", value: message.requestId },
      { name: "itemName", value: message.itemName },
    ];
    if (message.item !== undefined) args.push({ name: "item", value: deepClone(message.item) });
    if (message.payload !== undefined) args.push({ name: "payload", value: deepClone(message.payload) });
    return {
      IsBCXIR: true,
      type: "command",
      target,
      version: ITEM_RULE_PROTOCOL_VERSION,
      command: {
        name: message.command,
        args,
      },
    };
  }

  private getArg(args: unknown[], name: string, type?: "string"): any {
    const entry = args.find((arg): arg is CommandArg => isPlainObject(arg) && arg.name === name);
    const value = entry?.value;
    if (type === "string") return typeof value === "string" ? value : "";
    return value;
  }

  private getItemCrafterMemberNumber(item: any): number | null {
    return this.normalizeMemberNumber(item?.Craft?.MemberNumber);
  }

  private normalizeMemberNumber(value: unknown): number | null {
    const memberNumber = Number(value);
    return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
  }

  private makeRequestId(crafter: number, itemName: string): string {
    return [
      "bcxir",
      String(this.root.Player?.MemberNumber || 0),
      String(crafter),
      itemName.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40),
      String(Date.now()),
      String(Math.floor(Math.random() * 100000)),
    ].join(":");
  }

  private expirePending(): void {
    const cutoff = now() - ITEM_RULE_REQUEST_COOLDOWN_MS;
    for (const [requestId, pending] of this.pending.entries()) {
      if (pending.sentAt < cutoff) {
        this.pending.delete(requestId);
        this.noteRequestFailed(pending.cacheKey);
        this.debug("Item rule request expired; cooling down future polling.", {
          requestId,
          crafter: pending.crafter,
          itemName: pending.itemName,
        });
      }
    }
  }

  private noteRequestSent(cacheKey: string): void {
    const current = this.cooldowns.get(cacheKey);
    const failures = current?.failures || 0;
    this.cooldowns.set(cacheKey, {
      failures,
      lastSentAt: now(),
      nextAllowedAt: now() + this.getCooldownMs(failures),
    });
  }

  private noteRequestFailed(cacheKey: string): void {
    const current = this.cooldowns.get(cacheKey);
    const failures = Math.min((current?.failures || 0) + 1, 16);
    this.cooldowns.set(cacheKey, {
      failures,
      lastSentAt: current?.lastSentAt || now(),
      nextAllowedAt: now() + this.getCooldownMs(failures),
    });
  }

  private getCooldownMs(failures: number): number {
    const multiplier = Math.pow(2, Math.max(0, failures));
    return Math.min(ITEM_RULE_REQUEST_COOLDOWN_MS * multiplier, ITEM_RULE_REQUEST_MAX_COOLDOWN_MS);
  }

  private debug(message: string, data?: Record<string, unknown>): void {
    if (this.settingsStore?.get().debugLogging !== true) return;
    if (data) console.info("[BCXIR]", message, data);
    else console.info("[BCXIR]", message);
  }
}
