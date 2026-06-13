import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("./BCXItemRules.user.js", import.meta.url), "utf8");

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

const context = {
  console,
  window: {
    LZString: fakeLz,
    localStorage: {
      getItem(key) { return localStore.get(key) || null; },
      setItem(key, value) { localStore.set(key, value); },
    },
    Player: {
      MemberNumber: 12345,
      ExtensionSettings: {},
      Appearance: [],
    },
    setTimeout() {},
    clearTimeout() {},
    setInterval() {},
    ServerPlayerExtensionSettingsSync(key) { extensionSyncKey = key; },
    PreferenceRegisterExtensionSetting(config) { registeredExtensionSetting = config; },
    CommonSetScreen() {},
  },
  LZString: fakeLz,
};

context.unsafeWindow = context.window;
vm.createContext(context);
vm.runInContext(source, context);

const api = context.window.BCXItemRules;

const payload = {
  v: 1,
  id: "demo",
  r: [
    { k: "alt_restrict_sight", d: { blindnessStrength: "heavy" }, p: 5 },
  ],
};

const description = api.appendPayloadToDescription("Human text", payload);
assert.match(description, /\[BCXIR:v1:/);
assert.equal(api.stripMarkers(description), "Human text");
assert.equal(JSON.stringify(api.parsePayloadsFromDescription(description).payloads[0]), JSON.stringify({
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

const descLow = api.appendPayloadToDescription("", {
  v: 1,
  id: "low",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "light" }, p: 1 }],
});
const descHigh = api.appendPayloadToDescription("", {
  v: 1,
  id: "high",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "heavy" }, p: 2 }],
});

const desired = api.collectDesiredRulesFromAppearance([
  { Asset: { Group: { Category: "Item" } }, Craft: { Description: descLow } },
  { Asset: { Group: { Category: "Item" } }, Craft: { Description: descHigh } },
]);

assert.equal(desired.desired.size, 1);
assert.equal(desired.desired.get("alt_restrict_sight").conditionData.data.customData.blindnessStrength, "heavy");

const descA = api.appendPayloadToDescription("", {
  v: 1,
  id: "a",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "light" }, p: 1 }],
});
const descB = api.appendPayloadToDescription("", {
  v: 1,
  id: "b",
  r: [{ k: "alt_restrict_sight", d: { blindnessStrength: "heavy" }, p: 1 }],
});
const conflict = api.collectDesiredRulesFromAppearance([
  { Asset: { Group: { Category: "Item" } }, Craft: { Description: descA } },
  { Asset: { Group: { Category: "Item" } }, Craft: { Description: descB } },
]);

assert.equal(conflict.desired.size, 0);
assert.equal(conflict.conflicts.length, 1);

const nonItemDescription = api.appendPayloadToDescription("", {
  v: 1,
  id: "clothes",
  r: [{ k: "alt_restrict_sight" }],
});
const defaultScan = api.collectDesiredRulesFromAppearance([
  { Asset: { Group: { Category: "Appearance" } }, Craft: { Description: nonItemDescription } },
]);
assert.equal(defaultScan.desired.size, 0);
const wideScan = api.collectDesiredRulesFromAppearance([
  { Asset: { Group: { Category: "Appearance" } }, Craft: { Description: nonItemDescription } },
], { scanItemCategoryOnly: false });
assert.equal(wideScan.desired.size, 1);

assert.equal(api.getSettings().enabled, true);
const updatedSettings = api.updateSettings({ enabled: false, debugLogging: true });
assert.equal(updatedSettings.enabled, false);
assert.equal(updatedSettings.debugLogging, true);
assert.equal(extensionSyncKey, "BCXIR");
assert.ok(context.window.Player.ExtensionSettings.BCXIR);
assert.ok(localStore.get("BCXIR_12345_backup"));

assert.equal(api.openSettings(), true);
assert.equal(registeredExtensionSetting.Identifier, "BCXIR");
assert.equal(registeredExtensionSetting.ButtonText, "BCXIR Settings");
assert.equal(typeof registeredExtensionSetting.load, "function");
assert.equal(typeof registeredExtensionSetting.run, "function");
assert.equal(typeof registeredExtensionSetting.click, "function");
assert.equal(typeof registeredExtensionSetting.exit, "function");
assert.equal(typeof registeredExtensionSetting.unload, "function");

assert.equal(typeof api.openAuthoring, "function");
assert.equal(typeof api.finishAuthoring, "function");
assert.equal(typeof api.cancelAuthoring, "function");
assert.equal(typeof api.getAuthoringState, "function");
assert.equal(api.getAuthoringState().status, "idle");
assert.equal(await api.openAuthoring(), false);
assert.equal(api.cancelAuthoring(), false);
assert.equal(await api.finishAuthoring(), null);

console.log("BCXIR core tests passed");
