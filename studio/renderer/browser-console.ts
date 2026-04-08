import type { McpInvocationResult, McpTargetDefinition } from "../../src/studio/types";
import type { StudioProcessRecord } from "./client";
import type { McpSessionHistoryEntry } from "./mcp-session-history";

export const BROWSER_TARGET_ID = "browser-local";
export const BROWSER_PROCESS_ID = "browser";
export const BROWSER_MCP_ENDPOINT_FALLBACK = "http://localhost:3003/browser/mcp";

const MAX_SNAPSHOT_TEXT_LENGTH = 20_000;

const BROWSER_TOOL_NAMES = [
  "browser_navigate",
  "browser_screenshot",
  "browser_snapshot",
  "browser_click",
  "browser_type",
] as const;

export type BrowserToolName = (typeof BROWSER_TOOL_NAMES)[number];

export interface BrowserScreenshotPreview {
  mimeType: string;
  data: string;
  src: string;
}

export interface BrowserSnapshotPreview {
  title: string;
  text: string;
  truncated: boolean;
}

export interface BrowserActionLogEntry {
  id: string;
  createdAt: string;
  toolName: BrowserToolName;
  status: "ok" | "error";
  summary: string;
  args: Record<string, unknown>;
  result: McpInvocationResult | null;
  errorMessage: string | null;
}

interface ContentBlock {
  type?: unknown;
  text?: unknown;
  data?: unknown;
  mimeType?: unknown;
}

