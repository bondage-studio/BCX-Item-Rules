---
title: BCX Item Rules
description: An independent Bondage Club userscript that links locally registered crafted item names to BCX Rules.
order: 10
---

**BCX Item Rules** (BCXIR) is an independent [Bondage Club](https://www.bondageprojects.com/)
userscript that links **locally registered crafted item names** to **BCX Rules**.
When a player wears a matching crafted item, BCXIR applies the registered BCX
rule payload to the local player through BCX — without ever writing to BCX's
internal storage (`Player.ExtensionSettings.BCX`).

## Highlights

- **🔗 Local item registry** — register crafted item names locally and attach
  BCX rules to them. Nothing is written into `Craft.Description` or BCX's own
  storage. See [Creating Item Rules](/bcxir/creating-rules).
- **📤 Share with wearers** — other players' games request your rule payload on
  demand via an LSCG-style private beep, and cache the result locally. See
  [Sharing & Permissions](/bcxir/sharing).
- **🛡️ Conservative & safe** — rules apply only to the local wearer, never
  overwrite your existing BCX rules, and are restored or removed cleanly when
  items come off. See [How It Works](/bcxir/how-it-works).

## Install in one minute

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Make sure **BCX** is installed and available in game as `window.bcx`.
3. Install the loader from the canonical, auto-updating URL:

   ```text
   https://bondage-studio.github.io/BCX-Item-Rules/BCXItemRules.loader.user.js
   ```

See the [Install guide](/bcxir/getting-started) for full details, or jump
straight to [creating your first item rule](/bcxir/quick-start).

## Downloads

| File | Purpose |
| --- | --- |
| [BCXItemRules.loader.user.js](https://bondage-studio.github.io/BCX-Item-Rules/BCXItemRules.loader.user.js) | The loader you install. Stays small and auto-updates the runtime. |
| [BCXItemRules.user.js](https://bondage-studio.github.io/BCX-Item-Rules/BCXItemRules.user.js) | Compatibility alias of the loader for older install URLs. |
| [BCXItemRules.script.js](https://bondage-studio.github.io/BCX-Item-Rules/BCXItemRules.script.js) | The hosted runtime script fetched by the loader. |

## Why BCXIR exists

Crafted items in Bondage Club carry a name, a creator member number, and a
description. BCX Rules are powerful, but they live in each player's own BCX
configuration and are not attached to items.

BCXIR bridges the two: a creator attaches a set of BCX rules to a **crafted item
name** they own. When someone wears that item, their game can fetch and apply
those rules locally — so an item can carry behavior with it, without ever
stuffing rule data into the item description.

## Core ideas

| Concept | Description |
| --- | --- |
| **Registry** | Your local list of crafted item names, each with an attached BCX rule payload. Stored per member number in `localStorage`. |
| **Authoring** | You edit an item's rules through a **temporary virtual BCX character**, using the real BCX Rules UI — but the result is saved to BCXIR's registry, not to your own BCX. |
| **Sharing** | When someone else wears your item, their game requests the payload from you over a private BCX-style beep. They cache the response locally. |
| **Permission mode** | Controls *as whom* a rule is applied locally: the item's creator, or yourself. |
| **Apply / restore** | When a matching item is worn the rule is applied; when it is removed the rule is restored or removed — without touching your unmanaged rules. |

## What BCXIR does **not** do

- It does **not** write to `Player.ExtensionSettings.BCX`.
- It does **not** store rule payloads in `Craft.Description` (old `[BCXIR:v1:...]` markers are no longer supported).
- It does **not** overwrite your existing, unmanaged BCX rules.
- It does **not** sync the temporary authoring/operator characters to the server.

## Requirements

- A userscript manager — **[Tampermonkey](https://www.tampermonkey.net/)** is recommended.
- **BCX** installed and available in game as `window.bcx`.

## Next steps

- [Install BCXIR](/bcxir/getting-started)
- [Quick Start: create and wear your first rule](/bcxir/quick-start)
- [Creating Item Rules](/bcxir/creating-rules)