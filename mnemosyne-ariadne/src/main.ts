import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
  requestUrl
} from "obsidian";

const BUILD_ID = "0.1.0-audit.2";
const DEFAULT_TIMEOUT_MS = 15_000;
const REQUIRED_FRONTMATTER = [
  "id",
  "title",
  "created",
  "status",
  "sha256",
  "parents",
  "sources",
  "tags",
  "schema"
];

type WorkflowStage =
  | "note read"
  | "request sent"
  | "response received"
  | "validation"
  | "artifact written";

interface MnemosyneAriadneSettings {
  workerBaseUrl: string;
  ariadnePasskey: string;
  reviewFolder: string;
  requestTimeoutMs: number;
}

interface Identity {
  credential_id?: string;
  principal_id?: string;
  role?: string;
  capabilities?: string[];
  memory_domains?: string[];
}

interface SearchResult {
  file?: string;
  path?: string;
  section?: string;
  score?: number;
  preview?: string;
  sha256?: string;
  index?: string;
}

interface ApiResponse {
  status: number;
  json: any;
  text: string;
}

const DEFAULT_SETTINGS: MnemosyneAriadneSettings = {
  workerBaseUrl: "https://mnemosyne-worker.izeesub.workers.dev",
  ariadnePasskey: "",
  reviewFolder: "System/Ariadne/Review",
  requestTimeoutMs: DEFAULT_TIMEOUT_MS
};

class WorkflowError extends Error {
  stage: WorkflowStage;

  constructor(stage: WorkflowStage, message: string) {
    super(message);
    this.name = "WorkflowError";
    this.stage = stage;
  }
}

