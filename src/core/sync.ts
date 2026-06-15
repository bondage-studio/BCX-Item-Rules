import { makeRuleUpdateData, normalizeConditionForUpdate } from "./conditions";
import { FALLBACK_SYNC_MS, MOD_ID, SYNC_DEBOUNCE_MS } from "../shared/constants";
import { BCXAdapter, type RuleQueryContext } from "../platform/bcx-adapter";
import type { HostWindow } from "../platform/root";
import { collectDesiredRulesFromAppearance } from "./scanner";
import { loadState, saveState } from "../shared/storage";
import type { BCXIRSettings, DesiredRule, DesiredRuleSource, DesiredRulesResult, ManagedRuleState } from "../shared/types";
import { deepClone, now, sameStable } from "../shared/utils";
import { Reporter } from "../platform/reporter";
import type { SettingsStore } from "../settings/settings-storage";
import type { ItemRuleTransport } from "../platform/item-rule-transport";
import {
  findMatchingRegistryEntry,
  getCachedItemRules,
  getItemRuleName,
} from "./item-registry";

export class RuleSynchronizer {
  private syncTimer = 0;
  private fallbackTimer = 0;
  private syncInFlight = false;
  private pendingSyncReason = "";
  private lastSyncReason: string | null = null;
  private lastSyncTime: number | null = null;
  private lastSyncResult: "ok" | "failed" | "busy" | null = null;
  private lastConflictCount = 0;
  private lastInvalidCount = 0;

  constructor(
    private readonly root: HostWindow,
    private readonly bcx: BCXAdapter,
    private readonly reporter: Reporter,
    private readonly settingsStore: SettingsStore,
    private readonly itemRuleTransport?: ItemRuleTransport,
  ) {}

