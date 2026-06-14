# BCXIR LSCG-Style Local Registry Plan

## Summary

BCXIR now follows an LSCG cursed-item style model:

- Rule payloads are stored locally by the item creator.
- Crafted item names are used as matching keys.
- Wearers request rule payloads from the crafter when they do not already have a cached copy.
- Received payloads are cached locally for later offline use.
- `Craft.Description` marker support is removed.

## Storage

Creator registry:

```text
localStorage["BCXIR_registry_<MemberNumber>"]
```

Wearer cache:

```text
localStorage["BCXIR_rule_cache_<MemberNumber>"]
```

Registry entry:

```ts
type RegistryEntry = {
  id: string
  itemName: string
  enabled: boolean
  payload: EncodedPayload
  updatedAt: number
}
```

Cache entry:

```ts
type RuleCacheEntry = {
  cacheKey: string
  crafter: number
  itemName: string
  payload: EncodedPayload
  updatedAt: number
}
```

## Matching

- Primary item key is `item.Craft?.Name`.
- Fallbacks are `item.Name`, `item.Asset?.Name`, then `item.Asset?.Description`.
- Request/response matching uses a case-insensitive phrase check, similar to LSCG's `GetItemNameAndDescriptionConcat`.
- Responses are trusted only when the sender is the item's `Craft.MemberNumber`.

## Communication

BCXIR sends LSCG-style private account beeps:

- `BeepType: "Leash"`
- `Message.IsBCXIR === true`
- `Message.type === "command"`

- `bcxir-item-rules-request`: wearer to crafter.
- `bcxir-item-rules-response`: crafter to wearer.

Non-BCXIR beeps are ignored and passed through normally. Requests use per-crafter/item cooldown with exponential backoff after unanswered attempts.

## Runtime Flow

1. Scan worn item-category assets.
2. For self-crafted items, read the local registry.
3. For other-crafted items, read the local cache.
4. If no cache exists, request rules from the crafter.
5. When a valid response arrives, cache it and schedule a rule sync.
6. Apply/restore BCX rules through the existing conservative synchronizer.

## Authoring Flow

1. The crafting screen opens the virtual BCX authoring character.
2. The user edits Rules in BCX's UI.
3. Finish exports active virtual rules to a compact payload.
4. The user confirms the crafted item name.
5. BCXIR saves the payload to the local registry.

No marker is copied to the clipboard and no craft description is modified.

## Public API

```ts
window.BCXItemRules.getRegistry()
window.BCXItemRules.registerItemRules(itemName, payload)
window.BCXItemRules.deleteRegisteredItem(itemName)
window.BCXItemRules.requestItemRules(item)
window.BCXItemRules.clearRuleCache()
```

`encodePayload` and `decodePayload` remain available as payload utilities, not as a description-marker protocol.

## Verification

- `npm run check`
- `npm test`
- `npm run build`
