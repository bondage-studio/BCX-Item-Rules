import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("./BCXItemRules.script.js", import.meta.url), "utf8");
const loaderSource = fs.readFileSync(new URL("./BCXItemRules.loader.user.js", import.meta.url), "utf8");
const installAliasSource = fs.readFileSync(new URL("./BCXItemRules.user.js", import.meta.url), "utf8");
assert.match(loaderSource, /BCX Item Rules Loader/);
assert.match(loaderSource, /BCXItemRules\.script\.js/);
assert.match(loaderSource, /GM_xmlhttpRequest/);
assert.match(loaderSource, /Date\.now\(\)/);
assert.equal(installAliasSource, loaderSource);

const fakeLz = {
  compressToEncodedURIComponent(value) {
    return encodeURIComponent(value);
  },
  decompressFromEncodedURIComponent(value) {
    return decodeURIComponent(value);
  },
  compressToBase64(value) {
    return Buffer.from(value, "utf8").toString("base64");
  },
  decompressFromBase64(value) {
    return Buffer.from(value, "base64").toString("utf8");
  },
};

const localStore = new Map();
let extensionSyncKey = "";
let registeredExtensionSetting = null;
const screenChanges = [];
const serverSends = [];
const timers = [];
const hooks = new Map();
const elements = new Map();
const informationSheetClicks = [];
const preferenceActions = [];
let currentTime = 1000000;
let virtualReady = false;
const bcxRuleConditions = {};
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [currentTime]));
  }

  static now() {
    return currentTime;
  }
}
const modApi = {
  hookFunction(name, _priority, callback) {
    const list = hooks.get(name) || [];
    list.push(callback);
    hooks.set(name, list);
  },
};

function runHook(name, args, nativeFn) {
  const list = hooks.get(name) || [];
  let index = 0;
  const next = (nextArgs) => {
    const callback = list[index++];
    return callback ? callback(nextArgs, next) : nativeFn(nextArgs);
  };
  return next(args);
}

function runNextTimer() {
  timers.shift()?.();
}

function runTimersUntil(predicate, max = 100) {
  let count = 0;
  while (!predicate() && timers.length && count < max) {
    runNextTimer();
    count += 1;
  }
}

