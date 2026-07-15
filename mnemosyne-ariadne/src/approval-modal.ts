import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { ReviewArtifactV1 } from "./action-contracts";

export interface ApprovalHost {
  approveReview(reviewFile: TFile): Promise<{
    jobId: string;
    queuePath: string;
    duplicate: boolean;
  }>;
}

export class ApprovalModal extends Modal {
  private host: ApprovalHost;
  private reviewFile: TFile;
  private review: ReviewArtifactV1;

  constructor(app: App, host: ApprovalHost, reviewFile: TFile, review: ReviewArtifactV1) {
    super(app);
    this.host = host;
    this.reviewFile = reviewFile;
    this.review = review;
  }

  onOpen(): void {
    this.titleEl.setText("Approve Ariadne work order");
    this.contentEl.createEl("p", { text: `Review: ${this.reviewFile.path}` });
    this.contentEl.createEl("p", { text: `Source: ${this.review.sourcePath}` });
    this.contentEl.createEl("p", {
      text: `Source hash: ${this.review.sourceHash.slice(0, 16)}… · operation: ${this.review.operation} · domain: knowledge`
    });
    this.contentEl.createEl("p", {
      text: "The source note will not be modified. Codex may write only inside System/Ariadne/Memory."
    });
    const attachmentWarnings = this.review.attachments
      .map((item) => item.warning)
      .filter((warning): warning is string => Boolean(warning));
    if (attachmentWarnings.length > 0) {
      this.contentEl.createEl("p", {
        text: `Attachment warnings (${attachmentWarnings.length}): ${attachmentWarnings.join(" · ")}`,
        cls: "ariadne-error"
      });
    }

    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("Cancel")
        .onClick(() => this.close()))
      .addButton((button) => button
        .setCta()
        .setButtonText("Approve and queue")
        .onClick(async () => {
          button.setDisabled(true).setButtonText("Queuing…");
          try {
            await this.host.approveReview(this.reviewFile);
            this.close();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.contentEl.createEl("p", {
              text: `Approval failed: ${message}`,
              cls: "ariadne-error"
            });
            new Notice(`Ariadne Approval failed: ${message}`, 10_000);
          } finally {
            button.setDisabled(false).setButtonText("Approve and queue");
          }
        }));
  }
}
