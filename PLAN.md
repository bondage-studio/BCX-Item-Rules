# BCX Item Rules Project Plan

## Summary

- Standalone Bondage Club userscript, independent from Vivian's Portable Wardrobe.
- Published as a loader plus online script: users install `BCXItemRules.loader.user.js`, which fetches `BCXItemRules.script.js` with cache-busting query parameters.
- Applies BCX rules to the local player while they wear crafted items whose names resolve to BCXIR payloads.
- Uses LSCG-style local registration and private request/response communication instead of storing payloads in `Craft.Description`.
- Does not write BCX internal storage or `Player.ExtensionSettings.BCX`.
- Keeps the existing conservative conflict behavior: do not overwrite user-owned rules, and do not delete rules not managed by BCXIR.

## Current Protocol

The primary protocol is local registry plus item-rule request beeps:

- Creator registry: `localStorage["BCXIR_registry_<MemberNumber>"]`.
- Wearer cache: `localStorage["BCXIR_rule_cache_<MemberNumber>"]`.
- Registry key: crafted item name, normalized case-insensitively.
- Matching: LSCG-style case-insensitive phrase match against item name plus description text.
- Wire format: LSCG-style private `AccountBeep` with `BeepType: "Leash"` and `Message.IsBCXIR === true`.
- Request command: `bcxir-item-rules-request`.
- Response command: `bcxir-item-rules-response`.
- Missing responses use per-crafter/item exponential cooldown to avoid repeated polling pressure.

Description marker compatibility has been removed. Old `[BCXIR:v1:<encoded>]` markers are ignored and are no longer documented as a supported storage path.

## Payload Shape

```ts
type EncodedPayload = {
  v: 1
  id: string
  r: Array<{
    k: string
    e?: 0 | 1
    l?: 0 | 1
    d?: Record<string, unknown>
    q?: Record<string, unknown> | null
    t?: number | null
    tr?: 0 | 1
    p?: number
  }>
}
```

## Runtime Behavior

- On `CharacterRefresh`, room sync, wardrobe apply, and fallback ticks, scan `Player.Appearance`.
- Only inspect worn items with `item.Asset.Group.Category === "Item"` by default.
- Self-crafted item: resolve payload from the local registry.
- Other-crafted item: resolve payload from local cache, or request it from `item.Craft.MemberNumber`.
- Received responses are accepted only from the item crafter and cached locally.
- Repeated unresolved requests cool down from 30 seconds up to 10 minutes per crafter/item.
- Per-item `selfOnly` registry entries do not answer other players' requests.
- `allowForeignItemRules=false` disables remote requests, remote cache application, and cached offline creator identities.
- Desired active rules are computed from all registry/cache payloads for currently worn items.
- Apply through BCX public Mod API queries in self mode, through a controlled local BCX hidden-message query in creator mode so BCX sees the item creator as `sender`, or through the opt-in `Please use me` local operator mode.
- Cached remote item rules can keep applying when the creator is offline by temporarily inserting a minimal local creator character into `ChatRoomCharacter`; this character is not drawn, synced, or granted forced item permission.
- `Dangerous Mode` is a separate settings page with a master switch. After that master switch is enabled, `Please use me` and `Replacement Mode` are controlled by two independent switches.
- `Please use me` temporarily inserts a local operator character for BCX handler calls, bypassing normal self-permission blocks without directly editing `Player.ExtensionSettings.BCX`.
- `Replacement Mode` applies only while `Please use me` is selected at runtime. Existing active rules are still skipped, but existing inactive same-rule conflicts can be saved, replaced, and restored when the item is removed.

## Conflict Handling

- Maintain local managed state keyed by player member number.
- If a desired rule already exists and is not plugin-managed, skip it and report a conflict.
- If multiple worn items request the same rule:
  - exact same config dedupes cleanly
  - highest `p` wins
  - equal priority with different config becomes a conflict and is skipped
- When an item is removed:
  - restore the previous BCX snapshot when one exists
  - delete only plugin-created rules when no previous snapshot exists
  - release management if the user changed the rule after plugin application

## Source Layout

