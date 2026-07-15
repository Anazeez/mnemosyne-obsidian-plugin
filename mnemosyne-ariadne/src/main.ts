import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile
} from "obsidian";

import {
  BUILD_ID,
  buildCheckpointProposal,
  buildPublishedRunwayPath,
  buildRehydrateRequest,
  compareNoteToRunway,
  formatCheckpointProposal,
  formatRunwayMarkdown,
  normalizeScope,
  parseCheckpointProposal,
  parseRehydrationResponse,
  verifyProposalSource
} from "./continuity-contract";
import "./styles.css";

interface MnemosyneAriadneSettings {
  workerBaseUrl: string;
  ariadnePasskey: string;
  reviewFolder: string;
  proposalFolder: string;
  publishedFolder: string;
  identityId: string;
  projectId: string;
  scopeKey: string;
}

const DEFAULT_SETTINGS: MnemosyneAriadneSettings = {
  workerBaseUrl: "",
  ariadnePasskey: "",
  reviewFolder: "System/Ariadne/Review",
  proposalFolder: "System/Mnemosyne/Runway-Proposals",
  publishedFolder: "System/Mnemosyne/Runways",
  identityId: "ariadne",
  projectId: "project-infinitum",
  scopeKey: "default"
};

const OBSIDIAN_SERVER_GATE = "CONTINUITY_OBSIDIAN_ACTIONS";

