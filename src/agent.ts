/**
 * Amanda agent — powered by OpenAI Agents SDK.
 * Receives a structured message payload and decides what to do.
 * Has access to all iMessage MCP tools via the local HTTP server.
 */

import { Agent, run, MCPServerStreamableHttp, setDefaultOpenAIKey } from "@openai/agents";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { getMessages } from "./db.js";

const MCP_URL = process.env.MCP_URL ?? "http://localhost:3000/imessage/mcp";
const CONTEXT_MCP_URL = process.env.CONTEXT_MCP_URL ?? "http://localhost:3001/context/mcp";
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY_AMANDA_IRONLINE_AGENT ?? process.env.OPENAI_API_KEY;

if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN env var is required");
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_AMANDA_IRONLINE_AGENT env var is required");

setDefaultOpenAIKey(OPENAI_API_KEY);

// Load Ironline context facts — edit context.md to update what Amanda knows
const CONTEXT_PATH = join(import.meta.dir, "..", "context.md");
const IRONLINE_CONTEXT = existsSync(CONTEXT_PATH) ? readFileSync(CONTEXT_PATH, "utf-8").trim() : "";

export type MessageType = "text" | "image" | "video" | "audio" | "file" | "reaction";

export interface MessagePayload {
  trigger: "imessage";
  sender: string;           // phone number e.g. +13128344710
  sender_name: string | null;
  message_type: MessageType;
  text: string | null;
  chat_id: string;
  service: string;          // "iMessage" | "SMS"
  timestamp: string;        // ISO 8601
}


export async function callAgent(payload: MessagePayload): Promise<void> {
  // history is DESC ordered — history[0] is the triggering message.
  // For image messages, attachments may not be linked in chat.db immediately —
  // retry once after a short delay.
  let history = getMessages({ chatId: payload.chat_id, limit: 50 });
  if (payload.message_type === "image" && history[0]?.attachments.length === 0) {
    await new Promise((r) => setTimeout(r, 2_000));
    history = getMessages({ chatId: payload.chat_id, limit: 50 });
  }

  const text = formatInput(payload, history);
  const agentInput = buildAgentInput(text, history[0]);
  console.log(`[agent] calling with payload for ${payload.sender_name ?? payload.sender}`);

  const mcpServer = new MCPServerStreamableHttp({
    name: "imessage",
    url: MCP_URL,
    requestInit: { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } },
  });

  const contextMcpServer = new MCPServerStreamableHttp({
    name: "context",
    url: CONTEXT_MCP_URL,
    requestInit: { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } },
  });

  try {
    await mcpServer.connect();
    await contextMcpServer.connect();

    const agent = new Agent({
      name: "Amanda",
      model: "gpt-5.4-nano",
      instructions: buildInstructions(),
      mcpServers: [mcpServer, contextMcpServer],
    });

    const result = await run(agent, agentInput);
    const toolCalls = result.newItems
      .filter((i: any) => i.type === "tool_call_item")
      .map((i: any) => i.rawItem?.name ?? "unknown");
    if (toolCalls.length > 0) {
      console.log(`[agent] tool calls: ${toolCalls.join(", ")}`);
    }
    console.log(`[agent] completed — ${result.finalOutput ?? "(no text output)"}`);

    const sentMessage = toolCalls.some((t) =>
      ["send_message", "send_image", "send_file"].includes(t)
    );
    if (!sentMessage) {
      console.warn(`[agent] warning — completed without calling send_message`);
    }
  } catch (e: any) {
    console.error(`[agent] error: ${e?.message ?? String(e)}`);
  } finally {
    await mcpServer.close().catch(() => {});
    await contextMcpServer.close().catch(() => {});
  }
}

