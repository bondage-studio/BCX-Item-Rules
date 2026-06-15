---
title: 常见问题与排错
description: 常见问题及解决方法。
order: 100
---

## 找不到 `BCXIR Settings`

- 确认 loader 已在 Tampermonkey 中安装并启用。
- 确认你处于受支持的 Bondage Club 域名并已完整登录。
- 确认 **BCX** 已安装并以 `window.bcx` 存在。BCXIR 需要 BCX 才能工作。

## 穿上道具后规则没有应用

- 注册表条目名称必须与制作道具**名称完全一致**。
- 条目必须处于**启用**状态。
- 对你自己制作的道具，规则来自你的**注册表**；确保 payload 不为空（通过 **Edit BCX Rules** 编辑）。
- 用**道具规则 → 匹配测试**验证名称是否匹配。

## 别人的道具没有应用

- 你必须启用**外来道具规则**（运行与权限）。
- 制作者必须可达，或你已从其处获得**缓存** payload（可配合**缓存的离线制作者**）。
- 制作者可能把条目标记为**仅自己**，此时绝不会分享。
- 请求使用**冷却 / 退避**；立即重试可能被抑制。必要时在**缓存与分享**中清除冷却。

## 脱下道具后规则仍然存在

BCXIR 会保守地恢复 / 移除被管理规则。如果某个被管理规则在 BCXIR 之外被修改，它会**释放管理**，不会覆盖外部改动。你可以用**调试 / 诊断 → 释放被管理规则**来交还 BCXIR 管理的内容。

## BCXIR 会改动我自己的 BCX 规则吗？

不会。BCXIR 绝不写入 `Player.ExtensionSettings.BCX`，也不会覆盖你已有的、非管理的 BCX 规则。见[工作原理](/zh/bcxir/how-it-works)。

## 我安装的是旧的 `BCXItemRules.user.js`，还有效吗？

有效。`BCXItemRules.user.js` 是 loader 的别名，仍然可用。见[安装](/zh/bcxir/getting-started)。

## 如何备份我的规则？

使用**导入 / 导出**把注册表与设置保存为 JSON。本地设置备份也会保存在 `localStorage["BCXIR_<MemberNumber>_backup"]`。

## 我想在 BCX 权限会阻止我的情况下也应用规则

这正是[危险模式 → 请使用我](/zh/bcxir/dangerous-mode)的用途。它是高级的、需主动开启的模式 —— 启用前请先阅读该页。

## 还是没解决？

在 [GitHub](https://github.com/bondage-studio/BCX-Item-Rules/issues) 上提交 issue，附上你的 BCXIR 版本，以及你期望的行为与实际发生情况。**调试 / 诊断**页面可以生成诊断报告一并附上。