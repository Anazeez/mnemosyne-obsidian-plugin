# Ariadne Codex Action Loop Design

**Date:** 2026-07-14  
**Status:** Approved architecture; awaiting written-spec review  
**Scope:** First safe vertical slice from an approved Obsidian note review to a Codex-maintained memory artifact and receipt

## Objective

Turn Ariadne's authenticated connection into a controlled action loop. A user approves a proposal in Obsidian, Codex processes an immutable snapshot on Hearken, and the resulting knowledge artifact and execution receipt return through Obsidian Sync.

The source note must never be changed by this workflow.

## Existing Context

- Core and Grimoire are two local Obsidian vault instances connected to the same Obsidian Sync remote vault.
- The subscription is Obsidian Sync Standard, which provides one remote vault.
- `System/Ariadne` already contains `Charter`, `Config`, `Logs`, `Memory`, `Prompts`, `Reports`, `Review`, `Rules`, `Runtime`, and `Workflows`.
- Ariadne can authenticate to Mnemosyne and can create review artifacts.
- Codex CLI is installed on Hearken.
- Obsidian Headless Sync is the intended transport between the remote vault and Hearken.

## Design Principles

1. **Review before action.** Review creates a proposal. Only an explicit approval creates executable work.
2. **Immutable source input.** Every job contains a snapshot and cryptographic hash of the approved source note.
3. **Least-privilege execution.** Codex may write only inside `System/Ariadne/Memory`.
4. **Deterministic state.** Every job has a stable ID, explicit stage, timestamps, input hash, and terminal result.
5. **Observable outcomes.** Success and failure produce durable receipts; notification bubbles are supplementary only.
6. **Idempotence.** Reprocessing the same approved snapshot and operation must not create duplicate knowledge pages.
7. **Separation of responsibilities.** The plugin reviews and approves, Sync transports, the runner orchestrates, Codex synthesizes, and Mnemosyne indexes and searches.
8. **Creation is inert.** Creating, clipping, pasting, or synchronizing a note never creates executable work without Review and explicit Approval.

## Vault Layout and Ownership

```text
System/Ariadne/
├── Charter/                 human-owned purpose and invariants
├── Config/                  human-owned runtime configuration
├── Logs/                    runner-owned append-only operational logs
├── Memory/                  Codex-owned compiled knowledge wiki
│   ├── AGENTS.md            durable Codex schema and maintenance rules
│   ├── index.md             content-oriented navigation
│   ├── log.md               append-only knowledge-change history
│   ├── Sources/             source manifests, hashes, and provenance
│   └── Knowledge/           synthesized, interlinked knowledge pages
├── Prompts/                 human-reviewed prompt templates
├── Reports/                 runner-owned receipts and validation reports
├── Review/                  plugin-owned proposals awaiting a decision
├── Rules/                   human-owned schemas and lint policies
├── Runtime/
│   ├── Queue/               plugin-created approved work orders
│   ├── Claims/              runner-created job leases
│   └── Completed/           terminal job records
├── Workflows/               human-owned ingest, query, and lint definitions
└── README.md                system overview and operating instructions
```

Codex is launched with `System/Ariadne/Memory` as its workspace root and `workspace-write` sandboxing. The runner, not Codex, manages queue state, operational logs, and receipts.

## Components

### Ariadne Obsidian Plugin

The plugin reads the active note twice, with a one-second interval between reads. Review proceeds only when both reads produce the same SHA-256 hash. This stability gate prevents Review from capturing a partially written note while Clipper, paste handling, Linter, Templater, Sync, or another plugin is still changing it.

After a stable read, the plugin requests a review and writes a proposal under `Review/`. The proposal UI offers an explicit Approve action. Approval captures the current note again, verifies that its hash still matches the reviewed version, and creates a work order under `Runtime/Queue/`.

If the note changed after review, approval fails with `source_changed_since_review`; the user must review the new version.

Note creation alone is inert. Neither a new Clipper note nor a pasted note automatically enters the queue.

### Obsidian Sync and Headless Sync

