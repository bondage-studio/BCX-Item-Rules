// ==UserScript==
// @name         BCX Item Rules
// @namespace    https://github.com/VivianMoonlight
// @version      0.1.0
// @author       VivianMoonlight
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
  const MARKER_PREFIX = "[BCXIR:v1:";
  const MAX_ENCODED_LENGTH = 6e3;
  const SYNC_DEBOUNCE_MS = 250;
  const FALLBACK_SYNC_MS = 5e3;
  const QUERY_TIMEOUT_MS = 1e4;
  class BCXAdapter {
    constructor(root) {
      __publicField(this, "bcxApi", null);
      this.root = root;
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
    async query(type, data) {
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
    async fetchRuleConditions() {
      return this.query("conditionsGet", "rules");
    }
    async setRuleLimit(ruleId, limit) {
      return this.query("conditionSetLimit", {
        category: "rules",
        condition: ruleId,
        limit
      });
    }
    getRulePublicData(conditionsData, ruleId) {
      return conditionsData && conditionsData.conditions && Object.prototype.hasOwnProperty.call(conditionsData.conditions, ruleId) ? conditionsData.conditions[ruleId] : null;
    }
    async ensureRuleExists(ruleId, conditionsData) {
      if (this.getRulePublicData(conditionsData, ruleId)) return true;
      const created = await this.query("ruleCreate", ruleId);
      return created === true;
    }
    async updateRule(ruleId, data) {
      return this.query("conditionUpdate", {
        category: "rules",
        condition: ruleId,
        data
      });
    }
    async deleteRule(ruleId) {
      return this.query("ruleDelete", ruleId);
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
  function stripMarkers(description) {
    const source = typeof description === "string" ? description : "";
    return source.replace(/(?:\r?\n)?\[BCXIR:v1:[^\]\r\n]+\]/g, "").replace(/[ \t]+$/gm, "").replace(/\s+$/g, "");
  }
  function appendPayloadToDescription(description, payload) {
    const base = stripMarkers(description);
    const marker = MARKER_PREFIX + encodePayload(payload) + "]";
    return base ? base + "\n" + marker : marker;
  }
  function parsePayloadsFromDescription(description) {
    const source = typeof description === "string" ? description : "";
    const out = [];
    const errors = [];
    const regex = /\[BCXIR:v1:([^\]\r\n]+)\]/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
      try {
        out.push(decodePayload(match[1]));
      } catch (error) {
        errors.push(String(error instanceof Error ? error.message : error));
      }
    }
    return { payloads: out, errors };
  }
  function readPayloadsFromItem(item) {
    var _a;
    return parsePayloadsFromDescription((_a = item == null ? void 0 : item.Craft) == null ? void 0 : _a.Description);
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
    return !!(item && item.Asset && item.Asset.Group && (!scanItemCategoryOnly || item.Asset.Group.Category === "Item") && item.Craft && typeof item.Craft.Description === "string");
  }
  function collectDesiredRulesFromAppearance(appearance, options = {}) {
    const desired = /* @__PURE__ */ new Map();
    const payloadIds = /* @__PURE__ */ new Set();
    const errors = [];
    const conflicts = [];
    for (const item of Array.isArray(appearance) ? appearance : []) {
      if (!isWearerItem(item, options)) continue;
      const parsed = readPayloadsFromItem(item);
      errors.push(...parsed.errors);
      for (const payload of parsed.payloads) {
        payloadIds.add(payload.id);
        for (const rule of payload.r) {
          const conditionData = makeConditionData(rule);
          const candidate = {
            ruleId: rule.k,
            conditionData,
            priority: rule.p || 0,
            payloadIds: [payload.id]
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
      conflicts
    };
  }
  function buildPublicApi(synchronizer, settingsStore, settingsRegistry, authoring) {
    return {
      version: VERSION,
      markerPrefix: MARKER_PREFIX,
      encodePayload,
      decodePayload,
      stripMarkers,
      appendPayloadToDescription,
      parsePayloadsFromDescription,
      readPayloadsFromItem,
      collectDesiredRulesFromAppearance,
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
      openAuthoring: () => (authoring == null ? void 0 : authoring.open()) ?? Promise.resolve(false),
      finishAuthoring: () => (authoring == null ? void 0 : authoring.finish()) ?? Promise.resolve(null),
      cancelAuthoring: () => (authoring == null ? void 0 : authoring.cancel()) ?? false,
      getAuthoringState: () => (authoring == null ? void 0 : authoring.getState()) ?? {
        status: "idle",
        virtualMemberNumber: null,
        lastMarker: null,
        lastError: "authoring unavailable"
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
  function getPlayerNumber(root) {
    const value = root.Player && root.Player.MemberNumber;
    return value == null ? "DEFAULT" : String(value);
  }
  function storageKey(root) {
    return STORAGE_PREFIX + getPlayerNumber(root);
  }
  function emptyState() {
    return { version: 1, activePayloadIds: [], managed: {} };
  }
  function loadState(root) {
    try {
      const raw = root.localStorage && root.localStorage.getItem(storageKey(root));
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") throw new Error("bad state");
      return {
        version: 1,
        activePayloadIds: Array.isArray(parsed.activePayloadIds) ? parsed.activePayloadIds : [],
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
    } catch (error) {
      console.warn("[BCXIR] Failed to save local state.", error);
    }
  }
  class RuleSynchronizer {
    constructor(root, bcx, reporter, settingsStore) {
      __publicField(this, "syncTimer", 0);
      __publicField(this, "fallbackTimer", 0);
      __publicField(this, "syncInFlight", false);
      __publicField(this, "pendingSyncReason", "");
      this.root = root;
      this.bcx = bcx;
      this.reporter = reporter;
      this.settingsStore = settingsStore;
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
      let conditionsData;
      try {
        conditionsData = await this.bcx.fetchRuleConditions();
      } catch (error) {
        this.reporter.reportOnce("conditions", [
          "Failed to read BCX rules: " + String(error instanceof Error ? error.message : error)
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
        if ((managed == null ? void 0 : managed.lastApplied) && comparableCurrent && !sameStable(comparableCurrent, managed.lastApplied)) {
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
            updatedAt: now()
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
    async syncNow(reason) {
      if (this.syncInFlight) {
        this.pendingSyncReason = reason || this.pendingSyncReason || "queued";
        return false;
      }
      this.syncInFlight = true;
      try {
        const player = this.root.Player;
        if (!player || !Array.isArray(player.Appearance)) return false;
        const settings = this.settingsStore.get();
        const desiredInfo = settings.enabled ? collectDesiredRulesFromAppearance(player.Appearance, {
          scanItemCategoryOnly: settings.scanItemCategoryOnly
        }) : { desired: /* @__PURE__ */ new Map(), payloadIds: [], errors: [], conflicts: [] };
        if (!settings.enabled && settings.debugLogging) {
          console.info("[BCXIR] Runtime disabled; releasing managed rules.");
        }
        return await this.applyDesiredRules(desiredInfo, reason || "manual");
      } catch (error) {
        console.error("[BCXIR] Sync failed.", error);
        this.reporter.reportOnce("sync", [
          "BCXIR sync failed: " + String(error instanceof Error ? error.message : error)
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
  }
  const LABEL_ID = "bcxir-crafting-rules-label";
  const BUTTON_ID = "bcxir-crafting-rules-button";
  class CraftingAuthoringHook {
    constructor(root, session) {
      __publicField(this, "registered", false);
      this.root = root;
      this.session = session;
    }
    register(modApi) {
      if (this.registered) return true;
      if (!modApi || typeof modApi.hookFunction !== "function") return false;
      try {
        modApi.hookFunction("CraftingModeSet", 1, (args, next) => {
          const result = next(args);
          this.refreshButton();
          return result;
        });
        modApi.hookFunction("CraftingResize", 1, (args, next) => {
          const result = next(args);
          this.refreshButton();
          return result;
        });
        modApi.hookFunction("CraftingEventListeners._ChangeDescription", 1, (args, next) => {
          const result = next(args);
          this.refreshButton();
          return result;
        });
        this.registered = true;
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to register crafting authoring hooks.", error);
        return false;
      }
    }
    refreshButton() {
      var _a;
      const document = this.root.document;
      if (!document) return;
      const rightPanelId = (_a = this.root.CraftingID) == null ? void 0 : _a.rightPanel;
      const rightPanel = typeof rightPanelId === "string" ? document.getElementById(rightPanelId) : null;
      if (!rightPanel) {
        this.removeButton();
        return;
      }
      if (document.getElementById(LABEL_ID)) return;
      const label = document.createElement("label");
      label.id = LABEL_ID;
      label.className = "crafting-label";
      label.style.cssText = "grid-template-columns: min-content auto";
      const button = this.createButton();
      label.appendChild(button);
      const span = document.createElement("span");
      span.append("BCXIR Rules");
      label.appendChild(span);
      rightPanel.appendChild(label);
    }
    removeButton() {
      var _a, _b;
      (_b = (_a = this.root.document) == null ? void 0 : _a.getElementById(LABEL_ID)) == null ? void 0 : _b.remove();
    }
    createButton() {
      const document = this.root.document;
      let button;
      if (this.root.ElementButton && typeof this.root.ElementButton.Create === "function") {
        button = this.root.ElementButton.Create(BUTTON_ID, () => {
          void this.session.open();
        });
      } else {
        button = document.createElement("button");
        button.id = BUTTON_ID;
        button.addEventListener("click", () => {
          void this.session.open();
        });
      }
      button.type = "button";
      button.title = "BCXIR Rules";
      button.style.setProperty("height", "calc(0.75 * var(--menu-button-size))");
      button.style.setProperty("width", "calc(0.75 * var(--menu-button-size))");
      button.style.setProperty("background-image", 'url("Icons/Preference.png")');
      return button;
    }
  }
  function registerModSdkHooks(root, synchronizer, authoring) {
    const sdk = root.bcModSdk;
    if (!sdk || typeof sdk.registerMod !== "function") return false;
    try {
      const modApi = sdk.registerMod({
        name: MOD_ID,
        fullName: FULL_NAME,
        version: VERSION,
        repository: "https://github.com/VivianMoonlight/BCX-Item-Rules"
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
        new CraftingAuthoringHook(root, authoring).register(modApi);
      }
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
    fallbackSyncEnabled: true
  };
  function getSettingsBackupKey(root) {
    var _a;
    const number = ((_a = root.Player) == null ? void 0 : _a.MemberNumber) == null ? "DEFAULT" : String(root.Player.MemberNumber);
    return SETTINGS_BACKUP_PREFIX + number + "_backup";
  }
  function getLz(root) {
    const lz = root.LZString || globalThis.LZString;
    if (lz && typeof lz.compressToBase64 === "function" && typeof lz.decompressFromBase64 === "function") {
      return lz;
    }
    return null;
  }
  function normalizeSettings(value) {
    const source = isPlainObject(value) ? value : {};
    return {
      v: 1,
      enabled: source.enabled !== false,
      scanItemCategoryOnly: source.scanItemCategoryOnly !== false,
      showConflictMessages: source.showConflictMessages !== false,
      showInvalidPayloadMessages: source.showInvalidPayloadMessages !== false,
      debugLogging: source.debugLogging === true,
      fallbackSyncEnabled: source.fallbackSyncEnabled !== false
    };
  }
  function decodeSettings(root, raw) {
    if (typeof raw !== "string" || !raw) return null;
    const lz = getLz(root);
    if (!lz) throw new Error("LZString base64 codec is unavailable");
    const json = lz.decompressFromBase64(raw);
    if (!json) throw new Error("settings decompression failed");
    return normalizeSettings(JSON.parse(json));
  }
  function encodeSettings(root, settings) {
    const lz = getLz(root);
    if (!lz) throw new Error("LZString base64 codec is unavailable");
    const encoded = lz.compressToBase64(JSON.stringify(normalizeSettings(settings)));
    if (typeof encoded !== "string" || !encoded) throw new Error("settings compression failed");
    return encoded;
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
      const next = normalizeSettings({ ...this.current, ...patch, v: 1 });
      this.save(next);
      return this.get();
    }
  }
  const _SettingsScreen = class _SettingsScreen {
    constructor(registry) {
      this.registry = registry;
    }
    get root() {
      return this.registry.root;
    }
    get title() {
      return "BCXIR Settings";
    }
    load() {
    }
    unload() {
    }
    run() {
      const root = this.root;
      root.MainCanvas.textAlign = "left";
      root.DrawText("- " + this.title + " -", 125, 125, "Black", "Gray");
      root.DrawButton(1815, 75, 90, 90, "", "White", "Icons/Exit.png", "Exit");
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
      const hovering = this.mouseIn(_SettingsScreen.START_X, y - 32, 1320, 64);
      this.root.DrawTextFit(label, _SettingsScreen.START_X, y, 1320, hovering ? "Red" : "Black", "Gray");
      if (hovering && description) this.drawTooltip(description);
    }
    drawCheckbox(row, label, description, value, disabled = false) {
      const y = this.rowY(row);
      const labelX = _SettingsScreen.START_X;
      const boxX = 1420;
      const hovering = this.mouseIn(labelX, y - 32, 1300, 64);
      this.root.DrawTextFit(label, labelX, y, 1180, hovering ? "Red" : "Black", "Gray");
      this.root.DrawCheckbox(boxX, y - 32, 64, 64, "", value, disabled);
      if (hovering) this.drawTooltip(description);
    }
    checkboxClicked(row) {
      return this.mouseIn(1420, this.rowY(row) - 32, 64, 64);
    }
    drawButton(x, y, w, h, label, tooltip) {
      this.root.DrawButton(x, y, w, h, "", "White", "", tooltip || label);
      this.root.DrawTextFit(label, x + 10, y + h / 2, w - 20, "Black");
    }
    drawTooltip(text) {
      this.root.DrawRect(300, 850, 1400, 65, "#FFFF88");
      this.root.DrawEmptyRect(300, 850, 1400, 65, "black", 2);
      this.root.DrawTextFit(text, 306, 883, 1388, "black");
    }
  };
  __publicField(_SettingsScreen, "START_X", 180);
  __publicField(_SettingsScreen, "START_Y", 205);
  __publicField(_SettingsScreen, "ROW_H", 78);
  let SettingsScreen = _SettingsScreen;
  const ROWS = {
    enabled: 1,
    itemOnly: 2,
    conflicts: 3,
    invalid: 4,
    debug: 5,
    fallback: 6
  };
  class SettingsMainScreen extends SettingsScreen {
    constructor(registry, settingsStore, bcx, onSettingsChanged) {
      super(registry);
      this.settingsStore = settingsStore;
      this.bcx = bcx;
      this.onSettingsChanged = onSettingsChanged;
    }
    run() {
      super.run();
      const settings = this.settingsStore.get();
      const bcxStatus = this.bcx.canUseBCX() ? "BCX available" : "BCX unavailable";
      this.drawLabel(0, "Runtime status: " + bcxStatus);
      this.drawCheckbox(
        ROWS.enabled,
        "Enable BCXIR runtime rule sync",
        "When disabled, BCXIR releases rules it manages and stops applying item payloads.",
        settings.enabled
      );
      this.drawCheckbox(
        ROWS.itemOnly,
        "Only scan worn Item-category assets",
        "Default portable behavior. Disable only if a future authoring workflow stores BCXIR markers on other worn categories.",
        settings.scanItemCategoryOnly
      );
      this.drawCheckbox(
        ROWS.conflicts,
        "Show conflict messages",
        "Display local messages when existing rules or equal-priority item payloads prevent application.",
        settings.showConflictMessages
      );
      this.drawCheckbox(
        ROWS.invalid,
        "Show invalid payload messages",
        "Display local messages when malformed crafted item metadata is ignored.",
        settings.showInvalidPayloadMessages
      );
      this.drawCheckbox(
        ROWS.debug,
        "Enable debug logging",
        "Write additional BCXIR sync details to the browser console.",
        settings.debugLogging
      );
      this.drawCheckbox(
        ROWS.fallback,
        "Enable low-frequency fallback sync",
        "Keep the periodic safety scan active in addition to BC hook-triggered syncs.",
        settings.fallbackSyncEnabled
      );
    }
    click() {
      super.click();
      const settings = this.settingsStore.get();
      if (this.checkboxClicked(ROWS.enabled)) this.update({ enabled: !settings.enabled });
      if (this.checkboxClicked(ROWS.itemOnly)) this.update({ scanItemCategoryOnly: !settings.scanItemCategoryOnly });
      if (this.checkboxClicked(ROWS.conflicts)) this.update({ showConflictMessages: !settings.showConflictMessages });
      if (this.checkboxClicked(ROWS.invalid)) this.update({ showInvalidPayloadMessages: !settings.showInvalidPayloadMessages });
      if (this.checkboxClicked(ROWS.debug)) this.update({ debugLogging: !settings.debugLogging });
      if (this.checkboxClicked(ROWS.fallback)) this.update({ fallbackSyncEnabled: !settings.fallbackSyncEnabled });
    }
    update(patch) {
      this.settingsStore.update(patch);
      this.onSettingsChanged();
    }
  }
  class SettingsRegistry {
    constructor(root, settingsStore, bcx, synchronizer) {
      __publicField(this, "current", null);
      __publicField(this, "registered", false);
      this.root = root;
      this.settingsStore = settingsStore;
      this.bcx = bcx;
      this.synchronizer = synchronizer;
    }
    register() {
      if (this.registered) return true;
      if (typeof this.root.PreferenceRegisterExtensionSetting !== "function") {
        console.warn("[BCXIR] Preference extension setting API is unavailable; settings menu not registered.");
        return false;
      }
      this.root.PreferenceRegisterExtensionSetting({
        Identifier: "BCXIR",
        ButtonText: "BCXIR Settings",
        Image: "Icons/Preference.png",
        load: () => this.load(),
        run: () => this.run(),
        click: () => this.click(),
        exit: () => this.exit(),
        unload: () => this.unload()
      });
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
    load() {
      this.setScreen(new SettingsMainScreen(
        this,
        this.settingsStore,
        this.bcx,
        () => {
          this.synchronizer.startFallbackTimer();
          this.synchronizer.scheduleSync("settings");
        }
      ));
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
      this.setScreen(null);
      if (typeof this.root.PreferenceSubscreenExtensionsClear === "function") {
        this.root.PreferenceSubscreenExtensionsClear();
      }
    }
    unload() {
      this.setScreen(null);
    }
    setScreen(screen) {
      var _a, _b;
      (_a = this.current) == null ? void 0 : _a.unload();
      this.current = screen;
      (_b = this.current) == null ? void 0 : _b.load();
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
  function buildMarker(payload) {
    return MARKER_PREFIX + encodePayload(payload) + "]";
  }
  async function copyText(root, text) {
    var _a;
    try {
      const clipboard = (_a = root.navigator) == null ? void 0 : _a.clipboard;
      if (clipboard && typeof clipboard.writeText === "function") {
        await clipboard.writeText(text);
        return true;
      }
    } catch {
    }
    try {
      const document = root.document;
      if (!document || typeof document.createElement !== "function") return false;
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-10000px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = typeof document.execCommand === "function" && document.execCommand("copy");
      textarea.remove();
      return !!ok;
    } catch {
      return false;
    }
  }
  class VirtualBCXBridge {
    constructor(root, memberNumber, getStore) {
      __publicField(this, "installed", false);
      __publicField(this, "active", false);
      this.root = root;
      this.memberNumber = memberNumber;
      this.getStore = getStore;
    }
    install(modApi) {
      if (this.installed) {
        this.active = true;
        return true;
      }
      if (!modApi || typeof modApi.hookFunction !== "function") return false;
      try {
        modApi.hookFunction("ServerSend", 10, (args, next) => {
          if (this.shouldHandleServerSend(args)) {
            this.answerQuery(args[1].Dictionary.message);
            return void 0;
          }
          return next(args);
        });
        this.installed = true;
        this.active = true;
        return true;
      } catch (error) {
        console.warn("[BCXIR] Failed to install virtual BCX bridge.", error);
        return false;
      }
    }
    uninstall() {
      this.active = false;
    }
    shouldHandleServerSend(args) {
      var _a, _b;
      if (!this.active) return false;
      const messageType = args[0];
      const payload = args[1];
      return messageType === "ChatRoomChat" && (payload == null ? void 0 : payload.Content) === "BCXMsg" && (payload == null ? void 0 : payload.Type) === "Hidden" && (payload == null ? void 0 : payload.Target) === this.memberNumber && ((_a = payload == null ? void 0 : payload.Dictionary) == null ? void 0 : _a.type) === "query" && ((_b = payload == null ? void 0 : payload.Dictionary) == null ? void 0 : _b.message) && typeof payload.Dictionary.message.id === "string" && typeof payload.Dictionary.message.query === "string";
    }
    answerQuery(query) {
      const deliver = () => {
        const answer = this.makeAnswer(query);
        const data = {
          Type: "Hidden",
          Content: "BCXMsg",
          Sender: this.memberNumber,
          Dictionary: {
            type: "queryAnswer",
            message: answer
          }
        };
        try {
          if (typeof this.root.ChatRoomMessage === "function") {
            this.root.ChatRoomMessage(data);
          }
        } catch (error) {
          console.warn("[BCXIR] Failed to deliver virtual BCX answer.", error);
        }
      };
      if (typeof this.root.setTimeout === "function") {
        this.root.setTimeout(deliver, 0);
      } else {
        deliver();
      }
    }
    makeAnswer(query) {
      try {
        const store = this.getStore();
        const result = store == null ? void 0 : store.handleQuery(query.query, query.data);
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
  }
  const VIRTUAL_MEMBER_NUMBER = 990001337;
  class VirtualCharacterManager {
    constructor(root) {
      __publicField(this, "character", null);
      __publicField(this, "originalAllowItem", null);
      __publicField(this, "permissionHookInstalled", false);
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
      this.announceBCX(character);
      return character;
    }
    remove() {
      const character = this.character;
      if (!character) return;
      this.removeFromArray("ChatRoomCharacter", character);
      this.removeFromArray("ChatRoomCharacterDrawlist", character);
      this.character = null;
      this.uninstallPermissionHook();
    }
    openInformationSheet() {
      const character = this.character;
      if (!character) return false;
      try {
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
    announceBCX(character) {
      var _a, _b, _c;
      const version = ((_a = this.root.bcx) == null ? void 0 : _a.version) || ((_c = (_b = this.root.bcx) == null ? void 0 : _b.versionParsed) == null ? void 0 : _c.major) || "virtual";
      const data = {
        Type: "Hidden",
        Content: "BCXMsg",
        Sender: character.MemberNumber,
        Dictionary: {
          type: "hello",
          message: {
            version: String(version),
            request: false,
            effects: { Effect: [] },
            typingIndicatorEnable: false,
            screenIndicatorEnable: false
          }
        }
      };
      try {
        if (typeof this.root.ChatRoomMessage === "function") this.root.ChatRoomMessage(data);
      } catch {
      }
    }
  }
  const MODULE_LOG = 2;
  const MODULE_CURSES = 3;
  const MODULE_COMMANDS = 5;
  const MODULE_RELATIONSHIPS = 6;
  const ACCESS_SELF = 0;
  const LIMIT_NORMAL = 0;
  class VirtualRuleStore {
    constructor(sourceRulesCategory) {
      __publicField(this, "conditions", {});
      __publicField(this, "limits", {});
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
        requirements: {},
        timer: null,
        timerRemove: false,
        data: void 0,
        conditions: deepClone(this.conditions),
        limits: deepClone(this.limits)
      };
    }
    createRule(ruleId) {
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
            log: true
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
      const normalized = this.normalizeCondition(data.data);
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
        this.conditions[condition] = this.normalizeCondition({
          ...current,
          ...data.data,
          data: current.data
        }) || current;
        if (this.limits[condition] === void 0) this.limits[condition] = LIMIT_NORMAL;
      }
      return true;
    }
    normalizeCondition(value) {
      if (!isPlainObject(value)) return null;
      const rawData = isPlainObject(value.data) ? value.data : {};
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
      }
      return condition;
    }
  }
  class AuthoringSession {
    constructor(root, bcx, reporter) {
      __publicField(this, "modApi", null);
      __publicField(this, "status", "idle");
      __publicField(this, "store", null);
      __publicField(this, "bridge");
      __publicField(this, "characterManager");
      __publicField(this, "lastMarker", null);
      __publicField(this, "lastError", null);
      __publicField(this, "unsubscribeSubscreen", null);
      __publicField(this, "sawBcxSubscreen", false);
      this.root = root;
      this.bcx = bcx;
      this.reporter = reporter;
      this.characterManager = new VirtualCharacterManager(root);
      this.bridge = new VirtualBCXBridge(root, VIRTUAL_MEMBER_NUMBER, () => this.store);
    }
    setModApi(modApi) {
      this.modApi = modApi;
    }
    getState() {
      return {
        status: this.status,
        virtualMemberNumber: this.status === "idle" ? null : VIRTUAL_MEMBER_NUMBER,
        lastMarker: this.lastMarker,
        lastError: this.lastError
      };
    }
    async open() {
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
        const sourceRules = await this.bcx.fetchRuleConditions().catch(() => null);
        this.store = new VirtualRuleStore(sourceRules);
        this.characterManager.create();
        if (!this.bridge.install(this.modApi)) {
          throw new Error("failed to install virtual BCX query bridge");
        }
        this.status = "active";
        this.installSubscreenFinishListener();
        const opened = this.characterManager.openInformationSheet();
        this.reporter.localMessage(
          opened ? "Virtual BCXIR authoring character opened. Edit its BCX Rules; leaving BCX will copy the marker." : "Virtual BCXIR authoring character is in the room. Open its BCX Rules; leaving BCX will copy the marker.",
          "info"
        );
        return true;
      } catch (error) {
        this.lastError = String(error instanceof Error ? error.message : error);
        this.cleanup();
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
        const marker = buildMarker(payload);
        this.lastMarker = marker;
        const copied = await copyText(this.root, marker);
        this.reporter.localMessage(
          copied ? "BCXIR marker copied to clipboard. Paste it into the crafted item description." : "BCXIR marker generated, but clipboard copy failed. See console for the marker.",
          copied ? "info" : "error"
        );
        if (!copied) console.warn("[BCXIR] Generated marker:", marker);
        this.cleanup();
        return marker;
      } catch (error) {
        this.lastError = String(error instanceof Error ? error.message : error);
        this.reporter.localMessage("Failed to finish BCXIR authoring: " + this.lastError, "error");
        this.cleanup();
        return null;
      }
    }
    cancel() {
      if (this.status === "idle") return false;
      this.cleanup();
      this.reporter.localMessage("BCXIR authoring canceled.", "info");
      return true;
    }
    cleanup() {
      var _a;
      (_a = this.unsubscribeSubscreen) == null ? void 0 : _a.call(this);
      this.unsubscribeSubscreen = null;
      this.sawBcxSubscreen = false;
      this.bridge.uninstall();
      this.characterManager.remove();
      this.store = null;
      this.status = "idle";
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
      var _a, _b, _c, _d;
      const assetName = ((_b = (_a = this.root.CraftingItem) == null ? void 0 : _a.Asset) == null ? void 0 : _b.Name) || ((_c = this.root.CraftingItem) == null ? void 0 : _c.Name) || ((_d = this.root.CraftingAsset) == null ? void 0 : _d.Name) || "unknown";
      return "craft:" + String(assetName).replace(/[^A-Za-z0-9_-]+/g, "-") + ":" + Date.now();
    }
  }
  function bootstrap() {
    const root = getRoot();
    const settingsStore = new ExtensionSettingsStore(root);
    const reporter = new Reporter(root, settingsStore);
    const bcx = new BCXAdapter(root);
    const synchronizer = new RuleSynchronizer(root, bcx, reporter, settingsStore);
    const settingsRegistry = new SettingsRegistry(root, settingsStore, bcx, synchronizer);
    const authoring = new AuthoringSession(root, bcx, reporter);
    let settingsInitialized = false;
    root.BCXItemRules = buildPublicApi(synchronizer, settingsStore, settingsRegistry, authoring);
    const waitForGameReady = () => {
      if (root.Player && !settingsInitialized) {
        settingsStore.load();
        settingsRegistry.register();
        settingsInitialized = true;
      }
      if (root.Player && root.bcx && bcx.canUseBCX()) {
        registerModSdkHooks(root, synchronizer, authoring);
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