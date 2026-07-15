export type ActionOperation = "incorporate_note";

export interface AttachmentManifestEntry {
  link: string;
  path: string | null;
  exists: boolean;
  mediaType: string | null;
  size: number | null;
  sha256: string | null;
  warning: string | null;
}

export interface StableCapture {
  sourcePath: string;
  content: string;
  sourceHash: string;
  attachments: AttachmentManifestEntry[];
}

export function canonicalText(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(canonicalText(value)));
}

export async function sha256Bytes(value: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

export async function deriveReviewId(
  sourcePath: string,
  sourceHash: string
): Promise<string> {
  const digest = await sha256Text(JSON.stringify({
    schema: "ariadne.review/v1",
    sourcePath: canonicalPath(sourcePath),
    sourceHash: sourceHash.toLowerCase()
  }));

  return `review-${digest.slice(0, 24)}`;
}

export async function deriveJobId(
  operation: ActionOperation,
  sourcePath: string,
  sourceHash: string,
  reviewHash: string
): Promise<string> {
  const digest = await sha256Text(JSON.stringify({
    operation,
    sourcePath: canonicalPath(sourcePath),
    sourceHash: sourceHash.toLowerCase(),
    reviewHash: reviewHash.toLowerCase()
  }));

  return `ariadne-${digest.slice(0, 24)}`;
}
