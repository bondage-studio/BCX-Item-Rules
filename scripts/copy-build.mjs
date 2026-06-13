import fs from "node:fs";

const builtFile = new URL("../dist/BCXItemRules.user.js", import.meta.url);
const rootFile = new URL("../BCXItemRules.user.js", import.meta.url);

if (!fs.existsSync(builtFile)) {
  throw new Error("Expected build output was not found: dist/BCXItemRules.user.js");
}

fs.copyFileSync(builtFile, rootFile);
console.log("Copied dist/BCXItemRules.user.js to BCXItemRules.user.js");