  async applyDesiredRules(desiredInfo: DesiredRulesResult, reason?: string): Promise<boolean> {
    const api = this.bcx.getApi();
    if (!api) {
      this.reporter.reportOnce("missing-bcx", ["BCX is not available; item rules are paused"], "error");
      return false;
    }

    const state = loadState(this.root);
    const changedMessages: string[] = [];
    const conflictMessages = [...desiredInfo.conflicts];
    const invalidMessages = desiredInfo.errors.map((error) => "Invalid item payload: " + error);
    const settings = this.settingsStore.get();
    let latestConditionsData: any = null;

    for (const [ruleId, desired] of desiredInfo.desired.entries()) {
      if (!this.bcx.isKnownRule(ruleId)) {
        conflictMessages.push("Unknown BCX rule skipped: " + ruleId);
        continue;
      }

      const applyContext = this.getDesiredRuleContext(desired, settings);
      if (!applyContext) {
        conflictMessages.push("No permitted sender available for item rule: " + ruleId);
        continue;
      }

      let conditionsData: any;
      try {
        conditionsData = await this.bcx.fetchRuleConditions(applyContext.context);
        latestConditionsData = conditionsData;
      } catch (error) {
        conflictMessages.push("Failed to read BCX rules as sender for " + ruleId + ": " + this.errorMessage(error));
        continue;
      }

      const current = this.bcx.getRulePublicData(conditionsData, ruleId);
      const managed = state.managed[ruleId];
      const wasManaged = !!managed;
      const comparableCurrent = normalizeConditionForUpdate(current);

      if (managed?.lastApplied && comparableCurrent && !sameStable(comparableCurrent, managed.lastApplied)) {
        delete state.managed[ruleId];
        conflictMessages.push("Rule changed outside BCXIR; released: " + ruleId);
        continue;
      }

      if (!managed && current) {
        const canSuspendInactive = settings.dangerModeEnabled === true &&
          settings.useMeSuspendInactiveConflicts === true &&
          comparableCurrent?.active === false;
        if (!canSuspendInactive) {
          conflictMessages.push(
            comparableCurrent?.active === false && settings.dangerModeEnabled === true
              ? "Existing inactive BCX rule not overwritten without suspend option: " + ruleId
              : "Existing BCX rule not overwritten: " + ruleId,
          );
          continue;
        }
        state.managed[ruleId] = {
          previousCondition: deepClone(comparableCurrent),
          createdByUs: false,
          payloadIds: [],
          updatedAt: now(),
          appliedSenderMemberNumber: applyContext.senderMemberNumber,
          appliedSenderWasMinimal: applyContext.allowMinimalCreator,
          appliedContextKind: applyContext.context.kind,
          suspendedExistingInactive: true,
        };
      }

      if (!state.managed[ruleId]) {
        const okCreate = await this.bcx.ensureRuleExists(ruleId, conditionsData, applyContext.context);
        if (!okCreate) {
          conflictMessages.push("BCX refused to create rule: " + ruleId);
          continue;
        }
        conditionsData = await this.bcx.fetchRuleConditions(applyContext.context);
        latestConditionsData = conditionsData;
        state.managed[ruleId] = {
          previousCondition: null,
          createdByUs: !current,
          payloadIds: [],
          updatedAt: now(),
          appliedSenderMemberNumber: applyContext.senderMemberNumber,
          appliedSenderWasMinimal: applyContext.allowMinimalCreator,
          appliedContextKind: applyContext.context.kind,
        };
      }

      const currentForUpdate = this.bcx.getRulePublicData(conditionsData, ruleId);
      const updateData = makeRuleUpdateData(desired.conditionData, currentForUpdate);
      const okUpdate = await this.bcx.updateRule(ruleId, updateData, applyContext.context);
      if (okUpdate !== true) {
        const createdState = state.managed[ruleId];
        if (!wasManaged && createdState?.previousCondition) {
          await this.bcx.updateRule(ruleId, createdState.previousCondition, applyContext.context).catch(() => false);
          delete state.managed[ruleId];
        } else if (!wasManaged && createdState?.createdByUs) {
          await this.bcx.deleteRule(ruleId, applyContext.context).catch(() => false);
          delete state.managed[ruleId];
        }
        conflictMessages.push("BCX refused to update rule: " + ruleId);
        continue;
      }

      state.managed[ruleId].lastApplied = deepClone(updateData);
      state.managed[ruleId].payloadIds = Array.from(new Set(desired.payloadIds));
      state.managed[ruleId].updatedAt = now();
      state.managed[ruleId].appliedSenderMemberNumber = applyContext.senderMemberNumber;
      state.managed[ruleId].appliedSenderWasMinimal = applyContext.allowMinimalCreator;
      state.managed[ruleId].appliedContextKind = applyContext.context.kind;
      changedMessages.push("Applied " + ruleId);
    }

    latestConditionsData = await this.bcx.fetchRuleConditions().catch(() => latestConditionsData);

    for (const ruleId of Object.keys(state.managed)) {
      if (desiredInfo.desired.has(ruleId)) continue;
      const managed = state.managed[ruleId];
      const cleanupContext = this.getManagedRuleContext(managed);
      let conditionsData = latestConditionsData;
      if (cleanupContext.context.kind !== "self") {
        conditionsData = await this.bcx.fetchRuleConditions(cleanupContext.context).catch(() => latestConditionsData);
      }
      const current = this.bcx.getRulePublicData(conditionsData, ruleId);
      const comparableCurrent = normalizeConditionForUpdate(current);

      if (managed.lastApplied && comparableCurrent && !sameStable(comparableCurrent, managed.lastApplied)) {
        delete state.managed[ruleId];
        conflictMessages.push("Removed item no longer controls externally changed rule: " + ruleId);
        continue;
      }

      if (managed.previousCondition) {
        const okRestore = await this.bcx.updateRule(ruleId, managed.previousCondition, cleanupContext.context);
        if (okRestore === true) {
          changedMessages.push("Restored " + ruleId);
          delete state.managed[ruleId];
        } else {
          conflictMessages.push("BCX refused to restore rule: " + ruleId);
        }
      } else if (managed.createdByUs) {
        const okDelete = await this.bcx.deleteRule(ruleId, cleanupContext.context);
        if (okDelete === true) {
          changedMessages.push("Removed " + ruleId);
          delete state.managed[ruleId];
        } else {
          conflictMessages.push("BCX refused to delete rule: " + ruleId);
        }
      } else {
        delete state.managed[ruleId];
      }
    }

    state.activePayloadIds = desiredInfo.payloadIds;
    saveState(this.root, state);

    if (conflictMessages.length) {
      this.reporter.reportOnce("conflicts", conflictMessages, "conflict");
    }
    if (invalidMessages.length) {
      this.reporter.reportOnce("invalid-payloads", invalidMessages, "invalid-payload");
    }
    if (!conflictMessages.length && !invalidMessages.length && changedMessages.length) {
      if (this.settingsStore.get().debugLogging) {
        console.info("[BCXIR]", reason || "sync", changedMessages.join(", "));
      }
    } else if (changedMessages.length) {
      console.info("[BCXIR]", reason || "sync", changedMessages.join(", "));
    }

    this.lastConflictCount = conflictMessages.length;
    this.lastInvalidCount = invalidMessages.length;
    this.lastSyncResult = "ok";
    this.lastSyncTime = now();
    this.lastSyncReason = reason || null;

    return true;
  }

