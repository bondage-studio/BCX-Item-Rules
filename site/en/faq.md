---
title: FAQ & Troubleshooting
description: Common problems and how to resolve them.
order: 100
---

## `BCXIR Settings` doesn't appear

- Confirm the loader is installed and enabled in Tampermonkey.
- Confirm you are on a supported Bondage Club domain and fully logged in.
- Confirm **BCX** is installed and available as `window.bcx`. BCXIR needs BCX to function.

## My item's rules don't apply when I wear it

- The registry entry name must match the crafted item **name exactly**.
- The entry must be **enabled**.
- For items you created, the rule comes from your **registry**; make sure the payload is not empty (edit it via **Edit BCX Rules**).
- Use **Item Rules → Match test** to verify the name matches.

## Someone else's item doesn't apply

- You must have **Foreign item rules** enabled (Runtime & Permissions).
- The creator must be reachable, or you must already have a **cached** payload from them (optionally with **cached offline creator** enabled).
- The creator may have marked the entry **self-only**, in which case it is never shared.
- Requests use **cooldown/backoff**; an immediate retry may be suppressed. Clear cooldowns from **Cache & Sharing** if needed.

## A rule stayed after I removed the item

BCXIR restores/removes managed rules conservatively. If a managed rule was changed outside BCXIR, it **releases management** and won't overwrite the external change. You can use **Debug / Diagnostics → Release managed rules** to hand back what BCXIR manages.

## Does BCXIR change my own BCX rules?

No. BCXIR never writes to `Player.ExtensionSettings.BCX` and never overwrites your existing, unmanaged BCX rules. See [How It Works](/bcxir/how-it-works).

## I installed an old `BCXItemRules.user.js`. Is it still valid?

Yes. `BCXItemRules.user.js` is an alias of the loader and keeps working. See [Install](/bcxir/getting-started).

## How do I back up my rules?

Use **Import / Export** to save your registry and settings as JSON. A local settings backup is also kept at `localStorage["BCXIR_<MemberNumber>_backup"]`.

## I want to apply rules even when BCX permissions would block me

That is what [Dangerous Mode → Please use me](/bcxir/dangerous-mode) is for. It is an advanced, opt-in mode — read that page before enabling it.

## Still stuck?

Open an issue on [GitHub](https://github.com/bondage-studio/BCX-Item-Rules/issues) with your BCXIR version and a description of what you expected versus what happened. The **Debug / Diagnostics** page can produce a diagnostic report to include.