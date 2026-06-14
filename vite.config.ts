import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __BCXIR_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    host: "127.0.0.1",
    port: 5181,
    strictPort: true,
    cors: true,
  },
  plugins: [
    monkey({
      entry: "src/entry/userscript-entry.ts",
      userscript: {
        name: "BCX Item Rules",
        namespace: "https://github.com/bondage-studio",
        version: packageJson.version,
        description: "Apply BCX rules from portable crafted item metadata.",
        author: "Bondage Studio",
        match: [
          "https://bondageprojects.elementfx.com/*",
          "https://www.bondageprojects.elementfx.com/*",
          "https://bondage-europe.com/*",
          "https://www.bondage-europe.com/*",
          "https://bondageprojects.com/*",
          "https://www.bondageprojects.com/*",
          "https://bondage-asia.com/*",
          "https://www.bondage-asia.com/*",
        ],
        require: ["https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js"],
        grant: ["none" as never],
        "run-at": "document-idle",
      },
      build: {
        fileName: "BCXItemRules.script.js",
      },
    }),
  ],
});
