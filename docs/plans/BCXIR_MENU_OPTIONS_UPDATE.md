# BCXIR Menu Options Update Plan

## Summary

- The settings menu is split into focused pages instead of one long runtime page.
- Item registry entries gain `selfOnly` so a creator can keep an item rule private to themselves.
- Global settings gain foreign-item and sharing controls.

## Key Changes

- Main page shows status and links to `Item Rules`, `Runtime & Permissions`, `Cache & Sharing`, `Import / Export`, `Debug / Diagnostics`, and `Advanced`.
- `Item Rules` shows item name, enabled, self-only, rules count, updated time, edit, duplicate, delete, match test, and sync.
- `Runtime & Permissions` owns creator/self apply mode, cached offline creator, item-category scan, fallback sync, and foreign item rules.
- `Cache & Sharing` owns responding to requests, auto-requesting remote rules, transport messages, cache deletion, and cooldown clearing.
- `Import / Export` owns registry/settings backup JSON flows.
- `Debug / Diagnostics` owns message/log toggles, sync status, diagnostic report, cancel authoring, and release managed rules.
- `Advanced` owns destructive reset, registry/cache clearing, cleanup, and sharing-disable actions.

## Runtime Behavior

- Self-only entries do not return payloads to other players.
- Foreign item rules disabled means no remote requests, no remote cache application, and no new minimal offline creator usage.
- Existing managed remote rules are released through the normal cleanup path on the next sync.

## Tests

- Self-only registry entries are migrated and enforced.
- Foreign item rules disabled blocks request sending and cache application.
- New settings default to permissive sharing for compatibility.
- Menu navigation and item-rule editing still work.
