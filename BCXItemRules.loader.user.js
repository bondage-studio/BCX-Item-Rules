// ==UserScript==
// @name         BCX Item Rules Loader
// @namespace    https://github.com/bondage-studio
// @version      0.1.0
// @description  Loader for BCX Item Rules. Loads the latest hosted runtime script from GitHub Pages.
// @author       Bondage Studio
// @match        https://bondageprojects.elementfx.com/*
// @match        https://www.bondageprojects.elementfx.com/*
// @match        https://bondage-europe.com/*
// @match        https://www.bondage-europe.com/*
// @match        https://bondageprojects.com/*
// @match        https://www.bondageprojects.com/*
// @match        https://bondage-asia.com/*
// @match        https://www.bondage-asia.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const BCXIR_SCRIPT_URL = "https://bondage-studio.github.io/BCX-Item-Rules/BCXItemRules.script.js";
  const BCXIR_LZ_STRING_URL = "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js";

  // GitHub Pages serves the runtime with a JavaScript content type, so a plain
  // <script src> injection runs it directly — no GM_xmlhttpRequest or eval needed.
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const element = document.createElement("script");
      element.src = url;
      element.onload = () => resolve();
      element.onerror = () => reject(new Error("Failed to load " + url));
      (document.head || document.documentElement).appendChild(element);
    });
  }

  async function load() {
    if (!window.LZString) {
      await loadScript(BCXIR_LZ_STRING_URL);
    }
    // Cache-bust only our own script so published updates take effect immediately.
    await loadScript(BCXIR_SCRIPT_URL + "?t=" + Date.now());
  }

  load().catch((error) => {
    console.error("[BCXIR Loader] Failed to load BCX Item Rules.", error);
    try {
      const message = "[BCXIR Loader] Failed to load BCX Item Rules: " + (error?.message || String(error));
      if (typeof window.ChatRoomSendLocal === "function") window.ChatRoomSendLocal(message, 10000);
      else if (typeof window.InfoBeep === "function") window.InfoBeep(message, 10000);
    } catch {
      /* Best effort only. */
    }
  });
})();