const context = {
  console,
  Date: FakeDate,
  window: {
    document: {
      getElementById(id) { return elements.get(id) || null; },
      body: {
        appendChild(element) { elements.set(element.id, element); },
      },
      createElement(tag) {
        return {
          id: "",
          localName: tag,
          type: "",
          value: "",
          style: { setProperty() {} },
          addEventListener() {},
          remove() { elements.delete(this.id); },
        };
      },
    },
    LZString: fakeLz,
    localStorage: {
      getItem(key) { return localStore.get(key) || null; },
      setItem(key, value) { localStore.set(key, value); },
      removeItem(key) { localStore.delete(key); },
    },
    Player: {
      MemberNumber: 12345,
      ExtensionSettings: {},
      Appearance: [],
    },
    bcModSdk: {
      registerMod() { return modApi; },
    },
    bcx: {
      version: "test",
      getCharacterVersion(memberNumber) {
        return virtualReady && memberNumber === 990001337 ? "test" : null;
      },
      getModApi() {
        return {
          sendQuery(type, data) {
            if (type === "conditionsGet") return Promise.resolve({ conditions: clone(bcxRuleConditions) });
            if (type === "ruleCreate") {
              if (!bcxRuleConditions[data]) {
                bcxRuleConditions[data] = {
                  active: true,
                  favorite: false,
                  timer: null,
                  timerRemove: false,
                  requirements: null,
                  data: { enforce: true, log: true },
                };
              }
              return Promise.resolve(true);
            }
            if (type === "conditionUpdate") {
              bcxRuleConditions[data.condition] = clone(data.data);
              return Promise.resolve(true);
            }
            if (type === "ruleDelete") {
              delete bcxRuleConditions[data];
              return Promise.resolve(true);
            }
            return Promise.resolve(true);
          },
          getRuleState() { return true; },
        };
      },
    },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    setInterval() {},
    ServerSend(type, packet) {
      return runHook("ServerSend", [type, packet], ([nativeType, nativePacket]) => {
        serverSends.push({ type: nativeType, packet: nativePacket });
      });
    },
    ChatRoomMessage(data) {
      if (data?.Type !== "Hidden" || data.Content !== "BCXMsg" || data.Dictionary?.type !== "query") return;
      const character = this.ChatRoomCharacter?.find((candidate) => candidate?.MemberNumber === data.Sender);
      const message = data.Dictionary.message;
      const ok = !!character;
      const query = message?.query;
      let responseData = true;
      if (query === "conditionsGet") {
        responseData = { conditions: clone(bcxRuleConditions) };
      } else if (query === "ruleCreate") {
        if (!bcxRuleConditions[message.data]) {
          bcxRuleConditions[message.data] = {
            active: true,
            favorite: false,
            timer: null,
            timerRemove: false,
            requirements: null,
            data: { enforce: true, log: true },
          };
        }
      } else if (query === "conditionUpdate") {
        bcxRuleConditions[message.data.condition] = clone(message.data.data);
      } else if (query === "ruleDelete") {
        delete bcxRuleConditions[message.data];
      }
      this.ServerSend("ChatRoomChat", {
        Content: "BCXMsg",
        Type: "Hidden",
        Target: data.Sender,
        Dictionary: {
          type: "queryAnswer",
          message: {
            id: message.id,
            ok,
            data: ok ? responseData : "missing creator",
          },
        },
      });
    },
    ServerPlayerExtensionSettingsSync(key) { extensionSyncKey = key; },
    PreferenceRegisterExtensionSetting(config) { registeredExtensionSetting = config; },
    MainCanvas: { textAlign: "center" },
    MouseX: 0,
    MouseY: 0,
    MouseIn(x, y, w, h) {
      return this.MouseX >= x && this.MouseX <= x + w && this.MouseY >= y && this.MouseY <= y + h;
    },
    DrawText() {},
    DrawTextFit() {},
    DrawButton() {},
    DrawCheckbox() {},
    DrawRect() {},
    DrawEmptyRect() {},
    DrawImageResize() {},
    DrawBackNextButton() {},
    ElementCreateInput(id, type, value) {
      elements.set(id, {
        id,
        localName: "input",
        type,
        value: value || "",
        remove() { elements.delete(id); },
      });
      return elements.get(id);
    },
    ElementPosition() {},
    ElementRemove(id) { elements.delete(id); },
    ElementValue(id) { return elements.get(id)?.value || ""; },
    ElementSetValue(id, value) {
      const element = elements.get(id);
      if (element) element.value = value;
    },
    PreferenceOpenSubscreen(subscreen) {
      preferenceActions.push(["open", subscreen]);
      this.PreferenceSubscreen = { name: subscreen };
    },
    PreferenceSubscreenExtensionsClear() {
      preferenceActions.push(["clear"]);
    },
    PreferenceSubscreenExtensionsOpen(identifier) {
      preferenceActions.push(["extensionOpen", identifier]);
      if (identifier === "BCXIR") {
        this.PreferenceExtensionsCurrent = registeredExtensionSetting;
        registeredExtensionSetting?.load?.();
      }
    },
    InformationSheetLoad() {},
    InformationSheetClick() {
      informationSheetClicks.push([this.MouseX, this.MouseY]);
    },
    prompt(_message, value) { return value || "Prompted Item"; },
    CommonSetScreen(moduleName, screenName) {
      screenChanges.push([moduleName, screenName]);
      this.CurrentModule = moduleName;
      this.CurrentScreen = screenName;
    },
  },
  LZString: fakeLz,
};

context.unsafeWindow = context.window;
vm.createContext(context);
vm.runInContext(source, context);
runNextTimer();

const api = context.window.BCXItemRules;
assert.equal(hooks.has("CraftingModeSet"), false);
assert.equal(hooks.has("CraftingResize"), false);

const payload = {
  v: 1,
  id: "demo",
  r: [
    { k: "alt_restrict_sight", d: { blindnessStrength: "heavy" }, p: 5 },
  ],
};

