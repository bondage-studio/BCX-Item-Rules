# BCXIR Delayed Item Rules Restore Plan

## Summary

- BCX emits `bcxSubscreenChange(false)` before its exit flow finishes restoring the Information Sheet.
- Immediate BCXIR restoration can be overwritten by BCX's later `InformationSheetLoad().then(InformationSheetResize)` continuation.
- BCXIR therefore restores the Item Rules menu after a short delay, with a second fallback restore.
- Restore must re-enter Bondage Club's native Extension Settings state first, then open the BCXIR setting through `PreferenceSubscreenExtensionsOpen("BCXIR")`, then switch to the `Item Rules` subpage.

## Key Changes

- Menu-launched authoring no longer calls the Item Rules restore synchronously during cleanup.
- Cleanup schedules two idempotent restores: one on the next event loop turn and one delayed fallback.
- `SettingsRegistry.restoreItemRules(itemName)` opens `Character/Preference`, calls `PreferenceOpenSubscreen("Extensions")`, calls `PreferenceSubscreenExtensionsOpen("BCXIR")`, then sets the `itemRules` subpage.
- The restored `Item Rules` page selects the item name that launched authoring when that registry entry exists.
- Starting a new authoring session clears any pending delayed restore timers.

## Tests

- Simulate BCX overwriting the screen back to Information Sheet after finish.
- Confirm delayed restore returns to `Character/Preference`, has BCXIR selected as the active extension setting, and restores the edited Item Rules input.
- Confirm normal authoring without `returnTo: "settingsItemRules"` still uses screen snapshot restoration.
