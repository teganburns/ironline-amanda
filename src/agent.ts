/**
 * Amanda agent — powered by OpenAI Agents SDK.
 * Receives a structured message payload and decides what to do.
 *
 * Triage pipeline (runs before the agent):
 *   1. gpt-5.4-nano classifies the message into a tier
 *   2. no_reply → silent return
 *   3. reasoning/complex/correction/image → holding reply sent immediately
 *   4. image tier → gpt-5.4-pro describes image, stores in vector DB
 *   5. Agent runs with model + maxTurns appropriate to the tier
 *
 * Amanda (text agent) never receives raw image bytes — only descriptions.
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

const TRIAGE_MODEL = "gpt-5.4-nano";
const STANDARD_MODEL = process.env.STANDARD_MODEL ?? "gpt-5.4";
const REASONING_MODEL = process.env.REASONING_MODEL ?? "gpt-5.4-nano";
const IMAGE_MODEL = process.env.IMAGE_MODEL ?? "gpt-4o";

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

type MessageTier =
  | "no_reply"
  | "banter"
  | "question"
  | "reasoning"
  | "complex"
  | "correction"
  | "image";

interface ClassificationResult {
  tier: MessageTier;
  holding_reply?: string;
}


export async function callAgent(payload: MessagePayload): Promise<void> {
  // history is DESC ordered — history[0] is the triggering message.
  // For image messages, attachments may not be linked in chat.db immediately —
  // retry once after a short delay.
  let history = getMessages({ chatId: payload.chat_id, limit: 15 });
  if (payload.message_type === "image") {
    // Retry up to 5x (max ~10s) waiting for chat.db to link the attachment.
    for (let attempt = 0; attempt < 5; attempt++) {
      if ((history[0]?.attachments.length ?? 0) > 0) break;
      const delay = (attempt + 1) * 2_000;
      console.log(`[agent] waiting ${delay / 1000}s for attachment to link (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, delay));
      history = getMessages({ chatId: payload.chat_id, limit: 15 });
    }
    if ((history[0]?.attachments.length ?? 0) === 0) {
      console.warn("[agent] attachment never linked in chat.db after retries");
    }
  }

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

    // ── Triage ────────────────────────────────────────────────────────────────
    const classification = await classifyMessage(payload, history);
    console.log(`[agent] tier: ${classification.tier}`);

    if (classification.tier === "no_reply") {
      console.log("[agent] no reply needed — exiting");
      return;
    }

    // Send holding reply immediately for slow tiers before heavy processing
    if (classification.holding_reply) {
      try {
        const holdResult = await (mcpServer as any).callTool("send_message", {
          recipient: payload.sender,
          text: classification.holding_reply,
          chat_id: payload.chat_id,
        });
        if (holdResult?.isError) {
          console.error(`[agent] holding reply failed: ${holdResult.content?.[0]?.text ?? JSON.stringify(holdResult)}`);
        } else {
          console.log(`[agent] holding reply sent: "${classification.holding_reply}"`);
        }
      } catch (e: any) {
        console.error(`[agent] holding reply callTool threw: ${e?.message ?? String(e)}`);
      }
    }

    // ── Image pre-processing ──────────────────────────────────────────────────
    // Only run the full image pipeline when the classifier says it's an image
    // analysis request. Banter images (memes, laughing emoji) skip this.
    const imageDescriptions: string[] = [];

    if (classification.tier === "image" && payload.message_type === "image") {
      const triggerMsg = history[0];
      const imageAtts = triggerMsg?.attachments.filter((a) =>
        a.mimeType.startsWith("image/")
      ) ?? [];

      if (imageAtts.length === 0) {
        console.warn("[agent] image tier but no image attachments found — skipping pipeline");
      }

      for (const att of imageAtts) {
        const filePath = att.filename.replace(/^~/, homedir());
        if (!existsSync(filePath)) {
          console.log(`[agent] attachment not found: ${filePath}`);
          continue;
        }

        try {
          const description = await describeImage(filePath, att.mimeType);
          imageDescriptions.push(description);
          console.log(`[agent] described image: ${att.filename}`);

          // Store in vector DB via context-mcp
          let storeResult: any;
          try {
            storeResult = await (contextMcpServer as any).callTool("memory_store", {
              user_key: payload.sender,
              content: description,
              content_type: "image",
              source_chat_id: payload.chat_id,
              source_type: "1:1",
              image_path: filePath,
              tags: ["image"],
            });
          } catch (callErr: any) {
            throw new Error(`memory_store callTool threw: ${callErr?.message ?? String(callErr)}`);
          }

          if (storeResult?.isError) {
            const errText = storeResult.content?.[0]?.text ?? JSON.stringify(storeResult);
            throw new Error(`memory_store returned error: ${errText}`);
          }

          console.log(`[agent] stored image memory for ${payload.sender}`, storeResult);
        } catch (e: any) {
          console.error(`[agent] image processing failed: ${e?.message ?? String(e)}`);
        }
      }
    }

    // ── Run agent ─────────────────────────────────────────────────────────────
    const text = formatInput(payload, history, imageDescriptions);
    const { model, maxTurns } = getModelConfig(classification.tier);
    console.log(`[agent] model: ${model}, maxTurns: ${maxTurns}`);

    const agent = new Agent({
      name: "Amanda",
      model,
      instructions: buildInstructions(),
      mcpServers: [mcpServer, contextMcpServer],
    });

    const result = await run(agent, text, { maxTurns });
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
    if (!sentMessage && classification.tier !== "no_reply") {
      console.warn(`[agent] warning — completed without calling send_message`);
    }
  } catch (e: any) {
    console.error(`[agent] error: ${e?.message ?? String(e)}`);
  } finally {
    await mcpServer.close().catch(() => {});
    await contextMcpServer.close().catch(() => {});
  }
}

// ── Triage classifier ─────────────────────────────────────────────────────────

const TRIAGE_SYSTEM_PROMPT = `You are a message classifier for Amanda, an AI operations agent for a technology and construction company. Amanda communicates via iMessage.

Classify the incoming message into exactly one tier:
- no_reply: emoji only, tap reaction, "ok", "👍", sender says don't respond, message clearly doesn't involve Amanda
- banter: pure casual chat or greeting with zero information need ("hey", "thanks", "sounds good", "lol", "haha")
- question: a clear standalone question answerable from general knowledge with no need to look anything up
- reasoning: ANY message referencing past context ("before", "earlier", "that image", "you said", "last time", "what was", "what did", "remember"), needs memory or image lookup, or has ambiguous intent — when in doubt between banter and reasoning, ALWAYS choose reasoning
- complex: multi-step task, scheduling, time/date logic, calendar, chaining multiple operations
- correction: sender says Amanda got something wrong, is frustrated, or pushing back
- image: image was sent AND the sender wants Amanda to analyze, identify, count, or extract information from it

Rule: if the message references ANYTHING from the past or could require looking something up, it is reasoning or higher — never banter.

Respond with valid JSON only — no markdown, no explanation:
{"tier": "<tier>", "holding_reply": "<optional: brief natural holding reply for reasoning/complex/correction/image tiers only>"}

Holding reply guidelines: short, conversational, context-aware. Examples: "Got it, give me a sec", "On it, let me pull that up", "Got your image, give me a moment to look at this", "Let me look into that".`.trim();

async function classifyMessage(
  payload: MessagePayload,
  history: ReturnType<typeof getMessages>
): Promise<ClassificationResult> {
  // Images are always routed to the image pipeline — no need to ask nano.
  if (payload.message_type === "image") {
    return {
      tier: "image",
      holding_reply: "Got it, give me a moment to look at this.",
    };
  }

  try {
    // Build a compact context snippet — last 3 messages
    const recentHistory = history
      .slice(0, 3)
      .reverse()
      .map((msg) => {
        const speaker = msg.isFromMe ? "Amanda" : (payload.sender_name ?? payload.sender);
        const body = msg.text ?? `[${msg.attachments[0]?.mimeType ?? "attachment"}]`;
        return `${speaker}: ${body}`;
      })
      .join("\n");

    const currentMsg = payload.message_type === "image"
      ? `[Image sent]${payload.text ? ` with caption: ${payload.text}` : ""}`
      : (payload.text ?? "[no text]");

    const userContent = [
      recentHistory ? `Recent context:\n${recentHistory}` : "",
      `Incoming message (type: ${payload.message_type}): ${currentMsg}`,
    ].filter(Boolean).join("\n\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: TRIAGE_MODEL,
        messages: [
          { role: "system", content: TRIAGE_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 100,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`Triage API error ${response.status}`);
    }

    const json = (await response.json()) as any;
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { tier?: string; holding_reply?: string };

    const validTiers: MessageTier[] = [
      "no_reply", "banter", "question", "reasoning", "complex", "correction", "image",
    ];
    const tier = validTiers.includes(parsed.tier as MessageTier)
      ? (parsed.tier as MessageTier)
      : "banter";

    return {
      tier,
      holding_reply: parsed.holding_reply || undefined,
    };
  } catch (e: any) {
    console.error(`[agent] triage failed (${e?.message}) — defaulting to banter`);
    return { tier: "banter" };
  }
}

function getModelConfig(tier: MessageTier): { model: string; maxTurns: number } {
  switch (tier) {
    case "banter":     return { model: TRIAGE_MODEL,    maxTurns: 3 };
    case "question":   return { model: STANDARD_MODEL,  maxTurns: 5 };
    case "reasoning":  return { model: STANDARD_MODEL,  maxTurns: 7 };
    case "complex":
    case "correction":
    case "image":      return { model: REASONING_MODEL, maxTurns: 7 };
    default:           return { model: TRIAGE_MODEL,    maxTurns: 3  };
  }
}

// ── Image description ─────────────────────────────────────────────────────────

/**
 * Describe an image using IMAGE_MODEL (gpt-5.4-pro).
 * Converts HEIC/HEIF to JPEG first since OpenAI doesn't accept them.
 */