const encoded = api.encodePayload(payload);
assert.equal(JSON.stringify(api.decodePayload(encoded)), JSON.stringify({
  v: 1,
  id: "demo",
  r: [
    {
      k: "alt_restrict_sight",
      e: 1,
      l: 1,
      d: { blindnessStrength: "heavy" },
      q: null,
      t: null,
      tr: 0,
      p: 5,
    },
  ],
}));
assert.equal(api.appendPayloadToDescription, undefined);
assert.equal(api.stripMarkers, undefined);
assert.equal(api.parsePayloadsFromDescription, undefined);
assert.equal(api.readPayloadsFromItem, undefined);

api.registerItemRules("Strict Blindfold", {
  v: 1,
  id: "low",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "light" }, p: 1 }],
});
api.registerItemRules("Heavy Blindfold", {
  v: 1,
  id: "high",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "heavy" }, p: 2 }],
});
assert.equal(api.getRegistry().length, 2);

function registryPayloadsForItem(item) {
  const name = String(item.Craft?.Name || "").toLowerCase();
  const entry = api.getRegistry().find((candidate) => name.includes(candidate.itemName.toLowerCase()));
  return entry ? [entry.payload] : [];
}

const desired = api.collectDesiredRulesFromAppearance([
  { Asset: { Group: { Category: "Item" } }, Craft: { Name: "Strict Blindfold", MemberNumber: 12345 } },
  { Asset: { Group: { Category: "Item" } }, Craft: { Name: "Heavy Blindfold", MemberNumber: 12345 } },
], { getLocalPayloadsForItem: registryPayloadsForItem });

assert.equal(desired.desired.size, 1);
assert.equal(desired.desired.get("alt_restrict_sight").conditionData.data.customData.blindnessStrength, "heavy");

api.registerItemRules("Conflict A", {
  v: 1,
  id: "a",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "light" }, p: 1 }],
});
api.registerItemRules("Conflict B", {
  v: 1,
  id: "b",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "heavy" }, p: 1 }],
});
const conflict = api.collectDesiredRulesFromAppearance([
  { Asset: { Group: { Category: "Item" } }, Craft: { Name: "Conflict A", MemberNumber: 12345 } },
  { Asset: { Group: { Category: "Item" } }, Craft: { Name: "Conflict B", MemberNumber: 12345 } },
], { getLocalPayloadsForItem: registryPayloadsForItem });

assert.equal(conflict.desired.size, 0);
assert.equal(conflict.conflicts.length, 1);

api.registerItemRules("Clothes Rule", {
  v: 1,
  id: "clothes",
  r: [{ k: "alt_restrict_sight" }],
});
const defaultScan = api.collectDesiredRulesFromAppearance([
  { Asset: { Group: { Category: "Appearance" } }, Craft: { Name: "Clothes Rule", MemberNumber: 12345 } },
], { getLocalPayloadsForItem: registryPayloadsForItem });
assert.equal(defaultScan.desired.size, 0);
const wideScan = api.collectDesiredRulesFromAppearance([
  { Asset: { Group: { Category: "Appearance" } }, Craft: { Name: "Clothes Rule", MemberNumber: 12345 } },
], { scanItemCategoryOnly: false, getLocalPayloadsForItem: registryPayloadsForItem });
assert.equal(wideScan.desired.size, 1);
assert.equal(api.deleteRegisteredItem("Clothes Rule"), true);
assert.equal(api.getRegistry().some((entry) => entry.itemName === "Clothes Rule"), false);
assert.equal(typeof api.requestItemRules, "function");
assert.equal(api.requestItemRules({}), null);
assert.equal(typeof api.clearRuleCache, "function");