Obsidian Sync remains the only cross-device file synchronization system. Core and Grimoire continue to use the same remote vault. Hearken uses official Obsidian Headless Sync in continuous mode under a dedicated device name.

Git is not used as a synchronization transport. If Git history is retained on Hearken, its metadata lives outside the synchronized vault so `.git` data cannot propagate to mobile devices.

### Ariadne Runner on Hearken

The runner watches `Runtime/Queue/`, validates work-order structure, and claims one job with a time-limited lease. It invokes Codex non-interactively, supplies the approved snapshot and workflow instructions, validates the resulting changes, and writes a terminal receipt.

The runner never passes the Core vault root as Codex's workspace. It invokes Codex with `System/Ariadne/Memory` as the workspace root and does not add writable sibling directories.

### Codex

Codex maintains only the compiled wiki under `Memory/`. For the first vertical slice it may:

- create or update a deterministic knowledge page;
- update `index.md`;
- append one entry to `log.md`;
- create or update a source manifest under `Sources/`;
- run the memory lint command defined in `Memory/AGENTS.md`.

Codex must not mutate the work order, review proposal, source note, runtime state, configuration, charter, prompts, rules, or workflows.

### Mnemosyne

Mnemosyne remains the retrieval layer. Indexing occurs only after the runner validates the Codex-produced wiki change. A failed Mnemosyne indexing request does not roll back the local knowledge artifact; it produces a partial-success receipt with an explicit retryable indexing stage.

## Work-Order Contract

Each approved work order is a Markdown file with YAML frontmatter and an immutable body snapshot.

Required fields:

```yaml
schema: ariadne.work-order/v1
id: ariadne-20260714-<deterministic-suffix>
operation: incorporate_note
status: queued
created_at: <ISO-8601 UTC timestamp>
approved_at: <ISO-8601 UTC timestamp>
source_path: <vault-relative Markdown path>
source_hash: sha256:<lowercase-hex>
review_artifact: <vault-relative review path>
review_hash: sha256:<lowercase-hex>
allowed_domains:
  - knowledge
requested_outputs:
  - memory_page
  - index_update
  - knowledge_log_entry
  - receipt
```

The Markdown body contains the exact approved source snapshot and approved proposal. The job ID is derived from the operation, normalized source path, source hash, and review hash so duplicate approval attempts converge on the same job.

For the first vertical slice, the snapshot includes Markdown, YAML frontmatter, and remote image URLs. Local attachment references are recorded in a manifest containing vault-relative path, existence status, media type when known, size, and SHA-256 hash. Local attachment bytes are not copied, analyzed, or sent to Mnemosyne in this slice. Missing or still-changing attachments produce a visible warning in the review and receipt without mutating the source note.

The work-order file is never edited after creation. State changes are represented by separate claim, completion, and receipt files keyed by the same job ID.

## Execution State Machine

```text
reviewed
  -> approval_validating
  -> queued
  -> claimed
  -> codex_running
  -> output_validating
  -> memory_written
  -> indexing
  -> succeeded | partial_success | failed
```

Each transition records its timestamp. Claims have an expiry time so a crashed runner cannot lock a job permanently. A runner may resume an expired job only after verifying the current Memory tree against the job's recorded pre-run state.

## Validation and Error Reporting

Every terminal receipt includes:

- work-order ID and schema version;
- source path and source hash;
- review artifact and review hash;
- start and finish timestamps;
- final status and last completed stage;
- Codex invocation identifier;
- created, modified, and deleted Memory paths;
- validation results;
- Mnemosyne section IDs or indexing errors;
- source-note post-run hash check;
- retryability and a concise user-facing message.

Stage-specific failures include:

| Stage | Example codes |
| --- | --- |
| Note capture | `note_read_failed`, `note_not_stable`, `attachment_manifest_failed` |
| Approval validation | `source_changed_since_review`, `invalid_review_hash` |
| Queue write | `work_order_write_failed`, `duplicate_job_conflict` |
| Sync arrival | `job_not_observed_before_deadline` |
| Claim | `invalid_work_order`, `claim_conflict`, `claim_write_failed` |
| Codex execution | `codex_timeout`, `codex_auth_failed`, `codex_execution_failed` |
| Output validation | `write_outside_memory`, `invalid_memory_schema`, `missing_index_update`, `missing_log_entry` |
| Artifact persistence | `memory_write_failed`, `receipt_write_failed` |
| Mnemosyne indexing | `index_request_failed`, `index_response_invalid`, `index_partial_failure` |
| Source integrity | `source_hash_changed` |

