import { makeRuleUpdateData, normalizeConditionForUpdate } from "./conditions";
import { FALLBACK_SYNC_MS, MOD_ID, SYNC_DEBOUNCE_MS } from "../shared/constants";
import { BCXAdapter } from "../platform/bcx-adapter";
import type { HostWindow } from "../platform/root";
import { collectDesiredRulesFromAppearance } from "./scanner";
import { loadState, saveState } from "../shared/storage";
import type { DesiredRulesResult } from "../shared/types";
import { deepClone, now, sameStable } from "../shared/utils";
import { Reporter } from "../platform/reporter";
import type { SettingsStore } from "../settings/settings-storage";

export class RuleSynchronizer {
  private syncTimer = 0;
  private fallbackTimer = 0;
  private syncInFlight = false;
  private pendingSyncReason = "";

  constructor(
    private readonly root: HostWindow,
    private readonly bcx: BCXAdapter,
    private readonly reporter: Reporter,
    private readonly settingsStore: SettingsStore,
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

    let conditionsData: any;
    try {
      conditionsData = await this.bcx.fetchRuleConditions();
    } catch (error) {
      this.reporter.reportOnce("conditions", [
        "Failed to read BCX rules: " + String(error instanceof Error ? error.message : error),
      ], "error");
      return false;
    }

    for (const [ruleId, desired] of desiredInfo.desired.entries()) {
      if (!this.bcx.isKnownRule(ruleId)) {
        conflictMessages.push("Unknown BCX rule skipped: " + ruleId);
        continue;
      }

      const current = this.bcx.getRulePublicData(conditionsData, ruleId);
      const managed = state.managed[ruleId];
      const comparableCurrent = normalizeConditionForUpdate(current);

      if (managed?.lastApplied && comparableCurrent && !sameStable(comparableCurrent, managed.lastApplied)) {
        delete state.managed[ruleId];
        conflictMessages.push("Rule changed outside BCXIR; released: " + ruleId);
        continue;
      }

      if (!managed && current) {
        conflictMessages.push("Existing BCX rule not overwritten: " + ruleId);
        continue;
      }

      if (!managed) {
        const okCreate = await this.bcx.ensureRuleExists(ruleId, conditionsData);
        if (!okCreate) {
          conflictMessages.push("BCX refused to create rule: " + ruleId);
          continue;
        }
        conditionsData = await this.bcx.fetchRuleConditions();
        state.managed[ruleId] = {
          previousCondition: null,
          createdByUs: !current,
          payloadIds: [],
          updatedAt: now(),
        };
      }

      const currentForUpdate = this.bcx.getRulePublicData(conditionsData, ruleId);
      const updateData = makeRuleUpdateData(desired.conditionData, currentForUpdate);
      const okUpdate = await this.bcx.updateRule(ruleId, updateData);
      if (okUpdate !== true) {
        conflictMessages.push("BCX refused to update rule: " + ruleId);
        continue;
      }

      state.managed[ruleId].lastApplied = deepClone(updateData);
      state.managed[ruleId].payloadIds = Array.from(new Set(desired.payloadIds));
      state.managed[ruleId].updatedAt = now();
      changedMessages.push("Applied " + ruleId);
    }

    conditionsData = await this.bcx.fetchRuleConditions().catch(() => conditionsData);

    for (const ruleId of Object.keys(state.managed)) {
      if (desiredInfo.desired.has(ruleId)) continue;
      const managed = state.managed[ruleId];
      const current = this.bcx.getRulePublicData(conditionsData, ruleId);
      const comparableCurrent = normalizeConditionForUpdate(current);

      if (managed.lastApplied && comparableCurrent && !sameStable(comparableCurrent, managed.lastApplied)) {
        delete state.managed[ruleId];
        conflictMessages.push("Removed item no longer controls externally changed rule: " + ruleId);
        continue;
      }

      if (managed.previousCondition) {
        const okRestore = await this.bcx.updateRule(ruleId, managed.previousCondition);
        if (okRestore === true) {
          changedMessages.push("Restored " + ruleId);
          delete state.managed[ruleId];
        } else {
          conflictMessages.push("BCX refused to restore rule: " + ruleId);
        }
      } else if (managed.createdByUs) {
        const okDelete = await this.bcx.deleteRule(ruleId);
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

    return true;
  }

  async syncNow(reason?: string): Promise<boolean> {
    if (this.syncInFlight) {
      this.pendingSyncReason = reason || this.pendingSyncReason || "queued";
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
}
