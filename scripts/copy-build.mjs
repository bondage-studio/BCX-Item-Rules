import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = String(packageJson.version || "0.0.0");
const remoteBase = String(packageJson.bcxir?.remoteBase || "").replace(/\/+$/, "");
const scriptFileName = "BCXItemRules.script.js";
const loaderFileName = "BCXItemRules.loader.user.js";
const builtFile = new URL("../dist/" + scriptFileName, import.meta.url);
const rootScriptFile = new URL("../" + scriptFileName, import.meta.url);
const distLoaderFile = new URL("../dist/" + loaderFileName, import.meta.url);
const rootLoaderFile = new URL("../" + loaderFileName, import.meta.url);
const rootInstallAliasFile = new URL("../BCXItemRules.user.js", import.meta.url);

if (!fs.existsSync(builtFile)) {
  throw new Error("Expected build output was not found: dist/" + scriptFileName);
}

if (!remoteBase) {
  throw new Error("package.json bcxir.remoteBase must be set for loader generation.");
}

const scriptUrl = remoteBase + "/" + scriptFileName;
const lzStringUrl = "https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js";
const loader = makeLoader({
  version,
  scriptUrl,
  lzStringUrl,
});

fs.copyFileSync(builtFile, rootScriptFile);
fs.writeFileSync(distLoaderFile, loader, "utf8");
fs.writeFileSync(rootLoaderFile, loader, "utf8");
fs.writeFileSync(rootInstallAliasFile, loader, "utf8");

console.log("Copied dist/" + scriptFileName + " to " + scriptFileName);
console.log("Wrote " + loaderFileName + " and BCXItemRules.user.js loader alias");

function makeLoader({ version, scriptUrl, lzStringUrl }) {
  const connectHosts = [
    new URL(scriptUrl).hostname,
    new URL(lzStringUrl).hostname,
  ];
  const uniqueConnectHosts = Array.from(new Set(connectHosts));
  const connectBlock = uniqueConnectHosts.map((host) => "// @connect      " + host).join("\n");
  return `// ==UserScript==
// @name         BCX Item Rules Loader
// @namespace    https://github.com/bondage-studio
// @version      ${version}
// @description  Loader for BCX Item Rules. Fetches the latest hosted script with cache busting.
// @author       Bondage Studio
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
${connectBlock}
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const BCXIR_LOADER_VERSION = ${JSON.stringify(version)};
  const BCXIR_SCRIPT_URL = ${JSON.stringify(scriptUrl)};
  const BCXIR_LZ_STRING_URL = ${JSON.stringify(lzStringUrl)};
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
    const code = source + "\\n//# sourceURL=" + sourceUrl;
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
`;
}
