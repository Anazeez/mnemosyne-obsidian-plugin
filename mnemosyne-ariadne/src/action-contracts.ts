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

export interface ReviewData {
  summary: string;
  quality: string;
  ambiguities: string[];
  missingInformation: string[];
  duplicateRisk: string;
  suggestedTags: string[];
  suggestedLinks: string[];
  suggestedDestination: string;
  confidence: number;
  warnings: string[];
}

export interface ReviewArtifactInput {
  reviewId: string;
  createdAt: string;
  sourcePath: string;
  sourceHash: string;
  attachments: AttachmentManifestEntry[];
  buildId: string;
  review: ReviewData;
}

export interface ReviewArtifactV1 {
  schema: "ariadne.review/v1";
  id: string;
  operation: "incorporate_note";
  status: "proposed";
  createdAt: string;
  sourcePath: string;
  sourceHash: string;
  allowedDomains: ["knowledge"];
  buildId: string;
  attachments: AttachmentManifestEntry[];
}

export interface WorkOrderInput {
  id: string;
  createdAt: string;
  approvedAt: string;
  sourcePath: string;
  sourceHash: string;
  reviewArtifact: string;
  reviewHash: string;
  capture: StableCapture;
  reviewMarkdown: string;
}

export interface WorkOrderV1 {
  schema: "ariadne.work-order/v1";
  id: string;
  operation: "incorporate_note";
  status: "queued";
  createdAt: string;
  approvedAt: string;
  sourcePath: string;
  sourceHash: string;
  reviewArtifact: string;
  reviewHash: string;
  allowedDomains: ["knowledge"];
  capture: StableCapture;
  reviewMarkdown: string;
}

export class ContractError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ContractError";
    this.code = code;
  }
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
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === ".." || normalized.startsWith("../") ||
      normalized.includes("/../") || normalized.includes("/./") || normalized.endsWith("/.")) {
    throw new ContractError("invalid_artifact", "Artifact path is unsafe.");
  }
  return normalized;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function mdList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function frontmatterValue(markdown: string, key: string): string | null {
  const normalized = canonicalText(markdown);
  const lines = normalized.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const frontmatter = lines.slice(1, end).join("\n");
  const expression = new RegExp(`^${key}:\\s*(.+)$`, "gm");
  const matches: RegExpExecArray[] = [];
  let current: RegExpExecArray | null;
  while ((current = expression.exec(frontmatter)) !== null) matches.push(current);
  if (matches.length > 1) throw new ContractError("invalid_artifact", `Duplicate ${key}.`);
  const match = matches[0];
  if (!match) return null;
  const value = match[1].trim();

  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      return JSON.parse(value);
    } catch {
      throw new ContractError("invalid_artifact", `Invalid ${key} value.`);
    }
  }

  return value;
}

function requireValue(markdown: string, key: string): string {
  const value = frontmatterValue(markdown, key);
  if (!value) throw new ContractError("invalid_artifact", `Missing ${key}.`);
  return value;
}

export function formatReviewArtifactV1(input: ReviewArtifactInput): string {
  const attachmentWarnings = input.attachments
    .map((item) => item.warning)
    .filter((item): item is string => Boolean(item));
  const review = input.review;

  return `---
schema: ariadne.review/v1
id: ${input.reviewId}
operation: incorporate_note
status: proposed
created_at: ${input.createdAt}
source_path: ${yamlString(canonicalPath(input.sourcePath))}
source_hash: ${input.sourceHash.toLowerCase()}
allowed_domains: knowledge
build_id: ${input.buildId}
---
# Ariadne Review Proposal

## Summary

${review.summary}

## Quality

${review.quality}

## Ambiguities

${mdList(review.ambiguities)}

## Missing information

${mdList(review.missingInformation)}

## Duplicate risk

${review.duplicateRisk}

## Suggested tags

${mdList(review.suggestedTags)}

## Suggested links

${mdList(review.suggestedLinks)}

## Suggested destination

${review.suggestedDestination}

## Confidence

${review.confidence}

## Warnings

${mdList(review.warnings)}

## Attachment warnings

${mdList(attachmentWarnings)}

## Attachment manifest

\`\`\`json
${JSON.stringify(input.attachments)}
\`\`\`

## Safety

- reviewFirst: true
- mutated: false
- approval required: true
- source note modified: false
`;
}

