# BCXIR Please Use Me Mode

## Summary

- Add an advanced opt-in `Please use me` permission mode.
- The mode is locked by default and appears in Runtime only after the user enables the warning-gated unlock in Diagnostics / Advanced.
- It applies BCXIR item rules through BCX's own hidden-query handlers with a temporary local operator character.
- It does not directly edit `Player.ExtensionSettings.BCX`.

## Behavior

- Normal modes remain unchanged: `Item creator` and `Myself`.
- When unlocked, Runtime cycles through `Item creator`, `Myself`, and `Please use me`.
- `Please use me` temporarily inserts a local operator character into `ChatRoomCharacter` for the query batch.
- During that batch, BCXIR allows the operator to access the player locally and makes it resolve as a high-trust local owner identity.
- The operator is not drawn, not synced to the server, and is removed in `finally`-style cleanup after the query resolves or times out.

## Conflict Handling

- Existing unmanaged active rules are never overwritten.
- Existing unmanaged inactive rules are skipped by default.
- If `Suspend inactive conflicts` is enabled, an existing inactive same-rule condition can be saved as `previousCondition`, replaced by the BCXIR rule, and restored when the item is removed.
- If a managed rule is changed outside BCXIR, BCXIR releases management and does not overwrite or restore over the external change.

## Settings

```ts
rulePermissionMode: "creator" | "self" | "useMe"
unlockUseMeMode: boolean
useMeSuspendInactiveConflicts: boolean
```

Defaults:

- `rulePermissionMode: "creator"`
- `unlockUseMeMode: false`
- `useMeSuspendInactiveConflicts: false`

Normalization:

- If `unlockUseMeMode` is false, stored `rulePermissionMode: "useMe"` falls back to `"creator"`.
- If `unlockUseMeMode` is false, `useMeSuspendInactiveConflicts` is forced false.

## Safety

- This is an advanced risk mode and requires explicit confirmation.
- The implementation relies on BCX's own rule create/update/delete handlers rather than importing or rewriting the full BCX save blob.
- If BCX rejects a query, times out, or changes its hidden-query behavior, BCXIR fails closed and reports a conflict.
- The inactive-suspend option only applies to inactive conditions that can be normalized and compared safely.

## Test Plan

- Locked settings normalize away `useMe` and inactive suspend.
- Unlocking exposes `Please use me` in the Runtime selector.
- Existing active unmanaged rules are skipped.
- Existing inactive unmanaged rules are skipped unless suspend is enabled.
- With suspend enabled, inactive rules are saved, replaced, and restored on item removal.
- Query timeout or BCX rejection cleans up the temporary operator.
