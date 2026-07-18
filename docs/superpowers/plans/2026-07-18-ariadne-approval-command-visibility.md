# Ariadne Approval Command Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `Ariadne: Approve current review` visible in Obsidian's command palette and report an explicit validation error when the active note is not an eligible review artifact.

**Architecture:** Replace the context-filtering `checkCallback` with an unconditional `callback`. Move the existing folder/file eligibility check into a focused method invoked by the callback, preserving the existing approval modal and contract validation after eligibility succeeds.

**Tech Stack:** TypeScript, Obsidian plugin API, Node.js bundle tests, `obsidian-plugin-cli`.

## Global Constraints

- Never mutate the approved source note.
- Do not weaken `ariadne.review/v1` contract validation.
- Do not approve arbitrary Markdown outside the configured review folder.
- Rebuild `mnemosyne-ariadne/dist/main.js`, `mnemosyne-ariadne/main.js`, and repository-root `main.js`.
- The mobile release remains `main.js`, `manifest.json`, and `styles.css`.

---

### Task 1: Visible approval command with explicit validation

**Files:**
- Modify: `mnemosyne-ariadne/tests/bundle.test.cjs`
- Modify: `mnemosyne-ariadne/src/main.ts:138-153`
- Rebuild: `mnemosyne-ariadne/dist/main.js`
- Rebuild: `mnemosyne-ariadne/main.js`
- Rebuild: `main.js`

**Interfaces:**
- Consumes: `this.app.workspace.getActiveFile()`, `this.settings.reviewFolder`, `this.openApproval(reviewFile)`.
- Produces: `requireCurrentReview(): TFile`, which returns an eligible review file or throws `WorkflowError("approval validation", message)`.

- [ ] **Step 1: Write the failing bundle regression test**

After the command-ID assertion in `mnemosyne-ariadne/tests/bundle.test.cjs`, add:

```js
  const approvalCommand = plugin.commands.find(
    (command) => command.id === "ariadne-approve-current-review"
  );
  assert.strictEqual(typeof approvalCommand.callback, "function");
  assert.strictEqual(approvalCommand.checkCallback, undefined);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```sh
cd mnemosyne-ariadne
npm test
```

Expected: FAIL because the current command has `checkCallback` and no normal `callback`.

- [ ] **Step 3: Implement the minimal source change**

Replace the approval command registration in `mnemosyne-ariadne/src/main.ts` with:

```ts
    this.addCommand({
      id: "ariadne-approve-current-review",
      name: "Ariadne: Approve current review",
      callback: () => void this.runSafely("Approval", async () => {
        await this.openApproval(this.requireCurrentReview());
      })
    });
```

Add the focused eligibility method next to `currentNoteCommand`:

```ts
  requireCurrentReview(): TFile {
    const file = this.app.workspace.getActiveFile();
    const reviewFolder = normalizePath(this.settings.reviewFolder).replace(/\/+$/g, "");
    const available = file instanceof TFile &&
      file.extension === "md" &&
      file.path.startsWith(`${reviewFolder}/`);

    if (!available) {
      throw new WorkflowError(
        "approval validation",
        `Open an Ariadne review proposal from ${reviewFolder} first.`
      );
    }

    return file;
  }
```

- [ ] **Step 4: Build and verify GREEN**

Run:

```sh
cd mnemosyne-ariadne
npm run check
npm run build
npm test
```

Expected: source contract verified, release artifact verified, and bundle behavior verified.

- [ ] **Step 5: Verify artifacts and repository hygiene**

Run:

```sh
git diff --check
cmp mnemosyne-ariadne/dist/main.js mnemosyne-ariadne/main.js
cmp mnemosyne-ariadne/main.js main.js
git status --short
```

Expected: both `cmp` commands exit successfully; status contains only the intended source, test, bundle, and plan changes.

- [ ] **Step 6: Commit the implementation**

```sh
git add mnemosyne-ariadne/src/main.ts \
  mnemosyne-ariadne/tests/bundle.test.cjs \
  mnemosyne-ariadne/dist/main.js \
  mnemosyne-ariadne/main.js \
  main.js \
  manifest.json \
  styles.css \
  docs/superpowers/plans/2026-07-18-ariadne-approval-command-visibility.md
git commit -m "fix: keep Ariadne approval command visible"
```
