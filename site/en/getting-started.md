---
title: Install
description: Install the BCXIR loader and verify it in game.
order: 20
---

## Prerequisites

1. **A userscript manager.** [Tampermonkey](https://www.tampermonkey.net/) is recommended (Chrome, Edge, Firefox).
2. **BCX**, installed and working in game. BCXIR requires BCX to be available as `window.bcx`. If BCX is not present, BCXIR will not apply any rules.

## Install the loader

You only ever install the **loader**. The loader is tiny and fetches the latest runtime script automatically, so you rarely need to reinstall it.

Install from GitHub Pages — use the canonical, auto-updating URL (this is the URL the loader itself uses to fetch updates):

```text
https://bondage-studio.github.io/BCX-Item-Rules/BCXItemRules.loader.user.js
```

> **Compatibility alias.** If you previously installed from `BCXItemRules.user.js`, that file is an alias of the loader and still works:
>
> ```text
> https://bondage-studio.github.io/BCX-Item-Rules/BCXItemRules.user.js
> ```

When you open one of these links, Tampermonkey shows its install page. Review the `@match` entries and click **Install**. The loader runs with `@grant none` and needs no special permissions.

![Tampermonkey install page](../screenshots/install-tampermonkey.png)

## How loader updates work

The loader injects the online runtime script from GitHub Pages:

```text
https://bondage-studio.github.io/BCX-Item-Rules/BCXItemRules.script.js
```

Because GitHub Pages serves it with a JavaScript content type, the loader adds it as a plain `<script>` tag — no `GM_xmlhttpRequest` or `eval` required. Each load appends a cache-busting parameter so updates take effect immediately:

```text
?t=<timestamp>
```

This keeps the installed userscript small and lets published runtime updates reach you **without reinstalling the loader**.

## Verify the install

1. Open Bondage Club in a supported domain (e.g. `bondageprojects.com`) and log in.
2. Make sure BCX has loaded.
3. Open the in-game **extension settings menu** and look for **`BCXIR Settings`**.

If you can open `BCXIR Settings`, the install is working. Continue with the [Quick Start](/bcxir/quick-start).

![Extension settings list with BCXIR Settings](../screenshots/extension-menu-bcxir.png)

## Supported sites

The loader runs on the standard Bondage Club domains, including:

- `bondageprojects.elementfx.com`
- `bondage-europe.com`
- `bondageprojects.com`
- `bondage-asia.com`

(both apex and `www.` variants).