---
title: Quick Start
description: From a fresh install to a working item rule.
order: 30
---

This walkthrough takes you from a fresh install to a working item rule. It assumes BCXIR and BCX are installed (see [Install](/bcxir/getting-started)).

## 1. Open BCXIR Settings

Open the Bondage Club extension settings menu and choose **`BCXIR Settings`**. The main page shows status and links to the sub-pages: **Item Rules**, **Runtime & Permissions**, **Cache & Sharing**, **Import / Export**, **Debug / Diagnostics**, and **Advanced**.

![BCXIR Settings main page](../screenshots/settings-main.png)

## 2. Create an item rule entry

1. Open **Item Rules**.
2. Choose **Create** / **Add** and enter the **exact crafted item name** you want to attach rules to (for example, `Strict Blindfold`).
3. The new entry appears in the list, enabled, with an empty rule payload.

> **Name matching.** The entry name must match the crafted item's **name** exactly. BCXIR matches worn crafted items against your registry by name.

![Item Rules list](../screenshots/item-rules-list.png)

## 3. Edit the rules

1. Select your entry and choose **Edit BCX Rules**.
2. BCXIR opens a **temporary virtual BCX authoring character** and shows the familiar BCX **Rules** interface.
3. Add and configure the BCX rules you want this item to carry.
4. Choose **Finish** / **Save**. The rules are written back to your BCXIR registry entry — **not** to your own BCX.

See [Creating Item Rules](/bcxir/creating-rules) for the full authoring flow.

Opening the editor takes two steps:

1. On the virtual authoring character's BCX extensions menu, choose **Rules**.

   ![Authoring character BCX menu — Rules](../screenshots/authoring-rules.png)

2. The BCX Rules list opens. Use **Add new rule** to create and configure rules.

   ![Authoring character Rules list](../screenshots/authoring-rules-1.png)

## 4. Wear the item and see it apply

1. Craft (or already own) an item whose name matches your entry — created by you.
2. Wear it.
3. BCXIR detects the match and applies the registered rule payload to you locally through BCX.

When you remove the item, BCXIR restores or removes the rule it managed, leaving your other BCX rules untouched.

## 5. (Optional) Let others use your item

If you give the crafted item to another player, their game can request the rules from you on demand and cache them locally. This is covered in [Sharing & Permissions](/bcxir/sharing).

## What next?

- [Creating Item Rules](/bcxir/creating-rules) — the authoring flow in depth.
- [Sharing & Permissions](/bcxir/sharing) — remote requests, caching, creator vs. self mode, self-only and foreign-item controls.
- [Settings Reference](/bcxir/settings) — every page and option.