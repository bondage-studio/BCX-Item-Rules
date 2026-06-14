# BCXIR Authoring Entry and Return Fix

## Summary

- Opening authoring previously stopped on the virtual character's Information Sheet because BCXIR did not trigger BCX's Information Sheet button.
- Exiting authoring previously returned only to the native Preference screen, or was overwritten back to the virtual character Information Sheet by BCX's async exit flow, losing the BCXIR `Item Rules` subpage state.

## Key Changes

- After opening the virtual Information Sheet, BCXIR schedules a local click on BCX's Information Sheet button coordinates to enter BCX's own menu flow.
- The click uses BCX's existing `InformationSheetClick` hook and restores the previous mouse coordinates afterward.
- Menu-launched authoring passes `returnTo: "settingsItemRules"`.
- Menu-launched authoring records `returnTo: "settingsItemRules"` so finish/cancel knows it must return to the registry editor.
- Finish/cancel cleanup schedules a delayed restore back through the native Preference screen, `PreferenceOpenSubscreen("Extensions")`, `PreferenceSubscreenExtensionsOpen("BCXIR")`, and then the BCXIR `Item Rules` subpage.
- The restore carries the authoring item name so `Item Rules` reselects the same registry entry.
- The delayed restore is intentionally idempotent and runs twice, once on the next event loop turn and once shortly after, so BCX's `InformationSheetLoad().then(InformationSheetResize)` continuation cannot leave the user on bio/profile.

## Safety

- BCXIR does not import BCX private GUI classes or call BCX private `setSubscreen` directly.
- If the automatic click fails, authoring remains open and the user can click the BCX button manually.
- Public API authoring without a return context keeps the previous screen snapshot restore behavior.

## Tests

- Verify the scheduled Information Sheet click uses the BCX button coordinates.
- Verify menu-launched authoring finish returns to the Preference screen with Item Rules UI restored even if BCX briefly returns to Information Sheet first.
- Verify default public authoring behavior remains compatible.
