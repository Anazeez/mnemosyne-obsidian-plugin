# Ariadne action-loop end-to-end acceptance

This runbook validates one harmless note without deploying Worker code, changing
secrets, pushing branches, installing a service, or mutating the source note.
Every external or account-level operation remains separately gated.

## Automated evidence

Release identity: `0.2.0-action.1` (`manifest.json` version `0.2.0`).

The root BRAT artifacts built on 2026-07-14 have these SHA-256 values:

```text
fba18527150276617111528ef70d0fd7e97d8732a98450e6d7c54c01c55a4aa9  main.js
b45e74363dca468e0b158732151dd99d4339c412adb4fd217921a25f824d8240  manifest.json
0ec7f5df526962e7a9c9155e5f2d615bfa5daca83306a3623a18b3d35137e9b3  styles.css
```

The build completed with its release verifier, bundle tests, and action-contract
tests passing. The plugin build tool emitted a non-fatal update-check permission
warning; it did not alter the build result.

## Stop conditions before approval

In Obsidian, use the installed artifact to run:

1. `Ariadne: Test Mnemosyne connection`.
2. `Ariadne: Review current note` on one harmless note containing no secrets.

Stop immediately unless the connection displays an authenticated identity and
allowed memory domains. Also stop unless Review creates a valid
`ariadne.review/v1` artifact with `mutated: false`, the expected source path and
hash, operation `incorporate_note`, status `proposed`, and allowed domain
`knowledge`. A live Worker mismatch is evidence to reconcile the Worker
contract; it is not permission to deploy or change it.

## Evidence checklist

Use a harmless Markdown note with no confidential text or attachment bytes.
Record evidence outside secrets:

- [ ] Source vault-relative path.
- [ ] Pre-run canonical source SHA-256.
- [ ] Review artifact path and recorded source hash.
- [ ] Explicit approval screenshot or UTC timestamp.
- [ ] Queue work-order path and deterministic job ID.
- [ ] Headless Sync observation UTC timestamp.
- [ ] Runner stage result and exit code.
- [ ] Deterministic `Memory/Knowledge/<slug>--<hash-prefix>.md` path.
- [ ] Exactly one matching link in `Memory/index.md`.
- [ ] Exactly one matching job ID in `Memory/log.md`.
- [ ] Matching `Memory/Sources/<source-hash>.md` manifest.
- [ ] Mnemosyne section IDs and any section errors.
- [ ] Receipt path and terminal status.
- [ ] Post-run canonical source SHA-256 equal to the pre-run value.
- [ ] Repeat invocation result proving no duplicate page, index link, log entry,
      or receipt.

## Manual sequence

1. Wait for mobile Obsidian Sync to finish and stop editing the test note.
2. Run Review and inspect the proposal. Do not approve an unexpected proposal.
3. From the review artifact, run `Ariadne: Approve current review` and confirm the
   source-note warning in the approval dialog.
4. Record the work-order path and job ID. Creation or Sync alone must not trigger
   execution.
5. With separately authorized Headless Sync already configured, wait until the
   immutable work order is visible in the Hearken mirror.
6. Run `npm test`, then `npm run run:once` in the runner checkout.
7. Inspect the receipt before allowing another job. Exit `0` may mean succeeded
   or partial success; section errors remain explicit in the receipt.
8. Wait for bidirectional Sync and verify the Memory artifacts and receipt on
   mobile.
9. Recompute the source hash. Stop and preserve all evidence if it differs.
10. Invoke the runner once more. Confirm the completed job is idempotent and no
    duplicate Memory or report entries appear.

## Artifact installation gate

After separate approval, close Obsidian and replace exactly these three files in
`.obsidian/plugins/mnemosyne-ariadne/`:

```text
main.js
manifest.json
styles.css
```

Preserve `data.json`, reopen Obsidian, and confirm the settings panel reports
`Loaded build: 0.2.0-action.1` before testing. This document does not authorize
that installation, a branch push, Headless login, live-vault execution, Worker
deployment, or secret changes.
