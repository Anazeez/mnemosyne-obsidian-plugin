const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const {
  BUILD_ID,
  buildCheckpointProposal,
  buildPublishedRunwayPath,
  buildRehydrateRequest,
  compareNoteToRunway,
  formatCheckpointProposal,
  formatRunwayMarkdown,
  parseCheckpointProposal,
  parseRehydrationResponse,
  sha256Hex,
  verifyProposalSource,
} = require("../src/continuity-contract.js");

const scope = {
  identity_id: "ariadne",
  project_id: "project-infinitum",
  scope_key: "architecture",
};

test("proposal compilation is review-first and cannot mutate its source", async () => {
  const source = {
    path: "Projects/Mnemosyne/continuity.md",
    basename: "continuity",
    content: "Exact context must resolve first.",
  };
  const before = structuredClone(source);
  const proposal = await buildCheckpointProposal({
    source,
    scope,
    current: { runway_id: "rwy_previous", generation: 12 },
    createdAt: "2026-07-15T12:30:00.000Z",
    invocationId: "inv_obsidian_review",
  });

  assert.deepEqual(source, before);
  assert.equal(proposal.review_first, true);
  assert.equal(proposal.submit_automatically, false);
  assert.equal(proposal.predecessor_runway_id, "rwy_previous");
  assert.equal(proposal.payload.generation, 13);
  assert.equal(proposal.source_hashes[0].sha256, await sha256Hex(source.content));
});

test("reviewed submission verifies the current source hash before upload", async () => {
  const source = { path: "note.md", basename: "note", content: "original" };
  const proposal = await buildCheckpointProposal({
    source,
    scope,
    current: null,
    createdAt: "2026-07-15T12:30:00.000Z",
    invocationId: "inv_hash",
  });

  assert.equal(await verifyProposalSource(proposal, source), true);
  assert.equal(
    await verifyProposalSource(proposal, { ...source, content: "changed" }),
    false,
  );

  const note = formatCheckpointProposal(proposal);
  assert.deepEqual(parseCheckpointProposal(note), proposal);
  assert.match(note, /explicit submission required/i);
});

test("rehydration parser keeps exact runway primary and evidence separate", () => {
  const parsed = parseRehydrationResponse({
    context: {
      status: "DEGRADED_CONTEXT",
      runway_id: "rwy_exact",
      generation: 7,
      payload: { objective: "Resume exact work" },
      authorized_references: [],
    },
    supplemental: {
      used: true,
      results: [{ id: "old-high-score", score: 0.99 }],
      errors: [],
    },
    retrieval_receipt_id: "receipt_exact",
    invocation: {
      invocation_id: "inv_exact",
      runway_acknowledged: true,
      runway_id: "rwy_exact",
      generation: 7,
      context_status: "DEGRADED_CONTEXT",
    },
    omissions: [{ record_id: "private-file", reason: "domain_not_permitted" }],
  });

  assert.equal(parsed.runway.runway_id, "rwy_exact");
  assert.equal(parsed.supplemental[0].id, "old-high-score");
  assert.ok(parsed.warnings.some((warning) => /degraded/i.test(warning)));
  assert.ok(parsed.warnings.some((warning) => /omitted/i.test(warning)));
});

test("request and local published path use explicit bounded scope", () => {
  assert.deepEqual(buildRehydrateRequest(scope, "supporting evidence", ["knowledge"]), {
    ...scope,
    supplemental_query: "supporting evidence",
    supplemental_domains: ["knowledge"],
    top_k: 5,
  });
  assert.equal(
    buildPublishedRunwayPath("System/Mnemosyne/Runways", scope, 13),
    "System/Mnemosyne/Runways/project-infinitum/ariadne/architecture/runway-13.md",
  );
  assert.match(BUILD_ID, /^mnemosyne-ariadne\/0\.0\.4\+/);

  const rendered = formatRunwayMarkdown({
    runway: {
      status: "CURRENT_CONTEXT",
      runway_id: "rwy_exact",
      generation: 13,
      manifest_hash: "a".repeat(64),
      age_seconds: 5,
      payload: {
        identity_id: "ariadne",
        project_id: "project-infinitum",
        scope_key: "architecture",
        predecessor_runway_id: "rwy_previous",
        objective: "Resume work",
        source_hashes: [{ source_ref: "obsidian:note.md", sha256: "b".repeat(64) }],
      },
      authorized_references: [{ source_ref: "obsidian:note.md" }],
    },
    supplemental: [],
    warnings: [],
    receipt_id: "receipt_exact",
  });
  assert.match(rendered, /read-only representation/i);
  assert.match(rendered, /Build identifier/);
  assert.match(rendered, /Hash verification: passed/);
  assert.match(rendered, /Predecessor: rwy_previous/);
  assert.match(rendered, /Source count: 1/);
  assert.match(rendered, /Warning count: 0/);
});

test("note comparison uses exact source hashes and exposes missing references", async () => {
  const body = "current bytes";
  const runway = {
    payload: {
      source_hashes: [{ source_ref: "obsidian:note.md", sha256: await sha256Hex(body) }],
    },
    authorized_references: [{ source_ref: "obsidian:missing.md" }],
  };
  assert.deepEqual(await compareNoteToRunway("note.md", body, runway, new Set()), {
    matches: true,
    source_ref: "obsidian:note.md",
    missing_local_references: ["obsidian:missing.md"],
  });
});

test("plugin registers the six review-first continuity commands without editing sealed copies", () => {
  const source = readFileSync("src/main.ts", "utf8");
  for (const command of [
    "Mnemosyne: Show latest contextual runway",
    "Mnemosyne: Propose contextual checkpoint",
    "Mnemosyne: Submit reviewed checkpoint",
    "Mnemosyne: Rehydrate specialist context",
    "Mnemosyne: Compare current note with latest runway",
    "Mnemosyne: Open runway lineage",
  ]) {
    assert.match(source, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /vault\.modify\(/);
  assert.match(source, /CONTINUITY_OBSIDIAN_ACTIONS/);
});

test("package, manifest, mobile support, and build entry are aligned", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  assert.equal(packageJson.version, "0.0.4");
  assert.equal(manifest.version, packageJson.version);
  assert.equal(packageJson.main, "main.js");
  assert.equal(manifest.isDesktopOnly, false);
  assert.equal(packageJson.scripts.test, "node --test test/*.test.cjs");
  assert.match(packageJson.scripts.build, /--output-dir \./);
  assert.match(readFileSync("src/main.ts", "utf8"), /import "\.\/styles\.css"/);
  assert.match(readFileSync("styles.css", "utf8"), /mnemosyne-ariadne-status/);
});
