# BCX Item Rules

[中文说明](#中文说明)

BCX Item Rules, or BCXIR, is an independent Bondage Club userscript that links locally registered crafted item names to BCX Rules. When a player wears a matching item, BCXIR applies the registered BCX rule payload to the local player through BCX.

BCXIR does not write to BCX internal storage.

## Install

Install the loader in Tampermonkey:

```text
https://raw.githubusercontent.com/VivianMoonlight/BCX-Item-Rules/main/BCXItemRules.loader.user.js
```

Compatibility alias:

```text
https://raw.githubusercontent.com/VivianMoonlight/BCX-Item-Rules/main/BCXItemRules.user.js
```

You also need BCX installed and available in game as `window.bcx`.

## Loader Updates

Users install only `BCXItemRules.loader.user.js`.

The loader fetches the online runtime script:

```text
BCXItemRules.script.js
```

Every fetch appends cache-busting parameters:

```text
?bcxirLoader=<version>&t=<Date.now()>
```

This keeps the installed userscript small and lets published script updates take effect without asking users to reinstall the loader.

## Features

- Register crafted item names locally.
- Edit item-linked BCX rules through a temporary virtual BCX authoring character.
- Apply rules when matching crafted items are worn.
- Request remote item rule payloads from the item's creator using an LSCG-style private `Leash` command beep.
- Cache received remote payloads locally.
- Optional creator-based permission mode, including cached offline creator identity for previously trusted cache entries.
- Per-item `Only applies to myself` option.
- Global option to block rules from other people's items.
- Native Bondage Club extension settings menu.
- English and Simplified Chinese UI text.

## How It Works

BCXIR no longer stores rule payloads in `Craft.Description`.

Creators register item rules locally:

```text
localStorage["BCXIR_registry_<MemberNumber>"]
```

Wearers cache remote creator responses locally:

```text
localStorage["BCXIR_rule_cache_<MemberNumber>"]
```

When a matching item is worn:

- If the item was created by the local player, BCXIR reads the local registry.
- If the item was created by someone else, BCXIR checks the local cache.
- If no cache exists, BCXIR requests the payload from `item.Craft.MemberNumber`.
- Responses are accepted only from the item creator.
- Unanswered requests use cooldown/backoff to avoid polling pressure.

Old `[BCXIR:v1:<encoded>]` description markers are no longer supported.

## Settings

Open Bondage Club's native extension settings menu and choose `BCXIR Settings`.

The menu is organized into:

- `Item Rules`: create, rename, enable, delete, and edit registered item rules.
- `Runtime / Sharing / Backup`: permission mode, remote sharing, cache management, import/export.
- `Diagnostics / Advanced`: sync/debug controls and dangerous cleanup actions.

Settings are stored in:

```text
Player.ExtensionSettings.BCXIR
```

A local backup is also written to:

```text
localStorage["BCXIR_<MemberNumber>_backup"]
```

BCXIR never writes to:

```text
Player.ExtensionSettings.BCX
```

## Safety Notes

- BCXIR applies rules only to the local player wearing an item.
- Existing non-BCXIR BCX rules are not overwritten.
- Rules managed by BCXIR are restored or deleted conservatively when items are removed.
- The virtual authoring character is local-only and temporary.
- Remote responses are validated against the item's creator member number.

## Public API

BCXIR exposes helpers on `window.BCXItemRules`:

```js
window.BCXItemRules.getRegistry()
window.BCXItemRules.registerItemRules("Strict Blindfold", payload)
window.BCXItemRules.deleteRegisteredItem("Strict Blindfold")
window.BCXItemRules.updateRegisteredItem("Strict Blindfold", { selfOnly: true })
window.BCXItemRules.requestItemRules(item)
window.BCXItemRules.clearRuleCache()
window.BCXItemRules.syncNow()
window.BCXItemRules.openSettings()
```

`encodePayload` and `decodePayload` remain available for compact payload utilities, but they are not used for `Craft.Description` storage.

## Development

```sh
npm install
npm run dev
npm run check
npm test
npm run build
```

`npm run dev` starts a Vite userscript dev server on:

```text
http://127.0.0.1:5181
```

`npm run build` writes:

- `dist/BCXItemRules.script.js`
- `dist/BCXItemRules.loader.user.js`
- root copies of both files
- `BCXItemRules.user.js` as a loader alias

The hosted script base URL is configured in `package.json`:

```json
{
  "bcxir": {
    "remoteBase": "https://raw.githubusercontent.com/VivianMoonlight/BCX-Item-Rules/main"
  }
}
```

## Source Layout

- `src/entry/`: userscript entry point.
- `src/app/`: bootstrap wiring and public API assembly.
- `src/core/`: payload helpers, item registry/cache matching, scanner, and rule synchronization.
- `src/authoring/`: virtual BCX character authoring and registry save flow.
- `src/settings/`: settings persistence and BC canvas settings screens.
- `src/platform/`: BC/BCX/browser integration, ModSDK hooks, item-rule transport, and local reporting.
- `src/shared/`: constants, i18n, types, utilities, and local managed-state storage.

## Release Checklist

Before publishing:

```sh
npm run check
npm test
npm run build
```

Then publish or commit these root generated files:

- `BCXItemRules.loader.user.js`
- `BCXItemRules.user.js`
- `BCXItemRules.script.js`

`dist/` contains the same build outputs for local inspection and release packaging, but it is ignored by git in this repository.

Make sure `package.json` `bcxir.remoteBase` points to the location where `BCXItemRules.script.js` will be hosted.

---

# 中文说明

BCX Item Rules，简称 BCXIR，是一个独立的 Bondage Club userscript。它把“本地注册的制作道具名称”和 BCX Rules 关联起来：当玩家穿戴匹配的道具时，BCXIR 会通过 BCX 把对应规则应用到本地玩家身上。

BCXIR 不会写入 BCX 的内部存档。

## 安装

在 Tampermonkey 中安装 loader：

```text
https://raw.githubusercontent.com/VivianMoonlight/BCX-Item-Rules/main/BCXItemRules.loader.user.js
```

兼容旧链接的别名：

```text
https://raw.githubusercontent.com/VivianMoonlight/BCX-Item-Rules/main/BCXItemRules.user.js
```

你还需要安装 BCX，并确保游戏中存在 `window.bcx`。

## Loader 更新机制

用户只需要安装 `BCXItemRules.loader.user.js`。

loader 会在线拉取真正的运行脚本：

```text
BCXItemRules.script.js
```

每次请求都会追加缓存爆破参数：

```text
?bcxirLoader=<version>&t=<Date.now()>
```

这样安装脚本保持很小，而发布新的运行脚本后，用户通常不需要重新安装 loader。

## 功能

- 本地注册制作道具名称。
- 通过临时虚拟 BCX 编辑角色，为道具编辑 BCX Rules。
- 穿戴匹配道具时自动应用规则。
- 对其他玩家制作的道具，使用类似 LSCG 的私密 `Leash` command beep 向制作者请求规则 payload。
- 本地缓存收到的远端 payload。
- 可选“以道具制作者身份应用规则”的权限模式，并支持可信缓存下的离线制作者身份。
- 单个道具可设置“仅对自己生效”。
- 全局可禁止他人道具规则影响自己。
- 接入 Bondage Club 原生扩展设置菜单。
- 支持英文和简体中文界面。

## 工作方式

BCXIR 不再把规则 payload 写入 `Craft.Description`。

制作者的本地注册表：

```text
localStorage["BCXIR_registry_<MemberNumber>"]
```

穿戴者的远端规则缓存：

```text
localStorage["BCXIR_rule_cache_<MemberNumber>"]
```

当玩家穿戴匹配道具时：

- 如果道具由本地玩家制作，BCXIR 直接读取本地 registry。
- 如果道具由其他玩家制作，BCXIR 先读取本地 cache。
- 如果没有 cache，BCXIR 会向 `item.Craft.MemberNumber` 请求 payload。
- 只有来自道具制作者的 response 会被接受。
- 未响应请求会进入冷却/退避，避免轮询压力。

旧的 `[BCXIR:v1:<encoded>]` description marker 已不再支持。

## 设置

打开 Bondage Club 原生扩展设置菜单，选择 `BCXIR Settings` / `BCXIR 设置`。

菜单分为：

- `Item Rules` / `道具规则`：创建、重命名、启用、删除、编辑道具规则。
- `Runtime / Sharing / Backup` / `运行 / 分享 / 备份`：权限模式、远端分享、缓存管理、导入导出。
- `Diagnostics / Advanced` / `诊断 / 高级`：同步、调试和危险清理操作。

设置保存到：

```text
Player.ExtensionSettings.BCXIR
```

同时会写入本地备份：

```text
localStorage["BCXIR_<MemberNumber>_backup"]
```

BCXIR 永远不会写入：

```text
Player.ExtensionSettings.BCX
```

## 安全说明

- BCXIR 只会把规则应用到本地穿戴者。
- 不覆盖非 BCXIR 管理的现有 BCX 规则。
- 道具移除后，BCXIR 会保守恢复或删除自己管理的规则。
- 虚拟编辑角色只存在于本地、临时会话中。
- 远端 response 会校验是否来自道具制作者。

## Public API

BCXIR 在 `window.BCXItemRules` 上暴露辅助方法：

```js
window.BCXItemRules.getRegistry()
window.BCXItemRules.registerItemRules("Strict Blindfold", payload)
window.BCXItemRules.deleteRegisteredItem("Strict Blindfold")
window.BCXItemRules.updateRegisteredItem("Strict Blindfold", { selfOnly: true })
window.BCXItemRules.requestItemRules(item)
window.BCXItemRules.clearRuleCache()
window.BCXItemRules.syncNow()
window.BCXItemRules.openSettings()
```

`encodePayload` 和 `decodePayload` 仍作为紧凑 payload 工具保留，但不再用于 `Craft.Description` 存储。

## 开发

```sh
npm install
npm run dev
npm run check
npm test
npm run build
```

`npm run dev` 会在以下地址启动 Vite userscript 开发服务器：

```text
http://127.0.0.1:5181
```

`npm run build` 会生成：

- `dist/BCXItemRules.script.js`
- `dist/BCXItemRules.loader.user.js`
- 根目录下的对应文件
- `BCXItemRules.user.js` loader 兼容别名

在线脚本的托管基础地址配置在 `package.json`：

```json
{
  "bcxir": {
    "remoteBase": "https://raw.githubusercontent.com/VivianMoonlight/BCX-Item-Rules/main"
  }
}
```

## 目录结构

- `src/entry/`：userscript 入口。
- `src/app/`：启动 wiring 和 public API 组装。
- `src/core/`：payload、item registry/cache、scanner、同步逻辑。
- `src/authoring/`：虚拟 BCX 角色编辑和 registry 保存流程。
- `src/settings/`：设置持久化和 BC canvas 设置页。
- `src/platform/`：BC/BCX/browser 集成、ModSDK hook、通信、reporter。
- `src/shared/`：常量、i18n、类型、工具和本地 managed state。

## 发布检查清单

发布前运行：

```sh
npm run check
npm test
npm run build
```

然后发布或提交根目录下的生成文件：

- `BCXItemRules.loader.user.js`
- `BCXItemRules.user.js`
- `BCXItemRules.script.js`

`dist/` 中也会有同样的构建产物，便于本地检查或打包 release，但本仓库的 git 配置会忽略 `dist/`。

确认 `package.json` 中的 `bcxir.remoteBase` 指向将要托管 `BCXItemRules.script.js` 的位置。
