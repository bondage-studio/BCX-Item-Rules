# BCXIR Loader Build

## Summary

- Publish BCXIR as an installable loader plus an online runtime script.
- Users install only `BCXItemRules.loader.user.js`.
- The loader fetches `BCXItemRules.script.js` at runtime, allowing online updates without asking users to reinstall.
- `BCXItemRules.user.js` remains as a loader alias for compatibility with older install links.

## Files

- `BCXItemRules.loader.user.js`: Tampermonkey userscript loader.
- `BCXItemRules.user.js`: same loader content, compatibility alias.
- `BCXItemRules.script.js`: actual BCXIR runtime script.
- `dist/BCXItemRules.loader.user.js`: built loader.
- `dist/BCXItemRules.script.js`: built runtime script.

## Loader Behavior

- Uses `GM_xmlhttpRequest` to fetch remote scripts.
- Loads `lz-string` first if `window.LZString` is missing.
- Loads and evaluates `BCXItemRules.script.js` in `unsafeWindow`.
- Appends `bcxirLoader=<loader version>&t=<Date.now()>` to fetched URLs for cache busting.
- Reports loading failures to console and local BC messages when available.

## Configuration

- Remote base URL is configured in `package.json`:

```json
{
  "bcxir": {
    "remoteBase": "https://raw.githubusercontent.com/VivianMoonlight/BCX-Item-Rules/main"
  }
}
```

- Change `remoteBase` before build if hosting from GitHub Pages, a release CDN, or another raw file host.

## Validation

- `npm run build` must generate loader and script files.
- Tests verify the loader references `BCXItemRules.script.js`, uses `GM_xmlhttpRequest`, and contains a dynamic `Date.now()` cache-buster.
