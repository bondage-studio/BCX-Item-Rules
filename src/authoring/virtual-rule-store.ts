import type { RuleConditionData } from "../shared/types";
import { deepClone, isPlainObject } from "../shared/utils";

const MODULE_LOG = 2;
const MODULE_CURSES = 3;
const MODULE_COMMANDS = 5;
const MODULE_RELATIONSHIPS = 6;
const ACCESS_SELF = 0;
const LIMIT_NORMAL = 0;

export class VirtualRuleStore {
  private readonly conditions: Record<string, RuleConditionData> = {};
  private readonly limits: Record<string, number> = {};

  constructor(sourceRulesCategory?: any) {
    const sourceLimits = sourceRulesCategory?.limits;
    if (sourceLimits && typeof sourceLimits === "object") {
      for (const key of Object.keys(sourceLimits)) {
        this.limits[key] = LIMIT_NORMAL;
      }
    }
  }

  exportRules(): Array<{ ruleId: string; condition: RuleConditionData }> {
    return Object.keys(this.conditions)
      .sort()
      .map((ruleId) => ({
        ruleId,
        condition: deepClone(this.conditions[ruleId]),
      }));
  }

  handleQuery(type: string, data: any): unknown {
    switch (type) {
      case "disabledModules":
        return [MODULE_LOG, MODULE_CURSES, MODULE_COMMANDS, MODULE_RELATIONSHIPS];
      case "conditionsGet":
        return this.getConditions(data);
      case "conditionSetLimit":
        return this.setLimit(data);
      case "conditionUpdate":
        return this.updateCondition(data);
      case "conditionUpdateMultiple":
        return this.updateMultiple(data);
      case "ruleCreate":
        return this.createRule(data);
      case "ruleDelete":
        return this.deleteRule(data);
      case "permissions":
        return {};
      case "permissionAccess":
        return true;
      case "myAccessLevel":
        return ACCESS_SELF;
      case "rolesData":
        return {
          mistresses: [],
          owners: [],
          allowAddMistress: true,
          allowRemoveMistress: true,
          allowAddOwner: true,
          allowRemoveOwner: true,
        };
      case "relatonshipsGet":
      case "relationshipsGet":
        return {
          relationships: [],
          access_view_all: true,
          access_modify_self: true,
          access_modify_others: true,
        };
      case "logData":
        return [];
      case "logConfigGet":
        return {};
      case "logGetAllowedActions":
        return {
          delete: true,
          configure: true,
          praise: true,
          leaveMessage: true,
        };
      case "logDelete":
      case "logConfigEdit":
      case "logClear":
      case "logPraise":
      case "editPermission":
      case "editRole":
      case "relationshipsRemove":
      case "relationshipsSet":
        return true;
      default:
        return undefined;
    }
  }

  private getConditions(category: unknown): any {
    if (category !== "rules") {
      return {
        access_normal: false,
        access_limited: false,
        access_configure: false,
        access_changeLimits: false,
        highestRoleInRoom: ACCESS_SELF,
        requirements: {},
        timer: null,
        timerRemove: false,
        data: category === "curses" ? null : undefined,
        conditions: {},
        limits: {},
      };
    }
    return {
      access_normal: true,
      access_limited: true,
      access_configure: true,
      access_changeLimits: true,
      highestRoleInRoom: ACCESS_SELF,
      requirements: {},
      timer: null,
      timerRemove: false,
      data: undefined,
      conditions: deepClone(this.conditions),
      limits: deepClone(this.limits),
    };
  }

  private createRule(ruleId: unknown): boolean {
    if (typeof ruleId !== "string" || !ruleId) return false;
    if (!this.conditions[ruleId]) {
      this.conditions[ruleId] = {
        active: true,
        favorite: false,
        timer: null,
        timerRemove: false,
        requirements: null,
        data: {
          enforce: true,
          log: true,
        },
      };
    }
    if (this.limits[ruleId] === undefined) this.limits[ruleId] = LIMIT_NORMAL;
    return true;
  }

  private deleteRule(ruleId: unknown): boolean {
    if (typeof ruleId !== "string" || !ruleId) return false;
    delete this.conditions[ruleId];
    return true;
  }

  private setLimit(data: any): boolean {
    if (!data || data.category !== "rules" || typeof data.condition !== "string") return false;
    const limit = Number(data.limit);
    if (!Number.isFinite(limit)) return false;
    this.limits[data.condition] = limit;
    return true;
  }

  private updateCondition(data: any): boolean {
    if (!data || data.category !== "rules" || typeof data.condition !== "string") return false;
    const normalized = this.normalizeCondition(data.data);
    if (!normalized) return false;
    this.conditions[data.condition] = normalized;
    if (this.limits[data.condition] === undefined) this.limits[data.condition] = LIMIT_NORMAL;
    return true;
  }

  private updateMultiple(data: any): boolean {
    if (!data || data.category !== "rules" || !Array.isArray(data.conditions)) return false;
    if (!isPlainObject(data.data)) return false;
    for (const condition of data.conditions) {
      if (typeof condition !== "string") return false;
    }
    for (const condition of data.conditions) {
      const current = this.conditions[condition] || {
        active: true,
        favorite: false,
        timer: null,
        timerRemove: false,
        requirements: null,
        data: {
          enforce: true,
          log: true,
        },
      };
      this.conditions[condition] = this.normalizeCondition({
        ...current,
        ...data.data,
        data: current.data,
      }) || current;
      if (this.limits[condition] === undefined) this.limits[condition] = LIMIT_NORMAL;
    }
    return true;
  }

  private normalizeCondition(value: any): RuleConditionData | null {
    if (!isPlainObject(value)) return null;
    const rawData = isPlainObject(value.data) ? value.data : {};
    const condition: RuleConditionData = {
      active: value.active === true,
      favorite: value.favorite === true,
      timer: value.timer == null ? null : Number(value.timer),
      timerRemove: value.timerRemove === true,
      requirements: value.requirements == null ? null : deepClone(value.requirements) as Record<string, unknown>,
      data: {
        enforce: rawData.enforce !== false,
        log: rawData.log !== false,
      },
    };
    if (rawData.customData !== undefined) {
      if (!isPlainObject(rawData.customData)) return null;
      condition.data.customData = deepClone(rawData.customData);
    }
    return condition;
  }
}
