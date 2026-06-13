import { MOD_ID, QUERY_TIMEOUT_MS } from "../shared/constants";
import type { HostWindow } from "./root";

export class BCXAdapter {
  private bcxApi: any = null;

  constructor(private readonly root: HostWindow) {}

  canUseBCX(): boolean {
    return !!(this.root.bcx && typeof this.root.bcx.getModApi === "function");
  }

  getApi(): any | null {
    if (!this.canUseBCX()) return null;
    try {
      this.bcxApi = this.bcxApi || this.root.bcx.getModApi(MOD_ID);
      return this.bcxApi;
    } catch (error) {
      console.warn("[BCXIR] Failed to get BCX Mod API.", error);
      return null;
    }
  }

  async query(type: string, data: unknown): Promise<any> {
    const api = this.getApi();
    if (!api || typeof api.sendQuery !== "function") {
      throw new Error("BCX API is unavailable");
    }
    return api.sendQuery(type, data, "Player", QUERY_TIMEOUT_MS);
  }

  isKnownRule(ruleId: string): boolean {
    const api = this.getApi();
    if (!api || typeof api.getRuleState !== "function") return true;
    try {
      return !!api.getRuleState(ruleId);
    } catch {
      return false;
    }
  }

  async fetchRuleConditions(): Promise<any> {
    return this.query("conditionsGet", "rules");
  }

  async setRuleLimit(ruleId: string, limit: number): Promise<boolean> {
    return this.query("conditionSetLimit", {
      category: "rules",
      condition: ruleId,
      limit,
    });
  }

  getRulePublicData(conditionsData: any, ruleId: string): any | null {
    return conditionsData &&
      conditionsData.conditions &&
      Object.prototype.hasOwnProperty.call(conditionsData.conditions, ruleId)
      ? conditionsData.conditions[ruleId]
      : null;
  }

  async ensureRuleExists(ruleId: string, conditionsData: any): Promise<boolean> {
    if (this.getRulePublicData(conditionsData, ruleId)) return true;
    const created = await this.query("ruleCreate", ruleId);
    return created === true;
  }

  async updateRule(ruleId: string, data: unknown): Promise<boolean> {
    return this.query("conditionUpdate", {
      category: "rules",
      condition: ruleId,
      data,
    });
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    return this.query("ruleDelete", ruleId);
  }
}