export default class MnemosyneAriadnePlugin extends Plugin {
  settings: MnemosyneAriadneSettings;
  connectionIdentity: Identity | null = null;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "ariadne-test-connection",
      name: "Ariadne: Test Mnemosyne connection",
      callback: () => void this.runSafely("Connection", async () => {
        await this.testConnection();
      })
    });

    this.addCommand({
      id: "ariadne-review-current-note",
      name: "Ariadne: Review current note",
      checkCallback: (checking) => this.currentNoteCommand(
        checking,
        "Review",
        () => this.reviewCurrentNote()
      )
    });

    this.addCommand({
      id: "ariadne-index-current-note",
      name: "Ariadne: Index current note",
      checkCallback: (checking) => this.currentNoteCommand(
        checking,
        "Index",
        () => this.indexCurrentNote()
      )
    });

    this.addCommand({
      id: "ariadne-query-mnemosyne",
      name: "Ariadne: Query Mnemosyne",
      callback: () => new QueryModal(this.app, this).open()
    });

    this.addSettingTab(new MnemosyneAriadneSettingTab(this.app, this));
    console.info(`[Ariadne] loaded build ${BUILD_ID}`);
  }

  currentNoteCommand(
    checking: boolean,
    label: string,
    action: () => Promise<void>
  ): boolean {
    const file = this.app.workspace.getActiveFile();
    const available = file instanceof TFile && file.extension === "md";

    if (available && !checking) {
      void this.runSafely(label, action);
    }

    return available;
  }

  async runSafely(label: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const stage = error instanceof WorkflowError ? error.stage : "validation";
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Ariadne] ${label} failed at ${stage}`, error);
      new Notice(`Ariadne ${label} failed — ${stage}: ${message}`, 10_000);
    }
  }

  async testConnection(showNotice = true): Promise<Identity> {
    this.requirePasskey();
    const started = Date.now();
    const response = await this.apiRequest("/v1/memory/self", "GET");

    if (response.status < 200 || response.status >= 300) {
      throw new WorkflowError(
        "response received",
        this.httpError(response)
      );
    }

    const identity = response.json as Identity;

    if (!identity || !identity.principal_id || !Array.isArray(identity.memory_domains)) {
      throw new WorkflowError("validation", "Identity response is incomplete.");
    }

    this.connectionIdentity = identity;

    if (showNotice) {
      const who = identity.principal_id || identity.credential_id || "unknown";
      const domains = identity.memory_domains.join(", ") || "none";
      new Notice(
        `Connected as ${who} (${Date.now() - started} ms) · domains: ${domains} · build ${BUILD_ID}`,
        10_000
      );
    }

    return identity;
  }

  async reviewCurrentNote(): Promise<void> {
    const { file, content } = await this.readCurrentNote();
    new Notice("Ariadne Review — note read; sending request…");

    const response = await this.apiRequest(
      "/api/ariadne/core/review",
      "POST",
      {
        title: file.basename,
        content,
        currentLocation: file.path,
        metadata: { vaultPath: file.path },
        reviewFirst: true
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new WorkflowError("response received", this.httpError(response));
    }

    const data = response.json;

    if (
      !data ||
      data.mutated !== false ||
      data.reviewFirst !== true ||
      !this.isValidReview(data.review)
    ) {
      throw new WorkflowError(
        "validation",
        "Unsafe or invalid review response was blocked."
      );
    }

    const path = await this.writeReviewArtifact(file, data);
    new Notice(`Ariadne Review complete — artifact written: ${path}`, 10_000);
  }

  async indexCurrentNote(): Promise<void> {
    const { file, content } = await this.readCurrentNote();
    new Notice("Ariadne Index — note read; validating frontmatter and hash…");
    await this.validateIndexDocument(content);

    const response = await this.apiRequest("/ingest", "POST", {
      file_name: file.path,
      content
    });

    if (response.status < 200 || response.status >= 300) {
      throw new WorkflowError("response received", this.httpError(response));
    }

    const receipt = response.json;

    if (
      !receipt ||
      receipt.validation !== "passed" ||
      !Array.isArray(receipt.results) ||
      !Array.isArray(receipt.errors)
    ) {
      throw new WorkflowError("validation", "Ingestion receipt is incomplete.");
    }

    new IndexReceiptModal(this.app, file.path, receipt).open();
    new Notice(
      `Ariadne Index complete — ${receipt.results.length} section(s) indexed, ${receipt.errors.length} error(s).`,
      10_000
    );
  }

  async query(query: string, domain: string): Promise<SearchResult[]> {
    const trimmed = query.trim();

    if (!trimmed) {
      throw new WorkflowError("validation", "Enter a query.");
    }

    const identity = this.connectionIdentity || await this.testConnection(false);
    const allowed = identity.memory_domains || [];

    if (domain === "all") {
      if (allowed.length === 0) {
        throw new WorkflowError("validation", "This identity has no memory domains.");
      }
    } else if (!allowed.includes(domain)) {
      throw new WorkflowError(
        "validation",
        `Memory domain “${domain}” is not allowed for this identity.`
      );
    }

    const response = await this.apiRequest("/v1/memory/search", "POST", {
      query: trimmed,
      index: domain,
      top_k: 10
    });

    if (response.status < 200 || response.status >= 300) {
      throw new WorkflowError("response received", this.httpError(response));
    }

    if (!response.json || !Array.isArray(response.json.results)) {
      throw new WorkflowError("validation", "Search response contains no results array.");
    }

    return response.json.results as SearchResult[];
  }

  async readCurrentNote(): Promise<{ file: TFile; content: string }> {
    const file = this.app.workspace.getActiveFile();

    if (!(file instanceof TFile) || file.extension !== "md") {
      throw new WorkflowError("note read", "Open a Markdown note first.");
    }

    try {
      return { file, content: await this.app.vault.read(file) };
    } catch (error) {
      throw new WorkflowError("note read", this.errorMessage(error));
    }
  }

  async apiRequest(path: string, method: "GET" | "POST", body?: unknown): Promise<ApiResponse> {
    this.requirePasskey();
    const url = `${this.settings.workerBaseUrl.replace(/\/+$/g, "")}${path}`;
    new Notice(`Ariadne — request sent: ${path}`);

    const request = requestUrl({
      url,
      method,
      headers: {
        "X-Matrix-Key": this.settings.ariadnePasskey.trim(),
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      throw: false
    });

    try {
      const response = await this.withTimeout(
        request,
        this.settings.requestTimeoutMs,
        path
      );

      return {
        status: response.status,
        json: this.parseJson(response.text),
        text: response.text
      };
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }

      throw new WorkflowError("request sent", this.errorMessage(error));
    }
  }

  async withTimeout<T>(promise: Promise<T>, timeoutMs: number, path: string): Promise<T> {
    let timeoutId = 0;

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new WorkflowError(
          "response received",
          `${path} timed out after ${timeoutMs} ms.`
        )),
        timeoutMs
      );
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async validateIndexDocument(content: string): Promise<void> {
    const parsed = this.parseFrontmatter(content);

    for (const field of REQUIRED_FRONTMATTER) {
      if (!(field in parsed.frontmatter)) {
        throw new WorkflowError("validation", `Missing required frontmatter field: ${field}`);
      }
    }

    if (!["canon", "sealed"].includes(String(parsed.frontmatter.status))) {
      throw new WorkflowError(
        "validation",
        `Only canon and sealed notes may be indexed; status is ${parsed.frontmatter.status}.`
      );
    }

    const actualHash = await this.sha256(parsed.body);
    const expectedHash = String(parsed.frontmatter.sha256).toLowerCase();

    if (actualHash !== expectedHash) {
      throw new WorkflowError(
        "validation",
        `Hash mismatch. Stored ${expectedHash}; computed ${actualHash}. Source note was not changed.`
      );
    }
  }

  parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const lines = content.replace(/\r\n/g, "\n").split("\n");

    if (lines[0]?.trim() !== "---") {
      throw new WorkflowError("validation", "Missing opening frontmatter delimiter.");
    }

    const end = lines.slice(1).findIndex((line) => line.trim() === "---");

    if (end < 0) {
      throw new WorkflowError("validation", "Missing closing frontmatter delimiter.");
    }

    const frontmatter: Record<string, unknown> = {};

    for (const line of lines.slice(1, end + 1)) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) frontmatter[match[1]] = match[2].trim();
    }

    return { frontmatter, body: lines.slice(end + 2).join("\n") };
  }

  async sha256(value: string): Promise<string> {
    const normalized = value.replace(/\r\n/g, "\n").trim();
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(normalized)
    );

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async writeReviewArtifact(file: TFile, data: any): Promise<string> {
    const folder = normalizePath(
      this.settings.reviewFolder.replace(/^\/+|\/+$/g, "")
    );

    try {
      await this.ensureFolder(folder);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = file.basename.replace(/[^a-zA-Z0-9_-]/g, "-");
      const reviewPath = normalizePath(`${folder}/review-${stamp}-${safeName}.md`);
      await this.app.vault.create(reviewPath, this.formatReviewArtifact(file.path, data));
      return reviewPath;
    } catch (error) {
      throw new WorkflowError("artifact written", this.errorMessage(error));
    }
  }

  formatReviewArtifact(originalPath: string, data: any): string {
    const review = data.review;

    return `# Ariadne Review Proposal