const requestId = api.requestItemRules({
  Asset: { Name: "Blindfold", Group: { Name: "ItemHead", Category: "Item" } },
  Color: ["#111111"],
  Craft: { Name: "Remote Blindfold", MemberNumber: "67890", Description: "registry phrase" },
  Property: { Difficulty: 8 },
});
assert.equal(typeof requestId, "string");
assert.equal(serverSends.length, 1);
assert.equal(serverSends[0].type, "AccountBeep");
assert.equal(serverSends[0].packet.MemberNumber, 67890);
assert.equal(serverSends[0].packet.BeepType, "Leash");
assert.equal(serverSends[0].packet.IsSecret, true);
assert.equal(serverSends[0].packet.Message.IsBCXIR, true);
assert.equal(serverSends[0].packet.Message.type, "command");
assert.equal(serverSends[0].packet.Message.target, 67890);
assert.equal(serverSends[0].packet.Message.version, 1);
assert.equal(serverSends[0].packet.Message.command.name, "bcxir-item-rules-request");
const outgoingArgs = serverSends[0].packet.Message.command.args;
assert.equal(outgoingArgs.find((arg) => arg.name === "itemName").value, "Remote Blindfold");
const outgoingBundle = outgoingArgs.find((arg) => arg.name === "item").value;
assert.equal(outgoingBundle.Group, "ItemHead");
assert.equal(outgoingBundle.Name, "Blindfold");
assert.equal(JSON.stringify(outgoingBundle.Color), JSON.stringify(["#111111"]));
assert.equal(outgoingBundle.Craft.Name, "Remote Blindfold");
assert.equal(outgoingBundle.Craft.MemberNumber, "67890");
assert.equal(outgoingBundle.Property.Difficulty, 8);
assert.equal(api.requestItemRules({
  Asset: { Name: "Cuffs", Group: { Name: "ItemArms", Category: "Item" } },
  Craft: { Name: "No Crafter" },
}), null);
assert.equal(serverSends.length, 1);
const overrideRequestId = api.requestItemRules({
  Asset: { Name: "Collar", Group: { Name: "ItemNeck", Category: "Item" } },
  Craft: { Name: "Override Collar" },
}, 77777);
assert.equal(typeof overrideRequestId, "string");
assert.equal(serverSends.length, 2);
assert.equal(serverSends[1].packet.MemberNumber, 77777);

serverSends.length = 0;
const coolingItem = {
  Asset: { Name: "Harness", Group: { Name: "ItemTorso", Category: "Item" } },
  Craft: { Name: "Cooling Harness", MemberNumber: 88888 },
};
assert.equal(typeof api.requestItemRules(coolingItem), "string");
assert.equal(serverSends.length, 1);
assert.equal(api.requestItemRules(coolingItem), null);
assert.equal(serverSends.length, 1);
currentTime += 30001;
assert.equal(api.requestItemRules(coolingItem), null);
assert.equal(serverSends.length, 1);
currentTime += 59999;
assert.equal(api.requestItemRules(coolingItem), null);
assert.equal(serverSends.length, 1);
currentTime += 1;
assert.equal(typeof api.requestItemRules(coolingItem), "string");
assert.equal(serverSends.length, 2);

let passThroughCalled = false;
runHook("ServerAccountBeep", [{ BeepType: "Leash", Message: { IsBCXIR: false } }], () => {
  passThroughCalled = true;
});
assert.equal(passThroughCalled, true);

serverSends.length = 0;
runHook("ServerAccountBeep", [{
  MemberNumber: 24680,
  BeepType: "Leash",
  Message: {
    IsBCXIR: true,
    type: "command",
    target: 12345,
    version: 1,
    command: {
      name: "bcxir-item-rules-request",
      args: [
        { name: "requestId", value: "incoming-request" },
        { name: "itemName", value: "Strict Blindfold" },
        {
          name: "item",
          value: {
            Group: "ItemHead",
            Name: "Blindfold",
            Craft: { Name: "Strict Blindfold", Description: "" },
          },
        },
      ],
    },
  },
}], () => {
  throw new Error("BCXIR beep should be consumed");
});
assert.equal(serverSends.length, 1);
assert.equal(serverSends[0].packet.MemberNumber, 24680);
assert.equal(serverSends[0].packet.BeepType, "Leash");
assert.equal(serverSends[0].packet.Message.IsBCXIR, true);
assert.equal(serverSends[0].packet.Message.command.name, "bcxir-item-rules-response");
assert.equal(serverSends[0].packet.Message.command.args.find((arg) => arg.name === "requestId").value, "incoming-request");

