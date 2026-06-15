import { makeRuleUpdateData, normalizeConditionForUpdate } from "./conditions";
import { FALLBACK_SYNC_MS, MOD_ID, SYNC_DEBOUNCE_MS } from "../shared/constants";
import { BCXAdapter, type RuleQueryContext } from "../platform/bcx-adapter";
import type { HostWindow } from "../platform/root";
import { collectDesiredRulesFromAppearance } from "./scanner";
import { loadState, saveState } from "../shared/storage";
import type { BCXIRSettings, DesiredRule, DesiredRuleSource, DesiredRulesResult, LocalState, ManagedRuleState, TargetManagedRuleState } from "../shared/types";
import { deepClone, now, sameStable, stableStringify } from "../shared/utils";
import { Reporter } from "../platform/reporter";
import type { SettingsStore } from "../settings/settings-storage";
import type { ItemRuleTransport } from "../platform/item-rule-transport";
import {
  findMatchingRegistryEntry,
  getCachedItemRules,
  getItemRuleName,
  makeRuleCacheKey,
  normalizeItemName,
} from "./item-registry";
import { canRefreshRemoteItemRules } from "./worn-item-lock";

interface ResolvedRuleContext {
  context: RuleQueryContext;
  senderMemberNumber: number | null;
  allowMinimalCreator: boolean;
}

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

    const applyGroups = new Map<string, {
      applyContext: ResolvedRuleContext;
      rules: Array<{ ruleId: string; desired: DesiredRule }>;
    }>();

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
      const contextKey = this.makeRuleContextKey(applyContext.context);
      let group = applyGroups.get(contextKey);
      if (!group) {
        group = { applyContext, rules: [] };
        applyGroups.set(contextKey, group);
      }
      group.rules.push({ ruleId, desired });
    }

    for (const group of applyGroups.values()) {
      const applyContext = group.applyContext;
      let conditionsData: any;
      try {
        conditionsData = await this.bcx.fetchRuleConditions(applyContext.context);
        latestConditionsData = conditionsData;
      } catch (error) {
        for (const { ruleId } of group.rules) {
          conflictMessages.push("Failed to read BCX rules as sender for " + ruleId + ": " + this.errorMessage(error));
        }
        continue;
      }

      const updateCandidates: Array<{
        ruleId: string;
        desired: DesiredRule;
        wasManaged: boolean;
      }> = [];
      let createdAny = false;

      for (const { ruleId, desired } of group.rules) {
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
            appliedContextKind: this.managedContextKind(applyContext.context),
            suspendedExistingInactive: true,
          };
        }

        if (!state.managed[ruleId]) {
          const okCreate = await this.bcx.ensureRuleExists(ruleId, conditionsData, applyContext.context);
          if (!okCreate) {
            conflictMessages.push("BCX refused to create rule: " + ruleId);
            continue;
          }
          createdAny = true;
          state.managed[ruleId] = {
            previousCondition: null,
            createdByUs: !current,
            payloadIds: [],
            updatedAt: now(),
            appliedSenderMemberNumber: applyContext.senderMemberNumber,
            appliedSenderWasMinimal: applyContext.allowMinimalCreator,
            appliedContextKind: this.managedContextKind(applyContext.context),
          };
        }

        updateCandidates.push({ ruleId, desired, wasManaged });
      }

      if (createdAny) {
        try {
          conditionsData = await this.bcx.fetchRuleConditions(applyContext.context);
          latestConditionsData = conditionsData;
        } catch (error) {
          for (const { ruleId } of updateCandidates) {
            conflictMessages.push("Failed to reload BCX rules after create for " + ruleId + ": " + this.errorMessage(error));
          }
          continue;
        }
      }

      for (const { ruleId, desired, wasManaged } of updateCandidates) {
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
        state.managed[ruleId].appliedContextKind = this.managedContextKind(applyContext.context);
        changedMessages.push("Applied " + ruleId);
      }
    }

    const cleanupGroups = new Map<string, {
      cleanupContext: ResolvedRuleContext;
      rules: Array<{ ruleId: string; managed: ManagedRuleState }>;
    }>();
    for (const ruleId of Object.keys(state.managed)) {
      if (desiredInfo.desired.has(ruleId)) continue;
      const managed = state.managed[ruleId];
      const cleanupContext = this.getManagedRuleContext(managed);
      const contextKey = this.makeRuleContextKey(cleanupContext.context);
      let group = cleanupGroups.get(contextKey);
      if (!group) {
        group = { cleanupContext, rules: [] };
        cleanupGroups.set(contextKey, group);
      }
      group.rules.push({ ruleId, managed });
    }

    if (Array.from(cleanupGroups.values()).some((group) => group.cleanupContext.context.kind === "self")) {
      latestConditionsData = await this.bcx.fetchRuleConditions().catch(() => latestConditionsData);
    }

    for (const group of cleanupGroups.values()) {
      const cleanupContext = group.cleanupContext;
      let conditionsData = latestConditionsData;
      if (cleanupContext.context.kind !== "self") {
        conditionsData = await this.bcx.fetchRuleConditions(cleanupContext.context).catch(() => latestConditionsData);
      }

      for (const { ruleId, managed } of group.rules) {
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
      const state = loadState(this.root);
      const currentItemKeys = new Set<string>();
      const desiredInfo = settings.enabled
        ? collectDesiredRulesFromAppearance(player.Appearance, {
          scanItemCategoryOnly: settings.scanItemCategoryOnly,
          getLocalPayloadsForItem: (item) => {
            const crafter = Number(item?.Craft?.MemberNumber);
            const itemName = getItemRuleName(item);
            if (!itemName) return [];
            const playerNumber = Number(player.MemberNumber);
            const isLocalItem = Number.isFinite(crafter) && crafter > 0 && crafter === playerNumber;
            const itemKey = this.makeActiveItemPayloadKey(isLocalItem ? playerNumber : crafter, itemName);
            if (itemKey) currentItemKeys.add(itemKey);

            const activePayload = itemKey ? state.activeItemPayloads[itemKey] : null;
            if (activePayload) {
              if (activePayload.originatorSource === "cache" && settings.allowForeignItemRules === false) {
                if (itemKey) delete state.activeItemPayloads[itemKey];
                return [];
              }
              return [{
                payload: activePayload.payload,
                originatorMemberNumber: activePayload.originatorMemberNumber,
                originatorSource: activePayload.originatorSource,
                allowMinimalCreator: activePayload.allowMinimalCreator,
                itemName: activePayload.itemName,
              }];
            }

            if (isLocalItem) {
              const entry = findMatchingRegistryEntry(this.root, item);
              if (!entry) return [];
              if (itemKey) {
                state.activeItemPayloads[itemKey] = {
                  payload: deepClone(entry.payload),
                  originatorMemberNumber: Number(player.MemberNumber),
                  originatorSource: "registry",
                  allowMinimalCreator: false,
                  itemName,
                  updatedAt: now(),
                };
              }
              return [{
                payload: entry.payload,
                originatorMemberNumber: Number(player.MemberNumber),
                originatorSource: "registry" as const,
                allowMinimalCreator: false,
                itemName,
              }];
            }
            if (Number.isFinite(crafter) && crafter > 0) {
              if (settings.allowForeignItemRules === false) return [];
              if (
                settings.autoRequestForeignRules !== false &&
                itemKey &&
                !state.activeItemPayloads[itemKey] &&
                canRefreshRemoteItemRules(this.root, settings, crafter, itemName)
              ) {
                this.itemRuleTransport?.requestItemRules(item);
              }
              const cached = getCachedItemRules(this.root, crafter, itemName);
              if (!cached) return [];
              if (itemKey) {
                state.activeItemPayloads[itemKey] = {
                  payload: deepClone(cached.payload),
                  originatorMemberNumber: crafter,
                  originatorSource: "cache",
                  allowMinimalCreator: settings.allowCachedOfflineCreator,
                  itemName,
                  updatedAt: now(),
                };
              }
              return [{
                payload: cached.payload,
                originatorMemberNumber: crafter,
                originatorSource: "cache" as const,
                allowMinimalCreator: settings.allowCachedOfflineCreator,
                itemName,
              }];
            }
            return [];
          },
        })
        : { desired: new Map(), payloadIds: [], errors: [], conflicts: [] };
      this.pruneActiveItemPayloads(state, currentItemKeys, settings);
      saveState(this.root, state);
      if (!settings.enabled && settings.debugLogging) {
        console.info("[BCXIR] Runtime disabled; releasing managed rules.");
      }
      const applied = await this.applyDesiredRules(desiredInfo, reason || "manual");
      if (settings.enabled && (settings.applyMyRulesToNonPluginUsers || settings.removeMyRulesFromNonPluginUsers)) {
        await this.syncNonPluginTargets(settings, reason || "manual");
      }
      return applied;
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

  private async syncNonPluginTargets(settings: BCXIRSettings, reason: string): Promise<void> {
    if (!this.itemRuleTransport) return;
    const playerNumber = this.getPlayerMemberNumber();
    if (playerNumber == null) return;
    const targets = this.getRoomTargets(playerNumber);
    const state = loadState(this.root);
    const seenTargets = new Set<string>();
    let stateChanged = false;

    for (const target of targets) {
      const memberNumber = this.getCharacterMemberNumber(target);
      if (memberNumber == null || !this.targetHasBCX(memberNumber)) continue;
      if (await this.itemRuleTransport.hasBCXIRPeer(memberNumber)) continue;
      const desiredInfo = this.collectTargetDesiredRules(target, playerNumber, settings);
      const targetKey = String(memberNumber);
      const desiredHash = this.makeTargetDesiredHash(desiredInfo, settings);
      const itemKeys = this.getDesiredItemKeys(desiredInfo);
      const managedRules = this.getTargetManagedRules(state, memberNumber);
      const hasStaleManagedRules = managedRules.some((managed) => !desiredInfo.desired.has(managed.ruleId));
      seenTargets.add(targetKey);

      if (state.targetAppearances[targetKey]?.desiredHash === desiredHash && !hasStaleManagedRules) {
        continue;
      }

      const processed = await this.syncTargetRules(memberNumber, desiredInfo, settings, state);
      if (processed) {
        state.targetAppearances[targetKey] = {
          memberNumber,
          desiredHash,
          itemKeys,
          updatedAt: now(),
        };
        stateChanged = true;
      }
    }
    if (this.pruneTargetAppearanceState(state, seenTargets)) stateChanged = true;
    if (stateChanged) saveState(this.root, state);
    if (settings.debugLogging) console.info("[BCXIR]", reason, "non-plugin target sync complete");
  }

  private getRoomTargets(playerNumber: number): any[] {
    const characters = Array.isArray(this.root.ChatRoomCharacter) ? this.root.ChatRoomCharacter : [];
    return characters.filter((character: any) => {
      const memberNumber = this.getCharacterMemberNumber(character);
      if (memberNumber == null || memberNumber === playerNumber) return false;
      if (character === this.root.Player) return false;
      if (typeof character.IsPlayer === "function" && character.IsPlayer()) return false;
      return Array.isArray(character.Appearance);
    });
  }

  private targetHasBCX(memberNumber: number): boolean {
    const getVersion = this.root.bcx?.getCharacterVersion;
    if (typeof getVersion !== "function") return false;
    try {
      return !!getVersion.call(this.root.bcx, memberNumber);
    } catch {
      return false;
    }
  }

  private collectTargetDesiredRules(target: any, playerNumber: number, settings: BCXIRSettings): DesiredRulesResult {
    return collectDesiredRulesFromAppearance(Array.isArray(target.Appearance) ? target.Appearance : [], {
      scanItemCategoryOnly: settings.scanItemCategoryOnly,
      getLocalPayloadsForItem: (item) => {
        if (Number(item?.Craft?.MemberNumber) !== playerNumber) return [];
        const itemName = getItemRuleName(item);
        if (!itemName) return [];
        const entry = findMatchingRegistryEntry(this.root, item, playerNumber);
        if (!entry || entry.selfOnly) return [];
        return [{
          payload: entry.payload,
          originatorMemberNumber: playerNumber,
          originatorSource: "registry" as const,
          allowMinimalCreator: false,
          itemName,
        }];
      },
    });
  }

  private async syncTargetRules(
    memberNumber: number,
    desiredInfo: DesiredRulesResult,
    settings: BCXIRSettings,
    state: LocalState,
  ): Promise<boolean> {
    const context: RuleQueryContext = { kind: "target", memberNumber };
    const managedRules = this.getTargetManagedRules(state, memberNumber);
    const cleanupRules = settings.removeMyRulesFromNonPluginUsers
      ? managedRules.filter((managed) => !desiredInfo.desired.has(managed.ruleId))
      : [];
    const needsApply = settings.applyMyRulesToNonPluginUsers && desiredInfo.desired.size > 0;
    if (!needsApply && !cleanupRules.length) return true;

    let conditionsData: any;
    try {
      conditionsData = await this.bcx.fetchRuleConditions(context);
    } catch (error) {
      this.debugTarget("Failed to read target rules.", memberNumber, error);
      return false;
    }

    if (needsApply) {
      await this.applyDesiredRulesToTarget(memberNumber, desiredInfo, conditionsData, context, state);
    }

    if (cleanupRules.length) {
      await this.cleanupManagedRulesFromTarget(memberNumber, cleanupRules, desiredInfo, conditionsData, context, state);
    }

    return true;
  }

  private async applyDesiredRulesToTarget(
    memberNumber: number,
    desiredInfo: DesiredRulesResult,
    conditionsData: any,
    context: RuleQueryContext,
    state: LocalState,
  ): Promise<void> {
    for (const [ruleId, desired] of desiredInfo.desired.entries()) {
      if (!this.bcx.isKnownRule(ruleId)) continue;
      const managedKey = this.makeTargetManagedRuleKey(memberNumber, ruleId);
      const managed = state.targetManaged[managedKey];
      const current = this.bcx.getRulePublicData(conditionsData, ruleId);
      const comparableCurrent = normalizeConditionForUpdate(current);
      let createdByThisSync = false;

      if (current) {
        if (!managed) {
          this.debugTarget("Target rule exists; not overwriting.", memberNumber, ruleId);
          continue;
        }
        if (!comparableCurrent || !sameStable(comparableCurrent, managed.lastApplied)) {
          delete state.targetManaged[managedKey];
          this.debugTarget("Target managed rule changed externally; released.", memberNumber, ruleId);
          continue;
        }
      } else {
        const created = await this.bcx.ensureRuleExists(ruleId, conditionsData, context).catch((error) => {
          this.debugTarget("Target rule create failed.", memberNumber, error);
          return false;
        });
        if (created !== true) continue;
        createdByThisSync = true;
      }

      const updateData = makeRuleUpdateData(desired.conditionData, current);
      const updated = await this.bcx.updateRule(ruleId, updateData, context).catch((error) => {
        this.debugTarget("Target rule update failed.", memberNumber, error);
        return false;
      });
      if (updated !== true) {
        if (createdByThisSync) await this.bcx.deleteRule(ruleId, context).catch(() => false);
        continue;
      }

      state.targetManaged[managedKey] = {
        targetMemberNumber: memberNumber,
        ruleId,
        lastApplied: deepClone(updateData),
        payloadIds: Array.from(new Set(desired.payloadIds)).sort(),
        itemKeys: this.getDesiredItemKeysForRule(desired),
        updatedAt: now(),
      };
      if (conditionsData?.conditions && typeof conditionsData.conditions === "object") {
        conditionsData.conditions[ruleId] = deepClone(updateData);
      }
    }
  }

  private async cleanupManagedRulesFromTarget(
    memberNumber: number,
    managedRules: TargetManagedRuleState[],
    desiredInfo: DesiredRulesResult,
    conditionsData: any,
    context: RuleQueryContext,
    state: LocalState,
  ): Promise<void> {
    for (const managed of managedRules) {
      if (desiredInfo.desired.has(managed.ruleId)) continue;
      const managedKey = this.makeTargetManagedRuleKey(memberNumber, managed.ruleId);
      const current = this.bcx.getRulePublicData(conditionsData, managed.ruleId);
      if (!current) {
        delete state.targetManaged[managedKey];
        continue;
      }
      const comparableCurrent = normalizeConditionForUpdate(current);
      if (!comparableCurrent || !sameStable(comparableCurrent, managed.lastApplied)) {
        delete state.targetManaged[managedKey];
        this.debugTarget("Target managed rule changed before cleanup; released.", memberNumber, managed.ruleId);
        continue;
      }
      const deleted = await this.bcx.deleteRule(managed.ruleId, context).catch((error) => {
        this.debugTarget("Target rule delete failed.", memberNumber, error);
        return false;
      });
      if (deleted === true) delete state.targetManaged[managedKey];
    }
  }

  private getTargetManagedRules(state: LocalState, memberNumber: number): TargetManagedRuleState[] {
    return Object.values(state.targetManaged).filter((managed) => managed.targetMemberNumber === memberNumber);
  }

  private makeTargetManagedRuleKey(memberNumber: number, ruleId: string): string {
    return String(memberNumber) + ":" + ruleId;
  }

  private makeTargetDesiredHash(desiredInfo: DesiredRulesResult, settings: BCXIRSettings): string {
    return stableStringify({
      apply: settings.applyMyRulesToNonPluginUsers === true,
      remove: settings.removeMyRulesFromNonPluginUsers === true,
      errors: desiredInfo.errors,
      conflicts: desiredInfo.conflicts,
      rules: Array.from(desiredInfo.desired.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ruleId, desired]) => ({
          ruleId,
          conditionData: desired.conditionData,
          payloadIds: Array.from(new Set(desired.payloadIds)).sort(),
          itemKeys: this.getDesiredItemKeysForRule(desired),
        })),
    });
  }

  private getDesiredItemKeys(desiredInfo: DesiredRulesResult): string[] {
    const keys = new Set<string>();
    for (const desired of desiredInfo.desired.values()) {
      for (const key of this.getDesiredItemKeysForRule(desired)) keys.add(key);
    }
    return Array.from(keys).sort();
  }

  private getDesiredItemKeysForRule(desired: DesiredRule): string[] {
    const keys = new Set<string>();
    for (const source of desired.sources) {
      if (source.originatorMemberNumber == null || !source.itemName) continue;
      keys.add(makeRuleCacheKey(source.originatorMemberNumber, source.itemName));
    }
    return Array.from(keys).sort();
  }

  private pruneTargetAppearanceState(state: LocalState, seenTargets: Set<string>): boolean {
    let changed = false;
    for (const key of Object.keys(state.targetAppearances)) {
      if (seenTargets.has(key)) continue;
      const memberNumber = Number(key);
      const hasManagedRules = Number.isFinite(memberNumber) &&
        this.getTargetManagedRules(state, memberNumber).length > 0;
      if (hasManagedRules) continue;
      delete state.targetAppearances[key];
      changed = true;
    }
    return changed;
  }

  private getCharacterMemberNumber(character: any): number | null {
    const memberNumber = Number(character?.MemberNumber);
    return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
  }

  private debugTarget(message: string, memberNumber: number, detail?: unknown): void {
    if (this.settingsStore.get().debugLogging !== true) return;
    if (detail !== undefined) console.info("[BCXIR]", message, { memberNumber, detail });
    else console.info("[BCXIR]", message, { memberNumber });
  }

  private getDesiredRuleContext(
    desired: DesiredRule,
    settings: BCXIRSettings,
  ): ResolvedRuleContext | null {
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

  private makeRuleContextKey(context: RuleQueryContext): string {
    if (context.kind === "creator") {
      return ["creator", String(context.memberNumber), context.allowMinimalCreator === true ? "minimal" : "room"].join(":");
    }
    if (context.kind === "target") return "target:" + context.memberNumber;
    return context.kind;
  }

  private managedContextKind(context: RuleQueryContext): ManagedRuleState["appliedContextKind"] {
    return context.kind === "target" ? "self" : context.kind;
  }

  private getPlayerMemberNumber(): number | null {
    const memberNumber = Number(this.root.Player?.MemberNumber);
    return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
  }

  private makeActiveItemPayloadKey(crafter: unknown, itemName: string): string | null {
    const memberNumber = Number(crafter);
    const normalizedItemName = normalizeItemName(itemName);
    if (!Number.isFinite(memberNumber) || memberNumber <= 0 || !normalizedItemName) return null;
    return makeRuleCacheKey(memberNumber, normalizedItemName);
  }

  private pruneActiveItemPayloads(
    state: ReturnType<typeof loadState>,
    currentItemKeys: Set<string>,
    settings: BCXIRSettings,
  ): void {
    for (const [itemKey, active] of Object.entries(state.activeItemPayloads)) {
      if (!currentItemKeys.has(itemKey)) {
        delete state.activeItemPayloads[itemKey];
        continue;
      }
      if (active.originatorSource === "cache" && settings.allowForeignItemRules === false) {
        delete state.activeItemPayloads[itemKey];
      }
    }
  }

  private errorMessage(error: unknown): string {
    return String(error instanceof Error ? error.message : error);
  }
}
