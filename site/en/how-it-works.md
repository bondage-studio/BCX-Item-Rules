---
title: How It Works
description: BCXIR's storage model and runtime behavior.
order: 80
---

This page describes BCXIR's storage model and runtime behavior. It is reference material; you don't need it for normal use.

## Storage

BCXIR keeps its data separate from BCX.

**Creator registry** (your own item rules), keyed by your member number:

```text
localStorage["BCXIR_registry_<MemberNumber>"]
```

**Wearer cache** (remote creator responses you've received):

```text
localStorage["BCXIR_rule_cache_<MemberNumber>"]
```

**Settings** (BC extension settings):

```text
Player.ExtensionSettings.BCXIR
```

**Local settings backup:**

```text
localStorage["BCXIR_<MemberNumber>_backup"]
```

BCXIR does **not** store rule payloads in `Craft.Description`. The old `[BCXIR:v1:<encoded>]` description markers are no longer supported. BCXIR also never writes to `Player.ExtensionSettings.BCX`.

## Runtime: applying rules when an item is worn

When a matching crafted item is worn, BCXIR routes based on the item's creator:

- **Created by the local player** → read the local **registry** and apply.
- **Created by someone else** → check the local **cache**:
  - Cache hit → apply the cached payload (as the cached crafter; see permission modes).
  - Cache miss → **request** the payload from `item.Craft.MemberNumber`, then cool down. Only the creator's response is accepted.

Rule origin metadata is threaded through scanning so each source applies under the right identity:

- Registry sources apply as **self**.
- Cache sources apply as the **cached crafter**.
- Uncached remote items only **request** payloads (and back off).

The **sender** used for a managed rule is recorded, so later restore/delete attempts use the same sender context.

## Applying through BCX, conservatively

BCXIR applies and removes rules through BCX's own handlers, and is careful with anything it didn't create:

- It applies rules **only** to the local player wearing the item.
- Existing **non-BCXIR** BCX rules are not overwritten.
- When an item is removed, rules BCXIR manages are **restored or deleted conservatively**.
- If a managed rule is changed outside BCXIR, BCXIR **releases management** rather than fighting the external change.

## Temporary characters

BCXIR uses short-lived, local-only characters for two purposes. Neither is drawn in the room or synced to the server, and both are cleaned up afterward:

- **Authoring character** (`BCXIR Authoring`) — backs the virtual BCX Rules editor while you author an item's rules. A virtual BCX transport intercepts BCX hidden query messages targeting the virtual member number and answers them from an in-memory rules store.
- **Minimal creator character** — inserted only when applying a **cached offline creator's** rules, so BCX can resolve the sender for permission checks. Reference-counted; used only for local checks.
- **Operator character** — used by the [`Please use me`](/bcxir/dangerous-mode) advanced mode during a query batch.

## Fail-closed guarantees

BCXIR prefers to do nothing rather than do the wrong thing. It fails closed when:

- A remote response does not come from the item's creator.
- There is no cache for an offline creator.
- A creator member number is missing or a payload is malformed.
- A BCX hidden query is rejected or times out.

See [Public API & Development](/bcxir/api) for programmatic access and the source layout.