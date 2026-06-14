import type { EncodedPayload, EncodedRule, RuleConditionData } from "../shared/types";
import { deepClone, isPlainObject } from "../shared/utils";

export interface ExportRuleEntry {
  ruleId: string;
  condition: RuleConditionData;
}

export function conditionToEncodedRule(ruleId: string, condition: RuleConditionData): EncodedRule | null {
  if (!condition || condition.active !== true) return null;
  const rule: EncodedRule = { k: ruleId };
  if (condition.data?.enforce === false) rule.e = 0;
  if (condition.data?.log === false) rule.l = 0;
  if (condition.data?.customData !== undefined) {
    if (!isPlainObject(condition.data.customData)) return null;
    rule.d = deepClone(condition.data.customData);
  }
  if (condition.requirements != null) rule.q = deepClone(condition.requirements);
  if (condition.timer != null) rule.t = Number(condition.timer);
  if (condition.timerRemove === true) rule.tr = 1;
  return rule;
}

export function buildAuthoringPayload(
  id: string,
  entries: ExportRuleEntry[],
): EncodedPayload {
  const rules = entries
    .map(({ ruleId, condition }) => conditionToEncodedRule(ruleId, condition))
    .filter((rule): rule is EncodedRule => rule !== null);
  return {
    v: 1,
    id,
    r: rules,
  };
}
