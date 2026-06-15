---
title: 公共 API 与开发
description: window.BCXItemRules API、构建命令与源码结构。
order: 90
---

## 公共 API

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

| 方法 | 说明 |
| --- | --- |
| `getRegistry()` | 返回本地的道具规则条目注册表。 |
| `registerItemRules(name, payload)` | 为某道具名称注册或替换规则 payload。 |
| `deleteRegisteredItem(name)` | 移除一个注册表条目。 |
| `updateRegisteredItem(name, patch)` | 更新条目字段（如 `{ selfOnly: true }`）。 |
| `requestItemRules(item)` | 向某穿戴道具的制作者请求规则 payload。 |
| `clearRuleCache()` | 清除本地的远端规则缓存。 |
| `syncNow()` | 强制执行一次同步。 |
| `openSettings()` | 打开 BCXIR 设置菜单。 |

`encodePayload` 和 `decodePayload` 仍作为紧凑 payload 工具保留，但**不再**用于 `Craft.Description` 存储。

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
- `BCXItemRules.user.js` loader 别名

在线脚本的托管基础地址配置在 `package.json`：

```json
{
  "bcxir": {
    "remoteBase": "https://bondage-studio.github.io/BCX-Item-Rules"
  }
}
```

## 源码结构

| 路径 | 职责 |
| --- | --- |
| `src/entry/` | userscript 入口。 |
| `src/app/` | 启动 wiring 与 public API 组装。 |
| `src/core/` | payload、道具 registry/cache 匹配、scanner、规则同步。 |
| `src/authoring/` | 虚拟 BCX 角色编辑与 registry 保存流程。 |
| `src/settings/` | 设置持久化与 BC canvas 设置页。 |
| `src/platform/` | BC/BCX/浏览器集成、ModSDK hook、道具规则通信、本地 reporter。 |
| `src/shared/` | 常量、i18n、类型、工具与本地 managed state。 |

## 文档

本文档以按语言命名空间的 Markdown 形式存放于仓库的 `site/` 目录
（`site/en/…` 与 `site/zh/…`），并由中央组织站点
**[bondage-studio.github.io](https://bondage-studio.github.io)** 在构建时聚合，
发布于 `/bcxir/`（以及 `/zh/bcxir/`）下。编辑任意 `site/**/*.md` 文件并推送到
`main`，会通过 `notify-site` 工作流触发站点重建。

三个 userscript 在仓库根目录构建，并由 `.github/workflows/pages.yml`
托管到本项目自身的 GitHub Pages 部署上。

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

`dist/` 中也会有同样的构建产物供本地检查，但它被 git 忽略。确认 `package.json` 的 `bcxir.remoteBase` 指向 `BCXItemRules.script.js` 的托管位置。