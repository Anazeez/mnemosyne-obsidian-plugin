const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "manifest.json"), "utf8")
);

for (const file of ["main.js", "manifest.json", "styles.css"]) {
  const filePath = path.join(repositoryRoot, file);
  if (!fs.existsSync(filePath)) throw new Error(`Missing root release artifact: ${file}`);
}

const bundle = fs.readFileSync(path.join(repositoryRoot, "main.js"));
const hash = crypto.createHash("sha256").update(bundle).digest("hex");

if (!bundle.includes(Buffer.from("0.1.0-audit.1"))) {
  throw new Error("Root bundle does not contain the expected build identifier.");
}

console.log(`Release artifact verified: ${manifest.version} sha256:${hash}`);
