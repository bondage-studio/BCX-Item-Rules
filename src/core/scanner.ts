import { makeConditionData } from "./conditions";
import type {
  DesiredRule,
  DesiredRuleSource,
  DesiredRulesResult,
  NormalizedPayload,
  PayloadWithOrigin,
} from "../shared/types";
import { sameStable } from "../shared/utils";

export interface ScanOptions {
  scanItemCategoryOnly?: boolean;
  getLocalPayloadsForItem?: (item: any) => Array<NormalizedPayload | PayloadWithOrigin>;
  requestPayloadForItem?: (item: any) => void;
}

export function isWearerItem(item: any, options: ScanOptions = {}): boolean {
  const scanItemCategoryOnly = options.scanItemCategoryOnly !== false;
  return !!(
    item &&
    item.Asset &&
    item.Asset.Group &&
    (!scanItemCategoryOnly || item.Asset.Group.Category === "Item")
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
    const localPayloads = options.getLocalPayloadsForItem?.(item) || [];
    if (!localPayloads.length) options.requestPayloadForItem?.(item);
    for (const payloadInfo of localPayloads) {
      const { payload, source } = normalizePayloadSource(payloadInfo);
      payloadIds.add(payload.id);
      for (const rule of payload.r) {
        const conditionData = makeConditionData(rule);
        const candidate: DesiredRule = {
          ruleId: rule.k,
          conditionData,
          priority: rule.p || 0,
          payloadIds: [payload.id],
          sources: [source],
        };
        const existing = desired.get(rule.k);
        if (!existing) {
          desired.set(rule.k, candidate);
          continue;
        }
        if (sameStable(existing.conditionData, conditionData)) {
          existing.payloadIds.push(payload.id);
          existing.sources.push(source);
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
          existing.sources.push(source);
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

function normalizePayloadSource(value: NormalizedPayload | PayloadWithOrigin): {
  payload: NormalizedPayload;
  source: DesiredRuleSource;
} {
  const payloadInfo = isPayloadWithOrigin(value) ? value : { payload: value };
  const payload = payloadInfo.payload;
  return {
    payload,
    source: {
      payloadId: payload.id,
      originatorMemberNumber: normalizeMemberNumber(payloadInfo.originatorMemberNumber),
      originatorSource: payloadInfo.originatorSource || "unknown",
      allowMinimalCreator: payloadInfo.allowMinimalCreator === true,
      itemName: payloadInfo.itemName,
    },
  };
}

function isPayloadWithOrigin(value: NormalizedPayload | PayloadWithOrigin): value is PayloadWithOrigin {
  return !!value && typeof value === "object" && "payload" in value;
}

function normalizeMemberNumber(value: unknown): number | null {
  const memberNumber = Number(value);
  return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
}
