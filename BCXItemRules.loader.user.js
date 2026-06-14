// ==UserScript==
// @name         BCX Item Rules Loader
// @namespace    https://github.com/VivianMoonlight
// @version      0.1.0
// @description  Loader for BCX Item Rules. Fetches the latest hosted script with cache busting.
// @author       VivianMoonlight
// @match        https://bondageprojects.elementfx.com/*
// @match        https://www.bondageprojects.elementfx.com/*
// @match        https://bondage-europe.com/*
// @match        https://www.bondage-europe.com/*
// @match        https://bondageprojects.com/*
// @match        https://www.bondageprojects.com/*
// @match        https://bondage-asia.com/*
// @match        https://www.bondage-asia.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const BCXIR_LOADER_VERSION = "0.1.0";
  const BCXIR_SCRIPT_URL = "https://raw.githubusercontent.com/VivianMoonlight/BCX-Item-Rules/main/BCXItemRules.script.js";
  const BCXIR_LZ_STRING_URL = "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js";
  const BCXIR_ROOT = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  function cacheBust(url) {
    const separator = url.includes("?") ? "&" : "?";
    return url + separator + "bcxirLoader=" + encodeURIComponent(BCXIR_LOADER_VERSION) + "&t=" + Date.now();
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      const request = typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : globalThis.GM?.xmlHttpRequest;
      if (typeof request !== "function") {
        reject(new Error("GM_xmlhttpRequest is unavailable."));
        return;
      }
      request({
        method: "GET",
        url: cacheBust(url),
        nocache: true,
        onload(response) {
          const status = Number(response.status || 0);
          if (status >= 200 && status < 300 && typeof response.responseText === "string") {
            resolve(response.responseText);
          } else {
            reject(new Error("Failed to load " + url + " status=" + status));
          }
        },
        onerror(error) {
          reject(error instanceof Error ? error : new Error("Failed to load " + url));
        },
        ontimeout() {
          reject(new Error("Timed out loading " + url));
        },
      });
    });
  }

  function evaluate(source, sourceUrl) {
    const code = source + "\n//# sourceURL=" + sourceUrl;
    if (BCXIR_ROOT && typeof BCXIR_ROOT.eval === "function") {
      BCXIR_ROOT.eval(code);
      return;
    }
    (0, eval)(code);
  }

  async function load() {
    if (!BCXIR_ROOT.LZString) {
      evaluate(await requestText(BCXIR_LZ_STRING_URL), BCXIR_LZ_STRING_URL);
    }
    evaluate(await requestText(BCXIR_SCRIPT_URL), BCXIR_SCRIPT_URL);
  }

  load().catch((error) => {
    console.error("[BCXIR Loader] Failed to load BCX Item Rules.", error);
    try {
      const message = "[BCXIR Loader] Failed to load BCX Item Rules: " + (error?.message || String(error));
      if (typeof BCXIR_ROOT.ChatRoomSendLocal === "function") BCXIR_ROOT.ChatRoomSendLocal(message, 10000);
      else if (typeof BCXIR_ROOT.InfoBeep === "function") BCXIR_ROOT.InfoBeep(message, 10000);
    } catch {
      /* Best effort only. */
    }
  });
})();
