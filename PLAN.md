# BCX Item Rules 独立插件协议方案

## Summary

- 做成独立 Bondage Club userscript，不依赖 VPW。
- 道具规则写入“被穿戴道具”的 craft metadata；只有同时安装本插件与 BCX 的玩家，在自己穿戴该道具时才解析并应用规则。
- 不直接写 BCX 内部 storage；通过 BCX 公共接口 `window.bcx.getModApi()` 与 query API 操作规则，降低版本冲突风险。
- 默认采取保守冲突策略：不覆盖玩家已有规则，不删除非本插件管理的规则。

## Public Protocol

- 在 crafted item 的 `Craft.Description` 末尾嵌入标记：

```text
[BCXIR:v1:<encoded>]
```

- `<encoded>` 为：

```js
LZString.compressToEncodedURIComponent(JSON.stringify(compactPayload))
```

- 线格式使用紧凑 schema：

```ts
type EncodedPayload = {
  v: 1
  id: string
  r: Array<{
    k: string
    e?: 0 | 1
    l?: 0 | 1
    d?: Record<string, unknown>
    q?: ConditionsRequirements | null
    t?: number | null
    tr?: 0 | 1
    p?: number
  }>
}
```

- UI/authoring layer may expose expanded names, but stored payload must remain compact to fit craft description limits.

## Runtime Behavior

- On `CharacterRefresh`, room sync, wardrobe apply, and a low-frequency fallback tick, scan `Player.Appearance`.
- Only inspect worn items with `item.Asset.Group.Category === "Item"` by default.
- Parse every valid `BCXIR` marker, validate each `rule` with `bcx.getModApi(modName).getRuleState(rule)` or `conditionsGet`.
- Compute desired active rule set as the union of all currently worn item payloads.
- Apply through BCX queries to `"Player"`:
  - `ruleCreate(ruleId)` if the rule is absent.
  - `conditionUpdate({ category: "rules", condition: ruleId, data })` to set `active/timer/timerRemove/requirements/favorite/data`.
  - Avoid `export_import_do_import` for live updates because BCX’s import path can remove rules missing from the imported category.

## Conflict Handling

- Maintain local plugin state keyed by player member number:
  - active item payload IDs
  - rules managed by this plugin
  - previous BCX condition snapshot before first plugin change
  - last plugin-applied condition snapshot
- If a desired rule already exists and is not recorded as plugin-managed, skip it and show/report a conflict.
- If multiple worn items request the same rule:
  - exact same config dedupes cleanly
  - highest `p` wins
  - equal priority with different config becomes a conflict and is skipped
- When an item is removed:
  - if no remaining worn item needs that rule, restore the previous BCX snapshot
  - if no previous snapshot existed, delete only plugin-created rules
  - if user changed the rule after plugin application, do not overwrite or delete; release management and report conflict.

## Test Plan

- Encode/decode round trip preserves human craft description and payload.
- Invalid marker, unknown rule, malformed `customData`, oversized payload, and missing BCX all fail gracefully.
- Wearing one item creates/applies its BCX rule; removing it restores or deletes according to previous state.
- Existing user rule is not overwritten.
- Two items with same rule/same config dedupe; same rule/different config triggers priority or conflict behavior.
- BCX permission/limit failures from `ruleCreate` or `conditionUpdate` are surfaced without retry loops.

## Assumptions

- Protocol-only scope for this step; full authoring UI and new project scaffolding are separate implementation work.
- BCX remains installed and available as `window.bcx`.
- Rules apply only to the local player wearing the item.
- Craft description is the primary portable storage location because arbitrary custom fields on item/property/craft may be stripped or collide with BC/BCX validation.

## Settings Page Integration Plan

### Summary

- Do not register into BCX's private menu internals; BCX's public API does not expose a menu-extension contract.
- Register `BCXIR Settings` in Bondage Club's native extension settings menu with `PreferenceRegisterExtensionSetting`.
- Keep the settings page independent from BCX UI while showing BCX availability in the page.
- Store BCXIR settings in `Player.ExtensionSettings.BCXIR`, never in `Player.ExtensionSettings.BCX`.

### Settings Schema

```ts
type BCXIRSettings = {
  v: 1
  enabled: boolean
  scanItemCategoryOnly: boolean
  showConflictMessages: boolean
  showInvalidPayloadMessages: boolean
  debugLogging: boolean
  fallbackSyncEnabled: boolean
}
```

Defaults:
- `enabled: true`
- `scanItemCategoryOnly: true`
- `showConflictMessages: true`
- `showInvalidPayloadMessages: true`
- `debugLogging: false`
- `fallbackSyncEnabled: true`

### Implementation Notes

- Add a lightweight settings registry with `load/run/click/exit/unload` lifecycle callbacks.
- Add a BC canvas-style settings screen base with checkbox and label rendering, leaving room for future text/dropdown/range controls.
- Save settings as `LZString.compressToBase64(JSON.stringify(settings))`.
- Sync settings with `ServerPlayerExtensionSettingsSync("BCXIR")`.
- Keep a local backup at `localStorage["BCXIR_<MemberNumber>_backup"]`.
- Expose `getSettings`, `updateSettings`, and `openSettings` on `window.BCXItemRules`.

### Runtime Integration

- If `enabled` is false, stop applying new item payloads and run the existing cleanup/restore path for plugin-managed rules.
- Use `scanItemCategoryOnly` to control whether scanner accepts only `Asset.Group.Category === "Item"`.
- Use message toggles to suppress local conflict/invalid-payload messages without hiding console diagnostics.
- Use `fallbackSyncEnabled` to control whether the periodic fallback sync timer starts.

## Source Layout Plan

The source tree is organized for later generated additions such as authoring UI, rule template editors, and diagnostics:

```text
src/
  entry/      userscript entry point
  app/        bootstrap wiring and public API assembly
  core/       protocol, scanner, condition conversion, synchronizer
  settings/   settings storage plus BC canvas settings screens
  platform/   BC/BCX/browser adapters, hooks, reporter, root access
  shared/     constants, shared types, utilities, local managed-state storage
```

Dependency direction:
- `entry` imports `app`.
- `app` wires together `core`, `settings`, `platform`, and `shared`.
- `core` stays protocol/runtime focused and depends only on `shared` plus platform adapters needed by the synchronizer.
- `settings` owns UI and settings persistence; future generated settings pages should go under `src/settings/screens/`.
- `platform` owns integrations with BC, BCX, ModSDK, and browser globals.

## Virtual Character Authoring Plan

- Add `src/authoring/` for crafting UI integration, virtual character lifecycle, virtual BCX query bridging, virtual rules storage, payload export, and clipboard copy.
- In the crafting screen, add a `BCXIR Rules` button that starts a local authoring session.
- The session creates a temporary `BCXIR Authoring` character in the local room and answers BCX hidden `query` messages for that virtual member number from an in-memory rules store.
- The virtual store supports the BCX Rules UI query surface and keeps non-rules modules disabled or stubbed.
- Finishing authoring converts active virtual rules to the compact BCXIR payload schema, copies the full marker to the clipboard, then removes the virtual character and bridge.
- This path never writes `Player.ExtensionSettings.BCX`, never imports BCX data, and never modifies the player's own BCX rules.
- Full notes are recorded in `docs/plans/BCXIR_VIRTUAL_CHARACTER_AUTHORING.md`.