## Original file path

${originalPath}

## Summary

${review.summary}

## Quality

${review.quality}

## Ambiguities

${this.mdList(review.ambiguities)}

## Missing information

${this.mdList(review.missingInformation)}

## Duplicate risk

${review.duplicateRisk}

## Suggested tags

${this.mdList(review.suggestedTags)}

## Suggested links

${this.mdList(review.suggestedLinks)}

## Suggested destination

${review.suggestedDestination}

## Confidence

${review.confidence}

## Warnings

${this.mdList(review.warnings)}

## Safety

- reviewFirst: true
- mutated: false
- approval required: true
- source note modified: false
- Ariadne build: ${BUILD_ID}
`;
  }

  isValidReview(review: any): boolean {
    return Boolean(
      review &&
      typeof review.summary === "string" &&
      typeof review.quality === "string" &&
      Array.isArray(review.ambiguities) &&
      Array.isArray(review.missingInformation) &&
      typeof review.duplicateRisk === "string" &&
      Array.isArray(review.suggestedTags) &&
      Array.isArray(review.suggestedLinks) &&
      typeof review.suggestedDestination === "string" &&
      typeof review.confidence === "number" &&
      Array.isArray(review.warnings)
    );
  }

  mdList(items: unknown): string {
    return Array.isArray(items) && items.length > 0
      ? items.map((item) => `- ${String(item)}`).join("\n")
      : "- None";
  }

  async ensureFolder(folder: string): Promise<void> {
    const parts = folder.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  requirePasskey(): void {
    if (!this.settings.ariadnePasskey.trim()) {
      throw new WorkflowError("request sent", "Configure the Ariadne passkey first.");
    }
  }

  httpError(response: ApiResponse): string {
    const serverMessage = response.json?.error || response.json?.message;
    const upstreamStatus = response.json?.details?.status;
    const upstreamError = response.json?.details?.details?.error;
    const upstreamMessage = upstreamError?.message;
    const upstreamCode = upstreamError?.code || upstreamError?.type;
    const detail = [
      upstreamStatus ? `upstream HTTP ${upstreamStatus}` : "",
      upstreamCode ? String(upstreamCode) : "",
      upstreamMessage ? this.redactDiagnostic(String(upstreamMessage)) : ""
    ].filter(Boolean).join(" · ");

    return `HTTP ${response.status}${serverMessage ? `: ${serverMessage}` : ""}` +
      `${detail ? ` (${detail})` : ""}`;
  }

  redactDiagnostic(value: string): string {
    return value
      .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted-key]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .slice(0, 500);
  }

  parseJson(text: string): any {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class QueryModal extends Modal {
  plugin: MnemosyneAriadnePlugin;
  queryText = "";
  domain = "all";

  constructor(app: App, plugin: MnemosyneAriadnePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.titleEl.setText("Ariadne: Query Mnemosyne");
    this.renderForm();
  }

  renderForm(): void {
    this.contentEl.empty();

    new Setting(this.contentEl)
      .setName("Natural-language query")
      .addText((text) => {
        text.setPlaceholder("What do we know about…?");
        text.setValue(this.queryText);
        text.onChange((value) => { this.queryText = value; });
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") void this.search();
        });
      });

    const domains = this.plugin.connectionIdentity?.memory_domains || [
      "knowledge", "agents", "skills", "files", "library"
    ];

    new Setting(this.contentEl)
      .setName("Memory domain")
      .setDesc("The authenticated identity is checked before search.")
      .addDropdown((dropdown) => {
        dropdown.addOption("all", "All allowed domains");
        for (const domain of domains) dropdown.addOption(domain, domain);
        dropdown.setValue(this.domain);
        dropdown.onChange((value) => { this.domain = value; });
      });

    new Setting(this.contentEl).addButton((button) => {
      button.setCta().setButtonText("Search").onClick(() => void this.search());
    });
  }

  async search(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: "Searching Mnemosyne…" });

    try {
      const results = await this.plugin.query(this.queryText, this.domain);
      this.renderResults(results);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stage = error instanceof WorkflowError ? error.stage : "validation";
      this.contentEl.empty();
      this.contentEl.createEl("p", {
        text: `Query failed — ${stage}: ${message}`,
        cls: "ariadne-error"
      });
      new Setting(this.contentEl).addButton((button) => {
        button.setButtonText("Back").onClick(() => this.renderForm());
      });
    }
  }

  renderResults(results: SearchResult[]): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: `${results.length} grounded result(s)` });

    for (const result of results) {
      const card = this.contentEl.createDiv({ cls: "ariadne-result" });
      card.createEl("h3", { text: result.section || "Untitled section" });
      card.createEl("p", {
        text: `${result.path || result.file || "Unknown source"} · score ${
          typeof result.score === "number" ? result.score.toFixed(4) : "n/a"
        } · ${result.index || "unknown domain"}`
      });
      card.createEl("p", { text: result.preview || "No preview." });
      card.createEl("code", { text: result.sha256 || "No document hash" });

      const path = result.path || result.file;
      if (path) {
        const button = card.createEl("button", { text: "Open local note" });
        button.addEventListener("click", () => void this.openLocalNote(path));
      }
    }

    new Setting(this.contentEl).addButton((button) => {
      button.setButtonText("New query").onClick(() => this.renderForm());
    });
  }

  async openLocalNote(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);

    if (!(file instanceof TFile)) {
      new Notice(`Local note not found: ${normalized}`);
      return;
    }

    await this.app.workspace.getLeaf(false).openFile(file);
    this.close();
  }
}

class IndexReceiptModal extends Modal {
  filePath: string;
  receipt: any;

  constructor(app: App, filePath: string, receipt: any) {
    super(app);
    this.filePath = filePath;
    this.receipt = receipt;
  }

  onOpen(): void {
    this.titleEl.setText("Ariadne indexing receipt");
    this.contentEl.createEl("p", {
      text: `${this.filePath} · hash ${this.receipt.sha256 || "unknown"}`
    });

    for (const result of this.receipt.results) {
      const row = this.contentEl.createDiv({ cls: "ariadne-result" });
      row.createEl("strong", { text: result.section || "Untitled section" });
      row.createEl("p", { text: `ID: ${result.id} · domain: ${result.index}` });
    }

    for (const error of this.receipt.errors) {
      const row = this.contentEl.createDiv({ cls: "ariadne-result ariadne-error" });
      row.createEl("strong", { text: error.section || "Section error" });
      row.createEl("p", { text: error.error || "Unknown error" });
    }
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
    containerEl.createEl("p", { text: `Loaded build: ${BUILD_ID}` });

    new Setting(containerEl)
      .setName("Worker base URL")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.workerBaseUrl)
        .setValue(this.plugin.settings.workerBaseUrl)
        .onChange(async (value) => {
          this.plugin.settings.workerBaseUrl = value.trim();
          this.plugin.connectionIdentity = null;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Ariadne passkey")
      .setDesc("Stored locally in Obsidian plugin data.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.ariadnePasskey).onChange(async (value) => {
          this.plugin.settings.ariadnePasskey = value.trim();
          this.plugin.connectionIdentity = null;
          await this.plugin.saveSettings();
        });
      });

    const connection = new Setting(containerEl)
      .setName("Connection")
      .setDesc("Not tested in this session.");

    connection.addButton((button) => button
      .setButtonText("Test connection")
      .onClick(async () => {
        button.setDisabled(true).setButtonText("Connecting…");
        try {
          const identity = await this.plugin.testConnection(false);
          connection.setDesc(
            `Authenticated as ${identity.principal_id || identity.credential_id}; ` +
            `domains: ${(identity.memory_domains || []).join(", ") || "none"}; build ${BUILD_ID}`
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const stage = error instanceof WorkflowError ? error.stage : "validation";
          connection.setDesc(`Connection failed — ${stage}: ${message}`);
        } finally {
          button.setDisabled(false).setButtonText("Test connection");
        }
      }));

    new Setting(containerEl)
      .setName("Request timeout")
      .setDesc("Milliseconds before a workflow reports a timeout.")
      .addText((text) => text
        .setValue(String(this.plugin.settings.requestTimeoutMs))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed >= 1000) {
            this.plugin.settings.requestTimeoutMs = parsed;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName("Review folder")
      .setDesc("Review proposals are written here; source notes are never changed.")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.reviewFolder)
        .setValue(this.plugin.settings.reviewFolder)
        .onChange(async (value) => {
          this.plugin.settings.reviewFolder = value.trim() || DEFAULT_SETTINGS.reviewFolder;
          await this.plugin.saveSettings();
        }));
  }
}
