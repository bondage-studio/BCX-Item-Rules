# BCX Item Rules

Independent Bondage Club userscript that applies BCX rules encoded inside crafted item descriptions while the local player wears those items.

## Install

Install `BCXItemRules.user.js` in Tampermonkey alongside BCX.

The script does not depend on Vivian's Portable Wardrobe. It only acts on the local `Player` and only when BCX is available as `window.bcx`.

## Development

This project is structured like a small BC userscript project:

- `src/entry/`: userscript entry point.
- `src/app/`: bootstrap wiring and `window.BCXItemRules` public API assembly.
- `src/core/`: portable protocol helpers and runtime rule computation/synchronization.
- `src/settings/`: extension settings persistence and BC canvas settings screens.
- `src/platform/`: BC/BCX/browser integration, ModSDK hooks, and local reporting.
- `src/shared/`: constants, types, utilities, and local managed-state storage.

Commands:

```sh
npm install
npm run dev
npm run build
npm run check
npm test
```

`npm run dev` starts a Vite userscript dev server on `127.0.0.1:5181`.

`npm run build` writes `dist/BCXItemRules.user.js` and copies that built userscript back to `BCXItemRules.user.js`, keeping the root install path stable.

## Protocol

Add this marker at the end of a crafted item's `Craft.Description`:

```text
[BCXIR:v1:<encoded>]
```

`<encoded>` is:

```js
LZString.compressToEncodedURIComponent(JSON.stringify(payload))
```

Payload shape:

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

The userscript exposes helpers on `window.BCXItemRules`:

```js
const payload = {
  v: 1,
  id: "blindfold-rule-demo",
  r: [
    { k: "alt_restrict_sight", d: { blindnessStrength: "heavy" }, p: 10 }
  ]
}

const nextDescription = window.BCXItemRules.appendPayloadToDescription(
  "A custom blindfold.",
  payload
)
```

## Runtime Semantics

- Scans `Player.Appearance` for worn item-category assets.
- Parses markers from `item.Craft.Description`.
- Creates or updates BCX rules only via `window.bcx.getModApi(...).sendQuery(...)`.
- Skips existing rules that were not created/managed by this script.
- If multiple worn items request the same rule, identical configs dedupe, higher `p` wins, equal-priority mismatches are skipped.
- When an item is removed, rules created by this script are deleted unless the rule was changed externally after application.

## Settings

BCXIR registers `BCXIR Settings` in Bondage Club's native extension settings menu.

Settings are stored in `Player.ExtensionSettings.BCXIR` and backed up to `localStorage["BCXIR_<MemberNumber>_backup"]`. The plugin never writes to `Player.ExtensionSettings.BCX`.

The public helper API also exposes:

```js
window.BCXItemRules.getSettings()
window.BCXItemRules.updateSettings({ debugLogging: true })
window.BCXItemRules.openSettings()
```

## Notes

This first implementation is protocol/runtime only. It intentionally does not include an in-game authoring UI.
