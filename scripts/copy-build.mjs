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
  return `// ==UserScript==
// @name         BCX Item Rules Loader
// @namespace    https://github.com/bondage-studio
// @version      ${version}
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

  const BCXIR_SCRIPT_URL = ${JSON.stringify(scriptUrl)};
  const BCXIR_LZ_STRING_URL = ${JSON.stringify(lzStringUrl)};

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
`;
}
