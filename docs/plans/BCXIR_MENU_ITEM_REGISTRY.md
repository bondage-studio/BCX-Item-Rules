# BCXIR Menu Item Registry Plan

## Summary

- Crafting/Create screen authoring hooks are paused.
- BCXIR item rule registration now lives in the native Bondage Club extension settings menu.
- The settings UI uses an LSCG-inspired centered canvas layout and a cursed-items style item registry page.

## Key Changes

- `registerModSdkHooks` no longer registers `CraftingAuthoringHook`.
- `BCXIR Settings` has a main runtime page and an `Item Rules` subpage.
- `Item Rules` supports creating, selecting, renaming, enabling/disabling, deleting, and syncing registered item rule entries.
- `Edit BCX Rules` opens the existing virtual BCX authoring flow with the selected item name, so finish writes back to that registry entry name.
- Settings screen layout uses centered rows, text inputs positioned with BC element APIs, and consistent cleanup on page switches.

## Safety

- Runtime registry/cache matching and creator-sender application behavior are unchanged.
- Crafting hook code remains in the source tree as a paused integration path, but it is not wired into ModSDK hooks.
- Menu-created empty entries use a valid empty BCXIR payload until the virtual BCX editor overwrites them.

## Tests

- Verify Crafting hooks are not registered.
- Verify settings registration still exposes `BCXIR Settings`.
- Verify menu item creation, rename, and element cleanup.
- Verify authoring opened from the menu registers rules under the provided item name.
- Run `npm run check`, `npm test`, and `npm run build`.