  async syncNow(reason?: string): Promise<boolean> {
    if (this.syncInFlight) {
      this.pendingSyncReason = reason || this.pendingSyncReason || "queued";
      this.lastSyncResult = "busy";
      return false;
    }
    this.syncInFlight = true;
    try {
      const player = this.root.Player;
      if (!player || !Array.isArray(player.Appearance)) return false;
      const settings = this.settingsStore.get();
      const desiredInfo = settings.enabled
        ? collectDesiredRulesFromAppearance(player.Appearance, {
          scanItemCategoryOnly: settings.scanItemCategoryOnly,
          getLocalPayloadsForItem: (item) => {
            const crafter = Number(item?.Craft?.MemberNumber);
            const itemName = getItemRuleName(item);
            if (!itemName) return [];
            if (Number.isFinite(crafter) && crafter > 0 && crafter === Number(player.MemberNumber)) {
              const entry = findMatchingRegistryEntry(this.root, item);
              return entry ? [{
                payload: entry.payload,
                originatorMemberNumber: Number(player.MemberNumber),
                originatorSource: "registry" as const,
                allowMinimalCreator: false,
                itemName,
              }] : [];
            }
            if (Number.isFinite(crafter) && crafter > 0) {
              if (settings.allowForeignItemRules === false) return [];
              if (settings.autoRequestForeignRules !== false) {
                this.itemRuleTransport?.requestItemRules(item);
              }
              const cached = getCachedItemRules(this.root, crafter, itemName);
              return cached ? [{
                payload: cached.payload,
                originatorMemberNumber: crafter,
                originatorSource: "cache" as const,
                allowMinimalCreator: settings.allowCachedOfflineCreator,
                itemName,
              }] : [];
            }
            return [];
          },
        })
        : { desired: new Map(), payloadIds: [], errors: [], conflicts: [] };
      if (!settings.enabled && settings.debugLogging) {
        console.info("[BCXIR] Runtime disabled; releasing managed rules.");
      }
      return await this.applyDesiredRules(desiredInfo, reason || "manual");
    } catch (error) {
      console.error("[BCXIR] Sync failed.", error);
      this.reporter.reportOnce("sync", [
        "BCXIR sync failed: " + String(error instanceof Error ? error.message : error),
      ], "error");
      this.lastSyncReason = reason || "manual";
      this.lastSyncTime = now();
      this.lastSyncResult = "failed";
      return false;
    } finally {
      this.syncInFlight = false;
      if (this.pendingSyncReason) {
        const nextReason = this.pendingSyncReason;
        this.pendingSyncReason = "";
        this.scheduleSync(nextReason);
      }
    }
  }

  scheduleSync(reason?: string): void {
    if (this.syncTimer) this.root.clearTimeout(this.syncTimer);
    this.syncTimer = this.root.setTimeout(() => {
      this.syncTimer = 0;
      void this.syncNow(reason || "scheduled");
    }, SYNC_DEBOUNCE_MS);
  }

