---
title: Public API & Development
description: The window.BCXItemRules API, build commands, and source layout.
order: 90
---

## Public API

BCXIR exposes helpers on `window.BCXItemRules`:

```js
window.BCXItemRules.getRegistry()
window.BCXItemRules.registerItemRules("Strict Blindfold", payload)
window.BCXItemRules.deleteRegisteredItem("Strict Blindfold")
window.BCXItemRules.updateRegisteredItem("Strict Blindfold", { selfOnly: true })
window.BCXItemRules.requestItemRules(item)
window.BCXItemRules.clearRuleCache()
window.BCXItemRules.syncNow()
window.BCXItemRules.openSettings()
```

| Method | Description |
| --- | --- |
| `getRegistry()` | Returns the local registry of item rule entries. |
| `registerItemRules(name, payload)` | Register or replace the rule payload for an item name. |
| `deleteRegisteredItem(name)` | Remove a registry entry. |
| `updateRegisteredItem(name, patch)` | Update entry fields (e.g. `{ selfOnly: true }`). |
| `requestItemRules(item)` | Request the rule payload for a worn item from its creator. |
| `clearRuleCache()` | Clear the local remote-rule cache. |
| `syncNow()` | Force a synchronization pass. |
| `openSettings()` | Open the BCXIR settings menu. |

`encodePayload` and `decodePayload` remain available as compact payload utilities, but they are **not** used for `Craft.Description` storage.

## Development

```sh
npm install
npm run dev
npm run check
npm test
npm run build
```

`npm run dev` starts a Vite userscript dev server on:

```text
http://127.0.0.1:5181
```

`npm run build` writes:

- `dist/BCXItemRules.script.js`
- `dist/BCXItemRules.loader.user.js`
- root copies of both files
- `BCXItemRules.user.js` as a loader alias

The hosted script base URL is configured in `package.json`:

```json
{
  "bcxir": {
    "remoteBase": "https://bondage-studio.github.io/BCX-Item-Rules"
  }
}
```

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/entry/` | Userscript entry point. |
| `src/app/` | Bootstrap wiring and public API assembly. |
| `src/core/` | Payload helpers, item registry/cache matching, scanner, rule synchronization. |
| `src/authoring/` | Virtual BCX character authoring and registry save flow. |
| `src/settings/` | Settings persistence and BC canvas settings screens. |
| `src/platform/` | BC/BCX/browser integration, ModSDK hooks, item-rule transport, local reporting. |
| `src/shared/` | Constants, i18n, types, utilities, local managed-state storage. |

## Documentation

These docs live in the repo's `site/` directory as locale-namespaced Markdown
(`site/en/…` and `site/zh/…`) and are aggregated by the central org website,
**[bondage-studio.github.io](https://bondage-studio.github.io)**, at build time —
published under `/bcxir/` (and `/zh/bcxir/`). Editing a `site/**/*.md` file and
pushing to `main` triggers a site rebuild via the `notify-site` workflow.

The three userscripts are built at the repo root and hosted on the project's own
GitHub Pages deployment by `.github/workflows/pages.yml`.

## Release checklist

Before publishing:

```sh
npm run check
npm test
npm run build
```

Then publish or commit these root generated files:

- `BCXItemRules.loader.user.js`
- `BCXItemRules.user.js`
- `BCXItemRules.script.js`

`dist/` contains the same build outputs for local inspection, but it is gitignored. Make sure `package.json` `bcxir.remoteBase` points to where `BCXItemRules.script.js` is hosted.