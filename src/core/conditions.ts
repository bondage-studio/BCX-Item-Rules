import type { NormalizedRule, RuleConditionData } from "../shared/types";
import { deepClone } from "../shared/utils";

export function makeConditionData(ruleRequest: NormalizedRule): RuleConditionData {
  const data: RuleConditionData["data"] = {
    enforce: ruleRequest.e !== 0,
    log: ruleRequest.l !== 0,
  };
  if (ruleRequest.d !== undefined) data.customData = deepClone(ruleRequest.d);
  return {
    active: true,
    favorite: false,
    timer: ruleRequest.t == null ? null : Number(ruleRequest.t),
    timerRemove: ruleRequest.tr === 1,
    requirements: ruleRequest.q == null ? null : deepClone(ruleRequest.q),
    data,
  };
}

export function normalizeConditionForUpdate(condition: any): RuleConditionData | null {
  if (!condition || typeof condition !== "object") return null;
  const data = condition.data && typeof condition.data === "object" ? condition.data : {};
  const out: RuleConditionData = {
    active: condition.active === true,
    favorite: condition.favorite === true,
    timer: condition.timer == null ? null : Number(condition.timer),
    timerRemove: condition.timerRemove === true,
    requirements: condition.requirements == null ? null : deepClone(condition.requirements),
    data: {
      enforce: data.enforce !== false,
      log: data.log !== false,
    },
  };
  if (data.customData !== undefined) {
    out.data.customData = deepClone(data.customData);
  }
  return out;
}

export function makeRuleUpdateData(
  desiredCondition: RuleConditionData,
  currentCondition: any,
): RuleConditionData {
  const out = normalizeConditionForUpdate(desiredCondition);
  const current = normalizeConditionForUpdate(currentCondition);
  if (!out) throw new Error("desired rule condition is invalid");
  if (current && out.data.customData === undefined && current.data.customData !== undefined) {
    out.data.customData = deepClone(current.data.customData);
  }
  return out;
}