  startFallbackTimer(): void {
    if (this.fallbackTimer || !this.settingsStore.get().fallbackSyncEnabled) return;
    this.fallbackTimer = this.root.setInterval(() => {
      if (this.settingsStore.get().fallbackSyncEnabled) this.scheduleSync("fallback");
    }, FALLBACK_SYNC_MS);
  }

  async releaseManagedRules(reason = "manual-release"): Promise<boolean> {
    return this.applyDesiredRules({ desired: new Map(), payloadIds: [], errors: [], conflicts: [] }, reason);
  }

  getDiagnostics(): Record<string, unknown> {
    const state = loadState(this.root);
    return {
      lastSyncReason: this.lastSyncReason,
      lastSyncTime: this.lastSyncTime,
      lastSyncResult: this.lastSyncResult,
      lastConflictCount: this.lastConflictCount,
      lastInvalidCount: this.lastInvalidCount,
      activePayloadCount: state.activePayloadIds.length,
      managedRuleCount: Object.keys(state.managed).length,
      syncInFlight: this.syncInFlight,
      pendingSyncReason: this.pendingSyncReason,
    };
  }

  private getDesiredRuleContext(
    desired: DesiredRule,
    settings: BCXIRSettings,
  ): { context: RuleQueryContext; senderMemberNumber: number | null; allowMinimalCreator: boolean } | null {
    const playerNumber = this.getPlayerMemberNumber();
    if (settings.rulePermissionMode === "useMe" && settings.dangerModeEnabled === true && settings.unlockUseMeMode === true) {
      return { context: { kind: "useMe" }, senderMemberNumber: playerNumber, allowMinimalCreator: false };
    }
    if (settings.rulePermissionMode === "self") {
      return { context: { kind: "self" }, senderMemberNumber: playerNumber, allowMinimalCreator: false };
    }

    const source = this.pickDesiredSource(desired.sources, playerNumber);
    if (!source) return null;
    if (source.originatorSource === "registry" || source.originatorMemberNumber === playerNumber) {
      return { context: { kind: "self" }, senderMemberNumber: playerNumber, allowMinimalCreator: false };
    }
    if (source.originatorSource !== "cache" || source.originatorMemberNumber == null) return null;
    return {
      context: {
        kind: "creator",
        memberNumber: source.originatorMemberNumber,
        allowMinimalCreator: source.allowMinimalCreator,
      },
      senderMemberNumber: source.originatorMemberNumber,
      allowMinimalCreator: source.allowMinimalCreator,
    };
  }

  private pickDesiredSource(sources: DesiredRuleSource[], playerNumber: number | null): DesiredRuleSource | null {
    return sources.find((source) => source.originatorSource === "registry") ||
      sources.find((source) => source.originatorMemberNumber === playerNumber) ||
      sources.find((source) => source.originatorSource === "cache" && source.originatorMemberNumber != null) ||
      null;
  }

  private getManagedRuleContext(managed: ManagedRuleState): {
    context: RuleQueryContext;
    senderMemberNumber: number | null;
    allowMinimalCreator: boolean;
  } {
    const playerNumber = this.getPlayerMemberNumber();
    if (managed.appliedContextKind === "useMe") {
      return { context: { kind: "useMe" }, senderMemberNumber: playerNumber, allowMinimalCreator: false };
    }
    const sender = Number(managed.appliedSenderMemberNumber);
    if (!Number.isFinite(sender) || sender <= 0 || sender === playerNumber) {
      return { context: { kind: "self" }, senderMemberNumber: playerNumber, allowMinimalCreator: false };
    }
    const allowMinimalCreator = managed.appliedSenderWasMinimal === true || this.settingsStore.get().allowCachedOfflineCreator;
    return {
      context: { kind: "creator", memberNumber: sender, allowMinimalCreator },
      senderMemberNumber: sender,
      allowMinimalCreator,
    };
  }

  private getPlayerMemberNumber(): number | null {
    const memberNumber = Number(this.root.Player?.MemberNumber);
    return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
  }

  private errorMessage(error: unknown): string {
    return String(error instanceof Error ? error.message : error);
  }
}