function normalizeToolArgs(args: Record<string, unknown> | undefined) {
  return args ? { ...args } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isBrowserToolName(value: string): value is BrowserToolName {
  return (BROWSER_TOOL_NAMES as readonly string[]).includes(value);
}

export function getBrowserTarget(targets: McpTargetDefinition[] | null | undefined) {
  return targets?.find((target) => target.id === BROWSER_TARGET_ID) ?? null;
}

export function getBrowserProcess(processes: StudioProcessRecord[] | null | undefined) {
  return processes?.find((process) => process.id === BROWSER_PROCESS_ID) ?? null;
}

export function getBrowserEndpoint(target: McpTargetDefinition | null | undefined) {
  return target?.baseUrl ?? BROWSER_MCP_ENDPOINT_FALLBACK;
}

export function inferBrowserToolName(summary: string) {
  const matchedToolName = summary.match(/browser_[a-z_]+/i)?.[0] ?? "";
  return isBrowserToolName(matchedToolName) ? matchedToolName : null;
}

function getRawResponse(source: McpInvocationResult | unknown) {
  if (isRecord(source) && "rawResponse" in source) {
    return (source as McpInvocationResult).rawResponse;
  }

  return source;
}

export function extractBrowserToolPayload(source: McpInvocationResult | unknown): unknown {
  const rawResponse = getRawResponse(source);

  if (!isRecord(rawResponse)) {
    return rawResponse;
  }

  const maybeContent = rawResponse.content;
  if (!Array.isArray(maybeContent)) {
    return rawResponse;
  }

  const content = maybeContent as ContentBlock[];
  const imageBlock = content.find(
    (block) =>
      block.type === "image" &&
      typeof block.data === "string" &&
      typeof block.mimeType === "string"
  );

  if (imageBlock) {
    return {
      mimeType: imageBlock.mimeType,
      data: imageBlock.data,
    };
  }

  const textBlock = content.find(
    (block) => block.type === "text" && typeof block.text === "string"
  );

  if (textBlock && typeof textBlock.text === "string") {
    try {
      return JSON.parse(textBlock.text) as unknown;
    } catch {
      return {
        text: textBlock.text,
      };
    }
  }

  return rawResponse;
}

export function parseBrowserScreenshotPreview(source: McpInvocationResult | unknown): BrowserScreenshotPreview | null {
  const payload = extractBrowserToolPayload(source);
  if (!isRecord(payload)) return null;

  const mimeType = typeof payload.mimeType === "string" ? payload.mimeType : "image/png";
  const data = typeof payload.data === "string" ? payload.data.replace(/^data:[^;]+;base64,/i, "") : "";
  if (!data) return null;

  return {
    mimeType,
    data,
    src: `data:${mimeType};base64,${data}`,
  };
}

export function parseBrowserSnapshotPreview(source: McpInvocationResult | unknown): BrowserSnapshotPreview | null {
  const payload = extractBrowserToolPayload(source);
  if (!isRecord(payload)) return null;

  const title = typeof payload.title === "string" ? payload.title : "";
  const text = typeof payload.text === "string" ? payload.text : "";

  if (!title && !text) return null;

  return {
    title,
    text,
    truncated: text.length >= MAX_SNAPSHOT_TEXT_LENGTH,
  };
}

function getUrlLabel(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function summarizeBrowserSuccess(
  toolName: BrowserToolName,
  args: Record<string, unknown> | undefined,
  result: McpInvocationResult
) {
  const payload = extractBrowserToolPayload(result);

  switch (toolName) {
    case "browser_navigate": {
      const resolvedUrl =
        isRecord(payload) && typeof payload.url === "string"
          ? payload.url
          : typeof args?.url === "string"
          ? args.url
          : "";
      const title = isRecord(payload) && typeof payload.title === "string" ? payload.title : "";
      return title ? `Opened ${getUrlLabel(resolvedUrl)} · ${title}` : `Opened ${getUrlLabel(resolvedUrl)}`;
    }
    case "browser_snapshot": {
      const snapshot = parseBrowserSnapshotPreview(result);
      return snapshot?.title ? `Captured snapshot · ${snapshot.title}` : "Captured page snapshot";
    }
    case "browser_click":
      return `Clicked ${typeof args?.selector === "string" ? args.selector : "selector"}`;
    case "browser_type": {
      const selector = typeof args?.selector === "string" ? args.selector : "selector";
      const textLength =
        isRecord(payload) && typeof payload.textLength === "number"
          ? payload.textLength
          : typeof args?.text === "string"
          ? args.text.length
          : 0;
      return `Typed ${textLength} chars into ${selector}`;
    }
    case "browser_screenshot":
      return "Captured screenshot";
  }
}

export function summarizeBrowserFailure(toolName: BrowserToolName, args: Record<string, unknown> | undefined) {
  switch (toolName) {
    case "browser_navigate":
      return `Navigation failed${typeof args?.url === "string" ? ` for ${getUrlLabel(args.url)}` : ""}`;
    case "browser_snapshot":
      return "Snapshot failed";
    case "browser_click":
      return `Click failed${typeof args?.selector === "string" ? ` for ${args.selector}` : ""}`;
    case "browser_type":
      return `Typing failed${typeof args?.selector === "string" ? ` for ${args.selector}` : ""}`;
    case "browser_screenshot":
      return "Screenshot failed";
  }
}

export function createBrowserActionLogEntry({
  id = globalThis.crypto.randomUUID(),
  createdAt = new Date().toISOString(),
  toolName,
  args,
  result,
  errorMessage,
}: {
  id?: string;
  createdAt?: string;
  toolName: BrowserToolName;
  args?: Record<string, unknown>;
  result?: McpInvocationResult | null;
  errorMessage?: string | null;
}): BrowserActionLogEntry {
  const normalizedArgs = normalizeToolArgs(args);

  return {
    id,
    createdAt,
    toolName,
    status: result ? "ok" : "error",
    summary: result
      ? summarizeBrowserSuccess(toolName, normalizedArgs, result)
      : summarizeBrowserFailure(toolName, normalizedArgs),
    args: normalizedArgs,
    result: result ?? null,
    errorMessage: errorMessage ?? null,
  };
}

export function createBrowserHistorySeed(entries: McpSessionHistoryEntry[]) {
  return entries
    .filter((entry) => entry.targetId === BROWSER_TARGET_ID && entry.actionType === "tool")
    .map((entry) => {
      const toolName = inferBrowserToolName(entry.summary);
      if (!toolName) return null;

      return createBrowserActionLogEntry({
        id: entry.id,
        createdAt: entry.createdAt,
        toolName,
        result: entry,
      });
    })
    .filter((entry): entry is BrowserActionLogEntry => entry !== null);
}
