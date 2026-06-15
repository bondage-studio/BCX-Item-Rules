import { MOD_ID, QUERY_TIMEOUT_MS } from "../shared/constants";
import type { HostWindow } from "./root";
import type { CreatorSenderContext, CreatorSenderQueryTransport } from "./creator-sender-query-transport";
import type { UseMeQueryTransport } from "./use-me-query-transport";
import type { BCXQueryQueue, BCXQueryQueueDiagnostics } from "./bcx-query-queue";

export type RuleQueryContext =
  | { kind: "self" }
  | ({ kind: "creator" } & CreatorSenderContext)
  | { kind: "useMe" };

export class BCXAdapter {
  private bcxApi: any = null;

  constructor(
    private readonly root: HostWindow,
    private readonly creatorSenderTransport?: CreatorSenderQueryTransport,
    private readonly useMeTransport?: UseMeQueryTransport,
    private readonly queryQueue?: BCXQueryQueue,
  ) {}

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

  async query(type: string, data: unknown, context: RuleQueryContext = { kind: "self" }): Promise<any> {
    const label = this.makeQueryLabel(type, context);
    const runQuery = (): Promise<any> => this.queryDirect(type, data, context);
    return this.queryQueue ? this.queryQueue.enqueue(label, runQuery) : runQuery();
  }

  getQueryQueueDiagnostics(): BCXQueryQueueDiagnostics | null {
    return this.queryQueue?.getDiagnostics() || null;
  }

  private async queryDirect(type: string, data: unknown, context: RuleQueryContext): Promise<any> {
    if (context.kind === "creator") {
      if (!this.creatorSenderTransport) throw new Error("Creator sender transport is unavailable");
      return this.creatorSenderTransport.queryAsSender(type, data, context, QUERY_TIMEOUT_MS);
    }
    if (context.kind === "useMe") {
      if (!this.useMeTransport) throw new Error("Please-use-me transport is unavailable");
      return this.useMeTransport.queryUseMe(type, data, QUERY_TIMEOUT_MS);
    }
    const api = this.getApi();
    if (!api || typeof api.sendQuery !== "function") {
      throw new Error("BCX API is unavailable");
    }
    return api.sendQuery(type, data, "Player", QUERY_TIMEOUT_MS);
  }

  private makeQueryLabel(type: string, context: RuleQueryContext): string {
    if (context.kind === "creator") return "creator:" + context.memberNumber + ":" + type;
    if (context.kind === "useMe") return "useMe:" + type;
    return "self:" + type;
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

  getRuleDefinition(ruleId: string): any | null {
    const api = this.getApi();
    if (!api || typeof api.getRuleState !== "function") return null;
    try {
      return api.getRuleState(ruleId)?.ruleDefinition || null;
    } catch {
      return null;
    }
  }

  async fetchRuleConditions(context?: RuleQueryContext): Promise<any> {
    return this.query("conditionsGet", "rules", context);
  }

  async setRuleLimit(ruleId: string, limit: number, context?: RuleQueryContext): Promise<boolean> {
    return this.query("conditionSetLimit", {
      category: "rules",
      condition: ruleId,
      limit,
    }, context);
  }

  getRulePublicData(conditionsData: any, ruleId: string): any | null {
    return conditionsData &&
      conditionsData.conditions &&
      Object.prototype.hasOwnProperty.call(conditionsData.conditions, ruleId)
      ? conditionsData.conditions[ruleId]
      : null;
  }

  async ensureRuleExists(ruleId: string, conditionsData: any, context?: RuleQueryContext): Promise<boolean> {
    if (this.getRulePublicData(conditionsData, ruleId)) return true;
    const created = await this.query("ruleCreate", ruleId, context);
    return created === true;
  }

  async updateRule(ruleId: string, data: unknown, context?: RuleQueryContext): Promise<boolean> {
    return this.query("conditionUpdate", {
      category: "rules",
      condition: ruleId,
      data,
    }, context);
  }

  async deleteRule(ruleId: string, context?: RuleQueryContext): Promise<boolean> {
    return this.query("ruleDelete", ruleId, context);
  }
}
