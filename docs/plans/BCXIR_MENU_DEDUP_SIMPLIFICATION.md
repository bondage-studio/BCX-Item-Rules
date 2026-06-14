# BCXIR Menu Deduplication and Simplification

## Summary

- Keep the existing overview plus subpage menu structure.
- Remove duplicate or diagnostic-only buttons from ordinary item registration flows.
- Keep low-frequency, risky, or troubleshooting controls in `Diagnostics / Advanced`.
- Combine runtime, sharing/cache, and import/export into one daily-use page.
- Combine diagnostics and advanced cleanup into one troubleshooting page.
- Do not remove the underlying public/runtime APIs; this pass only changes visible menu entry points.

## Final Menu Shape

### Main

- Status readouts for BCX/runtime, registry/cache counts, and last sync.
- `Enable BCXIR`.
- Entrypoints: `Item Rules`, `Runtime / Sharing / Backup`, `Diagnostics / Advanced`.

### Item Rules

- Item selector, add item, delete item.
- `Item Name`.
- `Enabled`.
- `Only applies to myself`.
- Rules/update summary.
- `Edit BCX Rules`.
- `Back`.

Removed from this page:

- `Duplicate`.
- `Test Match`.
- `Sync Now`.

### Runtime / Sharing / Backup

- Single permission selector: `Item creator` / `Myself`.
- `Allow rules from other people's items`.
- `Respond to rule requests`.
- `Auto request remote rules`.
- Remote cache selector/details.
- `Delete Cache`.
- `Clear Cache`.
- `Export registered item rules`.
- `Import registered item rules`.
- `Export settings`.
- `Import settings`.
- `Back`.

Removed:

- Selected item import/export.
- Diagnostic-safe backup, which is covered by diagnostic report export.

Removed from visible menus:

- Non-item asset scanning toggle. `scanItemCategoryOnly` remains a setting/API field, but the menu no longer exposes it.

### Diagnostics / Advanced

- BCX, authoring, sync, payload, managed rule, and pending request readouts.
- Uses a two-column layout: status and toggles on the left, action buttons on the right.
- Action buttons must stay above the bottom tooltip band so hover text is never covered.
- `Show conflict messages`.
- `Show invalid payload messages`.
- `Show transport messages`.
- `Debug logging`.
- `Enable fallback sync`.
- `Allow cached offline creator`.
- `Sync Now`.
- `Retry Requests`.
- `Copy Report`, or conditional `Cancel Auth` while authoring is active.
- `Reset`.
- `Delete Rules`.
- `Disable + Cleanup`.
- `Disable Sharing`.
- `Back`.

Removed from this page:

- Separate `Release Rules`; cleanup is covered by `Disable + Cleanup`.

### Removed Separate Pages

- `Sharing & Cache` is folded into `Runtime / Sharing / Backup`.
- `Import / Export` is folded into `Runtime / Sharing / Backup`.
- `Advanced` is folded into `Diagnostics / Advanced`.
- `Scan non-item assets` is not exposed as a menu checkbox.

## Validation

- Runtime semantics stay unchanged.
- Item edits still schedule sync automatically.
- Public APIs for removed buttons remain available for debugging and future UI additions.
- Verification commands: `npm run check`, `npm test`, `npm run build`.
