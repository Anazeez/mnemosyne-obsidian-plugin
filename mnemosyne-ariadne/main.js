const {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile
} = require("obsidian");

const DEFAULT_SETTINGS = {
  workerBaseUrl: "https://mnemosyne-worker.izeesub.workers.dev",
  ariadnePasskey: "",
  reviewFolder: "System/Ariadne/Review"
};

module.exports = class MnemosyneAriadnePlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "ariadne-intake-current-note",
      name: "Ariadne: Intake current note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();

        if (!file) {
          return false;
        }

        if (!checking) {
          this.processCurrentNote();
        }

        return true;
      }
    });

    this.addSettingTab(new MnemosyneAriadneSettingTab(this.app, this));
  }

  async processCurrentNote() {
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
      this.settings.workerBaseUrl.replace(/\/+$/g, "") +
      "/api/ariadne/core/intake";

    const payload = {
      title,
      content,
      source: "obsidian-plugin",
      metadata: {
        vaultPath: file.path,
        originalLocation: file.path
      },
      reviewFirst: true
    };

    new Notice("Ariadne intake started.");

    let response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Matrix-Key": this.settings.ariadnePasskey,
          "X-Ariadne-Key": this.settings.ariadnePasskey
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error(err);
      new Notice("Ariadne network error: " + String(err && err.message ? err.message : err));
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();

      new Notice("Ariadne intake failed: HTTP " + response.status);
      console.error(errorText);
      return;
    }

    const data = await response.json();

    if (data.mutated !== false || data.reviewFirst !== true || !data.proposal) {
      new Notice("Unsafe or invalid Ariadne response blocked.");
      console.error(data);
      return;
    }

    await this.writeReviewArtifact(file, data);

    new Notice("Ariadne intake proposal written.");
  }

  async writeReviewArtifact(file, data) {
    const folder = this.settings.reviewFolder.replace(/^\/+|\/+$/g, "");

    await this.ensureFolder(folder);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = file.basename.replace(/[^a-zA-Z0-9_-]/g, "-");
    const reviewPath = folder + "/intake-" + stamp + "-" + safeName + ".md";
    const body = this.formatIntakeArtifact(file.path, data);

    await this.app.vault.create(reviewPath, body);
  }

  formatIntakeArtifact(originalPath, data) {
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
- approval required: true
- original note moved: false
- original note renamed: false
- original note deleted: false
- direct vault knowledge mutation: false
`;
  }

  mdList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "- None";
    }

    return items.map((item) => "- " + String(item)).join("\n");
  }

  async ensureFolder(folder) {
    const parts = folder.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? current + "/" + part : part;

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
};

class MnemosyneAriadneSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", {
      text: "Mnemosyne Ariadne"
    });

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
          .setPlaceholder("Ariadne passkey")
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