serverSends.length = 0;
api.updateRegisteredItem("Strict Blindfold", { selfOnly: true });
assert.equal(api.getRegistry().find((entry) => entry.itemName === "Strict Blindfold").selfOnly, true);
runHook("ServerAccountBeep", [{
  MemberNumber: 24680,
  BeepType: "Leash",
  Message: {
    IsBCXIR: true,
    type: "command",
    target: 12345,
    version: 1,
    command: {
      name: "bcxir-item-rules-request",
      args: [
        { name: "requestId", value: "self-only-request" },
        { name: "itemName", value: "Strict Blindfold" },
        { name: "item", value: { Group: "ItemHead", Name: "Blindfold", Craft: { Name: "Strict Blindfold" } } },
      ],
    },
  },
}], () => {
  throw new Error("BCXIR self-only beep should be consumed");
});
assert.equal(serverSends.length, 0);
api.updateRegisteredItem("Strict Blindfold", { selfOnly: false });

serverSends.length = 0;
api.requestItemRules({
  Asset: { Name: "Gag", Group: { Name: "ItemMouth", Category: "Item" } },
  Craft: { Name: "Response Test", MemberNumber: 55555 },
});
const pendingRequestId = serverSends[0].packet.Message.command.args.find((arg) => arg.name === "requestId").value;
runHook("ServerAccountBeep", [{
  MemberNumber: 44444,
  BeepType: "Leash",
  Message: {
    IsBCXIR: true,
    type: "command",
    target: 12345,
    version: 1,
    command: {
      name: "bcxir-item-rules-response",
      args: [
        { name: "requestId", value: pendingRequestId },
        { name: "itemName", value: "Response Test" },
        { name: "payload", value: payload },
      ],
    },
  },
}], () => {});
assert.equal(localStore.has("BCXIR_rule_cache_12345"), false);
runHook("ServerAccountBeep", [{
  MemberNumber: 55555,
  BeepType: "Leash",
  Message: {
    IsBCXIR: true,
    type: "command",
    target: 12345,
    version: 1,
    command: {
      name: "bcxir-item-rules-response",
      args: [
        { name: "requestId", value: pendingRequestId },
        { name: "itemName", value: "Response Test" },
        { name: "payload", value: payload },
      ],
    },
  },
}], () => {});
assert.ok(localStore.get("BCXIR_rule_cache_12345"));

context.window.ChatRoomCharacter = [];
context.window.ChatRoomCharacterDrawlist = [];
context.window.Player.Appearance = [{
  Asset: { Name: "Gag", Group: { Name: "ItemMouth", Category: "Item" } },
  Craft: { Name: "Response Test", MemberNumber: 55555 },
}];
api.updateSettings({
  enabled: true,
  rulePermissionMode: "creator",
  allowCachedOfflineCreator: true,
});
serverSends.length = 0;
assert.equal(await api.syncNow("cached-creator-test"), true);
const savedManaged = JSON.parse(localStore.get("BCXIR_state_12345")).managed;
assert.equal(savedManaged.alt_restrict_sight.appliedSenderMemberNumber, 55555);
assert.equal(savedManaged.alt_restrict_sight.appliedSenderWasMinimal, true);
assert.equal(context.window.ChatRoomCharacter.some((character) => character.MemberNumber === 55555), false);
assert.equal(context.window.ChatRoomCharacterDrawlist.some((character) => character.MemberNumber === 55555), false);
assert.equal(serverSends.some((entry) => entry.type === "ChatRoomChat"), false);
api.updateSettings({ allowForeignItemRules: false, autoRequestForeignRules: true });
serverSends.length = 0;
assert.equal(api.requestItemRules({
  Asset: { Name: "Gag", Group: { Name: "ItemMouth", Category: "Item" } },
  Craft: { Name: "Blocked Foreign", MemberNumber: 99999 },
}), null);
assert.equal(serverSends.length, 0);
assert.equal(await api.syncNow("foreign-disabled-cleanup"), true);
assert.equal(JSON.parse(localStore.get("BCXIR_state_12345")).managed.alt_restrict_sight, undefined);

