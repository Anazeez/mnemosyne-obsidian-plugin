import { App, TFile } from "obsidian";
import {
  AttachmentManifestEntry,
  StableCapture,
  sha256Bytes,
  sha256Text
} from "./action-contracts";

export class CaptureError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CaptureError";
    this.code = code;
  }
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function extractAttachmentLinks(content: string): string[] {
  const links = new Set<string>();
  const wikiEmbed = /!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  const markdownImage = /!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g;
  let match: RegExpExecArray | null;

  while ((match = wikiEmbed.exec(content)) !== null) {
    links.add(match[1].trim());
  }

  while ((match = markdownImage.exec(content)) !== null) {
    const link = match[1].replace(/^<|>$/g, "").trim();
    if (!/^(?:https?:|data:)/i.test(link)) links.add(link);
  }

  return Array.from(links).sort();
}

function mediaTypeFor(link: string): string | null {
  const extension = link.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp"
  };

  return extension ? types[extension] || null : null;
}

async function captureAttachments(
  app: App,
  content: string,
  sourcePath: string
): Promise<AttachmentManifestEntry[]> {
  const entries: AttachmentManifestEntry[] = [];

  for (const link of extractAttachmentLinks(content)) {
    const file = app.metadataCache.getFirstLinkpathDest(link, sourcePath);

    if (!(file instanceof TFile)) {
      entries.push({
        link,
        path: null,
        exists: false,
        mediaType: mediaTypeFor(link),
        size: null,
        sha256: null,
        warning: `Local attachment not found: ${link}`
      });
      continue;
    }

    try {
      const bytes = await app.vault.readBinary(file);
      entries.push({
        link,
        path: file.path,
        exists: true,
        mediaType: mediaTypeFor(file.path),
        size: file.stat.size,
        sha256: await sha256Bytes(bytes),
        warning: null
      });
    } catch (error) {
      entries.push({
        link,
        path: file.path,
        exists: true,
        mediaType: mediaTypeFor(file.path),
        size: file.stat.size,
        sha256: null,
        warning: `Local attachment could not be read: ${link}`
      });
    }
  }

  return entries.sort((left, right) =>
    left.link.localeCompare(right.link) || String(left.path).localeCompare(String(right.path))
  );
}

export async function captureStableNote(
  app: App,
  file: TFile,
  delayMs = 1_000
): Promise<StableCapture> {
  let first: string;
  let second: string;

  try {
    first = await app.vault.read(file);
    await wait(delayMs);
    second = await app.vault.read(file);
  } catch (error) {
    throw new CaptureError(
      "note_read_failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  const firstHash = await sha256Text(first);
  const secondHash = await sha256Text(second);

  if (firstHash !== secondHash) {
    throw new CaptureError(
      "note_not_stable",
      "The note changed while Ariadne was reading it. Wait for editing and Sync to finish, then review again."
    );
  }

  return {
    sourcePath: file.path,
    content: second,
    sourceHash: secondHash,
    attachments: await captureAttachments(app, second, file.path)
  };
}
