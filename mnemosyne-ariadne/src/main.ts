import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile
} from "obsidian";

interface MnemosyneAriadneSettings {
  workerBaseUrl: string;
  ariadnePasskey: string;
  reviewFolder: string;
}

const DEFAULT_SETTINGS: MnemosyneAriadneSettings = {
  workerBaseUrl: "https://mnemosyne-worker.izeesub.workers.dev",
  ariadnePasskey: "",
  reviewFolder: "System/Ariadne/Review"
};

export default class MnemosyneAriadnePlugin extends Plugin {
  settings: MnemosyneAriadneSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "ariadne-intake-current-note",
      name: "Ariadne: Intake current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) this.processCurrentNote("intake");
        return true;
      }
    });

    this.addCommand({
      id: "ariadne-review-current-note",
      name: "Ariadne: Review current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) this.processCurrentNote("review");
        return true;
      }
    });

    this.addSettingTab(new MnemosyneAriadneSettingTab(this.app, this));
  }

  async processCurrentNote(mode: "intake" | "review") {
    const file = this.app.workspace.getActiveFile();

    if (!file) {
      new Notice("No active note.");
      return;
    }

    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice("Active file is not a Markdown note.");
      return;
    }

    if (!this.settings.ariadnePasskey.trim()) {
      new Notice("Missing Ariadne passkey. Configure plugin settings.");
      return;
    }

    const content = await this.app.vault.read(file);
    const title = file.basename;
    const endpoint =
      mode === "review"
        ? `${this.settings.workerBaseUrl}/api/ariadne/core/review`
        : `${this.settings.workerBaseUrl}/api/ariadne/core/intake`;

    const payload =
      mode === "review"
        ? {
            title,
            content,
            currentLocation: file.path,
            metadata: {
              vaultPath: file.path
            },
            reviewFirst: true
          }
        : {
            title,
            content,
            source: "obsidian-plugin",
            metadata: {
              vaultPath: file.path
            },
            reviewFirst: true
          };

    new Notice(`Ariadne ${mode} started.`);

  let response: Response;

try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Matrix-Key": this.settings.ariadnePasskey
    },
    body: JSON.stringify(payload)
  });
} catch (err) {
  console.error(err);
  new Notice(
    `Ariadne network error: ${
      err instanceof Error ? err.message : String(err)
    }`
  );
  return;
}

    if (!response.ok) {
      const errorText = await response.text();
      new Notice(`Ariadne ${mode} failed: HTTP ${response.status}`);
      console.error(errorText);
      return;
    }

    const data = await response.json();

    if (data.mutated !== false || data.reviewFirst !== true) {
      new Notice("Unsafe Ariadne response blocked.");
      console.error(data);
      return;
    }

    await this.writeReviewArtifact(file, mode, data);
    new Notice(`Ariadne ${mode} proposal written.`);
  }

  async writeReviewArtifact(file: TFile, mode: "intake" | "review", data: any) {
    const folder = this.settings.reviewFolder.replace(/^\/+|\/+$/g, "");
    await this.ensureFolder(folder);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = file.basename.replace(/[^a-zA-Z0-9_-]/g, "-");
    const reviewPath = `${folder}/${mode}-${stamp}-${safeName}.md`;

    const body =
      mode === "review"
        ? this.formatReviewArtifact(file.path, data)
        : this.formatIntakeArtifact(file.path, data);

    await this.app.vault.create(reviewPath, body);
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

- mutated: false
- approval required: true
`;
  }

  formatReviewArtifact(originalPath: string, data: any): string {
    const review = data.review || {};

    return `# Ariadne Review Proposal

## Original file path

${originalPath}

## Summary

${review.summary || ""}

## Quality

${review.quality || ""}

## Ambiguities

${this.mdList(review.ambiguities)}

## Missing information

${this.mdList(review.missingInformation)}

## Duplicate risk

${review.duplicateRisk || ""}

## Suggested destination

${review.suggestedDestination || ""}

## Suggested tags

${this.mdList(review.suggestedTags)}

## Suggested links

${this.mdList(review.suggestedLinks)}

## Confidence

${typeof review.confidence === "number" ? review.confidence : "Unspecified"}

## Warnings

${this.mdList(review.warnings)}

## Safety

- mutated: false
- approval required: true
`;
  }

  mdList(items: unknown): string {
    if (!Array.isArray(items) || items.length === 0) {
      return "- None";
    }

    return items.map((item) => `- ${String(item)}`).join("\n");
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

    containerEl.createEl("h2", { text: "Mnemosyne Ariadne" });

    new Setting(containerEl)
      .setName("Worker base URL")
      .setDesc("Mnemosyne Worker base URL.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.workerBaseUrl)
          .setValue(this.plugin.settings.workerBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.workerBaseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ariadne passkey")
      .setDesc("Stored locally in Obsidian plugin data.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("X-Matrix-Key")
          .setValue(this.plugin.settings.ariadnePasskey)
          .onChange(async (value) => {
            this.plugin.settings.ariadnePasskey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Review folder")
      .setDesc("Where Ariadne proposal notes are written.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.reviewFolder)
          .setValue(this.plugin.settings.reviewFolder)
          .onChange(async (value) => {
            this.plugin.settings.reviewFolder =
              value.trim() || DEFAULT_SETTINGS.reviewFolder;
            await this.plugin.saveSettings();
          })
      );
  }
}