assert.equal(api.getSettings().enabled, true);
assert.equal(api.getSettings().rulePermissionMode, "creator");
assert.equal(api.getSettings().allowCachedOfflineCreator, true);
assert.equal(api.getSettings().allowForeignItemRules, false);
api.updateSettings({ allowForeignItemRules: true });
assert.equal(api.getSettings().respondToRuleRequests, true);
assert.equal(api.getSettings().autoRequestForeignRules, true);
assert.equal(api.getSettings().showTransportMessages, true);
api.updateSettings({ dangerModeEnabled: false, unlockUseMeMode: true, rulePermissionMode: "useMe", useMeSuspendInactiveConflicts: true });
assert.equal(api.getSettings().dangerModeEnabled, false);
assert.equal(api.getSettings().unlockUseMeMode, false);
assert.equal(api.getSettings().rulePermissionMode, "creator");
assert.equal(api.getSettings().useMeSuspendInactiveConflicts, false);
api.updateSettings({ dangerModeEnabled: true, unlockUseMeMode: true, rulePermissionMode: "useMe" });
assert.equal(api.getSettings().dangerModeEnabled, true);
assert.equal(api.getSettings().unlockUseMeMode, true);
assert.equal(api.getSettings().rulePermissionMode, "useMe");
localStore.delete("BCXIR_state_12345");
Object.keys(bcxRuleConditions).forEach((key) => delete bcxRuleConditions[key]);
context.window.Player.Appearance = [{
  Asset: { Name: "Blindfold", Group: { Name: "ItemHead", Category: "Item" } },
  Craft: { Name: "Strict Blindfold", MemberNumber: 12345 },
}];
bcxRuleConditions.alt_restrict_sight = {
  active: true,
  favorite: false,
  timer: null,
  timerRemove: false,
  requirements: null,
  data: { enforce: true, log: true, customData: { blindnessStrength: "existing-active" } },
};
assert.equal(await api.syncNow("useme-active-conflict"), true);
assert.equal(bcxRuleConditions.alt_restrict_sight.data.customData.blindnessStrength, "existing-active");
assert.equal(JSON.parse(localStore.get("BCXIR_state_12345")).managed.alt_restrict_sight, undefined);
bcxRuleConditions.alt_restrict_sight.active = false;
bcxRuleConditions.alt_restrict_sight.data.customData.blindnessStrength = "existing-inactive";
assert.equal(await api.syncNow("useme-inactive-conflict-no-suspend"), true);
assert.equal(bcxRuleConditions.alt_restrict_sight.active, false);
assert.equal(bcxRuleConditions.alt_restrict_sight.data.customData.blindnessStrength, "existing-inactive");
api.updateSettings({ useMeSuspendInactiveConflicts: true });
assert.equal(await api.syncNow("useme-inactive-suspend"), true);
assert.equal(bcxRuleConditions.alt_restrict_sight.active, true);
assert.equal(bcxRuleConditions.alt_restrict_sight.data.customData.blindnessStrength, "light");
let useMeManaged = JSON.parse(localStore.get("BCXIR_state_12345")).managed.alt_restrict_sight;
assert.equal(useMeManaged.appliedContextKind, "useMe");
assert.equal(useMeManaged.suspendedExistingInactive, true);
context.window.Player.Appearance = [];
assert.equal(await api.syncNow("useme-inactive-restore"), true);
assert.equal(bcxRuleConditions.alt_restrict_sight.active, false);
assert.equal(bcxRuleConditions.alt_restrict_sight.data.customData.blindnessStrength, "existing-inactive");
assert.equal(JSON.parse(localStore.get("BCXIR_state_12345")).managed.alt_restrict_sight, undefined);
api.updateSettings({ dangerModeEnabled: true, unlockUseMeMode: false, rulePermissionMode: "self", useMeSuspendInactiveConflicts: true });
localStore.delete("BCXIR_state_12345");
context.window.Player.Appearance = [{
  Asset: { Name: "Blindfold", Group: { Name: "ItemHead", Category: "Item" } },
  Craft: { Name: "Strict Blindfold", MemberNumber: 12345 },
}];
bcxRuleConditions.alt_restrict_sight = {
  active: false,
  favorite: false,
  timer: null,
  timerRemove: false,
  requirements: null,
  data: { enforce: true, log: true, customData: { blindnessStrength: "self-existing-inactive" } },
};
assert.equal(await api.syncNow("replacement-without-useme"), true);
assert.equal(bcxRuleConditions.alt_restrict_sight.active, true);
assert.equal(bcxRuleConditions.alt_restrict_sight.data.customData.blindnessStrength, "light");
let replacementManaged = JSON.parse(localStore.get("BCXIR_state_12345")).managed.alt_restrict_sight;
assert.equal(replacementManaged.appliedContextKind, "self");
assert.equal(replacementManaged.suspendedExistingInactive, true);
context.window.Player.Appearance = [];
assert.equal(await api.syncNow("replacement-without-useme-restore"), true);
assert.equal(bcxRuleConditions.alt_restrict_sight.active, false);
assert.equal(bcxRuleConditions.alt_restrict_sight.data.customData.blindnessStrength, "self-existing-inactive");
assert.equal(JSON.parse(localStore.get("BCXIR_state_12345")).managed.alt_restrict_sight, undefined);
api.updateSettings({ dangerModeEnabled: false, unlockUseMeMode: true, rulePermissionMode: "useMe", useMeSuspendInactiveConflicts: true });
assert.equal(api.getSettings().rulePermissionMode, "creator");
assert.equal(api.getSettings().unlockUseMeMode, false);
assert.equal(api.getSettings().useMeSuspendInactiveConflicts, false);
const updatedSettings = api.updateSettings({ enabled: false, debugLogging: true });
assert.equal(updatedSettings.enabled, false);
assert.equal(updatedSettings.debugLogging, true);
assert.equal(extensionSyncKey, "BCXIR");
assert.ok(context.window.Player.ExtensionSettings.BCXIR);
assert.ok(localStore.get("BCXIR_12345_backup"));

