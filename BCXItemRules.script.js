// ==UserScript==
// @name         BCX Item Rules
// @namespace    https://github.com/bondage-studio
// @version      0.1.0
// @author       Bondage Studio
// @description  Apply BCX rules from portable crafted item metadata.
// @match        https://bondageprojects.elementfx.com/*
// @match        https://www.bondageprojects.elementfx.com/*
// @match        https://bondage-europe.com/*
// @match        https://www.bondage-europe.com/*
// @match        https://bondageprojects.com/*
// @match        https://www.bondageprojects.com/*
// @match        https://bondage-asia.com/*
// @match        https://www.bondage-asia.com/*
// @require      https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  const VERSION = "0.1.0";
  const MOD_ID = "BCX Item Rules";
  const FULL_NAME = "BCX Item Rules";
  const STORAGE_PREFIX = "BCXIR_state_";
  const SETTINGS_EXTENSION_KEY = "BCXIR";
  const SETTINGS_BACKUP_PREFIX = "BCXIR_";
  const REGISTRY_STORAGE_PREFIX = "BCXIR_registry_";
  const RULE_CACHE_STORAGE_PREFIX = "BCXIR_rule_cache_";
  const MAX_ENCODED_LENGTH = 6e3;
  const SYNC_DEBOUNCE_MS = 250;
  const FALLBACK_SYNC_MS = 5e3;
  const QUERY_TIMEOUT_MS = 1e4;
  const ITEM_RULE_REQUEST_COOLDOWN_MS = 3e4;
  const ITEM_RULE_REQUEST_MAX_COOLDOWN_MS = 6e5;
  const ITEM_RULE_PROTOCOL_VERSION = 1;
  const ITEM_RULE_BEEP_TYPE = "Leash";
  const ITEM_RULE_MESSAGE_FLAG = "IsBCXIR";
  const ITEM_RULE_REQUEST_COMMAND = "bcxir-item-rules-request";
  const ITEM_RULE_RESPONSE_COMMAND = "bcxir-item-rules-response";
  class BCXAdapter {
    constructor(root, creatorSenderTransport, useMeTransport) {
      __publicField(this, "bcxApi", null);
      this.root = root;
      this.creatorSenderTransport = creatorSenderTransport;
      this.useMeTransport = useMeTransport;
    }
    canUseBCX() {
      return !!(this.root.bcx && typeof this.root.bcx.getModApi === "function");
    }
    getApi() {
      if (!this.canUseBCX()) return null;
      try {
        this.bcxApi = this.bcxApi || this.root.bcx.getModApi(MOD_ID);
        return this.bcxApi;
      } catch (error) {
        console.warn("[BCXIR] Failed to get BCX Mod API.", error);
        return null;
      }
    }
    async query(type, data, context = { kind: "self" }) {
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
    isKnownRule(ruleId) {
      const api = this.getApi();
      if (!api || typeof api.getRuleState !== "function") return true;
      try {
        return !!api.getRuleState(ruleId);
      } catch {
        return false;
      }
    }
    getRuleDefinition(ruleId) {
      var _a;
      const api = this.getApi();
      if (!api || typeof api.getRuleState !== "function") return null;
      try {
        return ((_a = api.getRuleState(ruleId)) == null ? void 0 : _a.ruleDefinition) || null;
      } catch {
        return null;
      }
    }
    async fetchRuleConditions(context) {
      return this.query("conditionsGet", "rules", context);
    }
    async setRuleLimit(ruleId, limit, context) {
      return this.query("conditionSetLimit", {
        category: "rules",
        condition: ruleId,
        limit
      }, context);
    }
    getRulePublicData(conditionsData, ruleId) {
      return conditionsData && conditionsData.conditions && Object.prototype.hasOwnProperty.call(conditionsData.conditions, ruleId) ? conditionsData.conditions[ruleId] : null;
    }
    async ensureRuleExists(ruleId, conditionsData, context) {
      if (this.getRulePublicData(conditionsData, ruleId)) return true;
      const created = await this.query("ruleCreate", ruleId, context);
      return created === true;
    }
    async updateRule(ruleId, data, context) {
      return this.query("conditionUpdate", {
        category: "rules",
        condition: ruleId,
        data
      }, context);
    }
    async deleteRule(ruleId, context) {
      return this.query("ruleDelete", ruleId, context);
    }
  }
  function now() {
    return Date.now();
  }
  function deepClone(value) {
    if (value === void 0) return void 0;
    return JSON.parse(JSON.stringify(value));
  }
  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }
  function stableNormalize(value) {
    if (Array.isArray(value)) return value.map(stableNormalize);
    if (!value || typeof value !== "object") return value;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stableNormalize(value[key]);
    }
    return out;
  }
  function stableStringify(value) {
    return JSON.stringify(stableNormalize(value));
  }
  function sameStable(a, b) {
    return stableStringify(a) === stableStringify(b);
  }
  function getLZString() {
    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const lz = root.LZString || globalThis.LZString;
    if (!lz || typeof lz.compressToEncodedURIComponent !== "function" || typeof lz.decompressFromEncodedURIComponent !== "function") {
      throw new Error("LZString is unavailable");
    }
    return lz;
  }
  function normalizeRequirements(value) {
    if (value === void 0 || value === null) return null;
    if (!isPlainObject(value)) throw new Error("requirements must be object or null");
    return deepClone(value);
  }
  function normalizeRuleEntry(entry) {
    if (!isPlainObject(entry)) throw new Error("rule entry must be an object");
    const rule = typeof entry.k === "string" ? entry.k.trim() : "";
    if (!rule) throw new Error("rule entry is missing k");
    const priority = Number.isFinite(Number(entry.p)) ? Number(entry.p) : 0;
    const customData = entry.d === void 0 ? void 0 : deepClone(entry.d);
    if (customData !== void 0 && !isPlainObject(customData)) {
      throw new Error("rule customData must be an object");
    }
    return {
      k: rule,
      e: entry.e === 0 ? 0 : 1,
      l: entry.l === 0 ? 0 : 1,
      d: customData,
      q: normalizeRequirements(entry.q),
      t: entry.t === void 0 ? null : entry.t === null ? null : Number(entry.t),
      tr: entry.tr === 1 ? 1 : 0,
      p: priority
    };
  }
  function normalizePayload(payload) {
    if (!isPlainObject(payload)) throw new Error("payload must be an object");
    if (payload.v !== 1) throw new Error("unsupported payload version");
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id) throw new Error("payload is missing id");
    if (!Array.isArray(payload.r)) throw new Error("payload rules must be an array");
    return {
      v: 1,
      id,
      r: payload.r.map(normalizeRuleEntry)
    };
  }
  function encodePayload(payload) {
    const normalized = normalizePayload(payload);
    const encoded = getLZString().compressToEncodedURIComponent(JSON.stringify(normalized));
    if (!encoded || encoded.length > MAX_ENCODED_LENGTH) {
      throw new Error("encoded BCXIR payload is empty or too large");
    }
    return encoded;
  }
  function decodePayload(encoded) {
    if (typeof encoded !== "string" || !encoded.trim()) throw new Error("encoded payload is empty");
    const json = getLZString().decompressFromEncodedURIComponent(encoded.trim());
    if (!json) throw new Error("payload decompression failed");
    return normalizePayload(JSON.parse(json));
  }
  function makeConditionData(ruleRequest) {
    const data = {
      enforce: ruleRequest.e !== 0,
      log: ruleRequest.l !== 0
    };
    if (ruleRequest.d !== void 0) data.customData = deepClone(ruleRequest.d);
    return {
      active: true,
      favorite: false,
      timer: ruleRequest.t == null ? null : Number(ruleRequest.t),
      timerRemove: ruleRequest.tr === 1,
      requirements: ruleRequest.q == null ? null : deepClone(ruleRequest.q),
      data
    };
  }
  function normalizeConditionForUpdate(condition) {
    if (!condition || typeof condition !== "object") return null;
    const data = condition.data && typeof condition.data === "object" ? condition.data : {};
    const out = {
      active: condition.active === true,
      favorite: condition.favorite === true,
      timer: condition.timer == null ? null : Number(condition.timer),
      timerRemove: condition.timerRemove === true,
      requirements: condition.requirements == null ? null : deepClone(condition.requirements),
      data: {
        enforce: data.enforce !== false,
        log: data.log !== false
      }
    };
    if (data.customData !== void 0) {
      out.data.customData = deepClone(data.customData);
    }
    return out;
  }
  function makeRuleUpdateData(desiredCondition, currentCondition) {
    const out = normalizeConditionForUpdate(desiredCondition);
    const current = normalizeConditionForUpdate(currentCondition);
    if (!out) throw new Error("desired rule condition is invalid");
    if (current && out.data.customData === void 0 && current.data.customData !== void 0) {
      out.data.customData = deepClone(current.data.customData);
    }
    return out;
  }
  function isWearerItem(item, options = {}) {
    const scanItemCategoryOnly = options.scanItemCategoryOnly !== false;
    return !!(item && item.Asset && item.Asset.Group && (!scanItemCategoryOnly || item.Asset.Group.Category === "Item"));
  }
  function collectDesiredRulesFromAppearance(appearance, options = {}) {
    var _a, _b;
    const desired = /* @__PURE__ */ new Map();
    const payloadIds = /* @__PURE__ */ new Set();
    const errors = [];
    const conflicts = [];
    for (const item of Array.isArray(appearance) ? appearance : []) {
      if (!isWearerItem(item, options)) continue;
      const localPayloads = ((_a = options.getLocalPayloadsForItem) == null ? void 0 : _a.call(options, item)) || [];
      if (!localPayloads.length) (_b = options.requestPayloadForItem) == null ? void 0 : _b.call(options, item);
      for (const payloadInfo of localPayloads) {
        const { payload, source } = normalizePayloadSource(payloadInfo);
        payloadIds.add(payload.id);
        for (const rule of payload.r) {
          const conditionData = makeConditionData(rule);
          const candidate = {
            ruleId: rule.k,
            conditionData,
            priority: rule.p || 0,
            payloadIds: [payload.id],
            sources: [source]
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
      conflicts
    };
  }
  function normalizePayloadSource(value) {
    const payloadInfo = isPayloadWithOrigin(value) ? value : { payload: value };
    const payload = payloadInfo.payload;
    return {
      payload,
      source: {
        payloadId: payload.id,
        originatorMemberNumber: normalizeMemberNumber$2(payloadInfo.originatorMemberNumber),
        originatorSource: payloadInfo.originatorSource || "unknown",
        allowMinimalCreator: payloadInfo.allowMinimalCreator === true,
        itemName: payloadInfo.itemName
      }
    };
  }
  function isPayloadWithOrigin(value) {
    return !!value && typeof value === "object" && "payload" in value;
  }
  function normalizeMemberNumber$2(value) {
    const memberNumber = Number(value);
    return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
  }
  function normalizeItemName(name) {
    return typeof name === "string" ? name.trim().replace(/\s+/g, " ").toLocaleLowerCase() : "";
  }
  function getRegistryStorageKey(memberNumber) {
    return REGISTRY_STORAGE_PREFIX + String(memberNumber);
  }
  function getRuleCacheStorageKey(memberNumber) {
    return RULE_CACHE_STORAGE_PREFIX + String(memberNumber);
  }
  function makeRuleCacheKey(crafter, itemName) {
    return String(crafter) + ":" + normalizeItemName(itemName);
  }
  function getPlayerMemberNumber(root) {
    var _a;
    const memberNumber = Number((_a = root.Player) == null ? void 0 : _a.MemberNumber);
    return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
  }
  function decodeCraftDescription(root, description) {
    var _a;
    if (typeof description !== "string") return "";
    const decoder = (_a = root.CraftingDescription) == null ? void 0 : _a.Decode;
    if (typeof decoder !== "function") return description;
    try {
      return String(decoder(description));
    } catch {
      return description;
    }
  }
  function getItemRuleName(item) {
    var _a, _b, _c;
    return String(
      ((_a = item == null ? void 0 : item.Craft) == null ? void 0 : _a.Name) || (item == null ? void 0 : item.Name) || ((_b = item == null ? void 0 : item.Asset) == null ? void 0 : _b.Name) || ((_c = item == null ? void 0 : item.Asset) == null ? void 0 : _c.Description) || ""
    ).trim();
  }
  function getItemNameAndDescriptionConcat(root, item) {
    var _a;
    const name = getItemRuleName(item);
    const description = decodeCraftDescription(root, (_a = item == null ? void 0 : item.Craft) == null ? void 0 : _a.Description);
    return [name, description].filter(Boolean).join(" | ");
  }
  function isPhraseInItemName(haystack, needle) {
    const source = normalizeItemName(haystack);
    const target = normalizeItemName(needle);
    return !!source && !!target && source.includes(target);
  }
  function normalizeRegistryEntry(value) {
    if (!isPlainObject(value)) return null;
    const itemName = typeof value.itemName === "string" ? value.itemName.trim() : "";
    if (!itemName) return null;
    try {
      return {
        id: typeof value.id === "string" && value.id ? value.id : "registry:" + normalizeItemName(itemName),
        itemName,
        enabled: value.enabled !== false,
        selfOnly: value.selfOnly === true,
        payload: normalizePayload(value.payload),
        updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0
      };
    } catch {
      return null;
    }
  }
  function normalizeRegistryState(value) {
    const out = { v: 1, entries: {} };
    const entries = isPlainObject(value) && isPlainObject(value.entries) ? value.entries : {};
    for (const raw of Object.values(entries)) {
      const entry = normalizeRegistryEntry(raw);
      if (entry) out.entries[normalizeItemName(entry.itemName)] = entry;
    }
    return out;
  }
  function readJsonState(root, key) {
    var _a;
    const raw = (_a = root.localStorage) == null ? void 0 : _a.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  }
  function writeJsonState(root, key, value) {
    var _a;
    (_a = root.localStorage) == null ? void 0 : _a.setItem(key, JSON.stringify(value));
  }
  function loadRegistry(root, memberNumber = getPlayerMemberNumber(root)) {
    if (memberNumber == null) return { v: 1, entries: {} };
    try {
      return normalizeRegistryState(readJsonState(root, getRegistryStorageKey(memberNumber)));
    } catch (error) {
      console.warn("[BCXIR] Failed to load local item rule registry; using empty registry.", error);
      return { v: 1, entries: {} };
    }
  }
  function saveRegistry(root, state, memberNumber = getPlayerMemberNumber(root)) {
    if (memberNumber == null) return;
    writeJsonState(root, getRegistryStorageKey(memberNumber), normalizeRegistryState(state));
  }
  function listRegistryEntries(root, memberNumber = getPlayerMemberNumber(root)) {
    return Object.values(loadRegistry(root, memberNumber).entries).map((entry) => deepClone(entry));
  }
  function getRegisteredItem(root, itemName, memberNumber = getPlayerMemberNumber(root)) {
    return deepClone(loadRegistry(root, memberNumber).entries[normalizeItemName(itemName)] || null);
  }
  function registerItemRules(root, itemName, payload, memberNumber = getPlayerMemberNumber(root)) {
    const cleanName = itemName.trim();
    if (!cleanName) throw new Error("itemName is required");
    const normalizedPayload = normalizePayload(payload);
    const state = loadRegistry(root, memberNumber);
    const key = normalizeItemName(cleanName);
    const existing = state.entries[key];
    const entry = {
      id: (existing == null ? void 0 : existing.id) || "registry:" + key + ":" + now(),
      itemName: cleanName,
      enabled: true,
      selfOnly: (existing == null ? void 0 : existing.selfOnly) === true,
      payload: normalizedPayload,
      updatedAt: now()
    };
    state.entries[key] = entry;
    saveRegistry(root, state, memberNumber);
    return deepClone(entry);
  }
  function updateRegisteredItem(root, currentItemName, patch, memberNumber = getPlayerMemberNumber(root)) {
    const state = loadRegistry(root, memberNumber);
    const currentKey = normalizeItemName(currentItemName);
    const existing = state.entries[currentKey];
    if (!existing) return null;
    const nextName = typeof patch.itemName === "string" && patch.itemName.trim() ? patch.itemName.trim() : existing.itemName;
    const next = {
      ...existing,
      itemName: nextName,
      enabled: patch.enabled === void 0 ? existing.enabled : patch.enabled !== false,
      selfOnly: patch.selfOnly === void 0 ? existing.selfOnly === true : patch.selfOnly === true,
      payload: patch.payload === void 0 ? existing.payload : normalizePayload(patch.payload),
      updatedAt: now()
    };
    delete state.entries[currentKey];
    state.entries[normalizeItemName(nextName)] = next;
    saveRegistry(root, state, memberNumber);
    return deepClone(next);
  }
  function deleteRegisteredItem(root, itemName, memberNumber = getPlayerMemberNumber(root)) {
    const state = loadRegistry(root, memberNumber);
    const key = normalizeItemName(itemName);
    if (!state.entries[key]) return false;
    delete state.entries[key];
    saveRegistry(root, state, memberNumber);
    return true;
  }
  function clearRegistry(root, memberNumber = getPlayerMemberNumber(root)) {
    var _a;
    if (memberNumber == null) return;
    (_a = root.localStorage) == null ? void 0 : _a.removeItem(getRegistryStorageKey(memberNumber));
  }
  function findMatchingRegistryEntry(root, itemOrName, memberNumber = getPlayerMemberNumber(root)) {
    const itemText = typeof itemOrName === "string" ? itemOrName : getItemNameAndDescriptionConcat(root, itemOrName);
    for (const entry of Object.values(loadRegistry(root, memberNumber).entries)) {
      if (entry.enabled && isPhraseInItemName(itemText, entry.itemName)) return deepClone(entry);
    }
    return null;
  }
  function normalizeRuleCacheEntry(value) {
    if (!isPlainObject(value)) return null;
    const crafter = Number(value.crafter);
    const itemName = typeof value.itemName === "string" ? value.itemName.trim() : "";
    if (!Number.isFinite(crafter) || crafter <= 0 || !itemName) return null;
    try {
      return {
        cacheKey: makeRuleCacheKey(crafter, itemName),
        crafter,
        itemName,
        payload: normalizePayload(value.payload),
        updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0
      };
    } catch {
      return null;
    }
  }
  function normalizeRuleCacheState(value) {
    const out = { v: 1, entries: {} };
    const entries = isPlainObject(value) && isPlainObject(value.entries) ? value.entries : {};
    for (const raw of Object.values(entries)) {
      const entry = normalizeRuleCacheEntry(raw);
      if (entry) out.entries[entry.cacheKey] = entry;
    }
    return out;
  }
  function loadRuleCache(root, memberNumber = getPlayerMemberNumber(root)) {
    if (memberNumber == null) return { v: 1, entries: {} };
    try {
      return normalizeRuleCacheState(readJsonState(root, getRuleCacheStorageKey(memberNumber)));
    } catch (error) {
      console.warn("[BCXIR] Failed to load item rule cache; using empty cache.", error);
      return { v: 1, entries: {} };
    }
  }
  function saveRuleCache(root, state, memberNumber = getPlayerMemberNumber(root)) {
    if (memberNumber == null) return;
    writeJsonState(root, getRuleCacheStorageKey(memberNumber), normalizeRuleCacheState(state));
  }
  function getCachedItemRules(root, crafter, itemName) {
    return deepClone(loadRuleCache(root).entries[makeRuleCacheKey(crafter, itemName)] || null);
  }
  function listRuleCacheEntries(root) {
    return Object.values(loadRuleCache(root).entries).map((entry) => deepClone(entry)).sort((a, b) => a.itemName.localeCompare(b.itemName) || a.crafter - b.crafter);
  }
  function cacheItemRules(root, crafter, itemName, payload) {
    const cleanName = itemName.trim();
    if (!cleanName) throw new Error("itemName is required");
    const state = loadRuleCache(root);
    const entry = {
      cacheKey: makeRuleCacheKey(crafter, cleanName),
      crafter,
      itemName: cleanName,
      payload: normalizePayload(payload),
      updatedAt: now()
    };
    state.entries[entry.cacheKey] = entry;
    saveRuleCache(root, state);
    return deepClone(entry);
  }
  function clearRuleCache(root) {
    var _a;
    const memberNumber = getPlayerMemberNumber(root);
    if (memberNumber == null) return;
    (_a = root.localStorage) == null ? void 0 : _a.removeItem(getRuleCacheStorageKey(memberNumber));
  }
  function deleteCachedItemRules(root, cacheKey) {
    const state = loadRuleCache(root);
    if (!state.entries[cacheKey]) return false;
    delete state.entries[cacheKey];
    saveRuleCache(root, state);
    return true;
  }
  function decodeExtensionSettingsRaw(root, raw) {
    if (typeof raw !== "string" || !raw) return null;
    const lz = getLz(root);
    if (!lz) throw new Error("LZString base64 codec is unavailable");
    const json = lz.decompressFromBase64(raw);
    if (!json) throw new Error("extension settings decompression failed");
    return JSON.parse(json);
  }
  function encodeExtensionSettingsRaw(root, value) {
    const lz = getLz(root);
    if (!lz) throw new Error("LZString base64 codec is unavailable");
    const encoded = lz.compressToBase64(JSON.stringify(value));
    if (typeof encoded !== "string" || !encoded) throw new Error("extension settings compression failed");
    return encoded;
  }
  function getLz(root) {
    const lz = root.LZString || globalThis.LZString;
    if (lz && typeof lz.compressToBase64 === "function" && typeof lz.decompressFromBase64 === "function") {
      return lz;
    }
    return null;
  }
  function getPlayerNumber(root) {
    const value = root.Player && root.Player.MemberNumber;
    return value == null ? "DEFAULT" : String(value);
  }
  function storageKey(root) {
    return STORAGE_PREFIX + getPlayerNumber(root);
  }
  function settingsBackupKey(root) {
    return SETTINGS_BACKUP_PREFIX + getPlayerNumber(root) + "_backup";
  }
  function emptyState() {
    return { version: 1, activePayloadIds: [], activeItemPayloads: {}, managed: {} };
  }
  function loadState(root) {
    try {
      const extensionActiveItemPayloads = loadActiveItemPayloadsFromExtensionSettings(root);
      const raw = root.localStorage && root.localStorage.getItem(storageKey(root));
      if (!raw) {
        return {
          ...emptyState(),
          activeItemPayloads: extensionActiveItemPayloads.value
        };
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") throw new Error("bad state");
      return {
        version: 1,
        activePayloadIds: Array.isArray(parsed.activePayloadIds) ? parsed.activePayloadIds : [],
        activeItemPayloads: extensionActiveItemPayloads.found ? extensionActiveItemPayloads.value : normalizeActiveItemPayloads(parsed.activeItemPayloads),
        managed: parsed.managed && typeof parsed.managed === "object" ? parsed.managed : {}
      };
    } catch (error) {
      console.warn("[BCXIR] Failed to load local state; starting clean.", error);
      return emptyState();
    }
  }
  function saveState(root, state) {
    try {
      root.localStorage && root.localStorage.setItem(storageKey(root), JSON.stringify(state));
      syncActiveItemPayloadsToExtensionSettings(root, state.activeItemPayloads);
    } catch (error) {
      console.warn("[BCXIR] Failed to save local state.", error);
    }
  }
  function loadActiveItemPayloadsFromExtensionSettings(root) {
    var _a, _b, _c;
    for (const raw of [
      (_b = (_a = root.Player) == null ? void 0 : _a.ExtensionSettings) == null ? void 0 : _b[SETTINGS_EXTENSION_KEY],
      (_c = root.localStorage) == null ? void 0 : _c.getItem(settingsBackupKey(root))
    ]) {
      try {
        const decoded = decodeExtensionSettingsRaw(root, raw);
        if (isPlainObject(decoded) && isPlainObject(decoded.activeItemPayloads)) {
          return { found: true, value: normalizeActiveItemPayloads(decoded.activeItemPayloads) };
        }
        if (isPlainObject(decoded) && isPlainObject(decoded.settings)) {
          return { found: true, value: {} };
        }
      } catch {
      }
    }
    return { found: false, value: {} };
  }
  function syncActiveItemPayloadsToExtensionSettings(root, activeItemPayloads) {
    var _a, _b, _c, _d, _e;
    if (!root.Player) return;
    const active = normalizeActiveItemPayloads(activeItemPayloads);
    const currentRaw = (_b = (_a = root.Player) == null ? void 0 : _a.ExtensionSettings) == null ? void 0 : _b[SETTINGS_EXTENSION_KEY];
    const backupRaw = (_c = root.localStorage) == null ? void 0 : _c.getItem(settingsBackupKey(root));
    const decoded = decodeFirstAvailable(root, currentRaw, backupRaw);
    const settings = isPlainObject(decoded) && isPlainObject(decoded.settings) ? decoded.settings : isPlainObject(decoded) ? decoded : {};
    const document = Object.keys(active).length ? { v: 1, settings, activeItemPayloads: active } : { v: 1, settings };
    const encoded = encodeExtensionSettingsRaw(root, document);
    if (currentRaw === encoded && backupRaw === encoded) return;
    (_d = root.Player).ExtensionSettings || (_d.ExtensionSettings = {});
    root.Player.ExtensionSettings[SETTINGS_EXTENSION_KEY] = encoded;
    (_e = root.localStorage) == null ? void 0 : _e.setItem(settingsBackupKey(root), encoded);
    if (typeof root.ServerPlayerExtensionSettingsSync === "function") {
      root.ServerPlayerExtensionSettingsSync(SETTINGS_EXTENSION_KEY);
    }
  }
  function decodeFirstAvailable(root, ...rawValues) {
    for (const raw of rawValues) {
      try {
        const decoded = decodeExtensionSettingsRaw(root, raw);
        if (decoded) return decoded;
      } catch {
      }
    }
    return null;
  }
  function normalizeActiveItemPayloads(value) {
    const out = {};
    if (!isPlainObject(value)) return out;
    for (const [key, raw] of Object.entries(value)) {
      if (!isPlainObject(raw) || !isPlainObject(raw.payload)) continue;
      const payload = raw.payload;
      if (payload.v !== 1 || typeof payload.id !== "string" || !Array.isArray(payload.r)) continue;
      const itemName = typeof raw.itemName === "string" ? raw.itemName.trim() : "";
      if (!itemName) continue;
      const originatorSource = normalizeOriginatorSource(raw.originatorSource);
      out[key] = {
        payload,
        originatorMemberNumber: normalizeMemberNumber$1(raw.originatorMemberNumber),
        originatorSource,
        allowMinimalCreator: raw.allowMinimalCreator === true,
        itemName,
        updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0
      };
    }
    return out;
  }
  function normalizeOriginatorSource(value) {
    return value === "registry" || value === "cache" ? value : "unknown";
  }
  function normalizeMemberNumber$1(value) {
    const memberNumber = Number(value);
    return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
  }
  const LOCKED_SETTING_KEYS = /* @__PURE__ */ new Set([
    "rulePermissionMode",
    "dangerModeEnabled",
    "unlockUseMeMode",
    "useMeSuspendInactiveConflicts",
    "allowCachedOfflineCreator",
    "lockWornItemRules"
  ]);
  function getWornItemRuleLockState(root, settings) {
    var _a, _b, _c;
    const state = {
      enabled: settings.lockWornItemRules === true,
      active: false,
      protectedItemCount: 0,
      registryItemNames: /* @__PURE__ */ new Set(),
      cacheKeys: /* @__PURE__ */ new Set(),
      remoteItemKeys: /* @__PURE__ */ new Set()
    };
    if (!state.enabled) return state;
    const playerNumber = normalizeMemberNumber((_a = root.Player) == null ? void 0 : _a.MemberNumber);
    const appearance = Array.isArray((_b = root.Player) == null ? void 0 : _b.Appearance) ? root.Player.Appearance : [];
    const activeItemPayloads = loadState(root).activeItemPayloads;
    for (const item of appearance) {
      if (!isWearerItem(item, { scanItemCategoryOnly: settings.scanItemCategoryOnly })) continue;
      const itemName = getItemRuleName(item);
      if (!itemName) continue;
      const crafter = normalizeMemberNumber((_c = item == null ? void 0 : item.Craft) == null ? void 0 : _c.MemberNumber);
      if (playerNumber != null && crafter === playerNumber) {
        const entry = findMatchingRegistryEntry(root, item);
        if (!entry) continue;
        state.registryItemNames.add(normalizeItemName(entry.itemName));
        state.protectedItemCount += 1;
        continue;
      }
      if (crafter == null) continue;
      const cacheKey = makeRuleCacheKey(crafter, itemName);
      const cached = getCachedItemRules(root, crafter, itemName);
      const activePayload = activeItemPayloads[cacheKey];
      if (!cached && !activePayload) continue;
      state.remoteItemKeys.add(cacheKey);
      if (cached) state.cacheKeys.add(cached.cacheKey);
      state.protectedItemCount += 1;
    }
    state.active = state.protectedItemCount > 0;
    return state;
  }
  function isWornItemRuleLockActive(root, settings) {
    return getWornItemRuleLockState(root, settings).active;
  }
  function canModifyRegisteredItem(root, settings, itemName) {
    const lock = getWornItemRuleLockState(root, settings);
    return !lock.active || !lock.registryItemNames.has(normalizeItemName(itemName));
  }
  function canModifyCacheEntry(root, settings, cacheKey) {
    const lock = getWornItemRuleLockState(root, settings);
    return !lock.active || !lock.cacheKeys.has(cacheKey);
  }
  function canRefreshRemoteItemRules(root, settings, crafter, itemName) {
    const lock = getWornItemRuleLockState(root, settings);
    return !lock.active || !lock.remoteItemKeys.has(makeRuleCacheKey(crafter, itemName));
  }
  function hasLockedRegistryEntries(root, settings) {
    return getWornItemRuleLockState(root, settings).registryItemNames.size > 0;
  }
  function hasLockedCacheEntries(root, settings) {
    return getWornItemRuleLockState(root, settings).cacheKeys.size > 0;
  }
  function filterSettingsPatchForWornItemLock(root, current, patch) {
    if (!isWornItemRuleLockActive(root, current)) return patch;
    const next = { ...patch };
    for (const key of LOCKED_SETTING_KEYS) delete next[key];
    return next;
  }
  function normalizeMemberNumber(value) {
    const memberNumber = Number(value);
    return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
  }
  function buildPublicApi(root, synchronizer, settingsStore, settingsRegistry, authoring, itemRuleTransport) {
    return {
      version: VERSION,
      encodePayload,
      decodePayload,
      collectDesiredRulesFromAppearance,
      getRegistry: () => listRegistryEntries(root),
      getRuleCache: () => listRuleCacheEntries(root),
      registerItemRules: (itemName, payload) => {
        if (!canModifyRegisteredItem(root, settingsStore.get(), itemName)) return getRegisteredItem(root, itemName);
        const entry = registerItemRules(root, itemName, payload);
        synchronizer.scheduleSync("registry-api");
        return entry;
      },
      deleteRegisteredItem: (itemName) => {
        if (!canModifyRegisteredItem(root, settingsStore.get(), itemName)) return false;
        const deleted = deleteRegisteredItem(root, itemName);
        synchronizer.scheduleSync("registry-api");
        return deleted;
      },
      updateRegisteredItem: (itemName, patch) => {
        if (!canModifyRegisteredItem(root, settingsStore.get(), itemName)) return null;
        const entry = updateRegisteredItem(root, itemName, patch);
        synchronizer.scheduleSync("registry-api");
        return entry;
      },
      requestItemRules: (item, targetOverride) => (itemRuleTransport == null ? void 0 : itemRuleTransport.requestItemRules(item, targetOverride)) ?? null,
      clearRuleCache: () => {
        if (hasLockedCacheEntries(root, settingsStore.get())) return;
        clearRuleCache(root);
        synchronizer.scheduleSync("cache-api");
      },
      deleteCachedItemRules: (cacheKey) => {
        if (!canModifyCacheEntry(root, settingsStore.get(), cacheKey)) return false;
        const deleted = deleteCachedItemRules(root, cacheKey);
        synchronizer.scheduleSync("cache-api");
        return deleted;
      },
      clearRequestCooldowns: () => itemRuleTransport == null ? void 0 : itemRuleTransport.clearCooldowns(),
      releaseManagedRules: (reason) => synchronizer.releaseManagedRules(reason || "api-release"),
      syncNow: (reason) => synchronizer.syncNow(reason),
      scheduleSync: (reason) => synchronizer.scheduleSync(reason),
      getSettings: () => settingsStore.get(),
      updateSettings: (patch) => {
        const next = settingsStore.update(patch);
        synchronizer.startFallbackTimer();
        synchronizer.scheduleSync("settings-api");
        return next;
      },
      openSettings: () => settingsRegistry.open(),
      openAuthoring: (options) => (authoring == null ? void 0 : authoring.open(options)) ?? Promise.resolve(false),
      finishAuthoring: () => (authoring == null ? void 0 : authoring.finish()) ?? Promise.resolve(null),
      cancelAuthoring: () => (authoring == null ? void 0 : authoring.cancel()) ?? false,
      getAuthoringState: () => (authoring == null ? void 0 : authoring.getState()) ?? {
        status: "idle",
        virtualMemberNumber: null,
        lastRegisteredItem: null,
        lastError: "authoring unavailable",
        bcxVersionReady: false,
        transportActive: false,
        bridgeActive: false,
        nativeRoomActive: null,
        lastInboundType: null,
        lastOutboundType: null,
        lastQuery: null,
        queryCount: 0,
        messageCount: 0,
        lastInitStep: null
      }
    };
  }
  class Reporter {
    constructor(root, settingsStore) {
      __publicField(this, "lastReportKey", "");
      this.root = root;
      this.settingsStore = settingsStore;
    }
    shouldShow(kind) {
      var _a;
      const settings = (_a = this.settingsStore) == null ? void 0 : _a.get();
      if (kind === "conflict" && (settings == null ? void 0 : settings.showConflictMessages) === false) return false;
      if (kind === "invalid-payload" && (settings == null ? void 0 : settings.showInvalidPayloadMessages) === false) return false;
      return true;
    }
    localMessage(message, kind = "info") {
      console.warn("[BCXIR]", message);
      if (!this.shouldShow(kind)) return;
      try {
        if (typeof this.root.ChatRoomSendLocal === "function") {
          this.root.ChatRoomSendLocal("[BCXIR] " + message, 8e3);
        } else if (typeof this.root.InfoBeep === "function") {
          this.root.InfoBeep("[BCXIR] " + message, 8e3);
        }
      } catch {
      }
    }
    reportOnce(kind, messages, reportKind = "info") {
      if (!messages.length) return;
      const key = kind + ":" + messages.join("|");
      if (key === this.lastReportKey) return;
      this.lastReportKey = key;
      this.localMessage(
        messages.slice(0, 4).join(" | ") + (messages.length > 4 ? " | ..." : ""),
        reportKind
      );
    }
  }
  function getRoot() {
    return typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  }
  class RuleSynchronizer {
    constructor(root, bcx, reporter, settingsStore, itemRuleTransport) {
      __publicField(this, "syncTimer", 0);
      __publicField(this, "fallbackTimer", 0);
      __publicField(this, "syncInFlight", false);
      __publicField(this, "pendingSyncReason", "");
      __publicField(this, "lastSyncReason", null);
      __publicField(this, "lastSyncTime", null);
      __publicField(this, "lastSyncResult", null);
      __publicField(this, "lastConflictCount", 0);
      __publicField(this, "lastInvalidCount", 0);
      this.root = root;
      this.bcx = bcx;
      this.reporter = reporter;
      this.settingsStore = settingsStore;
      this.itemRuleTransport = itemRuleTransport;
    }
    async applyDesiredRules(desiredInfo, reason) {
      const api = this.bcx.getApi();
      if (!api) {
        this.reporter.reportOnce("missing-bcx", ["BCX is not available; item rules are paused"], "error");
        return false;
      }
      const state = loadState(this.root);
      const changedMessages = [];
      const conflictMessages = [...desiredInfo.conflicts];
      const invalidMessages = desiredInfo.errors.map((error) => "Invalid item payload: " + error);
      const settings = this.settingsStore.get();
      let latestConditionsData = null;
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
        let conditionsData;
        try {
          conditionsData = await this.bcx.fetchRuleConditions(applyContext.context);
          latestConditionsData = conditionsData;
        } catch (error) {
          conflictMessages.push("Failed to read BCX rules as sender for " + ruleId + ": " + this.errorMessage(error));
          continue;
        }
        const current = this.bcx.getRulePublicData(conditionsData, ruleId);
        const managed = state.managed[ruleId];
        const wasManaged = !!managed;
        const comparableCurrent = normalizeConditionForUpdate(current);
        if ((managed == null ? void 0 : managed.lastApplied) && comparableCurrent && !sameStable(comparableCurrent, managed.lastApplied)) {
          delete state.managed[ruleId];
          conflictMessages.push("Rule changed outside BCXIR; released: " + ruleId);
          continue;
        }
        if (!managed && current) {
          const canSuspendInactive = settings.dangerModeEnabled === true && settings.useMeSuspendInactiveConflicts === true && (comparableCurrent == null ? void 0 : comparableCurrent.active) === false;
          if (!canSuspendInactive) {
            conflictMessages.push(
              (comparableCurrent == null ? void 0 : comparableCurrent.active) === false && settings.dangerModeEnabled === true ? "Existing inactive BCX rule not overwritten without suspend option: " + ruleId : "Existing BCX rule not overwritten: " + ruleId
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
            appliedContextKind: applyContext.context.kind,
            suspendedExistingInactive: true
          };
        }
        if (!state.managed[ruleId]) {
          const okCreate = await this.bcx.ensureRuleExists(ruleId, conditionsData, applyContext.context);
          if (!okCreate) {
            conflictMessages.push("BCX refused to create rule: " + ruleId);
            continue;
          }
          conditionsData = await this.bcx.fetchRuleConditions(applyContext.context);
          latestConditionsData = conditionsData;
          state.managed[ruleId] = {
            previousCondition: null,
            createdByUs: !current,
            payloadIds: [],
            updatedAt: now(),
            appliedSenderMemberNumber: applyContext.senderMemberNumber,
            appliedSenderWasMinimal: applyContext.allowMinimalCreator,
            appliedContextKind: applyContext.context.kind
          };
        }
        const currentForUpdate = this.bcx.getRulePublicData(conditionsData, ruleId);
        const updateData = makeRuleUpdateData(desired.conditionData, currentForUpdate);
        const okUpdate = await this.bcx.updateRule(ruleId, updateData, applyContext.context);
        if (okUpdate !== true) {
          const createdState = state.managed[ruleId];
          if (!wasManaged && (createdState == null ? void 0 : createdState.previousCondition)) {
            await this.bcx.updateRule(ruleId, createdState.previousCondition, applyContext.context).catch(() => false);
            delete state.managed[ruleId];
          } else if (!wasManaged && (createdState == null ? void 0 : createdState.createdByUs)) {
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
        state.managed[ruleId].appliedContextKind = applyContext.context.kind;
        changedMessages.push("Applied " + ruleId);
      }
      latestConditionsData = await this.bcx.fetchRuleConditions().catch(() => latestConditionsData);
      for (const ruleId of Object.keys(state.managed)) {
        if (desiredInfo.desired.has(ruleId)) continue;
        const managed = state.managed[ruleId];
        const cleanupContext = this.getManagedRuleContext(managed);
        let conditionsData = latestConditionsData;
        if (cleanupContext.context.kind !== "self") {
          conditionsData = await this.bcx.fetchRuleConditions(cleanupContext.context).catch(() => latestConditionsData);
        }
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
    async syncNow(reason) {
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
        const currentItemKeys = /* @__PURE__ */ new Set();
        const desiredInfo = settings.enabled ? collectDesiredRulesFromAppearance(player.Appearance, {
          scanItemCategoryOnly: settings.scanItemCategoryOnly,
          getLocalPayloadsForItem: (item) => {
            var _a, _b;
            const crafter = Number((_a = item == null ? void 0 : item.Craft) == null ? void 0 : _a.MemberNumber);
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
                itemName: activePayload.itemName
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
                  updatedAt: now()
                };
              }
              return [{
                payload: entry.payload,
                originatorMemberNumber: Number(player.MemberNumber),
                originatorSource: "registry",
                allowMinimalCreator: false,
                itemName
              }];
            }
            if (Number.isFinite(crafter) && crafter > 0) {
              if (settings.allowForeignItemRules === false) return [];
              if (settings.autoRequestForeignRules !== false && itemKey && !state.activeItemPayloads[itemKey] && canRefreshRemoteItemRules(this.root, settings, crafter, itemName)) {
                (_b = this.itemRuleTransport) == null ? void 0 : _b.requestItemRules(item);
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
                  updatedAt: now()
                };
              }
              return [{
                payload: cached.payload,
                originatorMemberNumber: crafter,
                originatorSource: "cache",
                allowMinimalCreator: settings.allowCachedOfflineCreator,
                itemName
              }];
            }
            return [];
          }
        }) : { desired: /* @__PURE__ */ new Map(), payloadIds: [], errors: [], conflicts: [] };
        this.pruneActiveItemPayloads(state, currentItemKeys, settings);
        saveState(this.root, state);
        if (!settings.enabled && settings.debugLogging) {
          console.info("[BCXIR] Runtime disabled; releasing managed rules.");
        }
        return await this.applyDesiredRules(desiredInfo, reason || "manual");
      } catch (error) {
        console.error("[BCXIR] Sync failed.", error);
        this.reporter.reportOnce("sync", [
          "BCXIR sync failed: " + String(error instanceof Error ? error.message : error)
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
    scheduleSync(reason) {
      if (this.syncTimer) this.root.clearTimeout(this.syncTimer);
      this.syncTimer = this.root.setTimeout(() => {
        this.syncTimer = 0;
        void this.syncNow(reason || "scheduled");
      }, SYNC_DEBOUNCE_MS);
    }
    startFallbackTimer() {
      if (this.fallbackTimer || !this.settingsStore.get().fallbackSyncEnabled) return;
      this.fallbackTimer = this.root.setInterval(() => {
        if (this.settingsStore.get().fallbackSyncEnabled) this.scheduleSync("fallback");
      }, FALLBACK_SYNC_MS);
    }
    async releaseManagedRules(reason = "manual-release") {
      return this.applyDesiredRules({ desired: /* @__PURE__ */ new Map(), payloadIds: [], errors: [], conflicts: [] }, reason);
    }
    getDiagnostics() {
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
        pendingSyncReason: this.pendingSyncReason
      };
    }
    getDesiredRuleContext(desired, settings) {
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
          allowMinimalCreator: source.allowMinimalCreator
        },
        senderMemberNumber: source.originatorMemberNumber,
        allowMinimalCreator: source.allowMinimalCreator
      };
    }
    pickDesiredSource(sources, playerNumber) {
      return sources.find((source) => source.originatorSource === "registry") || sources.find((source) => source.originatorMemberNumber === playerNumber) || sources.find((source) => source.originatorSource === "cache" && source.originatorMemberNumber != null) || null;
    }
    getManagedRuleContext(managed) {
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
        allowMinimalCreator
      };
    }
    getPlayerMemberNumber() {
      var _a;
      const memberNumber = Number((_a = this.root.Player) == null ? void 0 : _a.MemberNumber);
      return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
    }
    makeActiveItemPayloadKey(crafter, itemName) {
      const memberNumber = Number(crafter);
      const normalizedItemName = normalizeItemName(itemName);
      if (!Number.isFinite(memberNumber) || memberNumber <= 0 || !normalizedItemName) return null;
      return makeRuleCacheKey(memberNumber, normalizedItemName);
    }
    pruneActiveItemPayloads(state, currentItemKeys, settings) {
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
    errorMessage(error) {
      return String(error instanceof Error ? error.message : error);
    }
  }
  function registerModSdkHooks(root, synchronizer, authoring, itemRuleTransport, creatorSenderTransport, useMeTransport) {
    const sdk = root.bcModSdk;
    if (!sdk || typeof sdk.registerMod !== "function") return false;
    try {
      const modApi = sdk.registerMod({
        name: MOD_ID,
        fullName: FULL_NAME,
        version: VERSION,
        repository: "https://github.com/bondage-studio/BCX-Item-Rules"
      }, { allowReplace: true });
      const hookAfter = (fnName, reason, characterIndex) => {
        try {
          modApi.hookFunction(fnName, 1, (args, next) => {
            const result = next(args);
            const C = characterIndex == null ? root.Player : args[characterIndex];
            if (!C || C === root.Player || typeof C.IsPlayer === "function" && C.IsPlayer()) {
              synchronizer.scheduleSync(reason);
            }
            return result;
          });
        } catch (error) {
          console.warn("[BCXIR] Failed to hook " + fnName, error);
        }
      };
      hookAfter("CharacterRefresh", "CharacterRefresh", 0);
      hookAfter("ServerAppearanceLoadFromBundle", "ServerAppearanceLoadFromBundle", 0);
      hookAfter("ChatRoomSync", "ChatRoomSync", null);
      if (authoring) {
        authoring.setModApi(modApi);
      }
      itemRuleTransport == null ? void 0 : itemRuleTransport.install(modApi);
      creatorSenderTransport == null ? void 0 : creatorSenderTransport.install(modApi);
      useMeTransport == null ? void 0 : useMeTransport.install(modApi);
      return true;
    } catch (error) {
      console.warn("[BCXIR] Mod SDK registration failed.", error);
      return false;
    }
  }
  const DEFAULT_SETTINGS = {
    v: 1,
    enabled: true,
    scanItemCategoryOnly: true,
    showConflictMessages: true,
    showInvalidPayloadMessages: true,
    debugLogging: false,
    fallbackSyncEnabled: true,
    rulePermissionMode: "creator",
    allowCachedOfflineCreator: true,
    dangerModeEnabled: false,
    unlockUseMeMode: false,
    useMeSuspendInactiveConflicts: false,
    lockWornItemRules: false,
    allowForeignItemRules: true,
    respondToRuleRequests: true,
    autoRequestForeignRules: true,
    showTransportMessages: true
  };
  function getSettingsBackupKey(root) {
    var _a;
    const number = ((_a = root.Player) == null ? void 0 : _a.MemberNumber) == null ? "DEFAULT" : String(root.Player.MemberNumber);
    return SETTINGS_BACKUP_PREFIX + number + "_backup";
  }
  function normalizeSettings(value) {
    const source = isPlainObject(value) ? value : {};
    const dangerModeEnabled = source.dangerModeEnabled === true;
    const unlockUseMeMode = dangerModeEnabled && source.unlockUseMeMode === true;
    const rulePermissionMode = source.rulePermissionMode === "self" ? "self" : source.rulePermissionMode === "useMe" && unlockUseMeMode ? "useMe" : "creator";
    return {
      v: 1,
      enabled: source.enabled !== false,
      scanItemCategoryOnly: source.scanItemCategoryOnly !== false,
      showConflictMessages: source.showConflictMessages !== false,
      showInvalidPayloadMessages: source.showInvalidPayloadMessages !== false,
      debugLogging: source.debugLogging === true,
      fallbackSyncEnabled: source.fallbackSyncEnabled !== false,
      rulePermissionMode,
      allowCachedOfflineCreator: source.allowCachedOfflineCreator !== false,
      dangerModeEnabled,
      unlockUseMeMode,
      useMeSuspendInactiveConflicts: dangerModeEnabled && source.useMeSuspendInactiveConflicts === true,
      lockWornItemRules: source.lockWornItemRules === true,
      allowForeignItemRules: source.allowForeignItemRules !== false,
      respondToRuleRequests: source.respondToRuleRequests !== false,
      autoRequestForeignRules: source.autoRequestForeignRules !== false,
      showTransportMessages: source.showTransportMessages !== false
    };
  }
  function decodeSettings(root, raw) {
    const decoded = decodeExtensionSettingsRaw(root, raw);
    if (!decoded) return null;
    const settings = isPlainObject(decoded) && isPlainObject(decoded.settings) ? decoded.settings : decoded;
    return normalizeSettings(settings);
  }
  function encodeSettings(root, settings) {
    const activeItemPayloads = readExistingActiveItemPayloads(root);
    const document = activeItemPayloads ? { v: 1, settings: normalizeSettings(settings), activeItemPayloads } : { v: 1, settings: normalizeSettings(settings) };
    return encodeExtensionSettingsRaw(root, document);
  }
  function readExistingActiveItemPayloads(root) {
    var _a, _b, _c;
    for (const raw of [
      (_b = (_a = root.Player) == null ? void 0 : _a.ExtensionSettings) == null ? void 0 : _b[SETTINGS_EXTENSION_KEY],
      (_c = root.localStorage) == null ? void 0 : _c.getItem(getSettingsBackupKey(root))
    ]) {
      try {
        const decoded = decodeExtensionSettingsRaw(root, raw);
        if (isPlainObject(decoded) && isPlainObject(decoded.activeItemPayloads)) return decoded.activeItemPayloads;
      } catch {
      }
    }
    return null;
  }
  class ExtensionSettingsStore {
    constructor(root) {
      __publicField(this, "current", deepClone(DEFAULT_SETTINGS));
      __publicField(this, "warnedLoadFailure", false);
      this.root = root;
    }
    get() {
      return deepClone(this.current);
    }
    load() {
      var _a, _b, _c;
      const extensionRaw = (_b = (_a = this.root.Player) == null ? void 0 : _a.ExtensionSettings) == null ? void 0 : _b[SETTINGS_EXTENSION_KEY];
      const backupRaw = (_c = this.root.localStorage) == null ? void 0 : _c.getItem(getSettingsBackupKey(this.root));
      for (const raw of [extensionRaw, backupRaw]) {
        try {
          const parsed = decodeSettings(this.root, raw);
          if (parsed) {
            this.current = parsed;
            return this.get();
          }
        } catch (error) {
          if (!this.warnedLoadFailure) {
            this.warnedLoadFailure = true;
            console.warn("[BCXIR] Failed to load settings; using defaults.", error);
          }
        }
      }
      this.current = deepClone(DEFAULT_SETTINGS);
      return this.get();
    }
    save(settings) {
      var _a, _b;
      this.current = normalizeSettings(settings);
      try {
        const encoded = encodeSettings(this.root, this.current);
        (_a = this.root.Player).ExtensionSettings || (_a.ExtensionSettings = {});
        this.root.Player.ExtensionSettings[SETTINGS_EXTENSION_KEY] = encoded;
        (_b = this.root.localStorage) == null ? void 0 : _b.setItem(getSettingsBackupKey(this.root), encoded);
        if (typeof this.root.ServerPlayerExtensionSettingsSync === "function") {
          this.root.ServerPlayerExtensionSettingsSync(SETTINGS_EXTENSION_KEY);
        }
      } catch (error) {
        console.warn("[BCXIR] Failed to save settings.", error);
      }
    }
    update(patch) {
      const filteredPatch = filterSettingsPatchForWornItemLock(this.root, this.current, patch);
      const next = normalizeSettings({ ...this.current, ...filteredPatch, v: 1 });
      this.save(next);
      return this.get();
    }
  }
  const EN = {
    "extension.button": "BCXIR Settings",
    "common.back": "Back",
    "common.previous": "Previous",
    "common.next": "Next",
    "common.previousNext": "Previous / Next",
    "common.unknown": "unknown",
    "common.available": "available",
    "common.unavailable": "unavailable",
    "common.none": "none",
    "common.notRun": "not run",
    "settings.title": "BCXIR Settings",
    "settings.exit": "Exit",
    "settings.tooltip.back": "Return to BCXIR settings.",
    "main.status": "Runtime status: {status}",
    "main.counts": "Items: {registered} registered / {cached} cached",
    "main.sync": "Last sync: {result} / pending requests: {pending}",
    "main.enable": "Enable BCXIR",
    "main.enable.tip": "When disabled, BCXIR releases rules it manages and stops applying item payloads.",
    "main.itemRules": "Item Rules",
    "main.itemRules.tip": "Register crafted item names and edit BCXIR rules.",
    "main.runtime": "Runtime / Sharing / Backup",
    "main.runtime.tip": "Configure permissions, sharing, cache, and backups.",
    "main.danger": "Dangerous Mode",
    "main.danger.tip": "Opt into risky rule behavior. Leave these off unless you understand the tradeoff.",
    "main.diagnostics": "Diagnostics",
    "main.diagnostics.tip": "Inspect sync state and use troubleshooting or cleanup tools.",
    "item.title": "BCXIR Item Rules",
    "item.delete.tip": "Delete item rules",
    "item.create.tip": "Create new item rules",
    "item.empty": "No BCXIR Items Yet...",
    "item.name": "Item Name:",
    "item.name.tip": "Crafted item name or phrase used to match worn items.",
    "item.enabled": "Enabled:",
    "item.enabled.tip": "If disabled, this registered item will not answer or apply rules.",
    "item.selfOnly": "Only applies to myself:",
    "item.selfOnly.tip": "If enabled, this item will not answer rule requests from other players.",
    "item.rulesUpdated": "Rules: {rules} / Updated: {updated}",
    "item.edit": "Edit BCX Rules",
    "item.edit.tip": "Open the virtual BCX character rule editor for this item.",
    "item.locked.tip": "This registered item is currently worn and protected by the worn item lock.",
    "item.createFirst": "Create an item rule entry to begin.",
    "item.defaultName": "BCXIR Item No. {index}",
    "runtime.title": "BCXIR Runtime / Sharing / Backup",
    "runtime.permissionMode": "Permission mode:",
    "runtime.permissionMode.tip": "Choose who BCXIR uses when applying item rules. The risky Please use me option must be enabled from Dangerous Mode first.",
    "runtime.permissionMode.locked.tip": "This is locked while a protected BCXIR item is worn. Use Diagnostics / Advanced reset to clear the lock setting.",
    "runtime.permission.creator": "Item creator",
    "runtime.permission.self": "Myself",
    "runtime.permission.useMe": "Please use me",
    "runtime.lockWorn": "Lock worn item settings",
    "runtime.lockWorn.tip": "When a matching item is worn, freeze permission and dangerous-mode settings and protect that item's local rules/cache.",
    "runtime.lockWorn.active.tip": "This lock is active because a matching item is worn. Use Diagnostics / Advanced reset if you need to clear it.",
    "runtime.foreign": "Allow rules from other people's items",
    "runtime.foreign.tip": "When disabled, remote cache and remote requests are ignored.",
    "runtime.respond": "Respond to rule requests",
    "runtime.respond.tip": "Allow others to request payloads for your registered non-self-only items.",
    "runtime.request": "Auto request remote rules",
    "runtime.request.tip": "Request missing payloads for other people's crafted items.",
    "runtime.cacheDetails": "Cache: crafter {crafter} / rules {rules}",
    "runtime.noCache": "No cached remote item rules.",
    "runtime.deleteCache": "Delete Cache",
    "runtime.deleteCache.tip": "Delete this cached remote item payload.",
    "runtime.clearCache": "Clear Cache",
    "runtime.clearCache.tip": "Delete all cached remote item rules.",
    "runtime.lockedCache.tip": "This cache belongs to a currently worn item and is protected by the worn item lock.",
    "runtime.lockedCache.clear.tip": "Clear cache is disabled while any currently worn item cache is protected.",
    "runtime.lockedRegistry.tip": "Import is disabled while a currently worn registered item is protected.",
    "runtime.exportRules": "Export Rules",
    "runtime.exportRules.tip": "Copy registered item rules JSON.",
    "runtime.importRules": "Import Rules",
    "runtime.importRules.tip": "Merge registered item rules JSON from a prompt.",
    "runtime.exportSettings": "Export Settings",
    "runtime.exportSettings.tip": "Copy BCXIR settings JSON.",
    "runtime.importSettings": "Import Settings",
    "runtime.importSettings.tip": "Import BCXIR settings JSON.",
    "runtime.confirm.clearCache": "Clear all remote cache?",
    "runtime.prompt.registry": "Paste registry backup JSON:",
    "runtime.prompt.settings": "Paste BCXIR settings JSON:",
    "runtime.prompt.export": "BCXIR export JSON:",
    "danger.title": "BCXIR Dangerous Mode",
    "danger.warning": "Dangerous Mode is for stronger item-rule roleplay.",
    "danger.warning.tip": "Leave this off unless you intentionally want item rules to override more of your normal BCX safety choices.",
    "danger.master": "Enable Dangerous Mode",
    "danger.master.tip": "Unlocks the two risky options below. Turning this off also turns both options off.",
    "danger.useMe": "Enable Please use me",
    "danger.useMe.tip": "Adds Please use me to Runtime permissions. In that mode, item rules are treated as something you consented to apply to yourself.",
    "danger.useMe.disabled.tip": "Enable Dangerous Mode first.",
    "danger.replaceInactive": "Enable Replacement Mode",
    "danger.replaceInactive.tip": "Lets BCXIR temporarily replace an existing same-name rule only when that rule is currently turned off, then restore it later.",
    "danger.replaceInactive.disabled.tip": "Enable Dangerous Mode first.",
    "danger.summary": "Active existing rules are still protected and will not be overwritten.",
    "danger.locked.tip": "Dangerous Mode settings are locked while a protected BCXIR item is worn.",
    "danger.confirm.master": "Enable Dangerous Mode? This only unlocks the risky options; it does not enable them yet.",
    "danger.confirm.useMe": "Enable Please use me? When selected in Runtime, item rules may apply to you even when normal BCX self-permission checks would block them. Existing active rules are still protected.",
    "danger.confirm.replaceInactive": "Enable Replacement Mode? BCXIR may temporarily replace a matching rule that already exists but is turned off, then restore it later.",
    "diagnostics.title": "BCXIR Diagnostics / Advanced",
    "diagnostics.bcx": "BCX: {bcx} / Authoring: {authoring}",
    "diagnostics.sync": "Sync: {result} / {reason}",
    "diagnostics.counts": "Payloads: {payloads} / Managed rules: {managed} / Pending: {pending}",
    "diagnostics.conflicts": "Show conflict messages",
    "diagnostics.conflicts.tip": "Display local messages for rule conflicts.",
    "diagnostics.invalid": "Show invalid payload messages",
    "diagnostics.invalid.tip": "Display local messages for malformed payloads.",
    "diagnostics.transport": "Show transport messages",
    "diagnostics.transport.tip": "Display local messages when remote payloads are received.",
    "diagnostics.debug": "Debug logging",
    "diagnostics.debug.tip": "Write BCXIR troubleshooting details to the console.",
    "diagnostics.fallback": "Enable fallback sync",
    "diagnostics.fallback.tip": "Run a low-frequency safety scan in addition to hook-triggered syncs.",
    "diagnostics.cachedOffline": "Allow cached offline creator",
    "diagnostics.cachedOffline.tip": "Use trusted cache to create a minimal local creator identity for BCX checks.",
    "diagnostics.locked.tip": "This setting is locked while a protected BCXIR item is worn.",
    "diagnostics.lockedRegistry.tip": "Registered rules for a currently worn item are protected. Reset settings first if you need to remove the lock.",
    "diagnostics.useMeUnlock": 'Unlock "Please use me"',
    "diagnostics.useMeUnlock.tip": "Advanced risky mode: lets BCXIR apply item rules to you through a local operator even when normal BCX permission checks would block it.",
    "diagnostics.suspendInactive": "Suspend inactive conflicts",
    "diagnostics.suspendInactive.tip": "Only in Please use me mode: if an existing same-name rule is inactive, temporarily replace it and restore it when the item rule is removed.",
    "diagnostics.syncNow": "Sync Now",
    "diagnostics.syncNow.tip": "Run a BCXIR sync immediately.",
    "diagnostics.retry": "Retry Requests",
    "diagnostics.retry.tip": "Clear request cooldowns and run sync.",
    "diagnostics.report": "Copy Report",
    "diagnostics.report.tip": "Copy a diagnostic summary.",
    "diagnostics.cancelAuth": "Cancel Auth",
    "diagnostics.cancelAuth.tip": "Cancel the current authoring session.",
    "diagnostics.reset": "Reset",
    "diagnostics.reset.tip": "Reset BCXIR settings.",
    "diagnostics.deleteRules": "Delete Rules",
    "diagnostics.deleteRules.tip": "Delete local item-rule registry.",
    "diagnostics.disableCleanup": "Disable + Cleanup",
    "diagnostics.disableCleanup.tip": "Disable runtime and release managed rules.",
    "diagnostics.disableSharing": "Disable Sharing",
    "diagnostics.disableSharing.tip": "Disable responding to and requesting remote item rules.",
    "diagnostics.confirm.cachedOffline": "Change cached offline creator behavior?",
    "diagnostics.confirm.useMeUnlock": "Unlock Please use me mode? This is advanced and risky. BCXIR may apply item rules to you through a local operator even when normal BCX permission checks would block them. Existing active or unmanaged rules will still not be overwritten.",
    "diagnostics.confirm.suspendInactive": "Allow BCXIR to temporarily replace existing inactive same-name rules in Please use me mode? Active rules will still not be overwritten.",
    "diagnostics.confirm.reset": "Reset BCXIR settings?",
    "diagnostics.confirm.deleteRules": "Delete all registered item rules?",
    "diagnostics.confirm.disableCleanup": "Disable BCXIR and release managed rules?",
    "diagnostics.confirm.disableSharing": "Disable all BCXIR remote sharing?",
    "diagnostics.prompt.report": "BCXIR diagnostic report:"
  };
  const ZH_CN = {
    "extension.button": "BCXIR 设置",
    "common.back": "返回",
    "common.previous": "上一个",
    "common.next": "下一个",
    "common.previousNext": "上一个 / 下一个",
    "common.unknown": "未知",
    "common.available": "可用",
    "common.unavailable": "不可用",
    "common.none": "无",
    "common.notRun": "未运行",
    "settings.title": "BCXIR 设置",
    "settings.exit": "退出",
    "settings.tooltip.back": "返回 BCXIR 设置。",
    "main.status": "运行状态：{status}",
    "main.counts": "道具：{registered} 个已注册 / {cached} 个缓存",
    "main.sync": "上次同步：{result} / 待请求：{pending}",
    "main.enable": "启用 BCXIR",
    "main.enable.tip": "关闭后，BCXIR 会释放自己管理的规则，并停止应用道具规则。",
    "main.itemRules": "道具规则",
    "main.itemRules.tip": "注册制作道具名称并编辑 BCXIR 规则。",
    "main.runtime": "运行 / 分享 / 备份",
    "main.runtime.tip": "配置权限、分享、缓存与备份。",
    "main.danger": "危险模式",
    "main.danger.tip": "开启有风险的规则行为。不确定时请保持关闭。",
    "main.diagnostics": "诊断",
    "main.diagnostics.tip": "查看同步状态，并使用排错或清理工具。",
    "item.title": "BCXIR 道具规则",
    "item.delete.tip": "删除道具规则",
    "item.create.tip": "创建新道具规则",
    "item.empty": "还没有 BCXIR 道具...",
    "item.name": "道具名称：",
    "item.name.tip": "用于匹配穿戴道具的制作名称或关键词。",
    "item.enabled": "启用：",
    "item.enabled.tip": "关闭后，此注册道具不会响应请求，也不会应用规则。",
    "item.selfOnly": "仅对自己生效：",
    "item.selfOnly.tip": "开启后，此道具不会向其他玩家返回规则。",
    "item.rulesUpdated": "规则：{rules} / 更新：{updated}",
    "item.edit": "编辑 BCX 规则",
    "item.edit.tip": "打开此道具的虚拟 BCX 角色规则编辑器。",
    "item.locked.tip": "此注册道具正在被穿戴，已受穿戴锁保护。",
    "item.createFirst": "先创建一个道具规则条目。",
    "item.defaultName": "BCXIR 道具 {index}",
    "runtime.title": "BCXIR 运行 / 分享 / 备份",
    "runtime.permissionMode": "权限模式：",
    "runtime.permissionMode.tip": "选择 BCXIR 应用道具规则时使用的身份。有风险的“请使用我”选项需要先在危险模式中开启。",
    "runtime.permissionMode.locked.tip": "受保护的 BCXIR 道具正在被穿戴，此项已锁定。可在诊断 / 高级中重置设置来清除锁。",
    "runtime.permission.creator": "道具制作者",
    "runtime.permission.self": "自己",
    "runtime.permission.useMe": "请使用我",
    "runtime.lockWorn": "锁定已穿戴道具设置",
    "runtime.lockWorn.tip": "穿戴匹配道具时，冻结权限和危险模式设置，并保护该道具的本地规则/缓存。",
    "runtime.lockWorn.active.tip": "因为正在穿戴匹配道具，此锁已生效。如需清除，请在诊断 / 高级中重置设置。",
    "runtime.foreign": "允许他人的道具规则影响自己",
    "runtime.foreign.tip": "关闭后，将忽略远端缓存和远端规则请求。",
    "runtime.respond": "响应规则请求",
    "runtime.respond.tip": "允许他人请求你注册的、非仅自己生效的道具规则。",
    "runtime.request": "自动请求远端规则",
    "runtime.request.tip": "为其他玩家制作的道具请求缺失的规则数据。",
    "runtime.cacheDetails": "缓存：制作者 {crafter} / 规则 {rules}",
    "runtime.noCache": "没有已缓存的远端道具规则。",
    "runtime.deleteCache": "删除缓存",
    "runtime.deleteCache.tip": "删除当前缓存的远端道具规则。",
    "runtime.clearCache": "清空缓存",
    "runtime.clearCache.tip": "删除所有远端道具规则缓存。",
    "runtime.lockedCache.tip": "此缓存属于当前穿戴的道具，已受穿戴锁保护。",
    "runtime.lockedCache.clear.tip": "有当前穿戴道具的缓存受保护时，不能清空缓存。",
    "runtime.lockedRegistry.tip": "有当前穿戴的注册道具受保护时，不能导入规则。",
    "runtime.exportRules": "导出规则",
    "runtime.exportRules.tip": "复制已注册道具规则 JSON。",
    "runtime.importRules": "导入规则",
    "runtime.importRules.tip": "从提示框合并已注册道具规则 JSON。",
    "runtime.exportSettings": "导出设置",
    "runtime.exportSettings.tip": "复制 BCXIR 设置 JSON。",
    "runtime.importSettings": "导入设置",
    "runtime.importSettings.tip": "导入 BCXIR 设置 JSON。",
    "runtime.confirm.clearCache": "清空所有远端缓存？",
    "runtime.prompt.registry": "粘贴规则注册表备份 JSON：",
    "runtime.prompt.settings": "粘贴 BCXIR 设置 JSON：",
    "runtime.prompt.export": "BCXIR 导出 JSON：",
    "danger.title": "BCXIR 危险模式",
    "danger.warning": "危险模式用于更强势的道具规则扮演。",
    "danger.warning.tip": "除非你明确希望道具规则绕过更多普通 BCX 安全选择，否则请保持关闭。",
    "danger.master": "启用危险模式",
    "danger.master.tip": "解锁下面两个有风险的选项。关闭它也会同时关闭这两个选项。",
    "danger.useMe": "启用“请使用我”",
    "danger.useMe.tip": "在运行权限中加入“请使用我”。选择该模式后，道具规则会被视为你同意应用到自己身上。",
    "danger.useMe.disabled.tip": "请先启用危险模式。",
    "danger.replaceInactive": "启用替换模式",
    "danger.replaceInactive.tip": "只在同名现有规则处于关闭状态时，允许 BCXIR 临时替换它，并在之后恢复。",
    "danger.replaceInactive.disabled.tip": "请先启用危险模式。",
    "danger.summary": "已有 active 规则仍会被保护，不会被覆盖。",
    "danger.locked.tip": "受保护的 BCXIR 道具正在被穿戴，危险模式设置已锁定。",
    "danger.confirm.master": "启用危险模式？这只会解锁有风险的选项，不会直接启用它们。",
    "danger.confirm.useMe": "启用“请使用我”？当你在运行设置中选择它后，道具规则可能在普通 BCX 自我权限检查会阻止时仍应用到你身上。已有 active 规则仍会被保护。",
    "danger.confirm.replaceInactive": "启用替换模式？BCXIR 可能会临时替换一个已经存在但关闭的同名规则，并在之后恢复它。",
    "diagnostics.title": "BCXIR 诊断 / 高级",
    "diagnostics.bcx": "BCX：{bcx} / 编辑：{authoring}",
    "diagnostics.sync": "同步：{result} / {reason}",
    "diagnostics.counts": "Payload：{payloads} / 管理规则：{managed} / 待请求：{pending}",
    "diagnostics.conflicts": "显示冲突提示",
    "diagnostics.conflicts.tip": "本地显示规则冲突消息。",
    "diagnostics.invalid": "显示无效 payload 提示",
    "diagnostics.invalid.tip": "本地显示格式错误 payload 的消息。",
    "diagnostics.transport": "显示通信提示",
    "diagnostics.transport.tip": "收到远端 payload 时本地显示消息。",
    "diagnostics.debug": "调试日志",
    "diagnostics.debug.tip": "向控制台写入 BCXIR 排错信息。",
    "diagnostics.fallback": "启用兜底同步",
    "diagnostics.fallback.tip": "除 hook 触发同步外，低频运行安全扫描。",
    "diagnostics.cachedOffline": "允许缓存的离线制作者",
    "diagnostics.cachedOffline.tip": "使用可信缓存创建最小本地制作者身份，以便 BCX 权限检查。",
    "diagnostics.locked.tip": "受保护的 BCXIR 道具正在被穿戴，此设置已锁定。",
    "diagnostics.lockedRegistry.tip": "当前穿戴道具的注册规则受保护。如需移除此锁，请先重置设置。",
    "diagnostics.useMeUnlock": "解锁“请使用我”",
    "diagnostics.useMeUnlock.tip": "高级风险模式：允许 BCXIR 通过本地临时操作者把道具规则应用到你身上，即使普通 BCX 权限检查会阻止。",
    "diagnostics.suspendInactive": "挂起 inactive 冲突",
    "diagnostics.suspendInactive.tip": "仅在“请使用我”模式中生效：如果同名现有规则处于 inactive，则临时替换它，并在道具规则移除时恢复。",
    "diagnostics.syncNow": "立即同步",
    "diagnostics.syncNow.tip": "立刻运行一次 BCXIR 同步。",
    "diagnostics.retry": "重试请求",
    "diagnostics.retry.tip": "清除请求冷却并运行同步。",
    "diagnostics.report": "复制报告",
    "diagnostics.report.tip": "复制诊断摘要。",
    "diagnostics.cancelAuth": "取消编辑",
    "diagnostics.cancelAuth.tip": "取消当前规则编辑会话。",
    "diagnostics.reset": "重置",
    "diagnostics.reset.tip": "重置 BCXIR 设置。",
    "diagnostics.deleteRules": "删除规则",
    "diagnostics.deleteRules.tip": "删除本地道具规则注册表。",
    "diagnostics.disableCleanup": "禁用并清理",
    "diagnostics.disableCleanup.tip": "禁用运行时并释放已管理规则。",
    "diagnostics.disableSharing": "禁用分享",
    "diagnostics.disableSharing.tip": "禁止响应和请求远端道具规则。",
    "diagnostics.confirm.cachedOffline": "更改缓存离线制作者行为？",
    "diagnostics.confirm.useMeUnlock": "解锁“请使用我”模式？这是高级风险功能。BCXIR 可能通过本地临时操作者把道具规则应用到你身上，即使普通 BCX 权限检查会阻止。已有 active 或非 BCXIR 管理规则仍不会被覆盖。",
    "diagnostics.confirm.suspendInactive": "允许 BCXIR 在“请使用我”模式中临时替换同名 inactive 规则？Active 规则仍不会被覆盖。",
    "diagnostics.confirm.reset": "重置 BCXIR 设置？",
    "diagnostics.confirm.deleteRules": "删除所有已注册道具规则？",
    "diagnostics.confirm.disableCleanup": "禁用 BCXIR 并释放已管理规则？",
    "diagnostics.confirm.disableSharing": "禁用所有 BCXIR 远端分享？",
    "diagnostics.prompt.report": "BCXIR 诊断报告："
  };
  function getI18nLanguage(root) {
    var _a, _b, _c, _d;
    const candidates = [
      getFunctionLanguage(root),
      root.TranslationLanguage,
      root.PreferenceLanguage,
      (_a = root.Player) == null ? void 0 : _a.Language,
      (_c = (_b = root.Player) == null ? void 0 : _b.OnlineSettings) == null ? void 0 : _c.Language,
      (_d = root.navigator) == null ? void 0 : _d.language
    ];
    const language = candidates.find((candidate) => typeof candidate === "string" && candidate.trim()) || "en";
    return /^zh\b|^cn\b/i.test(language) ? "zh-CN" : "en";
  }
  function t(root, key, values = {}) {
    const table = getI18nLanguage(root) === "zh-CN" ? ZH_CN : EN;
    const template = table[key] || EN[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      const value = values[name];
      return value === null || value === void 0 ? match : String(value);
    });
  }
  function getFunctionLanguage(root) {
    try {
      if (typeof root.CommonGetTranslationLanguage === "function") return root.CommonGetTranslationLanguage();
    } catch {
    }
    return void 0;
  }
  const _SettingsScreen = class _SettingsScreen {
    constructor(registry) {
      __publicField(this, "elementIds", /* @__PURE__ */ new Set());
      this.registry = registry;
    }
    get root() {
      return this.registry.root;
    }
    get title() {
      return this.t("settings.title");
    }
    load() {
    }
    unload() {
    }
    run() {
      const root = this.root;
      this.drawTitle();
      root.DrawButton(1815, 75, 90, 90, "", "White", "Icons/Exit.png", this.t("settings.exit"));
    }
    click() {
      if (this.mouseIn(1815, 75, 90, 90)) this.exit();
    }
    exit() {
      this.registry.exit();
    }
    mouseIn(x, y, w, h) {
      return this.root.MouseIn(x, y, w, h);
    }
    rowY(row) {
      return _SettingsScreen.START_Y + _SettingsScreen.ROW_H * row;
    }
    drawLabel(row, label, description) {
      const y = this.rowY(row);
      const hovering = this.mouseIn(_SettingsScreen.START_X, y - 32, _SettingsScreen.LABEL_W, 64);
      this.drawTextFitLeft(label, _SettingsScreen.START_X, y, _SettingsScreen.LABEL_W, hovering ? "Red" : "Black", "Gray");
      if (hovering && description) this.drawTooltip(description);
    }
    drawCheckbox(row, label, description, value, disabled = false) {
      const y = this.rowY(row);
      const labelX = _SettingsScreen.START_X;
      const boxX = _SettingsScreen.VALUE_X;
      const hovering = this.mouseIn(labelX, y - 32, _SettingsScreen.LABEL_W + 64, 64);
      this.drawTextFitLeft(label, labelX, y, _SettingsScreen.LABEL_W, hovering ? "Red" : "Black", "Gray");
      this.root.DrawCheckbox(boxX, y - 32, 64, 64, "", value, disabled);
      if (hovering) this.drawTooltip(description);
    }
    checkboxClicked(row) {
      return this.mouseIn(_SettingsScreen.VALUE_X, this.rowY(row) - 32, 64, 64);
    }
    drawButton(x, y, w, h, label, tooltip, disabled = false) {
      this.root.DrawButton(x, y, w, h, label, disabled ? "#ddd" : "White", "", tooltip || label, disabled);
    }
    drawRowButton(row, label, tooltip, disabled = false) {
      this.drawButton(_SettingsScreen.VALUE_X, this.rowY(row) - 32, 300, 64, label, tooltip, disabled);
    }
    drawSelector(row, label, description, value, disabled = false) {
      const y = this.rowY(row);
      const hovering = this.mouseIn(_SettingsScreen.START_X, y - 32, _SettingsScreen.LABEL_W + 420, 64);
      this.drawTextFitLeft(label, _SettingsScreen.START_X, y, _SettingsScreen.LABEL_W, hovering ? "Red" : "Black", "Gray");
      if (typeof this.root.DrawBackNextButton === "function") {
        this.root.DrawBackNextButton(_SettingsScreen.VALUE_X, y - 32, 360, 64, value, disabled ? "#ddd" : "White", "", () => this.t("common.previous"), () => this.t("common.next"), disabled);
      } else {
        this.root.DrawButton(_SettingsScreen.VALUE_X, y - 32, 360, 64, value, disabled ? "#ddd" : "White", "", this.t("common.previousNext"), disabled);
      }
      if (hovering) this.drawTooltip(description);
    }
    selectorClicked(row) {
      return this.mouseIn(_SettingsScreen.VALUE_X, this.rowY(row) - 32, 360, 64);
    }
    drawWideButton(row, label, tooltip, disabled = false) {
      this.drawButton(_SettingsScreen.START_X, this.rowY(row) - 32, 700, 64, label, tooltip, disabled);
    }
    wideButtonClicked(row) {
      return this.mouseIn(_SettingsScreen.START_X, this.rowY(row) - 32, 700, 64);
    }
    rowButtonClicked(row) {
      return this.mouseIn(_SettingsScreen.VALUE_X, this.rowY(row) - 32, 300, 64);
    }
    createTextInput(id, value = "", maxLength = "255") {
      var _a, _b;
      if ((_a = this.root.document) == null ? void 0 : _a.getElementById(id)) return;
      if (typeof this.root.ElementCreateInput === "function") {
        this.root.ElementCreateInput(id, "text", value, maxLength);
      } else if (this.root.document) {
        const input = this.root.document.createElement("input");
        input.id = id;
        input.type = "text";
        input.value = value;
        (_b = this.root.document.body) == null ? void 0 : _b.appendChild(input);
      }
      this.elementIds.add(id);
    }
    positionTextInput(id, row, label, description, width = 600) {
      const y = this.rowY(row);
      const hovering = this.mouseIn(_SettingsScreen.START_X, y - 32, _SettingsScreen.LABEL_W, 64);
      this.drawTextFitLeft(label, _SettingsScreen.START_X, y, _SettingsScreen.LABEL_W, hovering ? "Red" : "Black", "Gray");
      if (typeof this.root.ElementPosition === "function") {
        this.root.ElementPosition(id, _SettingsScreen.VALUE_X + width / 2, y, width);
      }
      if (hovering) this.drawTooltip(description);
    }
    hideElement(id) {
      if (typeof this.root.ElementPosition === "function") {
        this.root.ElementPosition(id, -9999, -9999, 1);
      }
    }
    elementValue(id) {
      var _a;
      if (typeof this.root.ElementValue === "function") return String(this.root.ElementValue(id) || "");
      const element = (_a = this.root.document) == null ? void 0 : _a.getElementById(id);
      return (element == null ? void 0 : element.value) || "";
    }
    setElementValue(id, value) {
      var _a;
      if (typeof this.root.ElementSetValue === "function") {
        this.root.ElementSetValue(id, value);
        return;
      }
      const element = (_a = this.root.document) == null ? void 0 : _a.getElementById(id);
      if (element) element.value = value;
    }
    drawTooltip(text) {
      this.withTextAlign("center", () => {
        this.root.DrawRect(300, 850, 1400, 65, "#FFFF88");
        this.root.DrawEmptyRect(300, 850, 1400, 65, "black", 2);
        this.root.DrawTextFit(text, 1e3, 883, 1360, "black");
      });
    }
    drawTitle() {
      this.drawTextFitLeft("- " + this.title + " -", 180, 130, 1200, "Black", "Gray");
    }
    drawTextFitLeft(text, leftX, y, width, color = "Black", outline) {
      this.withTextAlign("left", () => {
        this.root.DrawTextFit(text, leftX, y, width, color, outline);
      });
    }
    withTextAlign(align, callback) {
      const canvas = this.getGameCanvas();
      if (canvas && typeof canvas.save === "function" && typeof canvas.restore === "function") {
        canvas.save();
        canvas.textAlign = align;
        try {
          return callback();
        } finally {
          canvas.restore();
        }
      }
      const previousAlign = canvas == null ? void 0 : canvas.textAlign;
      if (canvas) canvas.textAlign = align;
      try {
        return callback();
      } finally {
        if (canvas && previousAlign) canvas.textAlign = previousAlign;
      }
    }
    getGameCanvas() {
      if (typeof MainCanvas !== "undefined" && MainCanvas) return MainCanvas;
      return this.root.MainCanvas;
    }
    cleanupElements() {
      var _a, _b;
      for (const id of this.elementIds) {
        if (typeof this.root.ElementRemove === "function") this.root.ElementRemove(id);
        else (_b = (_a = this.root.document) == null ? void 0 : _a.getElementById(id)) == null ? void 0 : _b.remove();
      }
      this.elementIds.clear();
    }
    t(key, values) {
      return t(this.root, key, values);
    }
  };
  __publicField(_SettingsScreen, "START_X", 550);
  __publicField(_SettingsScreen, "START_Y", 205);
  __publicField(_SettingsScreen, "ROW_H", 68);
  __publicField(_SettingsScreen, "LABEL_W", 600);
  __publicField(_SettingsScreen, "VALUE_X", 1180);
  let SettingsScreen = _SettingsScreen;
  const ROWS$3 = {
    status: 0,
    counts: 1,
    sync: 2,
    enabled: 3,
    itemRules: 4,
    runtime: 5,
    danger: 6,
    diagnostics: 7
  };
  class SettingsMainScreen extends SettingsScreen {
    constructor(registry, settingsStore, bcx, synchronizer, itemRuleTransport, onSettingsChanged) {
      super(registry);
      this.settingsStore = settingsStore;
      this.bcx = bcx;
      this.synchronizer = synchronizer;
      this.itemRuleTransport = itemRuleTransport;
      this.onSettingsChanged = onSettingsChanged;
    }
    run() {
      var _a;
      super.run();
      const settings = this.settingsStore.get();
      const sync = this.synchronizer.getDiagnostics();
      const transport = ((_a = this.itemRuleTransport) == null ? void 0 : _a.getDiagnostics()) || {};
      const bcxStatus = "BCX " + (this.bcx.canUseBCX() ? this.t("common.available") : this.t("common.unavailable"));
      const registryCount = listRegistryEntries(this.root).length;
      const cacheCount = listRuleCacheEntries(this.root).length;
      const syncStatus = String(sync.lastSyncResult || this.t("common.notRun"));
      this.drawLabel(ROWS$3.status, this.t("main.status", { status: bcxStatus }));
      this.drawLabel(ROWS$3.counts, this.t("main.counts", { registered: registryCount, cached: cacheCount }));
      this.drawLabel(ROWS$3.sync, this.t("main.sync", { result: syncStatus, pending: String(transport.pendingRequestCount || 0) }));
      this.drawCheckbox(
        ROWS$3.enabled,
        this.t("main.enable"),
        this.t("main.enable.tip"),
        settings.enabled
      );
      this.drawWideButton(ROWS$3.itemRules, this.t("main.itemRules"), this.t("main.itemRules.tip"));
      this.drawWideButton(ROWS$3.runtime, this.t("main.runtime"), this.t("main.runtime.tip"));
      this.drawWideButton(ROWS$3.danger, this.t("main.danger"), this.t("main.danger.tip"));
      this.drawWideButton(ROWS$3.diagnostics, this.t("main.diagnostics"), this.t("main.diagnostics.tip"));
    }
    click() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      super.click();
      const settings = this.settingsStore.get();
      if (this.checkboxClicked(ROWS$3.enabled)) this.update({ enabled: !settings.enabled });
      if (this.wideButtonClicked(ROWS$3.itemRules)) (_b = (_a = this.registry).setScreen) == null ? void 0 : _b.call(_a, "itemRules");
      if (this.wideButtonClicked(ROWS$3.runtime)) (_d = (_c = this.registry).setScreen) == null ? void 0 : _d.call(_c, "runtime");
      if (this.wideButtonClicked(ROWS$3.danger)) (_f = (_e = this.registry).setScreen) == null ? void 0 : _f.call(_e, "danger");
      if (this.wideButtonClicked(ROWS$3.diagnostics)) (_h = (_g = this.registry).setScreen) == null ? void 0 : _h.call(_g, "diagnostics");
    }
    update(patch) {
      this.settingsStore.update(patch);
      this.onSettingsChanged();
    }
  }
  const NAME_INPUT_ID = "bcxir-item-rules-name";
  class SettingsItemRulesScreen extends SettingsScreen {
    constructor(registry, settingsStore, synchronizer, authoring, initialItemName) {
      super(registry);
      __publicField(this, "entries", []);
      __publicField(this, "index", 0);
      this.settingsStore = settingsStore;
      this.synchronizer = synchronizer;
      this.authoring = authoring;
      this.initialItemName = initialItemName;
    }
    get title() {
      return this.t("item.title");
    }
    load() {
      this.createTextInput(NAME_INPUT_ID, "");
      this.reloadEntries();
      this.selectInitialItem();
      this.loadCurrentIntoElements();
    }
    unload() {
      this.saveCurrent();
      this.cleanupElements();
    }
    run() {
      var _a, _b, _c, _d;
      super.run();
      const current = this.currentEntry;
      const currentLocked = current ? !canModifyRegisteredItem(this.root, this.settingsStore.get(), current.itemName) : false;
      this.root.MainCanvas.textAlign = "center";
      if (current) {
        if (typeof this.root.DrawBackNextButton === "function") {
          this.root.DrawBackNextButton(550, this.rowY(0) - 32, 600, 64, current.itemName, "White", "", () => this.t("common.previous"), () => this.t("common.next"));
        } else {
          this.root.DrawButton(550, this.rowY(0) - 32, 600, 64, current.itemName, "White", "", this.t("common.previousNext"));
        }
        this.root.DrawButton(1180 - 4, this.rowY(0) - 32 - 4, 72, 72, "", currentLocked ? "#ddd" : "White", "", currentLocked ? this.t("item.locked.tip") : this.t("item.delete.tip"), currentLocked);
        (_b = (_a = this.root).DrawImageResize) == null ? void 0 : _b.call(_a, "Icons/Trash.png", 1180, this.rowY(0) - 32, 64, 64);
      } else {
        this.root.DrawTextFit(this.t("item.empty"), 780, this.rowY(0), 600, "#CBC3E3", "Black");
      }
      this.root.DrawButton(1340 - 4, this.rowY(0) - 32 - 4, 72, 72, "", "White", "", this.t("item.create.tip"));
      (_d = (_c = this.root).DrawImageResize) == null ? void 0 : _d.call(_c, "Icons/Plus.png", 1340, this.rowY(0) - 32, 64, 64);
      this.root.MainCanvas.textAlign = "left";
      if (current) {
        this.positionTextInput(NAME_INPUT_ID, 2, this.t("item.name"), currentLocked ? this.t("item.locked.tip") : this.t("item.name.tip"), 600);
        this.drawCheckbox(3, this.t("item.enabled"), currentLocked ? this.t("item.locked.tip") : this.t("item.enabled.tip"), current.enabled, currentLocked);
        this.drawCheckbox(4, this.t("item.selfOnly"), currentLocked ? this.t("item.locked.tip") : this.t("item.selfOnly.tip"), current.selfOnly, currentLocked);
        this.drawLabel(5, this.t("item.rulesUpdated", { rules: current.payload.r.length, updated: this.formatDate(current.updatedAt) }));
        this.drawRowButton(6, this.t("item.edit"), currentLocked ? this.t("item.locked.tip") : this.t("item.edit.tip"), currentLocked);
      } else {
        this.hideElement(NAME_INPUT_ID);
        this.drawLabel(2, this.t("item.createFirst"));
      }
      this.drawRowButton(7, this.t("common.back"), this.t("settings.tooltip.back"));
    }
    click() {
      var _a, _b, _c, _d;
      super.click();
      const current = this.currentEntry;
      const currentLocked = current ? !canModifyRegisteredItem(this.root, this.settingsStore.get(), current.itemName) : false;
      if (current && this.root.MouseIn(550, this.rowY(0) - 32, 600, 64)) {
        this.saveCurrent();
        this.index = this.getNewIndexFromNextPrevClick(850, this.index, this.entries.length);
        this.loadCurrentIntoElements();
        return;
      }
      if (current && !currentLocked && this.root.MouseIn(1180, this.rowY(0) - 32, 64, 64)) {
        deleteRegisteredItem(this.root, current.itemName);
        this.synchronizer.scheduleSync("settings-item-delete");
        this.reloadEntries();
        this.loadCurrentIntoElements();
        return;
      }
      if (this.root.MouseIn(1340, this.rowY(0) - 32, 64, 64)) {
        this.saveCurrent();
        const entry = registerItemRules(this.root, this.makeNewItemName(), this.makeEmptyPayload());
        this.synchronizer.scheduleSync("settings-item-create");
        this.reloadEntries();
        this.index = this.entries.findIndex((candidate) => candidate.id === entry.id);
        this.loadCurrentIntoElements();
        return;
      }
      if (current && !currentLocked && this.checkboxClicked(3)) {
        updateRegisteredItem(this.root, current.itemName, { enabled: !current.enabled });
        this.synchronizer.scheduleSync("settings-item-toggle");
        this.reloadEntries();
        this.loadCurrentIntoElements();
        return;
      }
      if (current && !currentLocked && this.checkboxClicked(4)) {
        updateRegisteredItem(this.root, current.itemName, { selfOnly: !current.selfOnly });
        this.synchronizer.scheduleSync("settings-item-self-only");
        this.reloadEntries();
        this.loadCurrentIntoElements();
        return;
      }
      if (current && !currentLocked && this.rowButtonClicked(6)) {
        this.saveCurrent();
        const itemName = ((_a = this.currentEntry) == null ? void 0 : _a.itemName) || current.itemName;
        void ((_b = this.authoring) == null ? void 0 : _b.open({ itemName, returnTo: "settingsItemRules" }));
        return;
      }
      if (this.rowButtonClicked(7)) {
        this.saveCurrent();
        (_d = (_c = this.registry).setScreen) == null ? void 0 : _d.call(_c, "main");
      }
    }
    get currentEntry() {
      return this.entries[this.index] || null;
    }
    reloadEntries() {
      this.entries = listRegistryEntries(this.root).sort((a, b) => a.itemName.localeCompare(b.itemName));
      if (this.index >= this.entries.length) this.index = Math.max(0, this.entries.length - 1);
    }
    selectInitialItem() {
      var _a;
      const itemName = (_a = this.initialItemName) == null ? void 0 : _a.trim().toLocaleLowerCase();
      if (!itemName) return;
      const index = this.entries.findIndex((entry) => entry.itemName.toLocaleLowerCase() === itemName);
      if (index >= 0) this.index = index;
    }
    loadCurrentIntoElements() {
      var _a;
      this.setElementValue(NAME_INPUT_ID, ((_a = this.currentEntry) == null ? void 0 : _a.itemName) || "");
    }
    saveCurrent() {
      const current = this.currentEntry;
      if (!current) return;
      if (!canModifyRegisteredItem(this.root, this.settingsStore.get(), current.itemName)) return;
      const itemName = this.elementValue(NAME_INPUT_ID).trim();
      if (!itemName || itemName === current.itemName) return;
      const updated = updateRegisteredItem(this.root, current.itemName, { itemName });
      if (!updated) return;
      this.synchronizer.scheduleSync("settings-item-rename");
      this.reloadEntries();
      this.index = this.entries.findIndex((entry) => entry.id === updated.id);
      if (this.index < 0) this.index = 0;
    }
    makeNewItemName() {
      let index = this.entries.length + 1;
      const names = new Set(this.entries.map((entry) => entry.itemName.toLocaleLowerCase()));
      while (names.has(this.t("item.defaultName", { index }).toLocaleLowerCase())) index += 1;
      return this.t("item.defaultName", { index });
    }
    makeEmptyPayload() {
      return {
        v: 1,
        id: "registry:empty:" + Date.now(),
        r: []
      };
    }
    getNewIndexFromNextPrevClick(midpoint, currentIndex, listLength) {
      if (listLength <= 0) return 0;
      const mouseX = Number(this.root.MouseX);
      if (mouseX <= midpoint) return (listLength + currentIndex - 1) % listLength;
      return (currentIndex + 1) % listLength;
    }
    formatDate(value) {
      if (!Number.isFinite(value) || value <= 0) return this.t("common.unknown");
      try {
        return new Date(value).toLocaleDateString();
      } catch {
        return String(value);
      }
    }
  }
  const ROWS$2 = {
    permissionMode: 0,
    lockWorn: 1,
    foreign: 2,
    respond: 3,
    request: 4,
    back: 7
  };
  const CACHE_ACTIONS = {
    deleteEntry: { col: 0, labelKey: "runtime.deleteCache", tooltipKey: "runtime.deleteCache.tip" },
    clearCache: { col: 1, labelKey: "runtime.clearCache", tooltipKey: "runtime.clearCache.tip" }
  };
  const REGISTRY_ACTIONS = {
    exportRules: { col: 0, labelKey: "runtime.exportRules", tooltipKey: "runtime.exportRules.tip" },
    importRules: { col: 1, labelKey: "runtime.importRules", tooltipKey: "runtime.importRules.tip" }
  };
  const SETTINGS_ACTIONS = {
    exportSettings: { col: 0, labelKey: "runtime.exportSettings", tooltipKey: "runtime.exportSettings.tip" },
    importSettings: { col: 1, labelKey: "runtime.importSettings", tooltipKey: "runtime.importSettings.tip" }
  };
  const LEFT_X$1 = 260;
  const LEFT_LABEL_W$1 = 420;
  const LEFT_SELECTOR_X = 700;
  const LEFT_SELECTOR_W = 280;
  const LEFT_CHECKBOX_X$1 = 916;
  const RIGHT_X$1 = 1120;
  const RIGHT_PANEL_W = 660;
  const RIGHT_BUTTON_W = 300;
  const RIGHT_GAP = 40;
  const RIGHT_SELECTOR_W = RIGHT_PANEL_W;
  const RIGHT_CACHE_ROW = 0;
  const RIGHT_CACHE_DETAIL_ROW = 1;
  const RIGHT_CACHE_ACTION_ROW = 2;
  const RIGHT_REGISTRY_ACTION_ROW = 4;
  const RIGHT_SETTINGS_ACTION_ROW = 5;
  class SettingsRuntimeScreen extends SettingsScreen {
    constructor(registry, settingsStore, synchronizer) {
      super(registry);
      __publicField(this, "cacheIndex", 0);
      this.settingsStore = settingsStore;
      this.synchronizer = synchronizer;
    }
    get title() {
      return this.t("runtime.title");
    }
    run() {
      super.run();
      const settings = this.settingsStore.get();
      const cacheEntries = listRuleCacheEntries(this.root);
      const currentCache = cacheEntries[this.cacheIndex] || null;
      const lockActive = isWornItemRuleLockActive(this.root, settings);
      const currentCacheLocked = currentCache ? !canModifyCacheEntry(this.root, settings, currentCache.cacheKey) : false;
      this.drawLeftSelector(
        ROWS$2.permissionMode,
        this.t("runtime.permissionMode"),
        lockActive ? this.t("runtime.permissionMode.locked.tip") : this.t("runtime.permissionMode.tip"),
        this.permissionModeLabel(settings.rulePermissionMode),
        lockActive
      );
      this.drawLeftCheckbox(
        ROWS$2.lockWorn,
        this.t("runtime.lockWorn"),
        lockActive ? this.t("runtime.lockWorn.active.tip") : this.t("runtime.lockWorn.tip"),
        settings.lockWornItemRules,
        lockActive
      );
      this.drawLeftCheckbox(ROWS$2.foreign, this.t("runtime.foreign"), this.t("runtime.foreign.tip"), settings.allowForeignItemRules);
      this.drawLeftCheckbox(ROWS$2.respond, this.t("runtime.respond"), this.t("runtime.respond.tip"), settings.respondToRuleRequests);
      this.drawLeftCheckbox(ROWS$2.request, this.t("runtime.request"), this.t("runtime.request.tip"), settings.autoRequestForeignRules, settings.allowForeignItemRules === false);
      if (currentCache) {
        this.drawCacheSelector(currentCache.itemName);
        this.drawRightLabel(RIGHT_CACHE_DETAIL_ROW, this.t("runtime.cacheDetails", { crafter: currentCache.crafter, rules: currentCache.payload.r.length }));
        this.drawCacheActions(Boolean(currentCache), currentCacheLocked, hasLockedCacheEntries(this.root, settings));
      } else {
        this.drawRightLabel(RIGHT_CACHE_ROW, this.t("runtime.noCache"));
        this.drawCacheActions(false, false, hasLockedCacheEntries(this.root, settings));
      }
      this.drawImportExportActions();
      this.drawButton(RIGHT_X$1 + RIGHT_PANEL_W - 300, this.rowY(ROWS$2.back) - 32, 300, 64, this.t("common.back"), this.t("settings.tooltip.back"));
    }
    click() {
      var _a, _b;
      super.click();
      const settings = this.settingsStore.get();
      const cacheEntries = listRuleCacheEntries(this.root);
      const currentCache = cacheEntries[this.cacheIndex] || null;
      const lockActive = isWornItemRuleLockActive(this.root, settings);
      if (!lockActive && this.leftSelectorClicked(ROWS$2.permissionMode)) {
        this.update({ rulePermissionMode: this.nextPermissionMode(settings.rulePermissionMode, settings.dangerModeEnabled && settings.unlockUseMeMode) });
      }
      if (!lockActive && this.leftCheckboxClicked(ROWS$2.lockWorn)) this.update({ lockWornItemRules: !settings.lockWornItemRules });
      if (this.leftCheckboxClicked(ROWS$2.foreign)) this.update({ allowForeignItemRules: !settings.allowForeignItemRules });
      if (this.leftCheckboxClicked(ROWS$2.respond)) this.update({ respondToRuleRequests: !settings.respondToRuleRequests });
      if (settings.allowForeignItemRules !== false && this.leftCheckboxClicked(ROWS$2.request)) this.update({ autoRequestForeignRules: !settings.autoRequestForeignRules });
      if (currentCache && this.mouseIn(RIGHT_X$1, this.rowY(RIGHT_CACHE_ROW) - 32, RIGHT_SELECTOR_W, 64)) {
        this.cacheIndex = this.getNewIndexFromNextPrevClick(this.cacheIndex, cacheEntries.length);
      }
      if (currentCache && canModifyCacheEntry(this.root, settings, currentCache.cacheKey) && this.actionClicked(RIGHT_CACHE_ACTION_ROW, CACHE_ACTIONS.deleteEntry)) {
        deleteCachedItemRules(this.root, currentCache.cacheKey);
        this.synchronizer.scheduleSync("runtime-cache-delete");
        this.cacheIndex = 0;
      }
      if (!hasLockedCacheEntries(this.root, settings) && this.actionClicked(RIGHT_CACHE_ACTION_ROW, CACHE_ACTIONS.clearCache) && this.confirm(this.t("runtime.confirm.clearCache"))) {
        clearRuleCache(this.root);
        this.synchronizer.scheduleSync("runtime-cache-clear");
        this.cacheIndex = 0;
      }
      if (this.actionClicked(RIGHT_REGISTRY_ACTION_ROW, REGISTRY_ACTIONS.exportRules)) this.copyJson(loadRegistry(this.root));
      if (!hasLockedRegistryEntries(this.root, settings) && this.actionClicked(RIGHT_REGISTRY_ACTION_ROW, REGISTRY_ACTIONS.importRules)) this.importRegistry();
      if (this.actionClicked(RIGHT_SETTINGS_ACTION_ROW, SETTINGS_ACTIONS.exportSettings)) this.copyJson(this.settingsStore.get());
      if (this.actionClicked(RIGHT_SETTINGS_ACTION_ROW, SETTINGS_ACTIONS.importSettings)) this.importSettings();
      if (this.mouseIn(RIGHT_X$1 + RIGHT_PANEL_W - 300, this.rowY(ROWS$2.back) - 32, 300, 64)) (_b = (_a = this.registry).setScreen) == null ? void 0 : _b.call(_a, "main");
    }
    update(patch) {
      this.settingsStore.update(patch);
      this.synchronizer.startFallbackTimer();
      this.synchronizer.scheduleSync("settings");
    }
    permissionModeLabel(mode) {
      if (mode === "useMe") return this.t("runtime.permission.useMe");
      return mode === "creator" ? this.t("runtime.permission.creator") : this.t("runtime.permission.self");
    }
    nextPermissionMode(mode, unlockUseMeMode) {
      const modes = unlockUseMeMode ? ["creator", "self", "useMe"] : ["creator", "self"];
      const index = modes.indexOf(mode);
      return modes[(index + 1) % modes.length];
    }
    drawLeftSelector(row, label, description, value, disabled = false) {
      const y = this.rowY(row);
      const hovering = this.mouseIn(LEFT_X$1, y - 32, LEFT_SELECTOR_X + LEFT_SELECTOR_W - LEFT_X$1, 64);
      this.drawTextFitLeft(label, LEFT_X$1, y, LEFT_LABEL_W$1, hovering ? "Red" : "Black", "Gray");
      if (typeof this.root.DrawBackNextButton === "function") {
        this.root.DrawBackNextButton(LEFT_SELECTOR_X, y - 32, LEFT_SELECTOR_W, 64, value, disabled ? "#ddd" : "White", "", () => this.t("common.previous"), () => this.t("common.next"), disabled);
      } else {
        this.root.DrawButton(LEFT_SELECTOR_X, y - 32, LEFT_SELECTOR_W, 64, value, disabled ? "#ddd" : "White", "", this.t("common.previousNext"), disabled);
      }
      if (hovering) this.drawTooltip(description);
    }
    drawLeftCheckbox(row, label, description, value, disabled = false) {
      const y = this.rowY(row);
      const hovering = this.mouseIn(LEFT_X$1, y - 32, LEFT_CHECKBOX_X$1 + 64 - LEFT_X$1, 64);
      this.drawTextFitLeft(label, LEFT_X$1, y, LEFT_LABEL_W$1, hovering ? "Red" : "Black", "Gray");
      this.root.DrawCheckbox(LEFT_CHECKBOX_X$1, y - 32, 64, 64, "", value, disabled);
      if (hovering) this.drawTooltip(description);
    }
    leftSelectorClicked(row) {
      return this.mouseIn(LEFT_SELECTOR_X, this.rowY(row) - 32, LEFT_SELECTOR_W, 64);
    }
    leftCheckboxClicked(row) {
      return this.mouseIn(LEFT_CHECKBOX_X$1, this.rowY(row) - 32, 64, 64);
    }
    drawCacheActions(hasCurrentCache, currentCacheLocked, clearLocked) {
      const y = this.rowY(RIGHT_CACHE_ACTION_ROW) - 32;
      this.drawButton(
        this.actionX(CACHE_ACTIONS.deleteEntry),
        y,
        RIGHT_BUTTON_W,
        64,
        this.t(CACHE_ACTIONS.deleteEntry.labelKey),
        currentCacheLocked ? this.t("runtime.lockedCache.tip") : this.t(CACHE_ACTIONS.deleteEntry.tooltipKey),
        !hasCurrentCache || currentCacheLocked
      );
      this.drawButton(
        this.actionX(CACHE_ACTIONS.clearCache),
        y,
        RIGHT_BUTTON_W,
        64,
        this.t(CACHE_ACTIONS.clearCache.labelKey),
        clearLocked ? this.t("runtime.lockedCache.clear.tip") : this.t(CACHE_ACTIONS.clearCache.tooltipKey),
        clearLocked
      );
    }
    drawImportExportActions() {
      const registryY = this.rowY(RIGHT_REGISTRY_ACTION_ROW) - 32;
      const settingsY = this.rowY(RIGHT_SETTINGS_ACTION_ROW) - 32;
      this.drawButton(this.actionX(REGISTRY_ACTIONS.exportRules), registryY, RIGHT_BUTTON_W, 64, this.t(REGISTRY_ACTIONS.exportRules.labelKey), this.t(REGISTRY_ACTIONS.exportRules.tooltipKey));
      const registryLocked = hasLockedRegistryEntries(this.root, this.settingsStore.get());
      this.drawButton(
        this.actionX(REGISTRY_ACTIONS.importRules),
        registryY,
        RIGHT_BUTTON_W,
        64,
        this.t(REGISTRY_ACTIONS.importRules.labelKey),
        registryLocked ? this.t("runtime.lockedRegistry.tip") : this.t(REGISTRY_ACTIONS.importRules.tooltipKey),
        registryLocked
      );
      this.drawButton(this.actionX(SETTINGS_ACTIONS.exportSettings), settingsY, RIGHT_BUTTON_W, 64, this.t(SETTINGS_ACTIONS.exportSettings.labelKey), this.t(SETTINGS_ACTIONS.exportSettings.tooltipKey));
      this.drawButton(this.actionX(SETTINGS_ACTIONS.importSettings), settingsY, RIGHT_BUTTON_W, 64, this.t(SETTINGS_ACTIONS.importSettings.labelKey), this.t(SETTINGS_ACTIONS.importSettings.tooltipKey));
    }
    drawCacheSelector(itemName) {
      const y = this.rowY(RIGHT_CACHE_ROW) - 32;
      if (typeof this.root.DrawBackNextButton === "function") {
        this.root.DrawBackNextButton(RIGHT_X$1, y, RIGHT_SELECTOR_W, 64, itemName, "White", "", () => this.t("common.previous"), () => this.t("common.next"));
      } else {
        this.root.DrawButton(RIGHT_X$1, y, RIGHT_SELECTOR_W, 64, itemName, "White", "", this.t("common.previousNext"));
      }
    }
    drawRightLabel(row, label) {
      this.drawTextFitLeft(label, RIGHT_X$1, this.rowY(row), RIGHT_PANEL_W, "Black", "Gray");
    }
    actionClicked(row, action) {
      return this.mouseIn(this.actionX(action), this.rowY(row) - 32, RIGHT_BUTTON_W, 64);
    }
    actionX(action) {
      return RIGHT_X$1 + action.col * (RIGHT_BUTTON_W + RIGHT_GAP);
    }
    importRegistry() {
      const input = this.promptJson(this.t("runtime.prompt.registry"));
      if (!input) return;
      const incoming = normalizeRegistryState(JSON.parse(input));
      const current = loadRegistry(this.root);
      for (const [key, entry] of Object.entries(incoming.entries)) {
        if (!canModifyRegisteredItem(this.root, this.settingsStore.get(), entry.itemName)) continue;
        if (!current.entries[key]) current.entries[key] = entry;
      }
      saveRegistry(this.root, current);
      this.synchronizer.scheduleSync("registry-import");
    }
    importSettings() {
      const input = this.promptJson(this.t("runtime.prompt.settings"));
      if (!input) return;
      this.settingsStore.update(JSON.parse(input));
      this.synchronizer.startFallbackTimer();
      this.synchronizer.scheduleSync("settings-import");
    }
    promptJson(message) {
      if (typeof this.root.prompt !== "function") return null;
      const input = this.root.prompt(message, "");
      return typeof input === "string" && input.trim() ? input.trim() : null;
    }
    copyJson(value) {
      var _a;
      const text = JSON.stringify(value, null, 2);
      const clipboard = (_a = this.root.navigator) == null ? void 0 : _a.clipboard;
      if (clipboard && typeof clipboard.writeText === "function") {
        void clipboard.writeText(text).catch(() => void 0);
        return;
      }
      if (typeof this.root.prompt === "function") this.root.prompt(this.t("runtime.prompt.export"), text);
    }
    confirm(message) {
      return typeof this.root.confirm === "function" ? this.root.confirm(message) === true : true;
    }
    getNewIndexFromNextPrevClick(currentIndex, listLength) {
      if (listLength <= 0) return 0;
      return Number(this.root.MouseX) <= RIGHT_X$1 + RIGHT_SELECTOR_W / 2 ? (listLength + currentIndex - 1) % listLength : (currentIndex + 1) % listLength;
    }
  }
  const ROWS$1 = {
    bcx: 0,
    sync: 1,
    counts: 2,
    messages1: 3,
    messages2: 4,
    transport: 5,
    debug: 6,
    fallback: 7,
    cachedOffline: 8
  };
  const ACTIONS = {
    syncNow: { col: 0, row: 0, labelKey: "diagnostics.syncNow", tooltipKey: "diagnostics.syncNow.tip" },
    retry: { col: 1, row: 0, labelKey: "diagnostics.retry", tooltipKey: "diagnostics.retry.tip" },
    report: { col: 0, row: 1, labelKey: "diagnostics.report", tooltipKey: "diagnostics.report.tip" },
    back: { col: 1, row: 1, labelKey: "common.back", tooltipKey: "settings.tooltip.back" }
  };
  const ADVANCED_ACTIONS = {
    reset: { col: 0, row: 3, labelKey: "diagnostics.reset", tooltipKey: "diagnostics.reset.tip" },
    deleteRegistry: { col: 1, row: 3, labelKey: "diagnostics.deleteRules", tooltipKey: "diagnostics.deleteRules.tip" },
    disableCleanup: { col: 0, row: 4, labelKey: "diagnostics.disableCleanup", tooltipKey: "diagnostics.disableCleanup.tip" },
    disableSharing: { col: 1, row: 4, labelKey: "diagnostics.disableSharing", tooltipKey: "diagnostics.disableSharing.tip" }
  };
  const LEFT_X = 380;
  const LEFT_LABEL_W = 560;
  const LEFT_CHECKBOX_X = 965;
  const RIGHT_X = 1090;
  const ACTION_W = 250;
  const ACTION_GAP = 24;
  const ACTION_ROW_H = 74;
  const ACTION_START_Y = 340;
  class SettingsDiagnosticsScreen extends SettingsScreen {
    constructor(registry, settingsStore, bcx, synchronizer, authoring, itemRuleTransport) {
      super(registry);
      this.settingsStore = settingsStore;
      this.bcx = bcx;
      this.synchronizer = synchronizer;
      this.authoring = authoring;
      this.itemRuleTransport = itemRuleTransport;
    }
    get title() {
      return this.t("diagnostics.title");
    }
    run() {
      var _a, _b;
      super.run();
      const settings = this.settingsStore.get();
      const sync = this.synchronizer.getDiagnostics();
      const transport = ((_a = this.itemRuleTransport) == null ? void 0 : _a.getDiagnostics()) || {};
      const authoring = (_b = this.authoring) == null ? void 0 : _b.getState();
      const lockActive = isWornItemRuleLockActive(this.root, settings);
      this.drawLeftLabel(ROWS$1.bcx, this.t("diagnostics.bcx", {
        bcx: this.bcx.canUseBCX() ? this.t("common.available") : this.t("common.unavailable"),
        authoring: (authoring == null ? void 0 : authoring.status) || this.t("common.none")
      }));
      this.drawLeftLabel(ROWS$1.sync, this.t("diagnostics.sync", {
        result: String(sync.lastSyncResult || this.t("common.notRun")),
        reason: String(sync.lastSyncReason || this.t("common.none"))
      }));
      this.drawLeftLabel(ROWS$1.counts, this.t("diagnostics.counts", {
        payloads: String(sync.activePayloadCount || 0),
        managed: String(sync.managedRuleCount || 0),
        pending: String(transport.pendingRequestCount || 0)
      }));
      this.drawLeftCheckbox(ROWS$1.messages1, this.t("diagnostics.conflicts"), this.t("diagnostics.conflicts.tip"), settings.showConflictMessages);
      this.drawLeftCheckbox(ROWS$1.messages2, this.t("diagnostics.invalid"), this.t("diagnostics.invalid.tip"), settings.showInvalidPayloadMessages);
      this.drawLeftCheckbox(ROWS$1.transport, this.t("diagnostics.transport"), this.t("diagnostics.transport.tip"), settings.showTransportMessages);
      this.drawLeftCheckbox(ROWS$1.debug, this.t("diagnostics.debug"), this.t("diagnostics.debug.tip"), settings.debugLogging);
      this.drawLeftCheckbox(ROWS$1.fallback, this.t("diagnostics.fallback"), this.t("diagnostics.fallback.tip"), settings.fallbackSyncEnabled);
      this.drawLeftCheckbox(
        ROWS$1.cachedOffline,
        this.t("diagnostics.cachedOffline"),
        lockActive ? this.t("diagnostics.locked.tip") : this.t("diagnostics.cachedOffline.tip"),
        settings.allowCachedOfflineCreator,
        lockActive
      );
      this.drawActionButtons();
      if ((authoring == null ? void 0 : authoring.status) && authoring.status !== "idle") {
        this.drawActionButton(ACTIONS.report, this.t("diagnostics.cancelAuth"), this.t("diagnostics.cancelAuth.tip"));
      }
      this.drawAdvancedActions();
    }
    click() {
      var _a, _b, _c, _d, _e, _f;
      super.click();
      const settings = this.settingsStore.get();
      if (this.leftCheckboxClicked(ROWS$1.messages1)) this.settingsStore.update({ showConflictMessages: !settings.showConflictMessages });
      if (this.leftCheckboxClicked(ROWS$1.messages2)) this.settingsStore.update({ showInvalidPayloadMessages: !settings.showInvalidPayloadMessages });
      if (this.leftCheckboxClicked(ROWS$1.transport)) this.settingsStore.update({ showTransportMessages: !settings.showTransportMessages });
      if (this.leftCheckboxClicked(ROWS$1.debug)) this.settingsStore.update({ debugLogging: !settings.debugLogging });
      if (this.leftCheckboxClicked(ROWS$1.fallback)) {
        this.settingsStore.update({ fallbackSyncEnabled: !settings.fallbackSyncEnabled });
        this.synchronizer.startFallbackTimer();
      }
      if (!isWornItemRuleLockActive(this.root, settings) && this.leftCheckboxClicked(ROWS$1.cachedOffline) && this.confirm(this.t("diagnostics.confirm.cachedOffline"))) {
        this.settingsStore.update({ allowCachedOfflineCreator: !settings.allowCachedOfflineCreator });
        this.synchronizer.scheduleSync("diagnostics-cached-offline");
      }
      if (this.actionClicked(ACTIONS.syncNow)) void this.synchronizer.syncNow("diagnostics");
      if (this.actionClicked(ACTIONS.retry)) {
        (_a = this.itemRuleTransport) == null ? void 0 : _a.clearCooldowns();
        this.synchronizer.scheduleSync("diagnostics-retry");
      }
      const authoring = (_b = this.authoring) == null ? void 0 : _b.getState();
      if (this.actionClicked(ACTIONS.report)) {
        if ((authoring == null ? void 0 : authoring.status) && authoring.status !== "idle") (_c = this.authoring) == null ? void 0 : _c.cancel();
        else this.copyReport();
      }
      if (this.actionClicked(ACTIONS.back)) (_e = (_d = this.registry).setScreen) == null ? void 0 : _e.call(_d, "main");
      if (this.advancedActionClicked(ADVANCED_ACTIONS.reset) && this.confirm(this.t("diagnostics.confirm.reset"))) this.settingsStore.save(DEFAULT_SETTINGS);
      if (!hasLockedRegistryEntries(this.root, settings) && this.advancedActionClicked(ADVANCED_ACTIONS.deleteRegistry) && this.confirm(this.t("diagnostics.confirm.deleteRules"))) {
        clearRegistry(this.root);
        this.synchronizer.scheduleSync("registry-clear");
      }
      if (this.advancedActionClicked(ADVANCED_ACTIONS.disableCleanup) && this.confirm(this.t("diagnostics.confirm.disableCleanup"))) {
        this.settingsStore.update({ enabled: false });
        void this.synchronizer.releaseManagedRules("diagnostics-disable");
      }
      if (this.advancedActionClicked(ADVANCED_ACTIONS.disableSharing) && this.confirm(this.t("diagnostics.confirm.disableSharing"))) {
        this.settingsStore.update({
          allowForeignItemRules: false,
          respondToRuleRequests: false,
          autoRequestForeignRules: false,
          showTransportMessages: false
        });
        (_f = this.itemRuleTransport) == null ? void 0 : _f.clearCooldowns();
        this.synchronizer.scheduleSync("diagnostics-disable-sharing");
      }
    }
    drawActionButtons() {
      this.drawActionButton(ACTIONS.syncNow, this.t(ACTIONS.syncNow.labelKey), this.t(ACTIONS.syncNow.tooltipKey));
      this.drawActionButton(ACTIONS.retry, this.t(ACTIONS.retry.labelKey), this.t(ACTIONS.retry.tooltipKey));
      this.drawActionButton(ACTIONS.report, this.t(ACTIONS.report.labelKey), this.t(ACTIONS.report.tooltipKey));
      this.drawActionButton(ACTIONS.back, this.t(ACTIONS.back.labelKey), this.t(ACTIONS.back.tooltipKey));
    }
    drawAdvancedActions() {
      this.drawActionButton(ADVANCED_ACTIONS.reset, this.t(ADVANCED_ACTIONS.reset.labelKey), this.t(ADVANCED_ACTIONS.reset.tooltipKey));
      const registryLocked = hasLockedRegistryEntries(this.root, this.settingsStore.get());
      this.drawActionButton(
        ADVANCED_ACTIONS.deleteRegistry,
        this.t(ADVANCED_ACTIONS.deleteRegistry.labelKey),
        registryLocked ? this.t("diagnostics.lockedRegistry.tip") : this.t(ADVANCED_ACTIONS.deleteRegistry.tooltipKey),
        registryLocked
      );
      this.drawActionButton(ADVANCED_ACTIONS.disableCleanup, this.t(ADVANCED_ACTIONS.disableCleanup.labelKey), this.t(ADVANCED_ACTIONS.disableCleanup.tooltipKey));
      this.drawActionButton(ADVANCED_ACTIONS.disableSharing, this.t(ADVANCED_ACTIONS.disableSharing.labelKey), this.t(ADVANCED_ACTIONS.disableSharing.tooltipKey));
    }
    drawActionButton(action, label, tooltip, disabled = false) {
      const { x, y } = this.actionRect(action);
      this.drawButton(x, y, ACTION_W, 64, label, tooltip, disabled);
    }
    actionClicked(action) {
      const { x, y } = this.actionRect(action);
      return this.mouseIn(x, y, ACTION_W, 64);
    }
    advancedActionClicked(action) {
      return this.actionClicked(action);
    }
    actionRect(action) {
      return {
        x: RIGHT_X + action.col * (ACTION_W + ACTION_GAP),
        y: ACTION_START_Y + action.row * ACTION_ROW_H
      };
    }
    drawLeftLabel(row, label, description) {
      const y = this.rowY(row);
      const hovering = this.mouseIn(LEFT_X, y - 32, LEFT_LABEL_W, 64);
      this.drawTextFitLeft(label, LEFT_X, y, LEFT_LABEL_W, hovering ? "Red" : "Black", "Gray");
      if (hovering && description) this.drawTooltip(description);
    }
    drawLeftCheckbox(row, label, description, value, disabled = false) {
      const y = this.rowY(row);
      const hovering = this.mouseIn(LEFT_X, y - 32, LEFT_LABEL_W + 64, 64);
      this.drawTextFitLeft(label, LEFT_X, y, LEFT_LABEL_W, hovering ? "Red" : "Black", "Gray");
      this.root.DrawCheckbox(LEFT_CHECKBOX_X, y - 32, 64, 64, "", value, disabled);
      if (hovering) this.drawTooltip(description);
    }
    leftCheckboxClicked(row) {
      return this.mouseIn(LEFT_CHECKBOX_X, this.rowY(row) - 32, 64, 64);
    }
    copyReport() {
      var _a, _b, _c;
      const text = JSON.stringify({
        settings: this.settingsStore.get(),
        sync: this.synchronizer.getDiagnostics(),
        transport: ((_a = this.itemRuleTransport) == null ? void 0 : _a.getDiagnostics()) || {},
        authoring: ((_b = this.authoring) == null ? void 0 : _b.getState()) || null,
        bcxAvailable: this.bcx.canUseBCX()
      }, null, 2);
      const clipboard = (_c = this.root.navigator) == null ? void 0 : _c.clipboard;
      if (clipboard && typeof clipboard.writeText === "function") void clipboard.writeText(text).catch(() => void 0);
      else if (typeof this.root.prompt === "function") this.root.prompt(this.t("diagnostics.prompt.report"), text);
    }
    confirm(message) {
      return typeof this.root.confirm === "function" ? this.root.confirm(message) === true : true;
    }
  }
  const ROWS = {
    intro: 0,
    master: 2,
    useMe: 3,
    replaceInactive: 4,
    summary: 6,
    back: 7
  };
  class SettingsDangerScreen extends SettingsScreen {
    constructor(registry, settingsStore, synchronizer) {
      super(registry);
      this.settingsStore = settingsStore;
      this.synchronizer = synchronizer;
    }
    get title() {
      return this.t("danger.title");
    }
    run() {
      super.run();
      const settings = this.settingsStore.get();
      const lockActive = isWornItemRuleLockActive(this.root, settings);
      this.drawLabel(ROWS.intro, this.t("danger.warning"), this.t("danger.warning.tip"));
      this.drawCheckbox(
        ROWS.master,
        this.t("danger.master"),
        lockActive ? this.t("danger.locked.tip") : this.t("danger.master.tip"),
        settings.dangerModeEnabled,
        lockActive
      );
      this.drawCheckbox(
        ROWS.useMe,
        this.t("danger.useMe"),
        lockActive ? this.t("danger.locked.tip") : settings.dangerModeEnabled ? this.t("danger.useMe.tip") : this.t("danger.useMe.disabled.tip"),
        settings.unlockUseMeMode,
        lockActive || !settings.dangerModeEnabled
      );
      this.drawCheckbox(
        ROWS.replaceInactive,
        this.t("danger.replaceInactive"),
        lockActive ? this.t("danger.locked.tip") : settings.dangerModeEnabled ? this.t("danger.replaceInactive.tip") : this.t("danger.replaceInactive.disabled.tip"),
        settings.useMeSuspendInactiveConflicts,
        lockActive || !settings.dangerModeEnabled
      );
      this.drawLabel(ROWS.summary, this.t("danger.summary"));
      this.drawRowButton(ROWS.back, this.t("common.back"), this.t("settings.tooltip.back"));
    }
    click() {
      var _a, _b, _c, _d;
      super.click();
      const settings = this.settingsStore.get();
      if (isWornItemRuleLockActive(this.root, settings)) {
        if (this.rowButtonClicked(ROWS.back)) (_b = (_a = this.registry).setScreen) == null ? void 0 : _b.call(_a, "main");
        return;
      }
      if (this.checkboxClicked(ROWS.master)) {
        if (settings.dangerModeEnabled) {
          this.settingsStore.update({
            dangerModeEnabled: false,
            unlockUseMeMode: false,
            useMeSuspendInactiveConflicts: false,
            rulePermissionMode: settings.rulePermissionMode === "useMe" ? "creator" : settings.rulePermissionMode
          });
          this.synchronizer.scheduleSync("danger-disable");
        } else if (this.confirm(this.t("danger.confirm.master"))) {
          this.settingsStore.update({ dangerModeEnabled: true });
        }
      }
      if (settings.dangerModeEnabled && this.checkboxClicked(ROWS.useMe)) {
        if (!settings.unlockUseMeMode && !this.confirm(this.t("danger.confirm.useMe"))) return;
        this.settingsStore.update({
          unlockUseMeMode: !settings.unlockUseMeMode,
          rulePermissionMode: settings.unlockUseMeMode && settings.rulePermissionMode === "useMe" ? "creator" : settings.rulePermissionMode
        });
        this.synchronizer.scheduleSync("danger-useme-toggle");
      }
      if (settings.dangerModeEnabled && this.checkboxClicked(ROWS.replaceInactive)) {
        if (!settings.useMeSuspendInactiveConflicts && !this.confirm(this.t("danger.confirm.replaceInactive"))) return;
        this.settingsStore.update({ useMeSuspendInactiveConflicts: !settings.useMeSuspendInactiveConflicts });
        this.synchronizer.scheduleSync("danger-replace-inactive");
      }
      if (this.rowButtonClicked(ROWS.back)) (_d = (_c = this.registry).setScreen) == null ? void 0 : _d.call(_c, "main");
    }
    confirm(message) {
      return typeof this.root.confirm === "function" ? this.root.confirm(message) === true : true;
    }
  }
  class SettingsRegistry {
    constructor(root, settingsStore, bcx, synchronizer, authoring, itemRuleTransport) {
      __publicField(this, "current", null);
      __publicField(this, "registered", false);
      __publicField(this, "registeredConfig", null);
      this.root = root;
      this.settingsStore = settingsStore;
      this.bcx = bcx;
      this.synchronizer = synchronizer;
      this.authoring = authoring;
      this.itemRuleTransport = itemRuleTransport;
    }
    register() {
      if (this.registered) return true;
      if (typeof this.root.PreferenceRegisterExtensionSetting !== "function") {
        console.warn("[BCXIR] Preference extension setting API is unavailable; settings menu not registered.");
        return false;
      }
      this.registeredConfig = {
        Identifier: "BCXIR",
        ButtonText: () => t(this.root, "extension.button"),
        Image: "Icons/Preference.png",
        load: () => this.load(),
        run: () => this.run(),
        click: () => this.click(),
        exit: () => this.exit(),
        unload: () => this.unload()
      };
      this.root.PreferenceRegisterExtensionSetting(this.registeredConfig);
      this.registered = true;
      return true;
    }
    open() {
      if (!this.registered && !this.register()) return false;
      this.load();
      if (typeof this.root.CommonSetScreen === "function") {
        try {
          this.root.CommonSetScreen("Character", "Preference");
        } catch (error) {
          console.warn("[BCXIR] Failed to open Preference screen.", error);
        }
      }
      return true;
    }
    restoreItemRules(itemName) {
      if (!this.registered && !this.register()) return false;
      this.enterNativeExtensionSetting(itemName);
      return true;
    }
    load() {
      this.setScreen("main");
    }
    run() {
      var _a;
      (_a = this.current) == null ? void 0 : _a.run();
    }
    click() {
      var _a;
      (_a = this.current) == null ? void 0 : _a.click();
    }
    exit() {
      this.clearScreen();
      if (typeof this.root.PreferenceSubscreenExtensionsClear === "function") {
        this.root.PreferenceSubscreenExtensionsClear();
      }
    }
    unload() {
      this.clearScreen();
    }
    setScreen(screenName, options = {}) {
      var _a;
      (_a = this.current) == null ? void 0 : _a.unload();
      if (screenName === "itemRules") {
        this.current = new SettingsItemRulesScreen(this, this.settingsStore, this.synchronizer, this.authoring, options.itemName);
      } else if (screenName === "runtime") {
        this.current = new SettingsRuntimeScreen(this, this.settingsStore, this.synchronizer);
      } else if (screenName === "diagnostics") {
        this.current = new SettingsDiagnosticsScreen(this, this.settingsStore, this.bcx, this.synchronizer, this.authoring, this.itemRuleTransport);
      } else if (screenName === "danger") {
        this.current = new SettingsDangerScreen(this, this.settingsStore, this.synchronizer);
      } else {
        this.current = new SettingsMainScreen(
          this,
          this.settingsStore,
          this.bcx,
          this.synchronizer,
          this.itemRuleTransport,
          () => {
            this.synchronizer.startFallbackTimer();
            this.synchronizer.scheduleSync("settings");
          }
        );
      }
      this.current.load();
    }
    enterNativeExtensionSetting(itemName) {
      let screenResult;
      if (typeof this.root.CommonSetScreen === "function") {
        try {
          screenResult = this.root.CommonSetScreen("Character", "Preference");
        } catch (error) {
          console.warn("[BCXIR] Failed to restore Preference screen.", error);
        }
      }
      this.afterMaybePromise(screenResult, () => this.openExtensionsSubscreen(itemName));
    }
    openExtensionsSubscreen(itemName) {
      try {
        if (typeof this.root.PreferenceOpenSubscreen === "function") {
          const openResult = this.root.PreferenceOpenSubscreen("Extensions");
          if (openResult && typeof openResult.then === "function") {
            void openResult.then(
              () => this.activateNativeExtensionSetting(itemName),
              (error) => {
                console.warn("[BCXIR] Failed to open Preference Extensions subscreen.", error);
                this.activateNativeExtensionSetting(itemName);
              }
            );
            return;
          }
        }
      } catch (error) {
        console.warn("[BCXIR] Failed to open Preference Extensions subscreen.", error);
      }
      this.activateNativeExtensionSetting(itemName);
    }
    activateNativeExtensionSetting(itemName) {
      var _a, _b;
      try {
        if (typeof this.root.PreferenceSubscreenExtensionsOpen === "function") {
          const openResult = this.root.PreferenceSubscreenExtensionsOpen("BCXIR");
          if (openResult && typeof openResult.then === "function") {
            void openResult.then(
              () => this.restoreItemRulesScreen(itemName),
              (error) => {
                console.warn("[BCXIR] Failed to open BCXIR extension setting.", error);
                this.restoreItemRulesScreen(itemName);
              }
            );
            return;
          }
          this.restoreItemRulesScreen(itemName);
          return;
        }
      } catch (error) {
        console.warn("[BCXIR] Failed to open BCXIR extension setting.", error);
      }
      (_b = (_a = this.registeredConfig) == null ? void 0 : _a.load) == null ? void 0 : _b.call(_a);
      this.restoreItemRulesScreen(itemName);
    }
    restoreItemRulesScreen(itemName) {
      this.setScreen("itemRules", { itemName });
    }
    afterMaybePromise(value, callback) {
      if (value && typeof value.then === "function") {
        void value.then(
          () => callback(),
          (error) => {
            console.warn("[BCXIR] Failed while changing Preference screen.", error);
            callback();
          }
        );
        return;
      }
      callback();
    }
    clearScreen() {
      var _a;
      (_a = this.current) == null ? void 0 : _a.unload();
      this.current = null;
    }
  }
  function conditionToEncodedRule(ruleId, condition) {
    var _a, _b, _c;
    if (!condition || condition.active !== true) return null;
    const rule = { k: ruleId };
    if (((_a = condition.data) == null ? void 0 : _a.enforce) === false) rule.e = 0;
    if (((_b = condition.data) == null ? void 0 : _b.log) === false) rule.l = 0;
    if (((_c = condition.data) == null ? void 0 : _c.customData) !== void 0) {
      if (!isPlainObject(condition.data.customData)) return null;
      rule.d = deepClone(condition.data.customData);
    }
    if (condition.requirements != null) rule.q = deepClone(condition.requirements);
    if (condition.timer != null) rule.t = Number(condition.timer);
    if (condition.timerRemove === true) rule.tr = 1;
    return rule;
  }
  function buildAuthoringPayload(id, entries) {
    const rules = entries.map(({ ruleId, condition }) => conditionToEncodedRule(ruleId, condition)).filter((rule) => rule !== null);
    return {
      v: 1,
      id,
      r: rules
    };
  }
  const READY_TIMEOUT_MS = 2e3;
  const READY_POLL_MS = 50;
  class VirtualBCXEndpoint {
    constructor(root, memberNumber, getStore) {
      __publicField(this, "active", false);
      __publicField(this, "ready", false);
      __publicField(this, "lastInboundType", null);
      __publicField(this, "lastOutboundType", null);
      __publicField(this, "lastQuery", null);
      __publicField(this, "messageCount", 0);
      __publicField(this, "queryCount", 0);
      this.root = root;
      this.memberNumber = memberNumber;
      this.getStore = getStore;
    }
    get bcxVersionReady() {
      return this.ready || this.getBCXVersion() !== null;
    }
    activate() {
      this.active = true;
      this.ready = false;
    }
    deactivate() {
      if (this.active) this.sendGoodbye();
      this.active = false;
      this.ready = false;
    }
    getDiagnostics() {
      return {
        bcxVersionReady: this.bcxVersionReady,
        lastInboundType: this.lastInboundType,
        lastOutboundType: this.lastOutboundType,
        lastQuery: this.lastQuery,
        messageCount: this.messageCount,
        queryCount: this.queryCount
      };
    }
    handleHiddenMessage(type, message) {
      if (!this.active) return;
      this.lastInboundType = "chat:" + type;
      this.messageCount += 1;
      switch (type) {
        case "hello":
          if ((message == null ? void 0 : message.request) === true) this.sendHello(false);
          break;
        case "goodbye":
          this.sendHello(false);
          break;
        case "query":
          this.answerQuery(message);
          break;
      }
    }
    handleBeep(type, message) {
      if (!this.active) return;
      this.lastInboundType = "beep:" + type;
      this.messageCount += 1;
      switch (type) {
        case "versionCheck":
          this.sendBeep("versionResponse", {
            status: "current",
            supporterStatus: void 0,
            supporterSecret: void 0
          });
          break;
        case "supporterCheck":
          this.sendBeep("supporterCheckResult", {
            memberNumber: typeof (message == null ? void 0 : message.memberNumber) === "number" ? message.memberNumber : this.memberNumber,
            status: void 0
          });
          break;
      }
    }
    sendHello(request = false) {
      if (!this.active) return;
      this.deliverHidden("hello", {
        version: this.getOwnBCXVersion(),
        request,
        effects: { Effect: [] },
        typingIndicatorEnable: false,
        screenIndicatorEnable: false
      });
    }
    sendSomethingChanged() {
      if (!this.active) return;
      this.deliverHidden("somethingChanged", void 0);
    }
    async waitUntilReady(timeoutMs = READY_TIMEOUT_MS) {
      const start = Date.now();
      this.sendHello(false);
      while (Date.now() - start <= timeoutMs) {
        if (this.getBCXVersion() !== null) {
          this.ready = true;
          return true;
        }
        await this.sleep(READY_POLL_MS);
      }
      return false;
    }
    answerQuery(query) {
      if (!query || typeof query.id !== "string" || typeof query.query !== "string") return;
      const answer = this.makeAnswer(query);
      this.deliverHidden("queryAnswer", answer);
    }
    makeAnswer(query) {
      try {
        this.lastQuery = query.query;
        this.queryCount += 1;
        const store = this.getStore();
        const result = store == null ? void 0 : store.handleQuery(query.query, query.data);
        if (result !== void 0 && this.isMutatingQuery(query.query)) {
          this.defer(() => this.sendSomethingChanged());
        }
        return {
          id: query.id,
          ok: result !== void 0,
          data: result
        };
      } catch (error) {
        return {
          id: query.id,
          ok: false,
          data: String(error instanceof Error ? error.message : error)
        };
      }
    }
    sendGoodbye() {
      this.deliverHidden("goodbye", void 0);
    }
    deliverHidden(type, message) {
      this.lastOutboundType = "chat:" + type;
      const data = {
        Type: "Hidden",
        Content: "BCXMsg",
        Sender: this.memberNumber,
        Dictionary: {
          type,
          message
        }
      };
      this.defer(() => {
        try {
          if (typeof this.root.ChatRoomMessage === "function") this.root.ChatRoomMessage(data);
        } catch (error) {
          console.warn("[BCXIR] Failed to deliver virtual BCX hidden message.", error);
        }
      });
    }
    sendBeep(type, message) {
      this.lastOutboundType = "beep:" + type;
      const data = {
        MemberNumber: this.memberNumber,
        BeepType: "BCX",
        Message: {
          BCX: {
            type,
            message
          }
        }
      };
      this.defer(() => {
        try {
          if (typeof this.root.ServerAccountBeep === "function") this.root.ServerAccountBeep(data);
        } catch (error) {
          console.warn("[BCXIR] Failed to deliver virtual BCX beep.", error);
        }
      });
    }
    getBCXVersion() {
      var _a;
      try {
        if (typeof ((_a = this.root.bcx) == null ? void 0 : _a.getCharacterVersion) === "function") {
          const version = this.root.bcx.getCharacterVersion(this.memberNumber);
          return typeof version === "string" && version ? version : null;
        }
      } catch {
        return null;
      }
      return null;
    }
    getOwnBCXVersion() {
      var _a, _b;
      const version = (_a = this.root.bcx) == null ? void 0 : _a.version;
      if (typeof version === "string" && version) return version;
      const parsed = (_b = this.root.bcx) == null ? void 0 : _b.versionParsed;
      if (parsed && typeof parsed === "object") {
        const major = Number(parsed.major) || 0;
        const minor = Number(parsed.minor) || 0;
        const patch = Number(parsed.patch) || 0;
        return `${major}.${minor}.${patch}`;
      }
      return "virtual";
    }
    isMutatingQuery(type) {
      return [
        "conditionCategoryUpdate",
        "conditionSetLimit",
        "conditionUpdate",
        "conditionUpdateMultiple",
        "ruleCreate",
        "ruleDelete"
      ].includes(type);
    }
    sleep(ms) {
      return new Promise((resolve) => {
        const timer = typeof this.root.setTimeout === "function" ? this.root.setTimeout : setTimeout;
        timer(resolve, ms);
      });
    }
    defer(callback) {
      if (typeof this.root.setTimeout === "function") {
        this.root.setTimeout(callback, 0);
      } else {
        callback();
      }
    }
  }
  class VirtualBCXTransport {
    constructor(root, memberNumber) {
      __publicField(this, "installed", false);
      __publicField(this, "active", false);
      __publicField(this, "endpoint", null);
      __publicField(this, "nativeRoomActive", null);
      this.root = root;
      this.memberNumber = memberNumber;
    }
    get isActive() {
      return this.active;
    }
    getDiagnostics() {
      return {
        transportActive: this.active,
        nativeRoomActive: this.nativeRoomActive
      };
    }
    install(modApi) {
      if (this.installed) return true;
      if (!modApi || typeof modApi.hookFunction !== "function") return false;
      try {
        modApi.hookFunction("ServerSend", 10, (args, next) => {
          const handled = this.handleServerSend(args, next);
          if (handled.didHandle) return handled.result;
          return next(args);
        });
        modApi.hookFunction("ServerPlayerIsInChatRoom", 10, (args, next) => {
          const nativeResult = !!next(args);
          this.nativeRoomActive = nativeResult;
          return this.active ? true : nativeResult;
        });
        this.installed = true;
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to install virtual BCX transport.", error);
        return false;
      }
    }
    activate(endpoint) {
      this.endpoint = endpoint;
      this.active = true;
    }
    deactivate() {
      this.active = false;
      this.endpoint = null;
    }
    handleServerSend(args, next) {
      var _a;
      if (!this.active || !this.endpoint) return { didHandle: false };
      const messageType = args[0];
      const payload = args[1];
      if (messageType === "ChatRoomChat" && (payload == null ? void 0 : payload.Content) === "BCXMsg" && (payload == null ? void 0 : payload.Type) === "Hidden") {
        return this.handleHiddenChat(payload, args, next);
      }
      if (messageType === "AccountBeep" && ((_a = payload == null ? void 0 : payload.Message) == null ? void 0 : _a.BCX)) {
        return this.handleAccountBeep(payload);
      }
      return { didHandle: false };
    }
    handleHiddenChat(payload, args, next) {
      var _a, _b, _c, _d, _e, _f, _g;
      const type = (_a = payload.Dictionary) == null ? void 0 : _a.type;
      if (typeof type !== "string") return { didHandle: false };
      const target = payload.Target;
      if (target === this.memberNumber) {
        (_c = this.endpoint) == null ? void 0 : _c.handleHiddenMessage(type, (_b = payload.Dictionary) == null ? void 0 : _b.message);
        return { didHandle: true, result: void 0 };
      }
      if (target == null) {
        if (this.nativeRoomActive === false) {
          (_e = this.endpoint) == null ? void 0 : _e.handleHiddenMessage(type, (_d = payload.Dictionary) == null ? void 0 : _d.message);
          return { didHandle: true, result: void 0 };
        }
        const result = next(args);
        (_g = this.endpoint) == null ? void 0 : _g.handleHiddenMessage(type, (_f = payload.Dictionary) == null ? void 0 : _f.message);
        return { didHandle: true, result };
      }
      return { didHandle: false };
    }
    handleAccountBeep(payload) {
      var _a, _b, _c;
      if (payload.MemberNumber !== this.memberNumber) return { didHandle: false };
      const type = (_b = (_a = payload.Message) == null ? void 0 : _a.BCX) == null ? void 0 : _b.type;
      if (typeof type !== "string") return { didHandle: false };
      (_c = this.endpoint) == null ? void 0 : _c.handleBeep(type, payload.Message.BCX.message);
      return { didHandle: true, result: void 0 };
    }
  }
  const VIRTUAL_MEMBER_NUMBER = 990001337;
  class VirtualCharacterManager {
    constructor(root) {
      __publicField(this, "character", null);
      __publicField(this, "originalAllowItem", null);
      __publicField(this, "permissionHookInstalled", false);
      __publicField(this, "previousInformationSheetSelection", null);
      __publicField(this, "hadPreviousInformationSheetSelection", false);
      this.root = root;
    }
    get current() {
      return this.character;
    }
    create() {
      if (this.character) return this.character;
      const player = this.root.Player || {};
      const character = {
        ...player,
        ID: 999,
        Name: "BCXIR Authoring",
        Nickname: "BCXIR Authoring",
        AccountName: "BCXIR_Authoring",
        MemberNumber: VIRTUAL_MEMBER_NUMBER,
        AssetFamily: player.AssetFamily || "Female3DCG",
        Appearance: [],
        ActivePose: [],
        Effect: [],
        OnlineSharedSettings: {},
        ItemPermission: 3,
        IsPlayer: () => false
      };
      this.character = character;
      this.installPermissionHook();
      this.insertIntoRoom(character);
      return character;
    }
    remove() {
      const character = this.character;
      if (!character) return;
      this.restoreInformationSheetSelection(character);
      this.removeFromArray("ChatRoomCharacter", character);
      this.removeFromArray("ChatRoomCharacterDrawlist", character);
      this.character = null;
      this.uninstallPermissionHook();
    }
    openInformationSheet() {
      const character = this.character;
      if (!character) return false;
      try {
        if (!this.hadPreviousInformationSheetSelection) {
          this.previousInformationSheetSelection = this.root.InformationSheetSelection;
          this.hadPreviousInformationSheetSelection = true;
        }
        this.root.InformationSheetSelection = character;
        if (typeof this.root.InformationSheetLoad === "function") {
          this.root.InformationSheetLoad(character);
        }
        if (typeof this.root.CommonSetScreen === "function") {
          this.root.CommonSetScreen("Character", "InformationSheet");
        }
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to open virtual character information sheet.", error);
        return false;
      }
    }
    restoreInformationSheetSelection(character) {
      if (this.isVirtualSelection(this.root.InformationSheetSelection, character)) {
        const previous = this.isVirtualSelection(this.previousInformationSheetSelection, character) ? null : this.previousInformationSheetSelection;
        this.root.InformationSheetSelection = previous || this.root.Player || null;
      }
      this.previousInformationSheetSelection = null;
      this.hadPreviousInformationSheetSelection = false;
    }
    isVirtualSelection(selection, character) {
      return selection === character || (selection == null ? void 0 : selection.MemberNumber) === VIRTUAL_MEMBER_NUMBER;
    }
    openBCXMenuFromInformationSheet() {
      if (!this.character || typeof this.root.InformationSheetClick !== "function") return false;
      const previousX = this.root.MouseX;
      const previousY = this.root.MouseY;
      try {
        this.root.MouseX = 1820;
        this.root.MouseY = 690;
        this.root.InformationSheetClick();
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to auto-open virtual character BCX menu.", error);
        return false;
      } finally {
        this.root.MouseX = previousX;
        this.root.MouseY = previousY;
      }
    }
    insertIntoRoom(character) {
      if (!Array.isArray(this.root.ChatRoomCharacter)) this.root.ChatRoomCharacter = [];
      if (!this.root.ChatRoomCharacter.includes(character)) this.root.ChatRoomCharacter.push(character);
      if (Array.isArray(this.root.ChatRoomCharacterDrawlist) && !this.root.ChatRoomCharacterDrawlist.includes(character)) {
        this.root.ChatRoomCharacterDrawlist.push(character);
        this.root.ChatRoomCharacterViewCharacterCount = this.root.ChatRoomCharacterDrawlist.length;
      }
    }
    removeFromArray(name, value) {
      const array = this.root[name];
      if (!Array.isArray(array)) return;
      const index = array.indexOf(value);
      if (index >= 0) array.splice(index, 1);
      if (name === "ChatRoomCharacterDrawlist") {
        this.root.ChatRoomCharacterViewCharacterCount = array.length;
      }
    }
    installPermissionHook() {
      if (this.permissionHookInstalled) return;
      this.originalAllowItem = this.root.ServerChatRoomGetAllowItem;
      const memberNumber = VIRTUAL_MEMBER_NUMBER;
      const original = this.originalAllowItem;
      this.root.ServerChatRoomGetAllowItem = function allowVirtualItemAccess(a, b) {
        if ((a == null ? void 0 : a.MemberNumber) === memberNumber || (b == null ? void 0 : b.MemberNumber) === memberNumber) return true;
        if (typeof original === "function") return original(a, b);
        return true;
      };
      this.permissionHookInstalled = true;
    }
    uninstallPermissionHook() {
      if (!this.permissionHookInstalled) return;
      this.root.ServerChatRoomGetAllowItem = this.originalAllowItem;
      this.originalAllowItem = null;
      this.permissionHookInstalled = false;
    }
  }
  const MODULE_LOG = 2;
  const MODULE_CURSES = 3;
  const MODULE_COMMANDS = 5;
  const MODULE_RELATIONSHIPS = 6;
  const ACCESS_SELF = 0;
  const LIMIT_NORMAL = 0;
  class VirtualRuleStore {
    constructor(sourceRulesCategory, getDefaultCustomData) {
      __publicField(this, "conditions", {});
      __publicField(this, "limits", {});
      __publicField(this, "categoryRequirements", {});
      __publicField(this, "categoryTimer", null);
      __publicField(this, "categoryTimerRemove", false);
      this.getDefaultCustomData = getDefaultCustomData;
      const sourceLimits = sourceRulesCategory == null ? void 0 : sourceRulesCategory.limits;
      if (sourceLimits && typeof sourceLimits === "object") {
        for (const key of Object.keys(sourceLimits)) {
          this.limits[key] = LIMIT_NORMAL;
        }
      }
    }
    exportRules() {
      return Object.keys(this.conditions).sort().map((ruleId) => ({
        ruleId,
        condition: deepClone(this.conditions[ruleId])
      }));
    }
    importPayload(payload) {
      for (const rule of payload.r) {
        this.conditions[rule.k] = makeConditionData(rule);
        if (this.limits[rule.k] === void 0) this.limits[rule.k] = LIMIT_NORMAL;
      }
    }
    handleQuery(type, data) {
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
        case "conditionCategoryUpdate":
          return this.updateCategory(data);
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
            allowRemoveOwner: true
          };
        case "relatonshipsGet":
        case "relationshipsGet":
          return {
            relationships: [],
            access_view_all: true,
            access_modify_self: true,
            access_modify_others: true
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
            leaveMessage: true
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
          return void 0;
      }
    }
    getConditions(category) {
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
          data: category === "curses" ? null : void 0,
          conditions: {},
          limits: {}
        };
      }
      return {
        access_normal: true,
        access_limited: true,
        access_configure: true,
        access_changeLimits: true,
        highestRoleInRoom: ACCESS_SELF,
        requirements: deepClone(this.categoryRequirements),
        timer: this.categoryTimer,
        timerRemove: this.categoryTimerRemove,
        data: void 0,
        conditions: deepClone(this.conditions),
        limits: deepClone(this.limits)
      };
    }
    createRule(ruleId) {
      if (typeof ruleId !== "string" || !ruleId) return false;
      if (!this.conditions[ruleId]) {
        const customData = this.makeDefaultCustomData(ruleId);
        this.conditions[ruleId] = {
          active: true,
          favorite: false,
          timer: null,
          timerRemove: false,
          requirements: null,
          data: {
            enforce: true,
            log: true,
            ...customData !== void 0 ? { customData } : {}
          }
        };
      }
      if (this.limits[ruleId] === void 0) this.limits[ruleId] = LIMIT_NORMAL;
      return true;
    }
    deleteRule(ruleId) {
      if (typeof ruleId !== "string" || !ruleId) return false;
      delete this.conditions[ruleId];
      return true;
    }
    setLimit(data) {
      if (!data || data.category !== "rules" || typeof data.condition !== "string") return false;
      const limit = Number(data.limit);
      if (!Number.isFinite(limit)) return false;
      this.limits[data.condition] = limit;
      return true;
    }
    updateCondition(data) {
      if (!data || data.category !== "rules" || typeof data.condition !== "string") return false;
      const normalized = this.normalizeCondition(data.condition, data.data);
      if (!normalized) return false;
      this.conditions[data.condition] = normalized;
      if (this.limits[data.condition] === void 0) this.limits[data.condition] = LIMIT_NORMAL;
      return true;
    }
    updateMultiple(data) {
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
            log: true
          }
        };
        const nextData = isPlainObject(data.data.data) ? {
          enforce: data.data.data.enforce !== void 0 ? data.data.data.enforce !== false : current.data.enforce,
          log: data.data.data.log !== void 0 ? data.data.data.log !== false : current.data.log,
          customData: data.data.data.customData !== void 0 ? deepClone(data.data.data.customData) : current.data.customData
        } : current.data;
        this.conditions[condition] = this.normalizeCondition(condition, {
          ...current,
          ...data.data,
          data: nextData
        }) || current;
        if (this.limits[condition] === void 0) this.limits[condition] = LIMIT_NORMAL;
      }
      return true;
    }
    updateCategory(data) {
      if (!data || data.category !== "rules" || !isPlainObject(data.data)) return false;
      const categoryData = data.data;
      if (categoryData.requirements !== void 0) {
        if (categoryData.requirements == null) {
          this.categoryRequirements = {};
        } else if (isPlainObject(categoryData.requirements)) {
          this.categoryRequirements = deepClone(categoryData.requirements);
        } else {
          return false;
        }
      }
      if (categoryData.timer !== void 0) {
        this.categoryTimer = categoryData.timer == null ? null : Number(categoryData.timer);
      }
      if (categoryData.timerRemove !== void 0) {
        this.categoryTimerRemove = categoryData.timerRemove === true;
      }
      return true;
    }
    normalizeCondition(ruleId, value) {
      if (!isPlainObject(value)) return null;
      const rawData = isPlainObject(value.data) ? value.data : {};
      const defaultCustomData = this.makeDefaultCustomData(ruleId);
      const condition = {
        active: value.active === true,
        favorite: value.favorite === true,
        timer: value.timer == null ? null : Number(value.timer),
        timerRemove: value.timerRemove === true,
        requirements: value.requirements == null ? null : deepClone(value.requirements),
        data: {
          enforce: rawData.enforce !== false,
          log: rawData.log !== false
        }
      };
      if (rawData.customData !== void 0) {
        if (!isPlainObject(rawData.customData)) return null;
        condition.data.customData = deepClone(rawData.customData);
      } else if (defaultCustomData !== void 0) {
        condition.data.customData = defaultCustomData;
      }
      return condition;
    }
    makeDefaultCustomData(ruleId) {
      var _a;
      try {
        const defaults = (_a = this.getDefaultCustomData) == null ? void 0 : _a.call(this, ruleId);
        return defaults === void 0 ? void 0 : deepClone(defaults);
      } catch (error) {
        console.warn("[BCXIR] Failed to get default customData for " + ruleId, error);
        return void 0;
      }
    }
  }
  class AuthoringSession {
    constructor(root, bcx, reporter, synchronizer, settingsStore) {
      __publicField(this, "modApi", null);
      __publicField(this, "status", "idle");
      __publicField(this, "store", null);
      __publicField(this, "endpoint");
      __publicField(this, "transport");
      __publicField(this, "characterManager");
      __publicField(this, "lastRegisteredItem", null);
      __publicField(this, "lastError", null);
      __publicField(this, "lastInitStep", null);
      __publicField(this, "unsubscribeSubscreen", null);
      __publicField(this, "sawBcxSubscreen", false);
      __publicField(this, "returnScreen", null);
      __publicField(this, "returnTo", "screen");
      __publicField(this, "restoreSettingsItemRules", null);
      __publicField(this, "restoreAfterBcxExitTimers", []);
      __publicField(this, "pendingItemName", null);
      this.root = root;
      this.bcx = bcx;
      this.reporter = reporter;
      this.synchronizer = synchronizer;
      this.settingsStore = settingsStore;
      this.characterManager = new VirtualCharacterManager(root);
      this.endpoint = new VirtualBCXEndpoint(root, VIRTUAL_MEMBER_NUMBER, () => this.store);
      this.transport = new VirtualBCXTransport(root, VIRTUAL_MEMBER_NUMBER);
    }
    setModApi(modApi) {
      this.modApi = modApi;
    }
    setSettingsItemRulesRestore(callback) {
      this.restoreSettingsItemRules = callback;
    }
    getState() {
      const transport = this.transport.getDiagnostics();
      const endpoint = this.endpoint.getDiagnostics();
      return {
        status: this.status,
        virtualMemberNumber: this.status === "idle" ? null : VIRTUAL_MEMBER_NUMBER,
        lastRegisteredItem: this.lastRegisteredItem,
        lastError: this.lastError,
        bcxVersionReady: endpoint.bcxVersionReady,
        transportActive: transport.transportActive,
        bridgeActive: transport.transportActive,
        nativeRoomActive: transport.nativeRoomActive,
        lastInboundType: endpoint.lastInboundType,
        lastOutboundType: endpoint.lastOutboundType,
        lastQuery: endpoint.lastQuery,
        queryCount: endpoint.queryCount,
        messageCount: endpoint.messageCount,
        lastInitStep: this.lastInitStep
      };
    }
    async open(options = {}) {
      if (this.status !== "idle") {
        this.reporter.localMessage("BCXIR authoring is already active.", "info");
        return true;
      }
      if (!this.bcx.canUseBCX()) {
        this.lastError = "BCX is unavailable";
        this.reporter.localMessage("BCX is unavailable; cannot open BCXIR authoring.", "error");
        return false;
      }
      if (!Array.isArray(this.root.ChatRoomCharacter)) {
        this.lastError = "not in a chat room";
        this.reporter.localMessage("Enter a chat room before opening BCXIR authoring.", "error");
        return false;
      }
      try {
        this.clearRestoreAfterBcxExitTimers();
        this.pendingItemName = this.cleanItemName(options.itemName);
        this.returnTo = options.returnTo === "settingsItemRules" ? "settingsItemRules" : "screen";
        this.returnScreen = this.captureCurrentScreen();
        this.lastInitStep = "fetch-rules";
        const sourceRules = await this.bcx.fetchRuleConditions().catch(() => null);
        this.store = new VirtualRuleStore(sourceRules, (ruleId) => this.makeDefaultCustomData(ruleId));
        this.importExistingItemRules();
        this.lastInitStep = "transport";
        if (!this.transport.install(this.modApi)) {
          throw new Error("failed to install virtual BCX transport");
        }
        this.endpoint.activate();
        this.transport.activate(this.endpoint);
        this.lastInitStep = "character";
        this.characterManager.create();
        this.lastInitStep = "hello";
        if (!await this.endpoint.waitUntilReady()) {
          throw new Error("virtual BCX initialization failed");
        }
        this.status = "active";
        this.lastInitStep = "ready";
        this.installSubscreenFinishListener();
        this.lastInitStep = "open-information-sheet";
        const opened = this.characterManager.openInformationSheet();
        if (opened) this.scheduleAutoOpenBCXMenu();
        this.reporter.localMessage(
          opened ? "Virtual BCXIR authoring character opened. BCXIR will try to enter its BCX menu automatically." : "Virtual BCXIR authoring character is in the room. Open its BCX Rules; leaving BCX will register item rules locally.",
          "info"
        );
        return true;
      } catch (error) {
        this.lastError = String(error instanceof Error ? error.message : error);
        this.cleanup({ restoreScreen: true });
        this.reporter.localMessage("Failed to start BCXIR authoring: " + this.lastError, "error");
        return false;
      }
    }
    async finish() {
      if (this.status !== "active" || !this.store) {
        this.reporter.localMessage("BCXIR authoring is not active.", "error");
        return null;
      }
      this.status = "finishing";
      try {
        const payload = buildAuthoringPayload(this.makePayloadId(), this.store.exportRules());
        const itemName = this.confirmItemName();
        if (this.settingsStore && !canModifyRegisteredItem(this.root, this.settingsStore.get(), itemName)) {
          throw new Error("item rules are locked while this item is worn");
        }
        const entry = registerItemRules(this.root, itemName, payload);
        this.lastRegisteredItem = entry.itemName;
        this.reporter.localMessage("BCXIR rules registered locally for item: " + entry.itemName + ".", "info");
        this.synchronizer.scheduleSync("authoring-register");
        this.cleanup({ restoreScreen: true });
        return entry;
      } catch (error) {
        this.lastError = String(error instanceof Error ? error.message : error);
        this.reporter.localMessage("Failed to finish BCXIR authoring: " + this.lastError, "error");
        this.cleanup({ restoreScreen: true });
        return null;
      }
    }
    cancel() {
      if (this.status === "idle") return false;
      this.cleanup({ restoreScreen: true });
      this.reporter.localMessage("BCXIR authoring canceled.", "info");
      return true;
    }
    cleanup(options = {}) {
      var _a;
      const screenToRestore = options.restoreScreen ? this.returnScreen : null;
      const shouldRestoreItemRules = options.restoreScreen && this.returnTo === "settingsItemRules";
      const itemNameToRestore = this.pendingItemName || this.lastRegisteredItem;
      (_a = this.unsubscribeSubscreen) == null ? void 0 : _a.call(this);
      this.unsubscribeSubscreen = null;
      this.sawBcxSubscreen = false;
      this.transport.deactivate();
      this.endpoint.deactivate();
      this.characterManager.remove();
      this.store = null;
      this.status = "idle";
      this.returnScreen = null;
      this.returnTo = "screen";
      this.pendingItemName = null;
      if (screenToRestore) this.restoreScreen(screenToRestore);
      if (shouldRestoreItemRules) this.scheduleRestoreSettingsItemRules(itemNameToRestore);
    }
    scheduleAutoOpenBCXMenu() {
      if (typeof this.root.setTimeout !== "function") {
        this.tryAutoOpenBCXMenu();
        return;
      }
      this.root.setTimeout(() => this.tryAutoOpenBCXMenu(), 0);
    }
    tryAutoOpenBCXMenu() {
      if (this.status !== "active") return;
      const opened = this.characterManager.openBCXMenuFromInformationSheet();
      if (!opened) {
        this.reporter.localMessage("Open the virtual character's BCX button to edit BCXIR rules.", "info");
      }
    }
    scheduleRestoreSettingsItemRules(itemName) {
      const restore = () => {
        var _a;
        try {
          (_a = this.restoreSettingsItemRules) == null ? void 0 : _a.call(this, itemName);
        } catch (error) {
          console.warn("[BCXIR] Failed to restore Item Rules settings page.", error);
        }
      };
      if (typeof this.root.setTimeout !== "function") {
        restore();
        return;
      }
      this.restoreAfterBcxExitTimers.push(this.root.setTimeout(restore, 0));
      this.restoreAfterBcxExitTimers.push(this.root.setTimeout(restore, 100));
    }
    clearRestoreAfterBcxExitTimers() {
      if (typeof this.root.clearTimeout === "function") {
        for (const timer of this.restoreAfterBcxExitTimers) this.root.clearTimeout(timer);
      }
      this.restoreAfterBcxExitTimers = [];
    }
    installSubscreenFinishListener() {
      var _a;
      (_a = this.unsubscribeSubscreen) == null ? void 0 : _a.call(this);
      this.unsubscribeSubscreen = null;
      this.sawBcxSubscreen = false;
      const api = this.bcx.getApi();
      if (!api || typeof api.on !== "function") return;
      try {
        this.unsubscribeSubscreen = api.on("bcxSubscreenChange", (event) => {
          if (this.status !== "active") return;
          if ((event == null ? void 0 : event.inBcxSubscreen) === true) {
            this.sawBcxSubscreen = true;
            return;
          }
          if (this.sawBcxSubscreen && (event == null ? void 0 : event.inBcxSubscreen) === false) {
            void this.finish();
          }
        });
      } catch (error) {
        console.warn("[BCXIR] Failed to listen for BCX subscreen close.", error);
      }
    }
    makePayloadId() {
      const itemName = this.getSuggestedItemName() || "unknown";
      return "craft:" + String(itemName).replace(/[^A-Za-z0-9_-]+/g, "-") + ":" + Date.now();
    }
    importExistingItemRules() {
      if (!this.pendingItemName || !this.store) return;
      const entry = getRegisteredItem(this.root, this.pendingItemName);
      if (!entry) return;
      this.store.importPayload(entry.payload);
    }
    getSuggestedItemName() {
      var _a, _b, _c, _d, _e, _f;
      if (this.pendingItemName) return this.pendingItemName;
      return String(
        ((_a = this.root.CraftingItem) == null ? void 0 : _a.Name) || ((_c = (_b = this.root.CraftingItem) == null ? void 0 : _b.Craft) == null ? void 0 : _c.Name) || ((_d = this.root.CraftingAsset) == null ? void 0 : _d.Name) || ((_f = (_e = this.root.CraftingItem) == null ? void 0 : _e.Asset) == null ? void 0 : _f.Name) || ""
      ).trim();
    }
    confirmItemName() {
      const suggested = this.getSuggestedItemName();
      if (this.pendingItemName) return this.pendingItemName;
      if (typeof this.root.prompt === "function") {
        const input = this.root.prompt("Register BCXIR rules for crafted item name:", suggested);
        if (input === null) throw new Error("item rule registration canceled");
        const clean = input.trim();
        if (clean) return clean;
      }
      if (suggested) return suggested;
      throw new Error("could not determine crafted item name");
    }
    cleanItemName(value) {
      const clean = typeof value === "string" ? value.trim() : "";
      return clean || null;
    }
    makeDefaultCustomData(ruleId) {
      const definition = this.bcx.getRuleDefinition(ruleId);
      const dataDefinition = definition == null ? void 0 : definition.dataDefinition;
      if (!dataDefinition || typeof dataDefinition !== "object") return void 0;
      const out = {};
      for (const [key, entry] of Object.entries(dataDefinition)) {
        const defaultValue = entry == null ? void 0 : entry.default;
        out[key] = typeof defaultValue === "function" ? defaultValue() : defaultValue;
      }
      return out;
    }
    captureCurrentScreen() {
      const moduleName = typeof this.root.CurrentModule === "string" ? this.root.CurrentModule : "";
      const screenName = typeof this.root.CurrentScreen === "string" ? this.root.CurrentScreen : "";
      if (!moduleName || !screenName) return null;
      return { module: moduleName, screen: screenName };
    }
    restoreScreen(snapshot) {
      const currentModule = typeof this.root.CurrentModule === "string" ? this.root.CurrentModule : "";
      const currentScreen = typeof this.root.CurrentScreen === "string" ? this.root.CurrentScreen : "";
      if (currentModule === snapshot.module && currentScreen === snapshot.screen) return;
      try {
        if (typeof this.root.CommonSetScreen === "function") {
          this.root.CommonSetScreen(snapshot.module, snapshot.screen);
        }
      } catch (error) {
        console.warn("[BCXIR] Failed to restore screen after authoring.", error);
      }
    }
  }
  class ItemRuleTransport {
    constructor(root, reporter, settingsStore) {
      __publicField(this, "installed", false);
      __publicField(this, "pending", /* @__PURE__ */ new Map());
      __publicField(this, "cooldowns", /* @__PURE__ */ new Map());
      __publicField(this, "onRulesReceived", null);
      __publicField(this, "lastInboundType", null);
      __publicField(this, "lastOutboundType", null);
      this.root = root;
      this.reporter = reporter;
      this.settingsStore = settingsStore;
    }
    install(modApi) {
      if (this.installed) return true;
      if (!modApi || typeof modApi.hookFunction !== "function") return false;
      try {
        modApi.hookFunction("ServerAccountBeep", 10, (args, next) => {
          if (this.handleIncomingBeep(args[0])) return void 0;
          return next(args);
        });
        this.installed = true;
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to install item rule transport.", error);
        return false;
      }
    }
    setRulesReceivedCallback(callback) {
      this.onRulesReceived = callback;
    }
    requestItemRules(item, targetOverride) {
      var _a, _b;
      this.expirePending();
      const settings = (_a = this.settingsStore) == null ? void 0 : _a.get();
      if ((settings == null ? void 0 : settings.allowForeignItemRules) === false || (settings == null ? void 0 : settings.autoRequestForeignRules) === false) {
        this.debug("Item rule request skipped by settings.");
        return null;
      }
      const crafter = targetOverride == null ? this.getItemCrafterMemberNumber(item) : this.normalizeMemberNumber(targetOverride);
      const player = Number((_b = this.root.Player) == null ? void 0 : _b.MemberNumber);
      const itemName = getItemRuleName(item);
      if (crafter == null) {
        this.debug("Item rule request skipped; missing crafter member number.", { itemName });
        return null;
      }
      if (!itemName) {
        this.debug("Item rule request skipped; missing item name.", { crafter });
        return null;
      }
      if (Number.isFinite(player) && player === crafter) {
        this.debug("Item rule request skipped; item was crafted by the local player.", { crafter, itemName });
        return null;
      }
      if (settings && !canRefreshRemoteItemRules(this.root, settings, crafter, itemName)) {
        this.debug("Item rule request skipped; worn item rule lock is active.", { crafter, itemName });
        return null;
      }
      const cacheKey = makeRuleCacheKey(crafter, itemName);
      const cooldown = this.cooldowns.get(cacheKey);
      if (cooldown && cooldown.nextAllowedAt > now()) {
        this.debug("Item rule request cooled down.", {
          crafter,
          itemName,
          nextAllowedInMs: cooldown.nextAllowedAt - now(),
          failures: cooldown.failures
        });
        return null;
      }
      const requestId = this.makeRequestId(crafter, itemName);
      this.pending.set(requestId, {
        requestId,
        crafter,
        itemName,
        cacheKey,
        sentAt: now()
      });
      this.noteRequestSent(cacheKey);
      const message = {
        v: ITEM_RULE_PROTOCOL_VERSION,
        command: ITEM_RULE_REQUEST_COMMAND,
        requestId,
        itemName,
        item: this.makePortableItemBundle(item)
      };
      if (!this.sendBeep(crafter, message)) {
        this.pending.delete(requestId);
        this.noteRequestFailed(cacheKey);
        return null;
      }
      this.debug("Item rule request sent.", { target: crafter, requestId, itemName });
      return requestId;
    }
    getPendingCount() {
      this.expirePending();
      return this.pending.size;
    }
    clearCooldowns() {
      this.pending.clear();
      this.cooldowns.clear();
    }
    getDiagnostics() {
      this.expirePending();
      return {
        pendingRequestCount: this.pending.size,
        cooldownCount: this.cooldowns.size,
        lastInboundType: this.lastInboundType,
        lastOutboundType: this.lastOutboundType
      };
    }
    handleIncomingBeep(data) {
      const message = this.extractMessage(data);
      if (!message) return false;
      const sender = Number(data == null ? void 0 : data.MemberNumber);
      if (!Number.isFinite(sender) || sender <= 0) return true;
      if (message.command === ITEM_RULE_REQUEST_COMMAND) {
        this.lastInboundType = ITEM_RULE_REQUEST_COMMAND;
        this.handleRequest(sender, message);
        return true;
      }
      if (message.command === ITEM_RULE_RESPONSE_COMMAND) {
        this.lastInboundType = ITEM_RULE_RESPONSE_COMMAND;
        this.handleResponse(sender, message);
        return true;
      }
      return true;
    }
    extractMessage(data) {
      if (!data || data.BeepType !== ITEM_RULE_BEEP_TYPE) return null;
      const envelope = data.Message;
      if (!isPlainObject(envelope) || envelope[ITEM_RULE_MESSAGE_FLAG] !== true) return null;
      if (envelope.type !== "command" || envelope.version !== ITEM_RULE_PROTOCOL_VERSION) return null;
      const commandData = envelope.command;
      if (!isPlainObject(commandData)) return null;
      const command = commandData.name;
      if (command !== ITEM_RULE_REQUEST_COMMAND && command !== ITEM_RULE_RESPONSE_COMMAND) return null;
      const args = Array.isArray(commandData.args) ? commandData.args : [];
      const requestId = this.getArg(args, "requestId", "string");
      const itemName = this.getArg(args, "itemName", "string");
      if (!requestId || !itemName) return null;
      const message = {
        v: ITEM_RULE_PROTOCOL_VERSION,
        command,
        requestId,
        itemName,
        item: this.getArg(args, "item")
      };
      const payload = this.getArg(args, "payload");
      if (payload !== void 0) {
        try {
          message.payload = normalizePayload(payload);
        } catch (error) {
          console.warn("[BCXIR] Ignoring malformed item rule response payload.", error);
          this.debug("Malformed item rule response payload ignored.", { requestId, itemName });
          return null;
        }
      }
      return message;
    }
    handleRequest(sender, message) {
      var _a;
      if (((_a = this.settingsStore) == null ? void 0 : _a.get().respondToRuleRequests) === false) {
        this.debug("Item rule request ignored; responses disabled.", { sender, requestId: message.requestId });
        return;
      }
      const itemText = message.item ? getItemNameAndDescriptionConcat(this.root, message.item) : message.itemName;
      const entry = findMatchingRegistryEntry(this.root, itemText);
      this.debug("Item rule request received.", { sender, requestId: message.requestId, itemName: message.itemName, matched: !!entry });
      if (!entry) return;
      if (entry.selfOnly) {
        this.debug("Item rule request ignored; entry is self-only.", { sender, itemName: entry.itemName });
        return;
      }
      this.sendBeep(sender, {
        v: ITEM_RULE_PROTOCOL_VERSION,
        command: ITEM_RULE_RESPONSE_COMMAND,
        requestId: message.requestId,
        itemName: entry.itemName,
        payload: entry.payload
      });
    }
    handleResponse(sender, message) {
      var _a, _b, _c;
      this.expirePending();
      const pending = this.pending.get(message.requestId);
      if (!pending) {
        this.debug("Item rule response ignored; no pending request.", { sender, requestId: message.requestId });
        return;
      }
      if (pending.crafter !== sender) {
        this.debug("Item rule response ignored; sender is not expected crafter.", {
          sender,
          expected: pending.crafter,
          requestId: message.requestId
        });
        return;
      }
      if (!message.payload) {
        this.debug("Item rule response ignored; missing payload.", { sender, requestId: message.requestId });
        return;
      }
      const settings = (_a = this.settingsStore) == null ? void 0 : _a.get();
      if (settings && !canRefreshRemoteItemRules(this.root, settings, sender, pending.itemName)) {
        this.pending.delete(message.requestId);
        this.debug("Item rule response ignored; worn item rule lock is active.", {
          sender,
          requestId: message.requestId,
          itemName: pending.itemName
        });
        return;
      }
      if (!isPhraseInItemName(pending.itemName, message.itemName) && !isPhraseInItemName(message.itemName, pending.itemName)) {
        this.debug("Item rule response ignored; item name mismatch.", {
          requestId: message.requestId,
          pendingItemName: pending.itemName,
          responseItemName: message.itemName
        });
        return;
      }
      cacheItemRules(this.root, sender, pending.itemName, message.payload);
      this.freezeFreshPayloadIfCurrentlyWorn(sender, pending.itemName, message.payload);
      this.pending.delete(message.requestId);
      this.cooldowns.delete(pending.cacheKey);
      this.debug("Item rule response cached.", { sender, requestId: message.requestId, itemName: pending.itemName });
      if (((_b = this.settingsStore) == null ? void 0 : _b.get().showTransportMessages) !== false) {
        this.reporter.localMessage("Received BCXIR rules for " + pending.itemName + ".", "info");
      }
      (_c = this.onRulesReceived) == null ? void 0 : _c.call(this);
    }
    sendBeep(target, message) {
      try {
        if (typeof this.root.ServerSend !== "function") return false;
        this.root.ServerSend("AccountBeep", {
          MemberNumber: target,
          BeepType: ITEM_RULE_BEEP_TYPE,
          IsSecret: true,
          Message: this.toEnvelope(target, message)
        });
        this.lastOutboundType = message.command;
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to send item rule beep.", error);
        return false;
      }
    }
    makePortableItemBundle(item) {
      var _a, _b, _c;
      return {
        Group: (_b = (_a = item == null ? void 0 : item.Asset) == null ? void 0 : _a.Group) == null ? void 0 : _b.Name,
        Name: ((_c = item == null ? void 0 : item.Asset) == null ? void 0 : _c.Name) || (item == null ? void 0 : item.Name),
        Color: deepClone(item == null ? void 0 : item.Color),
        Craft: (item == null ? void 0 : item.Craft) ? deepClone(item.Craft) : void 0,
        Property: (item == null ? void 0 : item.Property) ? deepClone(item.Property) : void 0
      };
    }
    freezeFreshPayloadIfCurrentlyWorn(crafter, itemName, payload) {
      var _a, _b;
      const settings = (_a = this.settingsStore) == null ? void 0 : _a.get();
      if ((settings == null ? void 0 : settings.allowForeignItemRules) === false) return;
      const appearance = Array.isArray((_b = this.root.Player) == null ? void 0 : _b.Appearance) ? this.root.Player.Appearance : [];
      const isWorn = appearance.some((item) => {
        var _a2;
        if (!isWearerItem(item, { scanItemCategoryOnly: settings == null ? void 0 : settings.scanItemCategoryOnly })) return false;
        return this.normalizeMemberNumber((_a2 = item == null ? void 0 : item.Craft) == null ? void 0 : _a2.MemberNumber) === crafter && makeRuleCacheKey(crafter, getItemRuleName(item)) === makeRuleCacheKey(crafter, itemName);
      });
      if (!isWorn) return;
      const state = loadState(this.root);
      const itemKey = makeRuleCacheKey(crafter, itemName);
      if (state.activeItemPayloads[itemKey]) return;
      state.activeItemPayloads[itemKey] = {
        payload: deepClone(payload),
        originatorMemberNumber: crafter,
        originatorSource: "cache",
        allowMinimalCreator: (settings == null ? void 0 : settings.allowCachedOfflineCreator) !== false,
        itemName,
        updatedAt: now()
      };
      saveState(this.root, state);
    }
    toEnvelope(target, message) {
      const args = [
        { name: "requestId", value: message.requestId },
        { name: "itemName", value: message.itemName }
      ];
      if (message.item !== void 0) args.push({ name: "item", value: deepClone(message.item) });
      if (message.payload !== void 0) args.push({ name: "payload", value: deepClone(message.payload) });
      return {
        IsBCXIR: true,
        type: "command",
        target,
        version: ITEM_RULE_PROTOCOL_VERSION,
        command: {
          name: message.command,
          args
        }
      };
    }
    getArg(args, name, type) {
      const entry = args.find((arg) => isPlainObject(arg) && arg.name === name);
      const value = entry == null ? void 0 : entry.value;
      if (type === "string") return typeof value === "string" ? value : "";
      return value;
    }
    getItemCrafterMemberNumber(item) {
      var _a;
      return this.normalizeMemberNumber((_a = item == null ? void 0 : item.Craft) == null ? void 0 : _a.MemberNumber);
    }
    normalizeMemberNumber(value) {
      const memberNumber = Number(value);
      return Number.isFinite(memberNumber) && memberNumber > 0 ? memberNumber : null;
    }
    makeRequestId(crafter, itemName) {
      var _a;
      return [
        "bcxir",
        String(((_a = this.root.Player) == null ? void 0 : _a.MemberNumber) || 0),
        String(crafter),
        itemName.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40),
        String(Date.now()),
        String(Math.floor(Math.random() * 1e5))
      ].join(":");
    }
    expirePending() {
      const cutoff = now() - ITEM_RULE_REQUEST_COOLDOWN_MS;
      for (const [requestId, pending] of this.pending.entries()) {
        if (pending.sentAt < cutoff) {
          this.pending.delete(requestId);
          this.noteRequestFailed(pending.cacheKey);
          this.debug("Item rule request expired; cooling down future polling.", {
            requestId,
            crafter: pending.crafter,
            itemName: pending.itemName
          });
        }
      }
    }
    noteRequestSent(cacheKey) {
      const current = this.cooldowns.get(cacheKey);
      const failures = (current == null ? void 0 : current.failures) || 0;
      this.cooldowns.set(cacheKey, {
        failures,
        lastSentAt: now(),
        nextAllowedAt: now() + this.getCooldownMs(failures)
      });
    }
    noteRequestFailed(cacheKey) {
      const current = this.cooldowns.get(cacheKey);
      const failures = Math.min(((current == null ? void 0 : current.failures) || 0) + 1, 16);
      this.cooldowns.set(cacheKey, {
        failures,
        lastSentAt: (current == null ? void 0 : current.lastSentAt) || now(),
        nextAllowedAt: now() + this.getCooldownMs(failures)
      });
    }
    getCooldownMs(failures) {
      const multiplier = Math.pow(2, Math.max(0, failures));
      return Math.min(ITEM_RULE_REQUEST_COOLDOWN_MS * multiplier, ITEM_RULE_REQUEST_MAX_COOLDOWN_MS);
    }
    debug(message, data) {
      var _a;
      if (((_a = this.settingsStore) == null ? void 0 : _a.get().debugLogging) !== true) return;
      if (data) console.info("[BCXIR]", message, data);
      else console.info("[BCXIR]", message);
    }
  }
  class MinimalCreatorManager {
    constructor(root) {
      __publicField(this, "entries", /* @__PURE__ */ new Map());
      this.root = root;
    }
    acquire(memberNumber, allowMinimalCreator) {
      if (this.hasRoomCharacter(memberNumber)) return () => void 0;
      if (!allowMinimalCreator) return null;
      const existing = this.entries.get(memberNumber);
      if (existing) {
        existing.refs += 1;
        return () => this.release(memberNumber, existing.character);
      }
      const character = this.createCharacter(memberNumber);
      if (!Array.isArray(this.root.ChatRoomCharacter)) this.root.ChatRoomCharacter = [];
      this.root.ChatRoomCharacter.push(character);
      this.entries.set(memberNumber, { character, refs: 1 });
      return () => this.release(memberNumber, character);
    }
    hasRoomCharacter(memberNumber) {
      return Array.isArray(this.root.ChatRoomCharacter) && this.root.ChatRoomCharacter.some((character) => (character == null ? void 0 : character.MemberNumber) === memberNumber);
    }
    createCharacter(memberNumber) {
      const player = this.root.Player || {};
      const name = "BCXIR Creator " + memberNumber;
      return {
        ID: 0,
        Name: name,
        Nickname: name,
        AccountName: "BCXIR_Creator_" + memberNumber,
        MemberNumber: memberNumber,
        AssetFamily: player.AssetFamily || "Female3DCG",
        Appearance: [],
        ActivePose: [],
        Effect: [],
        OnlineSharedSettings: {},
        ItemPermission: 3,
        IsPlayer: () => false
      };
    }
    release(memberNumber, character) {
      const entry = this.entries.get(memberNumber);
      if (!entry || entry.character !== character) return;
      entry.refs -= 1;
      if (entry.refs > 0) return;
      this.entries.delete(memberNumber);
      this.removeFromArray("ChatRoomCharacter", character);
    }
    removeFromArray(name, value) {
      const array = this.root[name];
      if (!Array.isArray(array)) return;
      const index = array.indexOf(value);
      if (index >= 0) array.splice(index, 1);
    }
  }
  class CreatorSenderQueryTransport {
    constructor(root) {
      __publicField(this, "installed", false);
      __publicField(this, "sequence", 0);
      __publicField(this, "pending", /* @__PURE__ */ new Map());
      __publicField(this, "creators");
      this.root = root;
      this.creators = new MinimalCreatorManager(root);
    }
    install(modApi) {
      if (this.installed) return true;
      if (!modApi || typeof modApi.hookFunction !== "function") return false;
      try {
        modApi.hookFunction("ServerSend", 20, (args, next) => {
          if (this.handleServerSend(args)) return void 0;
          return next(args);
        });
        this.installed = true;
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to install creator sender query transport.", error);
        return false;
      }
    }
    queryAsSender(type, data, context, timeoutMs = QUERY_TIMEOUT_MS) {
      const sender = Number(context.memberNumber);
      if (!Number.isFinite(sender) || sender <= 0) {
        return Promise.reject(new Error("Invalid creator sender"));
      }
      if (typeof this.root.ChatRoomMessage !== "function") {
        return Promise.reject(new Error("BC ChatRoomMessage is unavailable"));
      }
      const release = this.creators.acquire(sender, context.allowMinimalCreator === true);
      if (!release) {
        return Promise.reject(new Error("Creator is not available in the room"));
      }
      const id = this.makeQueryId(sender, type);
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          this.pending.delete(id);
          release();
        };
        const timeout = this.root.setTimeout(() => {
          cleanup();
          reject(new Error("Timed out"));
        }, timeoutMs);
        this.pending.set(id, {
          sender,
          resolve: (value) => {
            this.root.clearTimeout(timeout);
            cleanup();
            resolve(value);
          },
          reject: (error) => {
            this.root.clearTimeout(timeout);
            cleanup();
            reject(error);
          },
          timeout,
          release
        });
        try {
          this.root.ChatRoomMessage({
            Type: "Hidden",
            Content: "BCXMsg",
            Sender: sender,
            Dictionary: {
              type: "query",
              message: {
                id,
                query: type,
                data
              }
            }
          });
        } catch (error) {
          const pending = this.pending.get(id);
          if (pending) {
            this.root.clearTimeout(pending.timeout);
            this.pending.delete(id);
            pending.release();
          }
          reject(error);
        }
      });
    }
    getPendingCount() {
      return this.pending.size;
    }
    handleServerSend(args) {
      var _a, _b;
      const messageType = args[0];
      const payload = args[1];
      if (messageType !== "ChatRoomChat" || (payload == null ? void 0 : payload.Content) !== "BCXMsg" || (payload == null ? void 0 : payload.Type) !== "Hidden") {
        return false;
      }
      if (((_a = payload.Dictionary) == null ? void 0 : _a.type) !== "queryAnswer") return false;
      const message = (_b = payload.Dictionary) == null ? void 0 : _b.message;
      const id = typeof (message == null ? void 0 : message.id) === "string" ? message.id : "";
      const pending = this.pending.get(id);
      if (!pending) return false;
      if (Number(payload.Target) !== pending.sender) return false;
      if (message.ok === true) pending.resolve(message.data);
      else pending.reject(message.data || new Error("BCX query rejected"));
      return true;
    }
    makeQueryId(sender, type) {
      var _a;
      this.sequence = (this.sequence + 1) % 1e6;
      return [
        "bcxir-creator",
        String(((_a = this.root.Player) == null ? void 0 : _a.MemberNumber) || 0),
        String(sender),
        type.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40),
        String(Date.now()),
        String(this.sequence)
      ].join(":");
    }
  }
  const USE_ME_OPERATOR_MEMBER_NUMBER = 990001339;
  class UseMeQueryTransport {
    constructor(root) {
      __publicField(this, "installed", false);
      __publicField(this, "sequence", 0);
      __publicField(this, "pending", /* @__PURE__ */ new Map());
      __publicField(this, "operator", null);
      this.root = root;
    }
    install(modApi) {
      if (this.installed) return true;
      if (!modApi || typeof modApi.hookFunction !== "function") return false;
      try {
        modApi.hookFunction("ServerSend", 19, (args, next) => {
          if (this.handleServerSend(args)) return void 0;
          return next(args);
        });
        this.installed = true;
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to install useMe query transport.", error);
        return false;
      }
    }
    queryUseMe(type, data, timeoutMs = QUERY_TIMEOUT_MS) {
      if (typeof this.root.ChatRoomMessage !== "function") {
        return Promise.reject(new Error("BC ChatRoomMessage is unavailable"));
      }
      const release = this.acquireOperator();
      if (!release) return Promise.reject(new Error("BCXIR useMe operator is unavailable"));
      const sender = this.getOperatorMemberNumber();
      const id = this.makeQueryId(type);
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          this.pending.delete(id);
          release();
        };
        const timeout = this.root.setTimeout(() => {
          cleanup();
          reject(new Error("Timed out"));
        }, timeoutMs);
        this.pending.set(id, {
          sender,
          resolve: (value) => {
            this.root.clearTimeout(timeout);
            cleanup();
            resolve(value);
          },
          reject: (error) => {
            this.root.clearTimeout(timeout);
            cleanup();
            reject(error);
          },
          timeout,
          release
        });
        try {
          this.root.ChatRoomMessage({
            Type: "Hidden",
            Content: "BCXMsg",
            Sender: sender,
            Dictionary: {
              type: "query",
              message: {
                id,
                query: type,
                data
              }
            }
          });
        } catch (error) {
          const pending = this.pending.get(id);
          if (pending) {
            this.root.clearTimeout(pending.timeout);
            this.pending.delete(id);
            pending.release();
          }
          reject(error);
        }
      });
    }
    handleServerSend(args) {
      var _a, _b;
      const messageType = args[0];
      const payload = args[1];
      if (messageType !== "ChatRoomChat" || (payload == null ? void 0 : payload.Content) !== "BCXMsg" || (payload == null ? void 0 : payload.Type) !== "Hidden") {
        return false;
      }
      if (((_a = payload.Dictionary) == null ? void 0 : _a.type) !== "queryAnswer") return false;
      const message = (_b = payload.Dictionary) == null ? void 0 : _b.message;
      const id = typeof (message == null ? void 0 : message.id) === "string" ? message.id : "";
      const pending = this.pending.get(id);
      if (!pending) return false;
      if (Number(payload.Target) !== pending.sender) return false;
      if (message.ok === true) pending.resolve(message.data);
      else pending.reject(message.data || new Error("BCX query rejected"));
      return true;
    }
    acquireOperator() {
      if (this.operator) {
        this.operator.refs += 1;
        return () => {
          var _a;
          return this.releaseOperator((_a = this.operator) == null ? void 0 : _a.character);
        };
      }
      const character = this.createOperatorCharacter();
      if (!Array.isArray(this.root.ChatRoomCharacter)) this.root.ChatRoomCharacter = [];
      this.root.ChatRoomCharacter.push(character);
      this.operator = {
        character,
        refs: 1,
        restore: this.patchTemporaryAuthority(character.MemberNumber)
      };
      return () => this.releaseOperator(character);
    }
    releaseOperator(character) {
      var _a;
      const entry = this.operator;
      if (!entry || entry.character !== character) return;
      entry.refs -= 1;
      if (entry.refs > 0) return;
      this.operator = null;
      (_a = entry.restore) == null ? void 0 : _a.call(entry);
      this.removeFromArray("ChatRoomCharacter", character);
    }
    patchTemporaryAuthority(memberNumber) {
      const root = this.root;
      const player = root.Player || {};
      const previousAllowItem = root.ServerChatRoomGetAllowItem;
      const previousIsOwnedByMemberNumber = player.IsOwnedByMemberNumber;
      const hadWhiteList = Array.isArray(player.WhiteList);
      const previousWhiteList = hadWhiteList ? player.WhiteList.slice() : null;
      let patchedAllowItem = null;
      let patchedIsOwnedByMemberNumber = null;
      if (!Array.isArray(player.WhiteList)) player.WhiteList = [];
      if (!player.WhiteList.includes(memberNumber)) player.WhiteList.push(memberNumber);
      if (typeof previousAllowItem === "function") {
        patchedAllowItem = function patchedServerChatRoomGetAllowItem(source, target) {
          if ((source == null ? void 0 : source.MemberNumber) === memberNumber && target === root.Player) return true;
          return previousAllowItem.apply(this, arguments);
        };
        root.ServerChatRoomGetAllowItem = patchedAllowItem;
      }
      if (typeof previousIsOwnedByMemberNumber === "function") {
        patchedIsOwnedByMemberNumber = function patchedPlayerIsOwnedByMemberNumber(value) {
          if (Number(value) === memberNumber) return true;
          return previousIsOwnedByMemberNumber.apply(this, arguments);
        };
        player.IsOwnedByMemberNumber = patchedIsOwnedByMemberNumber;
      }
      return () => {
        if (patchedAllowItem && root.ServerChatRoomGetAllowItem === patchedAllowItem) root.ServerChatRoomGetAllowItem = previousAllowItem;
        if (patchedIsOwnedByMemberNumber && player.IsOwnedByMemberNumber === patchedIsOwnedByMemberNumber) player.IsOwnedByMemberNumber = previousIsOwnedByMemberNumber;
        if (previousWhiteList) player.WhiteList = previousWhiteList;
        else if (!hadWhiteList) delete player.WhiteList;
      };
    }
    getOperatorMemberNumber() {
      var _a;
      const playerNumber = Number((_a = this.root.Player) == null ? void 0 : _a.MemberNumber);
      if (Number.isFinite(playerNumber) && playerNumber === USE_ME_OPERATOR_MEMBER_NUMBER) {
        return USE_ME_OPERATOR_MEMBER_NUMBER + 1;
      }
      return USE_ME_OPERATOR_MEMBER_NUMBER;
    }
    createOperatorCharacter() {
      const player = this.root.Player || {};
      const memberNumber = this.getOperatorMemberNumber();
      return {
        ID: 0,
        Name: "BCXIR Please Use Me",
        Nickname: "BCXIR Please Use Me",
        AccountName: "BCXIR_UseMe",
        MemberNumber: memberNumber,
        AssetFamily: player.AssetFamily || "Female3DCG",
        Appearance: [],
        ActivePose: [],
        Effect: [],
        OnlineSharedSettings: {},
        ItemPermission: 3,
        IsPlayer: () => false
      };
    }
    removeFromArray(name, value) {
      const array = this.root[name];
      if (!Array.isArray(array)) return;
      const index = array.indexOf(value);
      if (index >= 0) array.splice(index, 1);
    }
    makeQueryId(type) {
      var _a;
      this.sequence = (this.sequence + 1) % 1e6;
      return [
        "bcxir-useme",
        String(((_a = this.root.Player) == null ? void 0 : _a.MemberNumber) || 0),
        type.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40),
        String(Date.now()),
        String(this.sequence)
      ].join(":");
    }
  }
  function bootstrap() {
    const root = getRoot();
    const settingsStore = new ExtensionSettingsStore(root);
    const reporter = new Reporter(root, settingsStore);
    const creatorSenderTransport = new CreatorSenderQueryTransport(root);
    const useMeTransport = new UseMeQueryTransport(root);
    const bcx = new BCXAdapter(root, creatorSenderTransport, useMeTransport);
    const itemRuleTransport = new ItemRuleTransport(root, reporter, settingsStore);
    const synchronizer = new RuleSynchronizer(root, bcx, reporter, settingsStore, itemRuleTransport);
    itemRuleTransport.setRulesReceivedCallback(() => synchronizer.scheduleSync("item-rule-response"));
    const authoring = new AuthoringSession(root, bcx, reporter, synchronizer, settingsStore);
    const settingsRegistry = new SettingsRegistry(root, settingsStore, bcx, synchronizer, authoring, itemRuleTransport);
    authoring.setSettingsItemRulesRestore((itemName) => settingsRegistry.restoreItemRules(itemName));
    let settingsInitialized = false;
    root.BCXItemRules = buildPublicApi(root, synchronizer, settingsStore, settingsRegistry, authoring, itemRuleTransport);
    const waitForGameReady = () => {
      var _a;
      if (((_a = root.Player) == null ? void 0 : _a.MemberNumber) != null && !settingsInitialized) {
        settingsStore.load();
        settingsRegistry.register();
        settingsInitialized = true;
      }
      if (root.Player && root.bcx && bcx.canUseBCX()) {
        registerModSdkHooks(root, synchronizer, authoring, itemRuleTransport, creatorSenderTransport, useMeTransport);
        synchronizer.startFallbackTimer();
        synchronizer.scheduleSync("startup");
        console.info("[BCXIR] Loaded.");
        return;
      }
      root.setTimeout(waitForGameReady, 500);
    };
    if (typeof root.document !== "undefined") {
      root.setTimeout(waitForGameReady, 1e3);
    }
  }
  bootstrap();

})();