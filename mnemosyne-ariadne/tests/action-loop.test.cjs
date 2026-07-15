const assert = require("assert");
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
class MockTFile {
  constructor(pathValue, stat = { size: 0 }) {
    this.path = pathValue;
    this.name = pathValue.split("/").pop();
    this.basename = this.name.replace(/\.md$/i, "");
    this.extension = this.name.includes(".") ? this.name.split(".").pop() : "";
    this.stat = stat;
  }
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") {
    return {
      App: class {},
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
  const bundle = require(path.resolve(__dirname, "..", "main.js"));

  assert.strictEqual(bundle.canonicalText("a\r\nb\n"), "a\nb\n");
  assert.strictEqual(
    await bundle.sha256Text("a\r\nb\n"),
    await bundle.sha256Text("a\nb\n")
  );

  const first = await bundle.deriveJobId(
    "incorporate_note",
    "Inbox/Test.md",
    "a".repeat(64),
    "b".repeat(64)
  );
  const second = await bundle.deriveJobId(
    "incorporate_note",
    "/Inbox/Test.md",
    "a".repeat(64),
    "b".repeat(64)
  );

  assert.strictEqual(first, second);
  assert.match(first, /^ariadne-[0-9a-f]{24}$/);

  const unstableFile = new MockTFile("Inbox/Changing.md");
  const unstableReads = ["first", "second"];
  const unstableApp = {
    vault: {
      read: async () => unstableReads.shift()
    },
    metadataCache: {
      getFirstLinkpathDest: () => null
    }
  };

  await assert.rejects(
    () => bundle.captureStableNote(unstableApp, unstableFile, 0),
    (error) => error && error.code === "note_not_stable"
  );

  const attachmentFile = new MockTFile("Assets/image.png", { size: 3 });
  const stableContent = [
    "# Stable note",
    "",
    "![[image.png]]",
    "![[missing.pdf]]",
    "![](https://example.com/remote.png)"
  ].join("\n");
  let noteReadCount = 0;
  let binaryReadCount = 0;
  const stableApp = {
    vault: {
      read: async () => {
        noteReadCount += 1;
        return stableContent;
      },
      readBinary: async (file) => {
        binaryReadCount += 1;
        assert.strictEqual(file, attachmentFile);
        return new Uint8Array([1, 2, 3]).buffer;
      }
    },
    metadataCache: {
      getFirstLinkpathDest: (link) => link === "image.png" ? attachmentFile : null
    }
  };

  const stable = await bundle.captureStableNote(stableApp, new MockTFile("Inbox/Stable.md"), 0);
  assert.strictEqual(noteReadCount, 2);
  assert.strictEqual(binaryReadCount, 1);
  assert.strictEqual(stable.sourcePath, "Inbox/Stable.md");
  assert.strictEqual(stable.content, stableContent);
  assert.strictEqual(stable.sourceHash, await bundle.sha256Text(stableContent));
  assert.deepStrictEqual(stable.attachments, [
    {
      link: "image.png",
      path: "Assets/image.png",
      exists: true,
      mediaType: "image/png",
      size: 3,
      sha256: await bundle.sha256Bytes(new Uint8Array([1, 2, 3]).buffer),
      warning: null
    },
    {
      link: "missing.pdf",
      path: null,
      exists: false,
      mediaType: "application/pdf",
      size: null,
      sha256: null,
      warning: "Local attachment not found: missing.pdf"
    }
  ]);

  console.log("Action-loop contracts verified.");
}

main().finally(() => { Module._load = originalLoad; });
