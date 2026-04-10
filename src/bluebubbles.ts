/**
 * BlueBubbles REST API client + Message types for ironline-amanda.
 *
 * Replaces src/db.ts (SQLite reads) and provides BB equivalents for
 * lookupContact / markChatRead previously in src/applescript.ts.
 *
 * Auth:     ?password=KEY query param (BLUE_BUBBLES_KEY env var)
 * Base URL: BLUEBUBBLES_URL env var (default http://localhost:1234)
 *
 * Attachment filenames use the "bb://{guid}" scheme — agent.ts downloads
 * them on demand via downloadBBAttachment().
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const BB_URL = (process.env.BLUEBUBBLES_URL ?? "http://localhost:1234").replace(/\/$/, "");
const BB_KEY = process.env.BLUE_BUBBLES_KEY ?? "";

function buildUrl(path: string, params: Record<string, string | number> = {}): string {
  const url = new URL(`${BB_URL}${path}`);
  url.searchParams.set("password", BB_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function bbGet(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const res = await fetch(buildUrl(path, params));
  if (!res.ok) throw new Error(`BB GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function bbPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`BB POST ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Attachment {
  filename: string; // "bb://{guid}" for BlueBubbles attachments
  mimeType: string;
  size: number;
}

export interface Message {
  id: string;
  guid: string;
  text: string | null;
  sender: string;
  chatId: string;
  isFromMe: boolean;
  isRead: boolean;
  service: string;
  date: string; // ISO
  isReaction: boolean;
  reactionType: string | null;
  isReactionRemoval: boolean;
  associatedMessageGuid: string | null;
  attachments: Attachment[];
}

export interface GetMessagesOpts {
  chatId?: string;
  since?: Date;
  limit?: number;
  search?: string;
  unreadOnly?: boolean; // not supported by BB — ignored
}

// ── Message mapping ───────────────────────────────────────────────────────────

function mapBBMessage(msg: any, fallbackChatId: string): Message {
  const n = msg.associatedMessageType ?? 0;
  const isAdd = n >= 2000 && n <= 2005;
  const isRemove = n >= 3000 && n <= 3005;
  const isReaction = isAdd || isRemove;
  const base = isRemove ? n - 1000 : n;
  const reactionNames: Record<number, string> = {
    2000: "love", 2001: "like", 2002: "dislike",
    2003: "laugh", 2004: "emphasize", 2005: "question",
  };

  const chatId = (msg.chats as any[])?.[0]?.guid ?? fallbackChatId;

  return {
    id: msg.guid,
    guid: msg.guid,
    text: msg.text ?? null,
    sender: msg.isFromMe ? "me" : (msg.handle?.address ?? "unknown"),
    chatId,
    isFromMe: msg.isFromMe ?? false,
    isRead: msg.isRead ?? false,
    service: msg.service ?? "iMessage",
    date: new Date(msg.dateCreated).toISOString(),
    isReaction,
    reactionType: isReaction ? (reactionNames[base] ?? null) : null,
    isReactionRemoval: isRemove,
    associatedMessageGuid: msg.associatedMessageGuid ?? null,
    attachments: ((msg.attachments ?? []) as any[]).map((a) => ({
      filename: `bb://${a.guid}`,
      mimeType: a.mimeType ?? "application/octet-stream",
      size: a.totalBytes ?? 0,
    })),
  };
}

// ── getMessages ───────────────────────────────────────────────────────────────

export async function getMessages(opts: GetMessagesOpts = {}): Promise<Message[]> {
  const { chatId, since, limit = 50, search } = opts;

  let messages: Message[];

  if (chatId) {
    // Chat-specific history (DESC order, most recent first)
    const res: any = await bbGet(
      `/api/v1/chat/${encodeURIComponent(chatId)}/message`,
      { limit: Math.min(limit * 2, 500), sort: "DESC" }
    );
    messages = ((res?.data ?? []) as any[]).map((m) => mapBBMessage(m, chatId));
  } else {
    // All messages since a timestamp (ASC order, oldest first — good for polling)
    const params: Record<string, string | number> = { limit, sort: "ASC" };
    if (since) params.after = since.getTime();
    const res: any = await bbGet("/api/v1/message", params);
    messages = ((res?.data ?? []) as any[]).map((m) => mapBBMessage(m, ""));
  }

  if (since) {
    const sinceMs = since.getTime();
    messages = messages.filter((m) => new Date(m.date).getTime() >= sinceMs);
  }

  if (search) {
    const q = search.toLowerCase();
    messages = messages.filter((m) => m.text?.toLowerCase().includes(q));
  }

  return messages.slice(0, limit);
}

// ── lookupContact ─────────────────────────────────────────────────────────────

export async function lookupContact(address: string): Promise<string | null> {
  try {
    const res: any = await bbPost("/api/v1/contact", { addresses: [address] });
    const contact = (res?.data as any[])?.[0];
    if (!contact) return null;
    return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;
  } catch {
    return null;
  }
}

// ── markChatRead ──────────────────────────────────────────────────────────────

export async function markChatRead(chatGuid: string): Promise<void> {
  try {
    // Requires BlueBubbles Private API — silently ignored if unavailable
    await bbPost(`/api/v1/chat/${encodeURIComponent(chatGuid)}/read`, {});
  } catch {
    // no-op
  }
}

// ── downloadBBAttachment ──────────────────────────────────────────────────────

/**
 * Download a BB attachment by GUID to a temp file. Returns the temp file path.
 * The caller is responsible for cleanup (rmSync after use).
 *
 * Pass the full "bb://{guid}" filename or just the guid directly.
 */
export async function downloadBBAttachment(guidOrFilename: string, mimeType: string): Promise<string> {
  const guid = guidOrFilename.startsWith("bb://") ? guidOrFilename.slice(5) : guidOrFilename;
  const res = await fetch(buildUrl(`/api/v1/attachment/${encodeURIComponent(guid)}/download`));
  if (!res.ok) throw new Error(`BB attachment download ${guid} → ${res.status}`);

  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? ".jpg"
    : mimeType.includes("png") ? ".png"
    : mimeType.includes("gif") ? ".gif"
    : mimeType.includes("heic") ? ".heic"
    : mimeType.includes("heif") ? ".heif"
    : mimeType.includes("pdf") ? ".pdf"
    : "";

  const tmpPath = join(tmpdir(), `bb-att-${randomUUID()}${ext}`);
  await writeFile(tmpPath, Buffer.from(await res.arrayBuffer()));
  return tmpPath;
}
