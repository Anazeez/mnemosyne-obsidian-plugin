console.log("MNEMOSYNE ARIADNE MAIN.JS LOADED");
const { Plugin, Notice, PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = {
  workerBaseUrl: "",
  ariadnePasskey: ""
};

function sanitizeFileName(name) {
  return String(name || "untitled")
    .replace(/[\\/:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "untitled";
}

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

class AriadneSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Worker base URL")
      .setDesc("Example: https://your-worker.example.workers.dev")
      .addText(text =>
        text
          .setPlaceholder("https://...")
          .setValue(this.plugin.settings.workerBaseUrl)
          .onChange(async value => {
            this.plugin.settings.workerBaseUrl = value.trim().replace(/\/+$/, "");
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ariadne passkey")
      .setDesc("Sent as both X-Matrix-Key and X-Ariadne-Key.")
      .addText(text => {
        text.inputEl.type = "password";

        text
          .setPlaceholder("Passkey")
          .setValue(this.plugin.settings.ariadnePasskey)
          .onChange(async value => {
            this.plugin.settings.ariadnePasskey = value;
            await this.plugin.saveSettings();
          });
      });
  }
}

module.exports = class MnemosyneAriadnePlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    new Notice("Ariadne plugin loaded.");

    this.addCommand({
      id: "ariadne-intake-current-note",
      name: "Ariadne: Intake current note",
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
    new Notice("Ariadne intake started.");

    const passkey = this.settings.ariadnePasskey;
    const baseUrl = this.settings.workerBaseUrl;

    if (!passkey) {
      new Notice("Missing Ariadne passkey. Configure plugin settings.");
      return;
    }

    if (!baseUrl) {
      new Notice("Missing Ariadne Worker URL. Configure plugin settings.");
      return;
    }

    const file = this.app.workspace.getActiveFile();

    if (!file) {
      new Notice("No active note selected.");
      return;
    }

    const content = await this.app.vault.read(file);
    const title = file.basename;
    const url = `${baseUrl.replace(/\/+$/, "")}/api/ariadne/core/intake`;

    let response;

    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Matrix-Key": passkey,
            "X-Ariadne-Key": passkey
          },
          body: JSON.stringify({
            title,
            content,
            source: "obsidian-plugin",
            metadata: {
              vaultPath: file.path,
              originalLocation: file.path
            },
            reviewFirst: true
          })
        },
        45000
      );
    } catch (error) {
      if (error && error.name === "AbortError") {
        new Notice("Ariadne network timeout after 45 seconds.");
      } else {
        new Notice("Ariadne intake failed: network error");
      }

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
      data.reviewFirst !== true ||
      data.mutated !== false ||
      !data.proposal ||
      typeof data.proposal !== "object"
    ) {
      new Notice("Unsafe or invalid Ariadne response blocked.");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeTitle = sanitizeFileName(title);
    const folder = "System/Ariadne/Review";
    const reviewPath = `${folder}/intake-${timestamp}-${safeTitle}.md`;

    await this.app.vault.adapter.mkdir(folder).catch(() => {});

    const proposal = data.proposal;

    const reviewBody = [
      "---",
      "ariadne_review: true",
      "reviewFirst: true",
      "mutated: false",
      `source_note: ${JSON.stringify(file.path)}`,
      `created: ${JSON.stringify(new Date().toISOString())}`,
      "---",
      "",
      "# Ariadne Intake Proposal",
      "",
      "## Source",
      "",
      `- Title: ${title}`,
      `- Path: ${file.path}`,
      "",
      "## Classification",
      "",
      proposal.classification || "",
      "",
      "## Summary",
      "",
      proposal.summary || "",
      "",
      "## Proposed Destination",
      "",
      proposal.proposedDestination || "",
      "",
      "## Proposed Tags",
      "",
      Array.isArray(proposal.proposedTags)
        ? proposal.proposedTags.map(tag => `- ${tag}`).join("\n")
        : "",
      "",
      "## Proposed Links",
      "",
      Array.isArray(proposal.proposedLinks)
        ? proposal.proposedLinks.map(link => `- ${link}`).join("\n")
        : "",
      "",
      "## Warnings",
      "",
      Array.isArray(proposal.warnings)
        ? proposal.warnings.map(warning => `- ${warning}`).join("\n")
        : "",
      "",
      "## Raw Proposal",
      "",
      "```json",
      JSON.stringify(proposal, null, 2),
      "```",
      ""
    ].join("\n");

    await this.app.vault.create(reviewPath, reviewBody);

    new Notice("Ariadne intake proposal written.");
  }
};
