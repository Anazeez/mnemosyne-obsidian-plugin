# Mnemosyne Ariadne for Obsidian

A mobile-compatible Obsidian client for review-first Ariadne workflows and
governed Mnemosyne memory.

## Commands

- `Ariadne: Test Mnemosyne connection`
- `Ariadne: Review current note`
- `Ariadne: Index current note`
- `Ariadne: Query Mnemosyne`

Review writes proposals under `System/Ariadne/Review` and never modifies the
source note. Index validates the existing frontmatter and body hash before it
sends the note to Mnemosyne. Query results are read-only and can open matching
local notes.

## Build and BRAT artifact

Run `npm run check && npm run build` from `mnemosyne-ariadne`. The build copies
`main.js`, `manifest.json`, and `styles.css` to the repository root, which is the
release layout expected by Obsidian and BRAT.

The settings page displays the bundle build identifier. Compare it on mobile
after installing or updating to prove which artifact Obsidian loaded.

Publishing remains a separate operation: a GitHub release whose tag matches the
manifest version must contain those three root artifacts.
