const { Plugin, Notice, PluginSettingTab, Setting, TFile } = require("obsidian");

const DEFAULT_SETTINGS = {
  workerUrl: "",
  ariadnePasskey: ""
};

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeFileName(name) {
  return String(name || "note")
    .replace(/\.md$/i, "")
    .replace(/[\\/:*?"<>|#^[\]]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "note";
}

function formatProposalMarkdown(file, data) {
  const proposal = data.proposal || {};
  const timestamp = new Date().toISOString();

  return [
    "---",
    "type: ariadne-intake-review",
    "source: obsidian-plugin",
    `created: ${timestamp}`,
    `originalLocation: ${file.path}`,
    "reviewFirst: true",
    "mutated: false",
    "---",
    "",
    "# Ariadne Intake Proposal",
    "",
    "## Original Note",
    `- Path: ${file.path}`,
    `- Name: ${file.name}`,
    "",
    "## Classification",
    proposal.classification ? String(proposal.classification) : "_None returned._",
    "",
    "## Summary",
    proposal.summary ? String(proposal.summary) : "_None returned._",
    "",
    "## Proposed Destination",
    proposal.proposedDestination ? String(proposal.proposedDestination) : "_None returned._",
    "",
    "## Proposed Tags",
    Array.isArray(proposal.proposedTags) && proposal.proposedTags.length
      ? proposal.proposedTags.map(tag => `- ${String(tag)}`).join("\n")
      : "_None returned._",
    "",
    "## Proposed Links",
    Array.isArray(proposal.proposedLinks) && proposal.proposedLinks.length
      ? proposal.proposedLinks.map(link => `- ${String(link)}`).join("\n")
      : "_None returned._",
    "",
    "## Warnings",
    Array.isArray(proposal.warnings) && proposal.warnings.length
      ? proposal.warnings.map(warning => `- ${String(warning)}`).join("\n")
      : "_None returned._",
    "",
    "## Raw Ariadne Response",
    "",
    "```json",
    JSON.stringify(data, null, 2),
    "```",
    ""
  ].join("\n");
}

module.exports = class AriadneIntakePlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "ariadne-intake-current-note",
      name: "Intake current note",
      callback: async () => {
        await this.intakeCurrentNote();
      }
    });

    this.addSettingTab(new AriadneSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async intakeCurrentNote() {
    const passkey = String(this.settings.ariadnePasskey || "").trim();
    const workerUrl = String(this.settings.workerUrl || "").trim().replace(/\/+$/, "");

    if (!passkey) {
      new Notice("Missing Ariadne passkey. Configure plugin settings.");
      return;
    }

    if (!workerUrl) {
      new Notice("Missing Ariadne Worker URL. Configure plugin settings.");
      return;
    }

    const file = this.app.workspace.getActiveFile();

    if (!file || !(file instanceof TFile) || file.extension !== "md") {
      new Notice("Open a Markdown note before running Ariadne intake.");
      return;
    }

    new Notice("Ariadne intake started.");

    const content = await this.app.vault.read(file);
    const title = file.basename;

    const body = {
      title,
      content,
      source: "obsidian-plugin",
      metadata: {
        vaultPath: file.path,
        originalLocation: file.path
      },
      reviewFirst: true
    };

    let response;

    try {
      response = await fetchWithTimeout(
        `${workerUrl}/api/ariadne/core/intake`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Matrix-Key": passkey,
            "X-Ariadne-Key": passkey
          },
          body: JSON.stringify(body)
        },
        45000
      );
    } catch (error) {
      if (error && error.name === "AbortError") {
        new Notice("Ariadne network timeout after 45 seconds.");
        return;
      }

      new Notice("Ariadne intake failed: network error");
      return;
    }

    if (!response.ok) {
      new Notice(`Ariadne intake failed: HTTP ${response.status}`);
      return;
    }

    let data;

    try {
      data = await response.json();
    } catch (error) {
      new Notice("Ariadne returned invalid JSON.");
      return;
    }

    if (
      !data ||
      data.reviewFirst !== true ||
      data.mutated !== false ||
      !data.proposal ||
      typeof data.proposal !== "object"
    ) {
      new Notice("Unsafe or invalid Ariadne response blocked.");
      return;
    }

    const reviewFolder = "System/Ariadne/Review";
    await this.ensureFolder(reviewFolder);

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

    const safeName = sanitizeFileName(file.basename);
    const reviewPath = `${reviewFolder}/intake-${timestamp}-${safeName}.md`;

    const markdown = formatProposalMarkdown(file, data);

    await this.app.vault.create(reviewPath, markdown);

    new Notice("Ariadne intake proposal written.");
  }

  async ensureFolder(path) {
    const parts = path.split("/");
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;

      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }
};

class AriadneSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Ariadne Intake Settings" });

    new Setting(containerEl)
      .setName("Worker URL")
      .setDesc("Base URL for the Mnemosyne Worker, without trailing slash.")
      .addText(text =>
        text
          .setPlaceholder("https://your-worker.example.workers.dev")
          .setValue(this.plugin.settings.workerUrl)
          .onChange(async value => {
            this.plugin.settings.workerUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ariadne passkey")
      .setDesc("Passkey sent as both X-Matrix-Key and X-Ariadne-Key.")
      .addText(text => {
        text.inputEl.type = "password";

        text
          .setPlaceholder("Enter Ariadne passkey")
          .setValue(this.plugin.settings.ariadnePasskey)
          .onChange(async value => {
            this.plugin.settings.ariadnePasskey = value.trim();
            await this.plugin.saveSettings();
          });
      });
  }
}