export default class MnemosyneAriadnePlugin extends Plugin {
  settings: MnemosyneAriadneSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "ariadne-intake-current-note",
      name: "Ariadne: Intake current note",
      callback: () => this.processCurrentNote()
    });
    this.addCommand({
      id: "mnemosyne-show-latest-contextual-runway",
      name: "Mnemosyne: Show latest contextual runway",
      callback: () => this.showLatestRunway()
    });
    this.addCommand({
      id: "mnemosyne-propose-contextual-checkpoint",
      name: "Mnemosyne: Propose contextual checkpoint",
      callback: () => this.proposeCheckpoint()
    });
    this.addCommand({
      id: "mnemosyne-submit-reviewed-checkpoint",
      name: "Mnemosyne: Submit reviewed checkpoint",
      callback: () => this.submitReviewedCheckpoint()
    });
    this.addCommand({
      id: "mnemosyne-rehydrate-specialist-context",
      name: "Mnemosyne: Rehydrate specialist context",
      callback: () => this.rehydrateContext()
    });
    this.addCommand({
      id: "mnemosyne-compare-note-latest-runway",
      name: "Mnemosyne: Compare current note with latest runway",
      callback: () => this.compareCurrentNote()
    });
    this.addCommand({
      id: "mnemosyne-open-runway-lineage",
      name: "Mnemosyne: Open runway lineage",
      callback: () => this.openRunwayLineage()
    });

    this.addSettingTab(new MnemosyneAriadneSettingTab(this.app, this));
  }

  private scope() {
    return normalizeScope({
      identity_id: this.settings.identityId,
      project_id: this.settings.projectId,
      scope_key: this.settings.scopeKey
    });
  }

  private requireConfiguration() {
    if (!this.settings.workerBaseUrl.trim() || !this.settings.ariadnePasskey.trim()) {
      throw new Error("Configure the Worker URL and Ariadne passkey first.");
    }
    return this.scope();
  }

  private endpoint(path: string) {
    return `${this.settings.workerBaseUrl.replace(/\/+$/g, "")}${path}`;
  }

  private async requestJson(path: string, options: RequestInit = {}) {
    const headers = {
      "Content-Type": "application/json",
      "X-Matrix-Key": this.settings.ariadnePasskey,
      "X-Ariadne-Key": this.settings.ariadnePasskey,
      ...(options.headers || {})
    };
    let response: Response;
    try {
      response = await fetch(this.endpoint(path), { ...options, headers });
    } catch {
      throw new Error("Mnemosyne network request is unavailable.");
    }
    if (!response.ok) {
      throw new Error(`Mnemosyne request failed with HTTP ${response.status}.`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Mnemosyne returned an invalid response.");
    }
  }

  private async latest() {
    const scope = this.requireConfiguration();
    const query = new URLSearchParams(scope).toString();
    return this.requestJson(`/v1/continuity/latest?${query}`);
  }

  private activeMarkdown(): TFile {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      throw new Error("The active file must be a Markdown note.");
    }
    return file;
  }

  private async run(label: string, operation: () => Promise<void>) {
    try {
      await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : `${label} failed.`;
      new Notice(message);
      console.warn(`[${label}] ${message}`);
    }
  }

  async showLatestRunway() {
    return this.run("continuity.latest", async () => {
      const result = await this.latest();
      const context = result.context || {};
      new Notice(
        `${context.status || "CONTEXT_UNAVAILABLE"} · generation ${
          context.generation == null ? "none" : context.generation
        } · ${BUILD_ID}`
      );
    });
  }

  async proposeCheckpoint() {
    return this.run("continuity.propose", async () => {
      const scope = this.requireConfiguration();
      const file = this.activeMarkdown();
      const content = await this.app.vault.read(file);
      const latest = await this.latest();
      const now = new Date().toISOString();
      const proposal = await buildCheckpointProposal({
        source: { path: file.path, basename: file.basename, content },
        scope,
        current: latest.context && latest.context.runway_id
          ? latest.context
          : null,
        createdAt: now,
        invocationId: `inv_obsidian_${now.replace(/[^0-9]/g, "")}`
      });
      const folder = this.cleanFolder(this.settings.proposalFolder);
      await this.ensureFolder(folder);
      const path = `${folder}/checkpoint-${this.safeName(file.basename)}-${
        now.replace(/[:.]/g, "-")
      }.md`;
      const created = await this.app.vault.create(
        path,
        formatCheckpointProposal(proposal)
      );
      await this.app.workspace.getLeaf(false).openFile(created);
      new Notice("Checkpoint proposal created. Review it before explicit submission.");
    });
  }

  async submitReviewedCheckpoint() {
    return this.run("continuity.submit", async () => {
      this.requireConfiguration();
      const proposalFile = this.activeMarkdown();
      const proposalRoot = `${this.cleanFolder(this.settings.proposalFolder)}/`;
      if (!proposalFile.path.startsWith(proposalRoot)) {
        throw new Error("Only a reviewed Runway-Proposals note can be submitted.");
      }
      const proposal = parseCheckpointProposal(
        await this.app.vault.read(proposalFile)
      );
      const sourceFile = this.app.vault.getAbstractFileByPath(
        proposal.source_note.path
      );
      if (!(sourceFile instanceof TFile)) {
        throw new Error("The checkpoint source note is unavailable.");
      }
      const source = {
        path: sourceFile.path,
        basename: sourceFile.basename,
        content: await this.app.vault.read(sourceFile)
      };
      if (!(await verifyProposalSource(proposal, source))) {
        throw new Error("Source hash changed; create and review a new proposal.");
      }
      const result = await this.requestJson("/v1/continuity/checkpoints", {
        method: "POST",
        body: JSON.stringify(proposal)
      });
      new Notice(
        `Checkpoint candidate ${result.runway_id} created. Publication and activation remain separate.`
      );
    });
  }

  async rehydrateContext() {
    return this.run("continuity.rehydrate", async () => {
      const scope = this.requireConfiguration();
      const response = await this.requestJson("/v1/continuity/rehydrate", {
        method: "POST",
        body: JSON.stringify(buildRehydrateRequest(
          scope,
          "",
          ["knowledge", "skills", "files"]
        ))
      });
      const parsed = parseRehydrationResponse(response);
      if (!parsed.runway.runway_id || !parsed.runway.generation) {
        new Notice(`${parsed.runway.status}: no local Runway copy created.`);
        return;
      }
      const path = buildPublishedRunwayPath(
        this.cleanFolder(this.settings.publishedFolder),
        scope,
        parsed.runway.generation
      );
      await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
      let file = this.app.vault.getAbstractFileByPath(path);
      if (!file) {
        file = await this.app.vault.create(path, formatRunwayMarkdown(parsed));
      }
      if (!(file instanceof TFile)) {
        throw new Error("Published Runway path is not a Markdown file.");
      }
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`${parsed.runway.status}: exact Runway opened; supplemental evidence remains separate.`);
    });
  }

  async compareCurrentNote() {
    return this.run("continuity.compare", async () => {
      this.requireConfiguration();
      const file = this.activeMarkdown();
      const latest = await this.latest();
      const localPaths = new Set(this.app.vault.getMarkdownFiles().map(item => item.path));
      const comparison = await compareNoteToRunway(
        file.path,
        await this.app.vault.read(file),
        latest.context || {},
        localPaths
      );
      new Notice(
        `${comparison.matches ? "Note hash matches the latest Runway" : "Note hash is not represented by the latest Runway"}; ${
          comparison.missing_local_references.length
        } local reference(s) missing.`
      );
    });
  }

  async openRunwayLineage() {
    return this.run("continuity.lineage", async () => {
      const scope = this.requireConfiguration();
      const query = new URLSearchParams(scope).toString();
      const history = await this.requestJson(`/v1/continuity/history?${query}`);
      const folder = this.cleanFolder(this.settings.proposalFolder);
      await this.ensureFolder(folder);
      const now = new Date().toISOString();
      const rows = Array.isArray(history.runways) ? history.runways : [];
      const body = `# Contextual Runway Lineage

- Identity: ${scope.identity_id}
- Project: ${scope.project_id}
- Scope: ${scope.scope_key}
- Generated: ${now}
- Build identifier: ${BUILD_ID}

${rows.length === 0 ? "- No lineage available" : rows.map((row: any) =>
  `- generation ${row.generation}: ${row.runway_id} · ${row.state} · predecessor ${row.predecessor_runway_id || "none"}`
).join("\n")}
`;
      const created = await this.app.vault.create(
        `${folder}/lineage-${now.replace(/[:.]/g, "-")}.md`,
        body
      );
      await this.app.workspace.getLeaf(false).openFile(created);
    });
  }

  async processCurrentNote() {
    return this.run("ariadne.intake", async () => {
      this.requireConfiguration();
      const file = this.activeMarkdown();
      const content = await this.app.vault.read(file);
      const data = await this.requestJson("/api/ariadne/core/intake", {
        method: "POST",
        body: JSON.stringify({
          title: file.basename,
          content,
          source: "obsidian-plugin",
          metadata: { vaultPath: file.path, originalLocation: file.path },
          reviewFirst: true
        })
      });
      if (data.mutated !== false || data.reviewFirst !== true || !data.proposal) {
        throw new Error("Unsafe or invalid Ariadne response blocked.");
      }
      const folder = this.cleanFolder(this.settings.reviewFolder);
      await this.ensureFolder(folder);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await this.app.vault.create(
        `${folder}/intake-${stamp}-${this.safeName(file.basename)}.md`,
        this.formatIntakeArtifact(file.path, data)
      );
      new Notice("Ariadne intake proposal written without changing the source note.");
    });
  }

  formatIntakeArtifact(originalPath: string, data: any): string {
    const proposal = data.proposal || {};
    return `# Ariadne Intake Proposal

## Original file path

${originalPath}

## Classification

${proposal.classification || "Unclassified"}

## Summary

${proposal.summary || ""}

## Proposed destination

${proposal.proposedDestination || ""}

## Proposed tags

${this.mdList(proposal.proposedTags)}

## Proposed links

${this.mdList(proposal.proposedLinks)}

## Warnings

${this.mdList(proposal.warnings)}

## Safety

- reviewFirst: true
- mutated: false
- explicit approval required: true
- source note changed: false
- build identifier: ${BUILD_ID}
`;
  }

  mdList(items: unknown): string {
    if (!Array.isArray(items) || items.length === 0) return "- None";
    return items.map((item) => `- ${String(item)}`).join("\n");
  }

  private cleanFolder(folder: string) {
    return folder.replace(/^\/+|\/+$/g, "");
  }

  private safeName(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "note";
  }

  async ensureFolder(folder: string) {
    const parts = folder.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class MnemosyneAriadneSettingTab extends PluginSettingTab {
  plugin: MnemosyneAriadnePlugin;

  constructor(app: App, plugin: MnemosyneAriadnePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: `Mnemosyne Ariadne · ${BUILD_ID}` });

    this.addText("Worker base URL", "No default endpoint is embedded.", "workerBaseUrl");
    new Setting(containerEl)
      .setName("Ariadne passkey")
      .setDesc("Stored only in local Obsidian plugin data.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.ariadnePasskey).onChange(async value => {
          this.plugin.settings.ariadnePasskey = value.trim();
          await this.plugin.saveSettings();
        });
      });
    this.addText("Identity", "Exact canonical credential identity.", "identityId");
    this.addText("Project", "Explicit continuity project.", "projectId");
    this.addText("Scope", "Bounded exact Runway scope.", "scopeKey");
    this.addText("Review folder", "Ariadne review artifacts.", "reviewFolder");
    this.addText("Runway proposal folder", `Explicit submissions require server gate ${OBSIDIAN_SERVER_GATE}.`, "proposalFolder");
    this.addText("Published Runway folder", "Read-only local representations.", "publishedFolder");
  }

  private addText(
    name: string,
    description: string,
    key: keyof MnemosyneAriadneSettings
  ) {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addText(text => text
        .setValue(this.plugin.settings[key])
        .onChange(async value => {
          this.plugin.settings[key] = value.trim();
          await this.plugin.saveSettings();
        }));
  }
}
