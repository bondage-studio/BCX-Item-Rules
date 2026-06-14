# BCXIR Virtual Character Authoring Plan

## Summary

- Create a temporary local room character for BCXIR rule authoring.
- Keep authoring data in an in-memory virtual BCX rules store.
- Intercept BCX hidden query messages that target the virtual member number and answer them locally.
- Export the virtual rules as a compact BCXIR payload and save it to the local item-name registry.
- Do not write `Player.ExtensionSettings.BCX`, do not call BCX import/export, and do not modify the player's own BCX rules.

## Implementation Notes

- Crafting UI adds a `BCXIR Rules` button under the native crafting right panel.
- The authoring session activates the virtual BCX transport before creating the virtual `BCXIR Authoring` character.
- A virtual BCX endpoint sends the BCX `hello` message and waits for `bcx.getCharacterVersion(virtualMemberNumber)` before opening the Information Sheet.
- The virtual transport hooks `ServerSend` and consumes all `ChatRoomChat` hidden `BCXMsg` payloads whose `Target` is the virtual member number.
- Broadcast BCX hidden messages are still sent to the real room, but are mirrored locally into the virtual endpoint.
- The virtual transport also consumes `AccountBeep` payloads whose target is the virtual member number.
- The virtual endpoint handles hello, query, somethingChanged, status messages, and minimal BCX beep responses.
- Mutating virtual rule queries emit virtual `somethingChanged` notifications after they succeed.
- The virtual rules store supports the BCX queries needed by the Rules UI: `conditionsGet`, `ruleCreate`, `ruleDelete`, `conditionUpdate`, `conditionUpdateMultiple`, and `conditionSetLimit`.
- The virtual rules store also supports `conditionCategoryUpdate` for Rules global configuration.
- Non-rules modules are disabled or stubbed with minimal permissive responses.

## Safety

- All state is local and temporary.
- Cleanup removes the virtual character and disables the active virtual transport endpoint.
- Unknown, non-BCX, and non-virtual server messages pass through untouched.
- Finish saves only to the local BCXIR item registry; it does not touch craft descriptions or the clipboard.

## Validation

- `npm run check`
- `npm test`
- `npm run build`
