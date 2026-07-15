"use strict";

const BUILD_ID = "mnemosyne-ariadne/0.0.4+continuity-review";
const RUNWAY_SCHEMA = "mnemosyne.context-runway/1.0";
const PROPOSAL_MARKER = "mnemosyne-context-checkpoint-proposal";
const ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const PROJECT = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SCOPE = /^(?:[a-z0-9][a-z0-9_-]{1,63}|(?:mandate|thread):[a-z0-9][a-z0-9_-]{1,63})$/;

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeScope(scope) {
  const normalized = {
    identity_id: String(scope?.identity_id || "").trim().toLowerCase(),
    project_id: String(scope?.project_id || "").trim().toLowerCase(),
    scope_key: String(scope?.scope_key || "").trim().toLowerCase(),
  };
  if (!ID.test(normalized.identity_id)) throw new Error("invalid_identity_id");
  if (!PROJECT.test(normalized.project_id)) throw new Error("invalid_project_id");
  if (!SCOPE.test(normalized.scope_key) || normalized.scope_key.length > 96) {
    throw new Error("invalid_scope_key");
  }
  return normalized;
}

async function buildCheckpointProposal({
  source,
  scope,
  current,
  createdAt,
  invocationId,
}) {
  const boundedScope = normalizeScope(scope);
  const sourceRef = `obsidian:${source.path}`;
  const sourceHash = await sha256Hex(source.content);
  const generation = Number(current?.generation || 0) + 1;
  const sourceHashes = [{ source_ref: sourceRef, sha256: sourceHash }];
  return {
    proposal_schema: "mnemosyne.context-runway-proposal/1.0",
    review_first: true,
    submit_automatically: false,
    source: "obsidian-plugin",
    ...boundedScope,
    predecessor_runway_id: current?.runway_id || null,
    source_invocation_id: invocationId,
    source_note: { path: source.path, sha256: sourceHash },
    source_hashes: sourceHashes,
    idempotency_key: `obsidian-${await sha256Hex([
      sourceRef,
      sourceHash,
      current?.runway_id || "genesis",
      invocationId,
    ].join("\n"))}`,
    payload: {
      schema: RUNWAY_SCHEMA,
      runway_id: "assigned-by-worker",
      ...boundedScope,
      generation,
      predecessor_runway_id: current?.runway_id || null,
      source_invocation_id: invocationId,
      objective: source.basename,
      operational_state: source.content.slice(0, 8000),
      decisions_in_force: [],
      open_threads: [],
      next_actions: [],
      mounted_skills: [],
      relevant_agents: [],
      relevant_files: [{ source_ref: sourceRef, sha256: sourceHash }],
      knowledge_references: [],
      library_references: [],
      pending_handoffs: [],
      constraints: ["Review-first proposal; explicit submission required"],
      prohibited_assumptions: ["Semantic similarity does not establish current continuity"],
      integrity_warnings: [],
      source_hashes: sourceHashes,
      created_at: createdAt,
    },
  };
}

async function verifyProposalSource(proposal, source) {
  if (proposal?.source_note?.path !== source?.path) return false;
  return proposal.source_note.sha256 === await sha256Hex(source.content);
}

function formatCheckpointProposal(proposal) {
  return `# Mnemosyne Contextual Checkpoint Proposal

Review-first artifact. Explicit submission required. The source note has not
been modified, moved, renamed, or deleted.

<!-- ${PROPOSAL_MARKER}:start -->
\`\`\`json
${JSON.stringify(proposal, null, 2)}
\`\`\`
<!-- ${PROPOSAL_MARKER}:end -->
`;
}

function parseCheckpointProposal(markdown) {
  const start = `<!-- ${PROPOSAL_MARKER}:start -->`;
  const end = `<!-- ${PROPOSAL_MARKER}:end -->`;
  const from = markdown.indexOf(start);
  const to = markdown.indexOf(end);
  if (from < 0 || to <= from) throw new Error("checkpoint_proposal_marker_missing");
  const fenced = markdown.slice(from + start.length, to).trim();
  const match = fenced.match(/^```json\n([\s\S]+)\n```$/);
  if (!match) throw new Error("checkpoint_proposal_json_missing");
  const proposal = JSON.parse(match[1]);
  if (
    proposal.proposal_schema !== "mnemosyne.context-runway-proposal/1.0" ||
    proposal.review_first !== true ||
    proposal.submit_automatically !== false
  ) {
    throw new Error("checkpoint_proposal_invalid");
  }
  return proposal;
}

