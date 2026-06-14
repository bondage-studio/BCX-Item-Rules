# BCXIR Cached Creator Sender Plan

## Summary

- Creator permission mode applies BCXIR rules with the crafted item's creator as the BCX query sender.
- If the creator is not in the current room but a trusted local cache entry exists for that creator/item, BCXIR creates a temporary minimal local creator character so BCX can resolve `getChatroomCharacter(sender)`.
- The minimal creator is used only for local BCX permission checks. It is not drawn in the room, is not synced to the server, does not answer remote communication, and does not receive forced item permission.

## Key Changes

- Add a creator-sender query transport that injects local BCX hidden `query` messages with `Sender = item.Craft.MemberNumber`, then consumes only matching local `queryAnswer` messages.
- Add a minimal creator manager that inserts a reference-counted character into `ChatRoomCharacter` only when cached offline creator mode is allowed and the real creator is absent.
- Thread rule origin metadata through scanning: registry sources apply as self, cache sources apply as the cached crafter, and uncached remote items only request payloads.
- Record the sender used for managed rules so restore/delete attempts use the same sender context.
- Add settings for `rulePermissionMode` and `allowCachedOfflineCreator`.

## Safety

- Cache is the trust boundary for offline creator application.
- Missing cache, missing creator member number, malformed payload, or BCX query rejection fails closed.
- BCXIR does not hook `ServerChatRoomGetAllowItem` for cached creators and does not write `Player.ExtensionSettings.BCX`.

## Tests

- Creator sender query injects a local hidden query and resolves from a matching local hidden query answer.
- Cached offline creator is inserted into `ChatRoomCharacter`, never into `ChatRoomCharacterDrawlist`, and is cleaned up after success or failure.
- Cached remote rules can apply when the creator is offline; uncached remote rules only request and cool down.
- Self mode keeps the previous public API path.