async function describeImage(filePath: string, mimeType: string): Promise<string> {
  let readPath = filePath;
  let actualMime = mimeType;
  let tmpDir: string | null = null;

  try {
    if (mimeType === "image/heic" || mimeType === "image/heif") {
      tmpDir = mkdtempSync(join(tmpdir(), "amanda-img-"));
      const outPath = join(tmpDir, "converted.jpg");
      execSync(
        `sips -s format jpeg ${JSON.stringify(filePath)} --out ${JSON.stringify(outPath)}`,
        { timeout: 15_000 }
      );
      readPath = outPath;
      actualMime = "image/jpeg";
    }

    const data = readFileSync(readPath).toString("base64");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe this image in detail. Include all visible text, numbers, objects, people, and settings. Be factual and precise — do not infer issues, damage, or problems unless they are unambiguously visible. This description will be stored as long-term context for a business operations assistant.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${actualMime};base64,${data}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI vision error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as any;
    return json.choices?.[0]?.message?.content ?? "Image could not be described.";
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Context formatting ────────────────────────────────────────────────────────

function formatInput(
  payload: MessagePayload,
  history: ReturnType<typeof getMessages>,
  imageDescriptions: string[] = []
): string {
  const name = payload.sender_name ? `${payload.sender_name} (${payload.sender})` : payload.sender;

  const lines = [
    `CURRENT SENDER (the only person you are speaking with right now): ${name}`,
    `Sender identifier (use this as their memory key): ${payload.sender}`,
    `Trigger: ${payload.trigger}`,
    `Service: ${payload.service}`,
    `Type: ${payload.message_type}`,
    `Chat ID: ${payload.chat_id}`,
    `Current time: ${payload.timestamp}`,
  ];

  if (history.length > 0) {
    lines.push("", "--- Conversation history (oldest → newest) ---");
    for (const msg of history) {
      const speaker = msg.isFromMe ? "Amanda" : (payload.sender_name ?? payload.sender);
      const time = new Date(msg.date).toISOString();
      const att = msg.attachments[0];
      const body = msg.text
        ?? (att?.mimeType.startsWith("image/")
          ? `[Image sent — call memory_search with user_key and content_type="image" to get the description]`
          : `[${att?.mimeType ?? "attachment"}]`);
      lines.push(`[${time}] ${speaker}: ${body}`);
    }
    lines.push("--- End of history ---", "");
  }

  lines.push(`NEW MESSAGE at ${payload.timestamp}:`);
  if (payload.text) lines.push(payload.text);

  if (imageDescriptions.length > 0) {
    lines.push("", "--- Attached image(s) — pre-analyzed and stored in memory ---");
    for (let i = 0; i < imageDescriptions.length; i++) {
      lines.push(`Image ${i + 1}: ${imageDescriptions[i]}`);
    }
    lines.push("--- End of image context ---");
  }

  return lines.join("\n");
}

// ── Agent instructions ────────────────────────────────────────────────────────

function buildInstructions(): string {
  const core = `
You are Amanda, an AI operations agent for Ironline. You are not a chatbot — you are an intelligent operator that sits between incoming communication and execution.

When you receive a message you follow this pipeline:
1. CLASSIFY — who is the sender, what role do they have, what are they asking? Is the request clear, ambiguous, or risky?
2. GATHER CONTEXT — use available tools to pull any relevant context (message history, contact info, etc.)
3. DECIDE — execute directly if the request is clear and low-risk. Ask for clarification if ambiguous. Escalate if out of scope or risky.
4. ACT — call the appropriate tool to respond (send_message, send_image, send_file) or log and route to a human.

CRITICAL: You are not a chat interface. Outputting text does nothing — the sender will never see it. Your ONLY way to communicate with a sender is by calling send_message (or send_image/send_file). Every conversation must end with a tool call to send a reply, or a deliberate decision not to respond (with a reason logged as your final text output).

Note: For some messages a brief holding reply has already been sent automatically before you ran. Your reply is the real, substantive response — make it count.

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
- At the start of every conversation, call memory_get_user with user_key=sender's phone and content_type="profile" to load their contact summary.
- Always pass user_key = the sender's phone number (e.g. +13128344710) or email when storing memories.
- Always pass source_chat_id = the Chat ID from the conversation context.
- Pass source_type="group" if the history shows multiple participants besides you and the sender; otherwise "1:1".
- To update a contact's profile summary, call memory_store with content_type="profile" — this overwrites the previous profile. Write it clearly so future-you can read it quickly.
- To add a new note or event (not a profile update), use content_type="text" — this appends without deleting anything.
- Images are pre-analyzed before you run and their descriptions are provided as text in the message context under "--- Attached image(s) ---". They are already stored in memory — you do not need to call memory_store for images.
- When you see "[Image sent — call memory_search...]" in the conversation history, it means a past image was stored. Call memory_search with the sender's user_key and content_type="image" to retrieve its description before answering any question about it.
- When a user asks about something visual (count, brand, model, what's in a photo), always check image memory first via memory_search. If the description doesn't contain a clear answer, say so — never guess a model number or brand from old conversation history.
- Use memory_search to find relevant past context by meaning, always scoped to the current sender's user_key.
- Never call memory tools with another sender's user_key.

Vector memory tools: memory_store / memory_search / memory_get_user / memory_delete
  `.trim();

  if (!IRONLINE_CONTEXT) return core;

  return `${core}\n\n## Ironline Context\n\n${IRONLINE_CONTEXT}`;
}