assert.equal(api.openSettings(), true);
assert.equal(registeredExtensionSetting.Identifier, "BCXIR");
assert.equal(registeredExtensionSetting.ButtonText(), "BCXIR Settings");
context.window.TranslationLanguage = "zh-CN";
assert.equal(registeredExtensionSetting.ButtonText(), "BCXIR 设置");
delete context.window.TranslationLanguage;
assert.equal(typeof registeredExtensionSetting.load, "function");
assert.equal(typeof registeredExtensionSetting.run, "function");
assert.equal(typeof registeredExtensionSetting.click, "function");
assert.equal(typeof registeredExtensionSetting.exit, "function");
assert.equal(typeof registeredExtensionSetting.unload, "function");
registeredExtensionSetting.load();
context.window.MouseX = 600;
context.window.MouseY = 477;
registeredExtensionSetting.click();
context.window.MouseX = 1360;
context.window.MouseY = 205;
registeredExtensionSetting.click();
assert.ok(api.getRegistry().some((entry) => entry.itemName.startsWith("BCXIR Item No.")));
context.window.ElementSetValue("bcxir-item-rules-name", "Menu Registered Item");
context.window.MouseX = 1300;
context.window.MouseY = 681;
registeredExtensionSetting.click();
assert.ok(api.getRegistry().some((entry) => entry.itemName === "Menu Registered Item"));
assert.equal(elements.has("bcxir-item-rules-name"), false);
context.window.MouseX = 600;
context.window.MouseY = 545;
registeredExtensionSetting.click();
context.window.MouseX = 1300;
context.window.MouseY = 205;
registeredExtensionSetting.click();
assert.equal(api.getSettings().rulePermissionMode, "self");
context.window.MouseX = 1300;
context.window.MouseY = 817;
registeredExtensionSetting.click();
context.window.MouseX = 600;
context.window.MouseY = 613;
registeredExtensionSetting.click();
context.window.MouseX = 1190;
context.window.MouseY = 341;
registeredExtensionSetting.click();
assert.equal(api.getSettings().dangerModeEnabled, true);
assert.equal(api.getSettings().unlockUseMeMode, false);
context.window.MouseY = 477;
registeredExtensionSetting.click();
assert.equal(api.getSettings().unlockUseMeMode, false);
assert.equal(api.getSettings().useMeSuspendInactiveConflicts, true);
context.window.MouseY = 409;
registeredExtensionSetting.click();
assert.equal(api.getSettings().unlockUseMeMode, true);
context.window.MouseY = 477;
registeredExtensionSetting.click();
assert.equal(api.getSettings().useMeSuspendInactiveConflicts, false);
context.window.MouseX = 1300;
context.window.MouseY = 681;
registeredExtensionSetting.click();