// Build the agent input — plain string for text-only, structured UserMessageItem
// array when the triggering message contains image attachments.
function buildAgentInput(
  text: string,
  triggerMsg: ReturnType<typeof getMessages>[number] | undefined
): string | any[] {
  if (!triggerMsg) return text;

  const imageAttachments = triggerMsg.attachments.filter((a) =>
    a.mimeType.startsWith("image/")
  );
  if (imageAttachments.length === 0) return text;

  const content: any[] = [{ type: "input_text", text }];

  for (const att of imageAttachments) {
    const filePath = att.filename.replace(/^~/, homedir());
    if (!existsSync(filePath)) {
      console.log(`[agent] attachment not found: ${filePath}`);
      continue;
    }
    let readPath = filePath;
    let mimeType = att.mimeType;
    let tmpDir: string | null = null;

    try {
      // OpenAI doesn't accept HEIC — convert to JPEG via macOS sips
      if (att.mimeType === "image/heic" || att.mimeType === "image/heif") {
        tmpDir = mkdtempSync(join(tmpdir(), "amanda-img-"));
        const outPath = join(tmpDir, "converted.jpg");
        execSync(`sips -s format jpeg ${JSON.stringify(filePath)} --out ${JSON.stringify(outPath)}`, { timeout: 15_000 });
        readPath = outPath;
        mimeType = "image/jpeg";
      }

      const data = readFileSync(readPath).toString("base64");
      content.push({
        type: "input_image",
        image: `data:${mimeType};base64,${data}`,
        detail: "auto",
      });
      console.log(`[agent] attached image: ${att.filename} (${mimeType})`);
    } catch (e: any) {
      console.log(`[agent] failed to read attachment: ${e?.message}`);
    } finally {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  return [{ role: "user", content }];
}

function formatInput(
  payload: MessagePayload,
  history: ReturnType<typeof getMessages>
): string {
  const name = payload.sender_name ? `${payload.sender_name} (${payload.sender})` : payload.sender;

  const lines = [
    `CURRENT SENDER (the only person you are speaking with right now): ${name}`,
    `Sender identifier (use this as their memory key): ${payload.sender}`,
    `Trigger: ${payload.trigger}`,
    `Service: ${payload.service}`,
    `Type: ${payload.message_type}`,
    `Chat ID: ${payload.chat_id}`,
  ];

  if (history.length > 0) {
    lines.push("", "--- Conversation history (oldest → newest) ---");
    for (const msg of history) {
      const speaker = msg.isFromMe ? "Amanda" : (payload.sender_name ?? payload.sender);
      const time = new Date(msg.date).toISOString();
      const body = msg.text ?? `[${msg.attachments[0]?.mimeType ?? "attachment"}]`;
      lines.push(`[${time}] ${speaker}: ${body}`);
    }
    lines.push("--- End of history ---", "");
  }

  lines.push(`NEW MESSAGE at ${payload.timestamp}:`);
  if (payload.text) lines.push(payload.text);

  return lines.join("\n");
}

function buildInstructions(): string {
  const core = `
You are Amanda, an AI operations agent for Ironline. You are not a chatbot — you are an intelligent operator that sits between incoming communication and execution.

When you receive a message you follow this pipeline:
1. CLASSIFY — who is the sender, what role do they have, what are they asking? Is the request clear, ambiguous, or risky?
2. GATHER CONTEXT — use available tools to pull any relevant context (message history, contact info, etc.)
3. DECIDE — execute directly if the request is clear and low-risk. Ask for clarification if ambiguous. Escalate if out of scope or risky.
4. ACT — call the appropriate tool to respond (send_message, send_image, send_file) or log and route to a human.

CRITICAL: You are not a chat interface. Outputting text does nothing — the sender will never see it. Your ONLY way to communicate with a sender is by calling send_message (or send_image/send_file). Every conversation must end with a tool call to send a reply, or a deliberate decision not to respond (with a reason logged as your final text output).

Guidelines:
- Reply like a human would over text. Most replies should be one sentence. "Sure, what's the question?" is a complete, correct response to "Hey, quick question." Do not anticipate, list options, or explain your capabilities unless directly asked.
- Never use bullet points, numbered lists, headers, or em dashes (—) in replies.
- Match the sender's emotional tone. If they express excitement, happiness, or enthusiasm, reflect that back with an emoji or matching energy — don't respond flatly to emotional messages. "I'm so excited!" deserves "That's awesome! 🎉" not a dry follow-up question.
- Do not add context, caveats, or follow-up offers to a reply unless the sender's message actually calls for it.
- When in doubt, ask a clarifying question rather than guessing.
- Never take irreversible actions (sending files, making commitments) without sufficient context.
- If a request is outside your current capabilities, say so clearly and suggest next steps.
- NEVER invent or guess facts about Ironline, its products, team, or URLs. Only state what is in your context below.

Privacy and data isolation (strict):
- You are handling private conversations. Treat everything as confidential.
- You may only share a sender's own conversation history back with them — never another person's messages.
- Never reveal the contents of other chats, who else has contacted Ironline, or anything another person has told you.
- Never read or share another contact's memory entry with the current sender. Only read the current sender's own memory key.
- If asked about other people's conversations or data, decline clearly: "I can't share information from other conversations."
- When using get_messages or search_messages, only do so in the context of the current sender's own chat — do not retrieve messages from other chats to share with this sender.
- When using list_chats, do not relay the names or details of other conversations to the sender.

Memory:
- At the start of every conversation, call memory_get with the sender's phone number or email to load any notes about them.
- After any interaction where you learn something worth remembering (who someone is, their role, preferences, open tasks, decisions made), call memory_store to save it.
- Use the sender's phone number or email as the key for contact notes (e.g. +13128344710).
- Use topic slugs for non-contact memory (e.g. "open-tasks", "pricing", "team").
- Memory is markdown — write it clearly so future-you can read it quickly.
- Never read another sender's memory key on behalf of the current sender.

Vector memory (memory_store / memory_search / memory_get / memory_delete):
- Use memory_store to save anything richer than a flat note — contact summaries, conversation highlights, preferences with context.
- Use memory_search when you need to find relevant memories by meaning (e.g. "what do I know about their business?") rather than by exact key.
- Use memory_get for exact key lookup when you already know the key.
- Prefer vector memory over flat-file memory (read_memory/write_memory) for new writes — flat-file memory is legacy.
  `.trim();

  if (!IRONLINE_CONTEXT) return core;

  return `${core}\n\n## Ironline Context\n\n${IRONLINE_CONTEXT}`;
}
