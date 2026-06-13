import { makeConditionData } from "./conditions";
import { readPayloadsFromItem } from "./protocol";
import type { DesiredRule, DesiredRulesResult } from "../shared/types";
import { sameStable } from "../shared/utils";

export interface ScanOptions {
  scanItemCategoryOnly?: boolean;
}

export function isWearerItem(item: any, options: ScanOptions = {}): boolean {
  const scanItemCategoryOnly = options.scanItemCategoryOnly !== false;
  return !!(
    item &&
    item.Asset &&
    item.Asset.Group &&
    (!scanItemCategoryOnly || item.Asset.Group.Category === "Item") &&
    item.Craft &&
    typeof item.Craft.Description === "string"
  );
}

export function collectDesiredRulesFromAppearance(
  appearance: any[],
  options: ScanOptions = {},
): DesiredRulesResult {
  const desired = new Map<string, DesiredRule>();
  const payloadIds = new Set<string>();
  const errors: string[] = [];
  const conflicts: string[] = [];

  for (const item of Array.isArray(appearance) ? appearance : []) {
    if (!isWearerItem(item, options)) continue;
    const parsed = readPayloadsFromItem(item);
    errors.push(...parsed.errors);
    for (const payload of parsed.payloads) {
      payloadIds.add(payload.id);
      for (const rule of payload.r) {
        const conditionData = makeConditionData(rule);
        const candidate: DesiredRule = {
          ruleId: rule.k,
          conditionData,
          priority: rule.p || 0,
          payloadIds: [payload.id],
        };
        const existing = desired.get(rule.k);
        if (!existing) {
          desired.set(rule.k, candidate);
          continue;
        }
        if (sameStable(existing.conditionData, conditionData)) {
          existing.payloadIds.push(payload.id);
          existing.priority = Math.max(existing.priority, candidate.priority);
          continue;
        }
        if (candidate.priority > existing.priority) {
          desired.set(rule.k, candidate);
          continue;
        }
        if (candidate.priority === existing.priority) {
          existing.conflict = true;
          existing.payloadIds.push(payload.id);
          conflicts.push("Rule " + rule.k + " has equal-priority item configs");
        }
      }
    }
  }

  for (const [ruleId, entry] of Array.from(desired.entries())) {
    if (entry.conflict) desired.delete(ruleId);
  }

  return {
    desired,
    payloadIds: Array.from(payloadIds),
    errors,
    conflicts,
  };
}
