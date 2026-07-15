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

  const reviewId = await bundle.deriveReviewId(stable.sourcePath, stable.sourceHash);
  const reviewMarkdown = bundle.formatReviewArtifactV1({
    reviewId,
    createdAt: "2026-07-14T12:00:00.000Z",
    sourcePath: stable.sourcePath,
    sourceHash: stable.sourceHash,
    attachments: stable.attachments,
    buildId: "0.2.0-action.1",
    review: {
      summary: "Stable summary",
      quality: "Good",
      ambiguities: [],
      missingInformation: [],
      duplicateRisk: "Low",
      suggestedTags: ["stable"],
      suggestedLinks: [],
      suggestedDestination: "Knowledge/Stable.md",
      confidence: 0.9,
      warnings: []
    }
  });
  const parsedReview = bundle.parseReviewArtifactV1(reviewMarkdown);

  assert.strictEqual(parsedReview.schema, "ariadne.review/v1");
  assert.strictEqual(parsedReview.id, reviewId);
  assert.strictEqual(parsedReview.status, "proposed");
  assert.strictEqual(parsedReview.operation, "incorporate_note");
  assert.strictEqual(parsedReview.sourcePath, stable.sourcePath);
  assert.strictEqual(parsedReview.sourceHash, stable.sourceHash);
  assert.deepStrictEqual(parsedReview.allowedDomains, ["knowledge"]);

  assert.throws(
    () => bundle.parseReviewArtifactV1("# Legacy review"),
    (error) => error && error.code === "legacy_review_not_approvable"
  );

  const reviewHash = await bundle.sha256Text(reviewMarkdown);
  const jobId = await bundle.deriveJobId(
    "incorporate_note",
    stable.sourcePath,
    stable.sourceHash,
    reviewHash
  );
  const workOrderMarkdown = bundle.formatWorkOrderV1({
    id: jobId,
    createdAt: "2026-07-14T12:01:00.000Z",
    approvedAt: "2026-07-14T12:01:00.000Z",
    sourcePath: stable.sourcePath,
    sourceHash: stable.sourceHash,
    reviewArtifact: "System/Ariadne/Review/review-stable.md",
    reviewHash,
    capture: stable,
    reviewMarkdown
  });
  const parsedWorkOrder = bundle.parseWorkOrderV1(workOrderMarkdown);

  assert.strictEqual(parsedWorkOrder.schema, "ariadne.work-order/v1");
  assert.strictEqual(parsedWorkOrder.id, jobId);
  assert.strictEqual(parsedWorkOrder.operation, "incorporate_note");
  assert.strictEqual(parsedWorkOrder.status, "queued");
  assert.deepStrictEqual(parsedWorkOrder.allowedDomains, ["knowledge"]);
  assert.deepStrictEqual(parsedWorkOrder.capture, stable);
  assert.strictEqual(parsedWorkOrder.reviewMarkdown, reviewMarkdown);

  const reviewFile = new MockTFile("System/Ariadne/Review/review-stable.md");
  const sourceFile = new MockTFile(stable.sourcePath);
  const contents = new Map([
    [reviewFile.path, reviewMarkdown],
    [sourceFile.path, stableContent]
  ]);
  const files = new Map([
    [reviewFile.path, reviewFile],
    [sourceFile.path, sourceFile]
  ]);
  const created = [];
  const approvalApp = {
    workspace: { getActiveFile: () => reviewFile },
    metadataCache: { getFirstLinkpathDest: () => null },
    vault: {
      read: async (file) => contents.get(file.path),
      readBinary: async () => new ArrayBuffer(0),
      getAbstractFileByPath: (filePath) => files.get(filePath) || null,
      createFolder: async (folderPath) => files.set(folderPath, { path: folderPath }),
      create: async (filePath, content) => {
        const file = new MockTFile(filePath);
        files.set(filePath, file);
        contents.set(filePath, content);
        created.push(filePath);
        return file;
      }
    }
  };
  const ApprovalPlugin = bundle.default;
  const approvalPlugin = new ApprovalPlugin(approvalApp);
  await approvalPlugin.onload();
  approvalPlugin.stableReadDelayMs = 0;

  const queued = await approvalPlugin.approveReview(reviewFile);
  assert.strictEqual(queued.duplicate, false);
  assert.strictEqual(created.filter((item) => item === queued.queuePath).length, 1);
  assert.strictEqual(contents.get(sourceFile.path), stableContent);

  const duplicate = await approvalPlugin.approveReview(reviewFile);
  assert.strictEqual(duplicate.duplicate, true);
  assert.strictEqual(created.filter((item) => item === queued.queuePath).length, 1);

  contents.set(sourceFile.path, "# Changed after review");
  await assert.rejects(
    () => approvalPlugin.approveReview(reviewFile),
    /source_changed_since_review/
  );

  contents.set(sourceFile.path, stableContent);
  contents.set(queued.queuePath, "# conflicting content");
  await assert.rejects(
    () => approvalPlugin.approveReview(reviewFile),
    /duplicate_job_conflict/
  );

  console.log("Action-loop contracts verified.");
}

main().finally(() => { Module._load = originalLoad; });
