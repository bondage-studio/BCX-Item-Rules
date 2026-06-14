# BCXIR i18n

## Summary

- Use an LSCG-style local string table instead of scattering visible text through canvas screens.
- Keep English as the fallback language.
- Add Simplified Chinese strings for the BCXIR settings UI.
- Select language from BC/browser globals at runtime.

## Implementation

- Central file: `src/shared/i18n.ts`.
- Public helpers:
  - `getI18nLanguage(root)` returns `en` or `zh-CN`.
  - `t(root, key, values?)` resolves and interpolates localized strings.
- Language detection checks:
  - `CommonGetTranslationLanguage()`
  - `TranslationLanguage`
  - `PreferenceLanguage`
  - `Player.Language`
  - `Player.OnlineSettings.Language`
  - `navigator.language`
- `SettingsScreen` exposes `this.t(...)` for all settings screens.
- `PreferenceRegisterExtensionSetting.ButtonText` is now a function so the native extension list can reflect the current language.

## Current Scope

- The current visible menu pages are localized:
  - Main overview.
  - Item Rules.
  - Runtime / Sharing / Backup.
  - Diagnostics / Advanced.
- Confirmation prompts, import/export prompts, tooltips, and dynamic status labels are localized.
- Runtime protocol, localStorage keys, debug identifiers, and BCX rule ids remain language-neutral and are not translated.

## Adding New Strings

- Add the English key to `EN`.
- Add the matching Simplified Chinese key to `ZH_CN`.
- Use `this.t("key")` in settings screens, or `t(root, "key")` outside screen classes.
- Use interpolation placeholders like `{count}` for dynamic values.
