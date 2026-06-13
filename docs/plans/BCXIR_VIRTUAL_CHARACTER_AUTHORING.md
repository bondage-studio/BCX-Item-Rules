# BCXIR Virtual Character Authoring Plan

## Summary

- Create a temporary local room character for BCXIR rule authoring.
- Keep authoring data in an in-memory virtual BCX rules store.
- Intercept BCX hidden query messages that target the virtual member number and answer them locally.
- Export the virtual rules as a compact BCXIR payload and copy the full `[BCXIR:v1:<encoded>]` marker to the clipboard.
- Do not write `Player.ExtensionSettings.BCX`, do not call BCX import/export, and do not modify the player's own BCX rules.

## Implementation Notes

- Crafting UI adds a `BCXIR Rules` button under the native crafting right panel.
- The authoring session creates a virtual `BCXIR Authoring` character and tries to open its Information Sheet.
- The virtual bridge hooks `ServerSend` and only handles `ChatRoomChat` hidden `BCXMsg/query` payloads whose `Target` is the virtual member number.
- The virtual rules store supports the BCX queries needed by the Rules UI: `conditionsGet`, `ruleCreate`, `ruleDelete`, `conditionUpdate`, `conditionUpdateMultiple`, and `conditionSetLimit`.
- Non-rules modules are disabled or stubbed with minimal permissive responses.

## Safety

- All state is local and temporary.
- Cleanup removes the virtual character and disables the query bridge.
- Unknown or non-virtual server messages pass through untouched.
- Clipboard failure reports an error and logs the generated marker to the console.

## Validation

- `npm run check`
- `npm test`
- `npm run build`
