# Ariadne approval command visibility

## Problem

`Ariadne: Approve current review` uses an Obsidian `checkCallback` to decide
whether it should be available. Obsidian omits the command from the command
palette whenever that callback returns `false`. On mobile, this makes approval
undiscoverable even while a review proposal is open, and offers no explanation
of the failed context check.

## Design

Register the approval action with a normal callback so it is always visible in
the command palette. When invoked, inspect the active file and fail visibly at
the `approval validation` stage unless it is a Markdown file inside the
configured review folder. For an eligible file, retain the existing
`openApproval` flow and the existing `ariadne.review/v1` contract validation.

The command must not approve arbitrary Markdown, mutate source notes, or weaken
review-artifact validation. This change affects discoverability and error
reporting only.

## Error handling

If there is no active Markdown review artifact, show a deterministic notice
that tells the user to open a proposal from the configured review folder. If a
file is in that folder but has an invalid review contract, preserve the existing
contract-specific validation error.

## Verification

Add a bundle regression test proving that:

- the approval command is registered with a normal callback;
- the command remains present independent of active-file context;
- the production bundle contains the same behavior;
- existing build verification and plugin tests still pass.

Rebuild `mnemosyne-ariadne/dist/main.js`, `mnemosyne-ariadne/main.js`, and the
repository-root `main.js`. The mobile installation continues to require only
`main.js`, `manifest.json`, and `styles.css`.