Timeouts are configured independently for approval validation, queue observation, Codex execution, output validation, and Mnemosyne indexing. Error messages name the failed stage, retain technical detail in the receipt, and show a concise summary in Obsidian.

## First Vertical Slice

The first implementation supports only `operation: incorporate_note` and only the `knowledge` memory domain.

Given one harmless Markdown test note, the workflow must:

1. create a review proposal;
2. require explicit approval;
3. create exactly one valid work order;
4. synchronize that work order to Hearken;
5. invoke Codex with `Memory/` as the writable root;
6. create or update exactly one deterministic knowledge page;
7. update `Memory/index.md`;
8. append one entry to `Memory/log.md`;
9. validate all changed paths are under `Memory/`;
10. index the resulting deterministic sections in Mnemosyne;
11. write a durable receipt that synchronizes back to Obsidian;
12. prove the source note's hash is unchanged.

## Testing Strategy

### Contract Tests

- Accept a valid `ariadne.work-order/v1` document.
- Reject missing, unknown, or malformed required fields.
- Derive the same job ID from identical normalized inputs.
- Reject an approval when the source hash differs from the reviewed hash.
- Do not create a work order when a note is merely created, clipped, pasted, or synchronized.
- Require two identical note hashes separated by one second before Review begins.
- Emit `note_not_stable` when the two capture hashes differ.
- Record local attachment metadata without copying attachment bytes.

### Runner Tests

- Claim only one copy of a duplicated job.
- Recover an expired claim safely.
- Kill Codex after the configured timeout and emit `codex_timeout`.
- Reject any Codex diff containing a path outside `Memory/`.
- Produce a valid receipt for success, partial success, and failure.

### Wiki Tests

- Produce the same target page path for the same source identity.
- Preserve valid internal links and required frontmatter.
- Update `index.md` without duplicate entries.
- Append exactly one `log.md` entry per successful job.
- Detect broken links, orphan pages, conflicting source hashes, and malformed source manifests.

### End-to-End Acceptance Test

Record the original test-note hash, run Review, approve the proposal, wait for the runner, and verify:

- a deterministic page appears under `Memory/Knowledge/`;
- `Memory/index.md` references it once;
- `Memory/log.md` records the job once;
- `Reports/` contains a successful receipt;
- the receipt contains Mnemosyne section IDs;
- the original test-note hash is identical before and after the run;
- rerunning the identical job creates no duplicate page, index entry, or log entry.

## Security and Operational Constraints

- Never place Obsidian credentials, Sync encryption passwords, Ariadne passkeys, OpenAI credentials, or Mnemosyne secrets in the vault.
- Headless Sync credentials remain in its protected Hearken configuration.
- Codex runs with `workspace-write`, never `danger-full-access` or sandbox bypass.
- The runner supplies no writable directory outside `Memory/` to Codex.
- Network access is denied to Codex for the first vertical slice; the runner owns external API calls.
- The runner must redact secrets from logs and receipts.
- No automatic source-note mutation exists in this design.
- No automatic merge into an external Git default branch exists in this design.

## Out of Scope for the First Vertical Slice

- Autonomous ingestion without approval.
- Direct Codex access to arbitrary Core notes.
- Cross-domain ingestion beyond `knowledge`.
- Automatic contradiction resolution.
- Automatic deletion of wiki pages.
- Scheduled bulk maintenance.
- Query-result filing back into Memory.
- A second Obsidian Sync remote vault.
- Git as a mobile synchronization mechanism.

## References

- [Obsidian Headless Sync](https://obsidian.md/help/sync/headless)
- [Obsidian Sync plans](https://obsidian.md/help/sync/plans)
- [Codex developer commands](https://learn.chatgpt.com/docs/developer-commands#codex-exec)
- [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
