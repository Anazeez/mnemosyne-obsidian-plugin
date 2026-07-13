const assert = require("assert");
const crypto = require("crypto");
const Module = require("module");
const path = require("path");

class MockPlugin {
  constructor(app) {
    this.app = app;
    this.commands = [];
  }

  async loadData() { return {}; }
  async saveData() {}
  addCommand(command) { this.commands.push(command); }
  addSettingTab() {}
}

class MockModal { constructor(app) { this.app = app; } }
class MockSetting {}
class MockSettingTab { constructor(app) { this.app = app; } }
class MockTFile {}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") {
    return {
      Modal: MockModal,
      Notice: class {},
      Plugin: MockPlugin,
      PluginSettingTab: MockSettingTab,
      Setting: MockSetting,
      TFile: MockTFile,
      normalizePath: (value) => value.replace(/^\/+/, ""),
      requestUrl: () => { throw new Error("Network must not run in unit tests."); }
    };
  }

  return originalLoad(request, parent, isMain);
};

async function main() {
  const Plugin = require(path.resolve(__dirname, "..", "main.js")).default;
  const app = { workspace: { getActiveFile: () => null } };
  const plugin = new Plugin(app);
  await plugin.onload();

  assert.deepStrictEqual(
    plugin.commands.map((command) => command.id),
    [
      "ariadne-test-connection",
      "ariadne-review-current-note",
      "ariadne-index-current-note",
      "ariadne-query-mnemosyne"
    ]
  );

  const body = "# Deterministic section\n\nThis body is long enough to index safely.";
  const hash = crypto.createHash("sha256").update(body.trim()).digest("hex");
  const content = `---\n` +
    `id: test-note\n` +
    `title: Test note\n` +
    `created: 2026-07-13\n` +
    `status: canon\n` +
    `sha256: ${hash}\n` +
    `parents: []\n` +
    `sources: []\n` +
    `tags: []\n` +
    `schema: note/v1\n` +
    `---\n${body}`;

  const parsed = plugin.parseFrontmatter(content);
  assert.strictEqual(parsed.frontmatter.status, "canon");
  assert.strictEqual(parsed.body, body);
  await plugin.validateIndexDocument(content);

  await assert.rejects(
    () => plugin.validateIndexDocument(content.replace(hash, "0".repeat(64))),
    /Hash mismatch/
  );

  assert.strictEqual(plugin.isValidReview({
    summary: "Summary",
    quality: "Good",
    ambiguities: [],
    missingInformation: [],
    duplicateRisk: "Low",
    suggestedTags: [],
    suggestedLinks: [],
    suggestedDestination: "Notes/Test.md",
    confidence: 0.9,
    warnings: []
  }), true);

  assert.strictEqual(
    plugin.redactDiagnostic("Invalid key sk-secret-value in Bearer abc123"),
    "Invalid key [redacted-key] in Bearer [redacted]"
  );

  assert.match(plugin.httpError({
    status: 502,
    text: "",
    json: {
      error: "openai_request_failed",
      details: {
        status: 429,
        details: {
          error: {
            type: "insufficient_quota",
            message: "Quota exceeded"
          }
        }
      }
    }
  }), /upstream HTTP 429.*insufficient_quota.*Quota exceeded/);

  console.log("Bundle behavior verified.");
}

main().finally(() => { Module._load = originalLoad; });