function buildRehydrateRequest(scope, query = "", domains = []) {
  return {
    ...normalizeScope(scope),
    supplemental_query: String(query || "").slice(0, 8000),
    supplemental_domains: [...new Set(domains)].filter((domain) =>
      ["knowledge", "agents", "skills", "files", "library"].includes(domain)
    ),
    top_k: 5,
  };
}

function parseRehydrationResponse(response) {
  if (!response?.context || !response?.supplemental || !response?.retrieval_receipt_id) {
    throw new Error("invalid_rehydration_response");
  }
  const statuses = new Set([
    "CURRENT_CONTEXT",
    "STALE_CONTEXT",
    "DEGRADED_CONTEXT",
    "NO_CONTEXT",
    "QUARANTINED_CONTEXT",
    "CONTEXT_UNAVAILABLE",
  ]);
  if (!statuses.has(response.context.status)) throw new Error("invalid_context_status");

  const warnings = [];
  if (response.context.status !== "CURRENT_CONTEXT") {
    warnings.push(`Context status is ${response.context.status.toLowerCase().replaceAll("_", " ")}.`);
  }
  if ((response.omissions || []).length > 0) {
    warnings.push(`${response.omissions.length} inaccessible reference(s) were omitted.`);
  }
  for (const error of response.supplemental.errors || []) {
    warnings.push(`Supplemental evidence warning: ${error.code || "unavailable"}.`);
  }
  return {
    runway: response.context,
    supplemental: [...(response.supplemental.results || [])],
    warnings,
    receipt_id: response.retrieval_receipt_id,
    invocation: response.invocation,
  };
}

function buildPublishedRunwayPath(root, scope, generation) {
  const normalized = normalizeScope(scope);
  if (!Number.isInteger(Number(generation)) || Number(generation) < 1) {
    throw new Error("invalid_generation");
  }
  const base = String(root || "").replace(/^\/+|\/+$/g, "");
  return `${base}/${normalized.project_id}/${normalized.identity_id}/${normalized.scope_key}/runway-${generation}.md`;
}

function formatRunwayMarkdown(result) {
  const payload = result.runway.payload || {};
  return `# Contextual Runway ${result.runway.generation ?? "Unavailable"}

> Read-only representation. Canonical head remains in Mnemosyne-Worker.

- Identity: ${payload.identity_id || "Unavailable"}
- Project: ${payload.project_id || "Unavailable"}
- Scope: ${payload.scope_key || "Unavailable"}
- Status: ${result.runway.status}
- Runway: ${result.runway.runway_id || "None"}
- Age seconds: ${result.runway.age_seconds ?? "Unknown"}
- Hash verification: ${result.runway.manifest_hash ? "passed" : "unavailable"}
- Predecessor: ${payload.predecessor_runway_id || "None"}
- Source count: ${(payload.source_hashes || []).length}
- Warning count: ${(result.warnings || []).length}
- Retrieval receipt: ${result.receipt_id}
- Build identifier: ${BUILD_ID}

## Objective

${payload.objective || "No exact context is available."}

## Current Operational State

${payload.operational_state || ""}

## Warnings

${renderList(result.warnings)}

## Supplemental Evidence (separate)

${renderList(result.supplemental)}
`;
}

async function compareNoteToRunway(path, content, runway, localPaths) {
  const sourceRef = `obsidian:${path}`;
  const expected = (runway.payload?.source_hashes || [])
    .find((item) => item.source_ref === sourceRef)?.sha256;
  const observed = await sha256Hex(content);
  const missing = (runway.authorized_references || [])
    .map((reference) => reference.source_ref)
    .filter((reference) => reference?.startsWith("obsidian:") && !localPaths.has(reference.slice(9)));
  return {
    matches: Boolean(expected) && expected === observed,
    source_ref: sourceRef,
    missing_local_references: missing,
  };
}

function renderList(items) {
  if (!Array.isArray(items) || items.length === 0) return "- None";
  return items.map((item) => `- ${typeof item === "string" ? item : JSON.stringify(item)}`).join("\n");
}

module.exports = {
  BUILD_ID,
  RUNWAY_SCHEMA,
  buildCheckpointProposal,
  buildPublishedRunwayPath,
  buildRehydrateRequest,
  compareNoteToRunway,
  formatCheckpointProposal,
  formatRunwayMarkdown,
  normalizeScope,
  parseCheckpointProposal,
  parseRehydrationResponse,
  sha256Hex,
  verifyProposalSource,
};
