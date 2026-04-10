/**
 * Amanda iMessage poller
 *
 * Polls BlueBubbles API for new messages every 5s, deduplicates via seen
 * GUIDs, and fires the agent for each new inbound iMessage.
 *
 * Usage:
 *   BLUE_BUBBLES_KEY=<key> bun poller.ts
 */

import { loadProjectEnv } from "./src/env";
import { getMessages, lookupContact, markChatRead, type Message } from "./src/bluebubbles";
import { loadSeen, markSeen } from "./src/seen";
import type { MessagePayload, MessageType } from "./src/agent";
import { IronlineStudioControl } from "./src/studio/control";

loadProjectEnv();

const POLL_INTERVAL_MS = 5_000;
// How far back to look on each poll — 2x the interval so we never miss a
// message if a poll fires slightly late. Seen-GUID deduplication prevents
// double-processing.
const POLL_WINDOW_MS = POLL_INTERVAL_MS * 2;
const studioControl = new IronlineStudioControl();

// ── Message type resolution ───────────────────────────────────────────────────

function resolveMessageType(msg: Message): MessageType {
  if (msg.isReaction) return "reaction";
  if (msg.attachments.length === 0) return "text";
  const mime = msg.attachments[0].mimeType;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

// ── Process a batch of new messages ──────────────────────────────────────────

async function processMessages(
  seen: Set<string>,
  msgs: Message[]
): Promise<void> {
  const unseen = msgs.filter((m) => !seen.has(m.guid) && !m.isFromMe && m.service === "iMessage");
  if (unseen.length === 0) return;

  console.log(`[poller] ${unseen.length} new message(s)`);
  await markSeen(seen, unseen.map((m) => m.guid));

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
    try {
      await markChatRead(msg.chatId).catch(() => {}); // mark read before replying
      await studioControl.runAgent({
        trigger: "imessage",
        channel: "imessage",
        input: payload.text ?? `[${payload.message_type}]`,
        context: {
          sender: payload.sender,
          sender_name: payload.sender_name,
          chat_id: payload.chat_id,
          service: payload.service,
        },
        messagePayload: payload,
      });
    } catch (error: any) {
      console.error(
        `[poller] Amanda could not process ${senderName ?? msg.sender}: ${error?.message ?? String(error)}`
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[poller] starting up");

  const seen = loadSeen();

  // Seed seen with all messages from the last 24 hours so we don't reprocess
  // anything that arrived before startup.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await getMessages({ since: oneDayAgo, limit: 1000 });
  await markSeen(seen, existing.map((m) => m.guid));
  console.log(`[poller] seeded ${existing.length} message(s) from last 24h as seen`);

  console.log(`[poller] polling every ${POLL_INTERVAL_MS / 1000}s`);
  console.log("[poller] ready — waiting for messages");

  const poll = async () => {
    try {
      const since = new Date(Date.now() - POLL_WINDOW_MS);
      const msgs = await getMessages({ since, limit: 100 });
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