```text
src/
  entry/      userscript entry point
  app/        bootstrap wiring and public API assembly
  core/       payload helpers, scanner, item registry/cache, synchronizer
  authoring/  crafting hook, virtual BCX character authoring, export flow
  settings/   settings storage plus BC canvas settings screens
  platform/   BC/BCX/browser adapters, hooks, reporter, transport, root access
  shared/     constants, shared types, utilities, local managed-state storage
```

## Settings

- Register `BCXIR Settings` in Bondage Club's native extension settings menu with `PreferenceRegisterExtensionSetting`.
- Store settings in `Player.ExtensionSettings.BCXIR`.
- Keep local backup at `localStorage["BCXIR_<MemberNumber>_backup"]`.
- Default rule permission mode is creator-based. Advanced settings can switch back to self mode or disable cached offline creator identities.
- Dangerous Mode settings provide one master switch and two independent child switches: `Please use me` and `Replacement Mode`.
- The settings menu owns item-rule registration through an LSCG-style `Item Rules` subpage.
- Settings are split into overview, item rules, `Runtime / Sharing / Backup`, `Dangerous Mode`, and `Diagnostics` pages.
- The menu is intentionally deduplicated: item registration only keeps registration/editing controls, daily runtime/sharing/backup controls share one page, and diagnostics/advanced cleanup share one troubleshooting page.
- The non-item asset scan toggle is not exposed in the menu; the runtime keeps the default item-category-only behavior unless changed through lower-level APIs.
- Settings UI text uses a local i18n table with English fallback and Simplified Chinese support, selected from BC/browser language globals.
- Crafting/Create screen hooks are currently paused and not registered.

## Loader Build

- `BCXItemRules.script.js` is the built runtime script.
- `BCXItemRules.loader.user.js` is the installable userscript loader.
- `BCXItemRules.user.js` is kept as a loader alias for older install paths.
- Loader fetches `lz-string` and the runtime script with `GM_xmlhttpRequest`.
- Loader appends `bcxirLoader=<version>&t=<Date.now()>` to remote URLs to avoid stale CDN/browser caches.
- Hosted script base URL is configured by `package.json` `bcxir.remoteBase`.

## Virtual Character Authoring

- The `Item Rules` settings page opens the virtual BCX rule editor for the selected registered item name.
- The authoring session creates a temporary local `BCXIR Authoring` room character.
- After opening the virtual character Information Sheet, BCXIR triggers BCX's own Information Sheet button locally so the user lands in the BCX menu instead of stopping on bio/profile.
- BCX hidden chat and beep traffic targeting the virtual member number is consumed locally and answered from an in-memory virtual rule store.
- Finishing authoring exports active virtual rules into a compact payload and saves it into the creator's local registry under a confirmed item name.
- Menu-launched authoring returns to the `Item Rules` settings subpage after finish or cancel.
- Because BCX restores the Information Sheet asynchronously after `bcxSubscreenChange(false)`, BCXIR schedules a delayed idempotent restore back through `Character/Preference -> PreferenceOpenSubscreen("Extensions") -> PreferenceSubscreenExtensionsOpen("BCXIR") -> Item Rules` instead of restoring only inside the close callback.
- The delayed restore reselects the item name that launched authoring, so the user returns to the same registry entry after editing.
- The authoring path never modifies the player's own BCX rules.

## Plan Files

- `docs/plans/BCXIR_VIRTUAL_CHARACTER_AUTHORING.md`
- `docs/plans/BCXIR_LSCG_STYLE_LOCAL_REGISTRY.md`
- `docs/plans/BCXIR_CACHED_CREATOR_SENDER.md`
- `docs/plans/BCXIR_MENU_ITEM_REGISTRY.md`
- `docs/plans/BCXIR_AUTHORING_ENTRY_RETURN_FIX.md`
- `docs/plans/BCXIR_DELAYED_ITEM_RULES_RESTORE.md`
- `docs/plans/BCXIR_MENU_OPTIONS_UPDATE.md`
- `docs/plans/BCXIR_MENU_DEDUP_SIMPLIFICATION.md`
- `docs/plans/BCXIR_I18N.md`
- `docs/plans/BCXIR_LOADER_BUILD.md`
- `docs/plans/BCXIR_USE_ME_MODE.md`
