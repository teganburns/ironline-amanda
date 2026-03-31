/**
 * Amanda iMessage poller
 *
 * Watches ~/Library/Messages/ for changes, queries new unread messages,
 * deduplicates via seen GUIDs, and fires the agent for each new message.
 *
 * Usage:
 *   AUTH_TOKEN=<token> bun poller.ts
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { getMessages } from "./src/db";
import { lookupContact, markChatRead } from "./src/applescript";
import { loadSeen, markSeen } from "./src/seen";
import { callAgent, type MessagePayload, type MessageType } from "./src/agent";

const POLL_INTERVAL_MS = 5_000;
// How far back to look on each poll — 2x the interval so we never miss a
// message if a poll fires slightly late. Seen-GUID deduplication prevents
// double-processing.
const POLL_WINDOW_MS = POLL_INTERVAL_MS * 2;

// ── Message type resolution ───────────────────────────────────────────────────

function resolveMessageType(msg: ReturnType<typeof getMessages>[number]): MessageType {
  if (msg.isReaction) return "reaction";
  if (msg.attachments.length === 0) {
    // U+FFFC (object replacement character) in text means an attachment was sent
    // but hasn't been linked in chat.db yet — treat as image so the agent retries.
    if (msg.text?.includes("\uFFFC")) return "image";
    return "text";
  }
  const mime = msg.attachments[0].mimeType;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

// ── Process a batch of new messages ──────────────────────────────────────────

async function processMessages(
  seen: Set<string>,
  msgs: ReturnType<typeof getMessages>
): Promise<void> {
  const unseen = msgs.filter((m) => !seen.has(m.guid) && !m.isFromMe && m.service === "iMessage");
  if (unseen.length === 0) return;

  console.log(`[poller] ${unseen.length} new message(s)`);
  markSeen(seen, unseen.map((m) => m.guid));

  for (const msg of unseen) {
    const senderName = await lookupContact(msg.sender).catch(() => null);

    const payload: MessagePayload = {
      trigger: "imessage",
      sender: msg.sender,
      sender_name: senderName,
      message_type: resolveMessageType(msg),
      text: msg.text,
      chat_id: msg.chatId,
      service: msg.service,
      timestamp: msg.date,
    };

    console.log(`[poller] → agent: ${senderName ?? msg.sender}: ${msg.text ?? `[${payload.message_type}]`}`);
    await markChatRead(msg.sender).catch(() => {}); // mark read before replying
    await callAgent(payload);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[poller] starting up");

  const seen = loadSeen();

  // Seed seen with all messages from the last 24 hours — covers both read and
  // unread so we don't reprocess anything that arrived before startup.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = getMessages({ since: oneDayAgo, limit: 1000 });
  markSeen(seen, existing.map((m) => m.guid));
  console.log(`[poller] seeded ${existing.length} message(s) from last 24h as seen`);

  console.log(`[poller] polling every ${POLL_INTERVAL_MS / 1000}s`);
  console.log("[poller] ready — waiting for messages");

  const poll = async () => {
    try {
      const since = new Date(Date.now() - POLL_WINDOW_MS);
      const msgs = getMessages({ since, limit: 100 });
      await processMessages(seen, msgs);
    } catch (e: any) {
      console.error(`[poller] error: ${e?.message ?? String(e)}`);
    }
  };

  const interval = setInterval(poll, POLL_INTERVAL_MS);

  process.on("SIGINT", () => {
    console.log("\n[poller] shutting down");
    clearInterval(interval);
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("[poller] fatal:", e);
  process.exit(1);
});
