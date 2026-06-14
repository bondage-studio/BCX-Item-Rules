export interface EncodedRule {
  k: string;
  e?: 0 | 1;
  l?: 0 | 1;
  d?: Record<string, unknown>;
  q?: Record<string, unknown> | null;
  t?: number | null;
  tr?: 0 | 1;
  p?: number;
}

export interface EncodedPayload {
  v: 1;
  id: string;
  r: EncodedRule[];
}

export interface NormalizedRule {
  k: string;
  e: 0 | 1;
  l: 0 | 1;
  d?: Record<string, unknown>;
  q: Record<string, unknown> | null;
  t: number | null;
  tr: 0 | 1;
  p: number;
}

export interface NormalizedPayload {
  v: 1;
  id: string;
  r: NormalizedRule[];
}

export interface RuleConditionData {
  active: boolean;
  favorite: boolean;
  timer: number | null;
  timerRemove: boolean;
  requirements: Record<string, unknown> | null;
  data: {
    enforce: boolean;
    log: boolean;
    customData?: Record<string, unknown>;
  };
}

export interface DesiredRule {
  ruleId: string;
  conditionData: RuleConditionData;
  priority: number;
  payloadIds: string[];
  sources: DesiredRuleSource[];
  conflict?: boolean;
}

export type RuleOriginatorSource = "registry" | "cache" | "unknown";

export interface DesiredRuleSource {
  payloadId: string;
  originatorMemberNumber: number | null;
  originatorSource: RuleOriginatorSource;
  allowMinimalCreator: boolean;
  itemName?: string;
}

export interface PayloadWithOrigin {
  payload: NormalizedPayload;
  originatorMemberNumber?: number | null;
  originatorSource?: RuleOriginatorSource;
  allowMinimalCreator?: boolean;
  itemName?: string;
}

export interface DesiredRulesResult {
  desired: Map<string, DesiredRule>;
  payloadIds: string[];
  errors: string[];
  conflicts: string[];
}

export interface ManagedRuleState {
  previousCondition: RuleConditionData | null;
  lastApplied?: RuleConditionData;
  createdByUs: boolean;
  payloadIds: string[];
  updatedAt: number;
  appliedSenderMemberNumber?: number | null;
  appliedSenderWasMinimal?: boolean;
  appliedContextKind?: "self" | "creator" | "useMe";
  suspendedExistingInactive?: boolean;
}

export interface LocalState {
  version: 1;
  activePayloadIds: string[];
  managed: Record<string, ManagedRuleState>;
}

export interface BCXIRSettings {
  v: 1;
  enabled: boolean;
  scanItemCategoryOnly: boolean;
  showConflictMessages: boolean;
  showInvalidPayloadMessages: boolean;
  debugLogging: boolean;
  fallbackSyncEnabled: boolean;
  rulePermissionMode: "creator" | "self" | "useMe";
  allowCachedOfflineCreator: boolean;
  dangerModeEnabled: boolean;
  unlockUseMeMode: boolean;
  useMeSuspendInactiveConflicts: boolean;
  allowForeignItemRules: boolean;
  respondToRuleRequests: boolean;
  autoRequestForeignRules: boolean;
  showTransportMessages: boolean;
}

export interface RegistryEntry {
  id: string;
  itemName: string;
  enabled: boolean;
  selfOnly: boolean;
  payload: NormalizedPayload;
  updatedAt: number;
}

export interface RegistryState {
  v: 1;
  entries: Record<string, RegistryEntry>;
}

export interface RuleCacheEntry {
  cacheKey: string;
  crafter: number;
  itemName: string;
  payload: NormalizedPayload;
  updatedAt: number;
}

export interface RuleCacheState {
  v: 1;
  entries: Record<string, RuleCacheEntry>;
}