assert.equal(typeof api.openAuthoring, "function");
assert.equal(typeof api.finishAuthoring, "function");
assert.equal(typeof api.cancelAuthoring, "function");
assert.equal(typeof api.getAuthoringState, "function");
assert.equal(api.getAuthoringState().status, "idle");
assert.equal(api.getAuthoringState().bcxVersionReady, false);
assert.equal(api.getAuthoringState().transportActive, false);
assert.equal(api.getAuthoringState().bridgeActive, false);
assert.equal(api.getAuthoringState().nativeRoomActive, null);
assert.equal(api.getAuthoringState().lastInboundType, null);
assert.equal(api.getAuthoringState().lastOutboundType, null);
assert.equal(api.getAuthoringState().lastQuery, null);
assert.equal(api.getAuthoringState().queryCount, 0);
assert.equal(api.getAuthoringState().messageCount, 0);
assert.equal(api.getAuthoringState().lastInitStep, null);
context.window.ChatRoomCharacter = [];
context.window.ChatRoomCharacterDrawlist = [];
context.window.CurrentModule = "Character";
context.window.CurrentScreen = "Preference";
context.window.InformationSheetSelection = context.window.Player;
delete context.window.CraftingItem;
virtualReady = true;
api.registerItemRules("Menu Authoring Item", {
  v: 1,
  id: "existing-menu-authoring",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "light" }, p: 3 }],
});
screenChanges.length = 0;
preferenceActions.length = 0;
informationSheetClicks.length = 0;
assert.equal(await api.openAuthoring({ itemName: "Menu Authoring Item", returnTo: "settingsItemRules" }), true);
assert.deepEqual(screenChanges[screenChanges.length - 1], ["Character", "InformationSheet"]);
runTimersUntil(() => informationSheetClicks.length > 0);
assert.deepEqual(informationSheetClicks[0], [1820, 690]);
context.window.CurrentModule = "Character";
context.window.CurrentScreen = "InformationSheet";
assert.equal((await api.finishAuthoring())?.itemName, "Menu Authoring Item");
const reloadedAuthoringEntry = api.getRegistry().find((entry) => entry.itemName === "Menu Authoring Item");
assert.equal(reloadedAuthoringEntry.payload.r.length, 1);
assert.equal(reloadedAuthoringEntry.payload.r[0].k, "alt_restrict_sight");
assert.equal(reloadedAuthoringEntry.payload.r[0].d.blindnessStrength, "light");
assert.equal(context.window.InformationSheetSelection, context.window.Player);
assert.equal(context.window.InformationSheetSelection?.MemberNumber, 12345);
context.window.CommonSetScreen("Character", "InformationSheet");
assert.deepEqual(screenChanges[screenChanges.length - 1], ["Character", "InformationSheet"]);
runTimersUntil(() => screenChanges[screenChanges.length - 1]?.[1] === "Preference");
assert.deepEqual(screenChanges[screenChanges.length - 1], ["Character", "Preference"]);
assert.deepEqual(preferenceActions.slice(0, 2), [["open", "Extensions"], ["extensionOpen", "BCXIR"]]);
assert.equal(context.window.PreferenceSubscreen.name, "Extensions");
assert.equal(context.window.PreferenceExtensionsCurrent, registeredExtensionSetting);
assert.equal(elements.has("bcxir-item-rules-name"), true);
assert.equal(context.window.ElementValue("bcxir-item-rules-name"), "Menu Authoring Item");
registeredExtensionSetting.unload();
assert.equal(elements.has("bcxir-item-rules-name"), false);
delete context.window.ChatRoomCharacter;
delete context.window.ChatRoomCharacterDrawlist;
assert.equal(await api.openAuthoring(), false);
assert.equal(api.cancelAuthoring(), false);
assert.equal(await api.finishAuthoring(), null);

console.log("BCXIR core tests passed");
