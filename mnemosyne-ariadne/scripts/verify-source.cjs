const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "main.ts"), "utf8");
const sourceFiles = fs.readdirSync(path.join(root, "src"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => fs.readFileSync(path.join(root, "src", name), "utf8"));
const allSource = sourceFiles.join("\n");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const expectedVersion = "0.2.0";
const expectedBuild = "0.2.0-action.1";

const requiredCommands = [
  "ariadne-test-connection",
  "ariadne-review-current-note",
  "ariadne-approve-current-review",
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
if (!source.includes("System/Ariadne/Runtime/Queue")) {
  throw new Error("Missing approved work-order queue path.");
}
if (!allSource.includes("ariadne.work-order/v1")) {
  throw new Error("Missing immutable work-order schema.");
}
if (!source.includes(`BUILD_ID = "${expectedBuild}"`)) {
  throw new Error(`Missing expected build identifier: ${expectedBuild}`);
}
if (allSource.includes("vault.modify(") || allSource.includes("vault.delete(")) {
  throw new Error("Source-note mutation API detected.");
}
for (const forbidden of [
  "danger-full-access",
  "dangerously-bypass-approvals-and-sandbox"
]) {
  if (allSource.includes(forbidden)) throw new Error(`Forbidden execution mode: ${forbidden}`);
}
if (/sk-[A-Za-z0-9_-]{12,}/.test(allSource)) throw new Error("Hardcoded OpenAI key detected.");
if (/ARIADNE_PASSKEY\s*[:=]\s*["'][^"']+["']/.test(allSource)) {
  throw new Error("Hardcoded Ariadne passkey detected.");
}
if (manifest.version !== packageJson.version) {
  throw new Error("Manifest and package versions do not match.");
}
if (manifest.version !== expectedVersion) {
  throw new Error(`Expected release version ${expectedVersion}.`);
}

console.log("Source contract verified.");
