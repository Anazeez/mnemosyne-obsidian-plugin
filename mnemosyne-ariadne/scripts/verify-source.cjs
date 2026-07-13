const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "main.ts"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const requiredCommands = [
  "ariadne-test-connection",
  "ariadne-review-current-note",
  "ariadne-index-current-note",
  "ariadne-query-mnemosyne"
];

for (const command of requiredCommands) {
  if (!source.includes(command)) throw new Error(`Missing command: ${command}`);
}

for (const route of [
  "/v1/memory/self",
  "/api/ariadne/core/review",
  "/ingest",
  "/v1/memory/search"
]) {
  if (!source.includes(route)) throw new Error(`Missing route: ${route}`);
}

if (!source.includes("requestUrl(")) throw new Error("Mobile-safe requestUrl is required.");
if (source.includes("vault.modify(") || source.includes("vault.delete(")) {
  throw new Error("Source-note mutation API detected.");
}
if (manifest.version !== packageJson.version) {
  throw new Error("Manifest and package versions do not match.");
}

console.log("Source contract verified.");