export function parseReviewArtifactV1(markdown: string): ReviewArtifactV1 {
  if (frontmatterValue(markdown, "schema") !== "ariadne.review/v1") {
    throw new ContractError(
      "legacy_review_not_approvable",
      "This review predates the approval contract. Run Review again."
    );
  }

  const operation = requireValue(markdown, "operation");
  const status = requireValue(markdown, "status");
  const domain = requireValue(markdown, "allowed_domains");
  if (operation !== "incorporate_note" || status !== "proposed" || domain !== "knowledge") {
    throw new ContractError("invalid_artifact", "Review action fields are invalid.");
  }

  const manifestMatch = canonicalText(markdown).match(/## Attachment manifest\s+\`\`\`json\n([^\n]+)\n\`\`\`/);
  if (!manifestMatch) throw new ContractError("invalid_artifact", "Missing attachment manifest.");
  let attachments: AttachmentManifestEntry[];
  try {
    attachments = JSON.parse(manifestMatch[1]);
  } catch {
    throw new ContractError("invalid_artifact", "Attachment manifest is invalid JSON.");
  }
  if (!Array.isArray(attachments)) {
    throw new ContractError("invalid_artifact", "Attachment manifest must be an array.");
  }

  return {
    schema: "ariadne.review/v1",
    id: requireValue(markdown, "id"),
    operation: "incorporate_note",
    status: "proposed",
    createdAt: requireValue(markdown, "created_at"),
    sourcePath: canonicalPath(requireValue(markdown, "source_path")),
    sourceHash: requireValue(markdown, "source_hash").toLowerCase(),
    allowedDomains: ["knowledge"],
    buildId: requireValue(markdown, "build_id"),
    attachments
  };
}

export function formatWorkOrderV1(input: WorkOrderInput): string {
  const payload = JSON.stringify({
    capture: input.capture,
    reviewMarkdown: input.reviewMarkdown
  });

  return `---
schema: ariadne.work-order/v1
id: ${input.id}
operation: incorporate_note
status: queued
created_at: ${input.createdAt}
approved_at: ${input.approvedAt}
source_path: ${yamlString(canonicalPath(input.sourcePath))}
source_hash: ${input.sourceHash.toLowerCase()}
review_artifact: ${yamlString(canonicalPath(input.reviewArtifact))}
review_hash: ${input.reviewHash.toLowerCase()}
allowed_domains: knowledge
---
# Ariadne Approved Work Order

## Payload

\`\`\`json
${payload}
\`\`\`
`;
}

export function parseWorkOrderV1(markdown: string): WorkOrderV1 {
  if (frontmatterValue(markdown, "schema") !== "ariadne.work-order/v1") {
    throw new ContractError("invalid_work_order", "Unsupported work-order schema.");
  }

  const operation = requireValue(markdown, "operation");
  const status = requireValue(markdown, "status");
  const domain = requireValue(markdown, "allowed_domains");
  if (operation !== "incorporate_note" || status !== "queued" || domain !== "knowledge") {
    throw new ContractError("invalid_work_order", "Work-order action fields are invalid.");
  }

  const normalized = canonicalText(markdown);
  const payloadMatch = normalized.match(/## Payload\s+\`\`\`json\n([^\n]+)\n\`\`\`/);
  if (!payloadMatch) throw new ContractError("invalid_work_order", "Missing work-order payload.");

  let payload: { capture?: StableCapture; reviewMarkdown?: string };
  try {
    payload = JSON.parse(payloadMatch[1]);
  } catch {
    throw new ContractError("invalid_work_order", "Work-order payload is invalid JSON.");
  }

  if (!payload.capture || typeof payload.reviewMarkdown !== "string") {
    throw new ContractError("invalid_work_order", "Work-order payload is incomplete.");
  }

  return {
    schema: "ariadne.work-order/v1",
    id: requireValue(markdown, "id"),
    operation: "incorporate_note",
    status: "queued",
    createdAt: requireValue(markdown, "created_at"),
    approvedAt: requireValue(markdown, "approved_at"),
    sourcePath: canonicalPath(requireValue(markdown, "source_path")),
    sourceHash: requireValue(markdown, "source_hash").toLowerCase(),
    reviewArtifact: canonicalPath(requireValue(markdown, "review_artifact")),
    reviewHash: requireValue(markdown, "review_hash").toLowerCase(),
    allowedDomains: ["knowledge"],
    capture: payload.capture,
    reviewMarkdown: payload.reviewMarkdown
  };
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
