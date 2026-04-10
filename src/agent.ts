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
import Langfuse from "langfuse";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { getMessages, downloadBBAttachment } from "./bluebubbles.js";
import { loadProjectEnv } from "./env";
import {
  getBrowserLocalMcpUrl,
  getIMessageLocalMcpUrl,
  getLanceDbContextLocalMcpUrl,
  getTemporalLocalMcpUrl,
} from "./mcp-endpoints";
import { compileActiveFlowRuntimeConfig } from "./studio/flow-blocks";
import { compilePublishedPromptGraph } from "./studio/prompt-graphs";
import { FlowGraphStore } from "./studio/flow-graphs";
import type {
  ArtifactRecord,
  FlowRuntimeConfig,
  RunPromptSource,
  RunRequest,
  RunResult,
  TimelineEvent,
  ToolEvent,
} from "./studio/types";

loadProjectEnv();

const MCP_URL = getIMessageLocalMcpUrl();
const CONTEXT_MCP_URL = getLanceDbContextLocalMcpUrl();
const TEMPORAL_MCP_URL = getTemporalLocalMcpUrl();
const BROWSER_MCP_URL = getBrowserLocalMcpUrl();

function loadFlowConfig(): FlowRuntimeConfig {
  const store = new FlowGraphStore();
  return compileActiveFlowRuntimeConfig(store.getDocument());
}

let langfuseClient: Langfuse | null = null;

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

function timelineEvent(
  source: TimelineEvent["source"],
  kind: string,
  summary: string,
  rawPayload?: unknown
): TimelineEvent {
  return {
    source,
    kind,
    timestamp: new Date().toISOString(),
    summary,
    rawPayload,
  };
}

function getAuthToken(): string {
  const token = process.env.AUTH_TOKEN;
  if (!token) throw new Error("AUTH_TOKEN env var is required");
  return token;
}

function getOpenAIKey(): string {
  const apiKey = process.env.OPENAI_API_KEY_AMANDA_IRONLINE_AGENT ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY_AMANDA_IRONLINE_AGENT env var is required");
  return apiKey;
}


function getLangfuse(): Langfuse {
  if (!langfuseClient) {
    langfuseClient = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    });
  }

  return langfuseClient;
}

export interface PromptExecutionOptions {
  compiledInstructions?: string;
  promptSource?: RunPromptSource;
}

function resolvePromptExecution(agentId: string, options: PromptExecutionOptions = {}) {
  if (options.compiledInstructions && options.promptSource) {
    return options;
  }

  const published = compilePublishedPromptGraph(agentId);
  return {
    compiledInstructions: options.compiledInstructions ?? published.compiledInstructions,
    promptSource:
      options.promptSource ??
      ({
        variantId: published.variant.id,
        variantName: published.variant.name,
        sourceMode: "published",
      } satisfies RunPromptSource),
  };
}

export async function callAgent(
  payload: MessagePayload,
  request: Partial<RunRequest> = {},
  promptExecutionOptions: PromptExecutionOptions = {}
): Promise<RunResult> {
  const config = loadFlowConfig();
  const AUTH_TOKEN = getAuthToken();
  const OPENAI_API_KEY = getOpenAIKey();
  setDefaultOpenAIKey(OPENAI_API_KEY);
  const langfuse = getLangfuse();
  const runId = request.id ?? randomUUID();
  const startedAt = new Date().toISOString();
  const timeline: TimelineEvent[] = [
    timelineEvent("runtime", "run.started", `Run started for ${payload.sender}`, {
      trigger: request.trigger ?? payload.trigger,
      channel: request.channel ?? "imessage",
    }),
  ];
  const toolEvents: ToolEvent[] = [];
  const artifacts: ArtifactRecord[] = [];

  const normalizedRequest: RunRequest = {
    id: runId,
    trigger: request.trigger ?? payload.trigger,
    channel: request.channel ?? "imessage",
    input: request.input ?? payload.text ?? `[${payload.message_type}]`,
    context: request.context ?? {
      sender: payload.sender,
      sender_name: payload.sender_name,
      chat_id: payload.chat_id,
      service: payload.service,
    },
    agentId: request.agentId ?? "amanda-core",
    approvalMode: request.approvalMode ?? "autonomous",
    messagePayload: (request.messagePayload ?? (payload as unknown as Record<string, unknown>)),
    replayOfRunId: request.replayOfRunId,
  };
  const promptExecution = resolvePromptExecution(normalizedRequest.agentId ?? "amanda-core", promptExecutionOptions);

  const trace = langfuse.trace({
    name:     "amanda-message",
    userId:   payload.sender,
    input:    { message: payload.text, message_type: payload.message_type },
    metadata: {
      chat_id: payload.chat_id,
      sender_name: payload.sender_name,
      run_id: runId,
      prompt_variant_id: promptExecution.promptSource?.variantId,
      prompt_source_mode: promptExecution.promptSource?.sourceMode,
    },
    tags:     ["imessage", "studio"],
  });

  // history is DESC ordered — history[0] is the triggering message.
  let history = await getMessages({ chatId: payload.chat_id, limit: config.historyLimit });
  if (payload.message_type === "image") {
    // Retry up to 5x (max ~10s) waiting for BB to have the attachment linked.
    for (let attempt = 0; attempt < 5; attempt++) {
      if ((history[0]?.attachments.length ?? 0) > 0) break;
      const delay = (attempt + 1) * 2_000;
      console.log(`[agent] waiting ${delay / 1000}s for attachment to link (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, delay));
      history = await getMessages({ chatId: payload.chat_id, limit: config.historyLimit });
    }
    if ((history[0]?.attachments.length ?? 0) === 0) {
      console.warn("[agent] attachment never linked after retries");
    }
  }

  console.log(`[agent] calling with payload for ${payload.sender_name ?? payload.sender}`);
  timeline.push(
    timelineEvent("runtime", "history.loaded", `Loaded ${history.length} messages of history`, {
      chatId: payload.chat_id,
      activeGraphId: config.graphId,
      activeGraphName: config.graphName,
    })
  );

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

  const temporalMcpServer = new MCPServerStreamableHttp({
    name: "temporal",
    url: TEMPORAL_MCP_URL,
    requestInit: { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } },
  });
  const browserMcpServer = new MCPServerStreamableHttp({
    name: "browser",
    url: BROWSER_MCP_URL,
    requestInit: { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } },
  });
  const activeMcpServers: MCPServerStreamableHttp[] = [];
  let imessageMcpConnected = false;
  let contextMcpConnected = false;
  let typingStarted = false;

  const connectConfiguredMcp = async ({
    enabled,
    required,
    server,
    label,
    skippedSummary,
    degradedSummary,
  }: {
    enabled: boolean;
    required: boolean;
    server: MCPServerStreamableHttp;
    label: string;
    skippedSummary: string;
    degradedSummary: string;
  }) => {
    if (!enabled) {
      timeline.push(timelineEvent("connector", "mcp.skipped", skippedSummary));
      return false;
    }

    try {
      await server.connect();
      activeMcpServers.push(server);
      timeline.push(timelineEvent("connector", "mcp.connected", `Connected ${label}`));
      return true;
    } catch (error) {
      if (required) {
        throw new Error(
          `${label} is enabled in Amanda's active flow graph but could not connect: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      timeline.push(
        timelineEvent(
          "connector",
          "mcp.degraded",
          degradedSummary,
          error instanceof Error ? error.message : String(error)
        )
      );
      return false;
    }
  };

  const callIMessageLifecycleTool = async (
    name: "mark_read" | "set_typing",
    args: Record<string, unknown>,
    startedSummary: string,
    completedSummary: string,
    failedSummary: string
  ) => {
    if (!imessageMcpConnected) {
      timeline.push(
        timelineEvent("tool", `${name}.skipped`, `${failedSummary} because the iMessage MCP is disabled or unavailable.`)
      );
      return false;
    }

    toolEvents.push({
      name,
      status: "started",
      timestamp: new Date().toISOString(),
      summary: startedSummary,
    });

    try {
      const result = await (mcpServer as any).callTool(name, args);
      if (result?.isError) {
        toolEvents.push({
          name,
          status: "error",
          timestamp: new Date().toISOString(),
          summary: failedSummary,
          rawPayload: result,
        });
        timeline.push(timelineEvent("tool", `${name}.error`, failedSummary, result));
        return false;
      }

      toolEvents.push({
        name,
        status: "completed",
        timestamp: new Date().toISOString(),
        summary: completedSummary,
        rawPayload: result,
      });
      timeline.push(timelineEvent("tool", `${name}.completed`, completedSummary, result));
      return true;
    } catch (error: any) {
      toolEvents.push({
        name,
        status: "error",
        timestamp: new Date().toISOString(),
        summary: failedSummary,
        rawPayload: error?.message ?? String(error),
      });
      timeline.push(
        timelineEvent("tool", `${name}.error`, failedSummary, error?.message ?? String(error))
      );
      return false;
    }
  };

  const stopTypingIndicator = async (reason: string) => {
    if (!typingStarted) {
      return;
    }

    const stopped = await callIMessageLifecycleTool(
      "set_typing",
      { chat_id: payload.chat_id, typing: false },
      "Stopping typing indicator",
      reason,
      "Typing indicator stop failed"
    );

    if (stopped) {
      typingStarted = false;
    }
  };

  try {
    imessageMcpConnected = await connectConfiguredMcp({
      enabled: config.mcps.imessage.enabled,
      required: config.mcps.imessage.required,
      server: mcpServer,
      label: "iMessage MCP server",
      skippedSummary: "iMessage MCP disabled in the active flow graph.",
      degradedSummary: "iMessage MCP was unavailable, so Amanda could not use iMessage tools.",
    });
    contextMcpConnected = await connectConfiguredMcp({
      enabled: config.mcps.context.enabled,
      required: config.mcps.context.required,
      server: contextMcpServer,
      label: "context MCP server",
      skippedSummary: "Context MCP disabled in the active flow graph.",
      degradedSummary: "Context MCP was unavailable, so Amanda could not use memory tools.",
    });
    await connectConfiguredMcp({
      enabled: config.mcps.temporal.enabled,
      required: config.mcps.temporal.required,
      server: temporalMcpServer,
      label: "Temporal MCP server",
      skippedSummary: "Temporal MCP disabled in the active flow graph.",
      degradedSummary: "Temporal MCP was unavailable, so reminder scheduling tools are currently offline.",
    });
    await connectConfiguredMcp({
      enabled: config.mcps.browser.enabled,
      required: config.mcps.browser.required,
      server: browserMcpServer,
      label: "Browser MCP server",
      skippedSummary: "Browser MCP disabled in the active flow graph.",
      degradedSummary: "Browser MCP was unavailable, so browser navigation tools are currently offline.",
    });
    // ── Triage ────────────────────────────────────────────────────────────────
    const classification = await classifyMessage(payload, history, trace, config.classifyModel);
    console.log(`[agent] tier: ${classification.tier}`);
    trace.update({ metadata: { chat_id: payload.chat_id, sender_name: payload.sender_name, tier: classification.tier } });
    timeline.push(
      timelineEvent("agent", "triage.completed", `Classified incoming message as ${classification.tier}`, classification)
    );

    if (classification.tier === "no_reply") {
      console.log("[agent] no reply needed — exiting");
      const finishedAt = new Date().toISOString();
      const result: RunResult = {
        id: runId,
        status: "completed",
        output: null,
        traceId: trace.id,
        toolEvents,
        artifacts,
        startedAt,
        finishedAt,
        timeline: [
          ...timeline,
          timelineEvent("runtime", "run.completed", "No reply required for this message"),
        ],
        request: normalizedRequest,
        tier: classification.tier,
      };
      return result;
    }

    if (config.actions.markRead.enabled) {
      await callIMessageLifecycleTool(
        "mark_read",
        { chat_id: payload.chat_id },
        "Marking chat read",
        "Marked chat read",
        "Mark chat read failed"
      );
    }

    const slowTier = config.holdingReplyTiers.includes(classification.tier);
    const shouldStartTyping =
      config.actions.setTyping.enabled &&
      (!config.actions.setTyping.slowOnly || slowTier);

    if (shouldStartTyping) {
      const started = await callIMessageLifecycleTool(
        "set_typing",
        { chat_id: payload.chat_id, typing: true },
        "Starting typing indicator",
        "Typing indicator started",
        "Typing indicator start failed"
      );
      typingStarted = started;
    }

    const holdingReplyText =
      config.holdingReply.enabled && slowTier
        ? classification.holding_reply?.trim() || config.holdingReply.fallbackMessage
        : null;

    // Send holding reply immediately for slow tiers before heavy processing
    if (holdingReplyText) {
      const holdSpan = trace.span({ name: "holding-reply", input: { text: holdingReplyText } });
      toolEvents.push({
        name: "send_message",
        status: "started",
        timestamp: new Date().toISOString(),
        summary: holdingReplyText,
      });
      try {
        if (!imessageMcpConnected) {
          throw new Error("iMessage MCP is disabled or unavailable.");
        }

        const holdResult = await (mcpServer as any).callTool("send_message", {
          recipient: payload.sender,
          text: holdingReplyText,
          chat_id: payload.chat_id,
        });
        if (holdResult?.isError) {
          console.error(`[agent] holding reply failed: ${holdResult.content?.[0]?.text ?? JSON.stringify(holdResult)}`);
          holdSpan.end({ output: { status: "error" } });
          toolEvents.push({
            name: "send_message",
            status: "error",
            timestamp: new Date().toISOString(),
            summary: "Holding reply failed",
            rawPayload: holdResult,
          });
          timeline.push(timelineEvent("tool", "holding-reply.error", "Holding reply failed", holdResult));
        } else {
          console.log(`[agent] holding reply sent: "${holdingReplyText}"`);
          holdSpan.end({ output: { status: "sent" } });
          toolEvents.push({
            name: "send_message",
            status: "completed",
            timestamp: new Date().toISOString(),
            summary: "Holding reply sent",
            rawPayload: holdResult,
          });
          timeline.push(timelineEvent("tool", "holding-reply.sent", "Holding reply sent", holdResult));
          await stopTypingIndicator("Stopped typing after holding reply");
        }
      } catch (e: any) {
        console.error(`[agent] holding reply callTool threw: ${e?.message ?? String(e)}`);
        holdSpan.end({ output: { status: "error", error: String(e) } });
        toolEvents.push({
          name: "send_message",
          status: "error",
          timestamp: new Date().toISOString(),
          summary: e?.message ?? String(e),
        });
        timeline.push(timelineEvent("tool", "holding-reply.error", "Holding reply threw an exception", String(e)));
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
        let filePath: string;
        let tempPath: string | null = null;

        if (att.filename.startsWith("bb://")) {
          try {
            filePath = await downloadBBAttachment(att.filename, att.mimeType);
            tempPath = filePath;
          } catch (e: any) {
            console.log(`[agent] failed to download BB attachment ${att.filename}: ${e?.message}`);
            continue;
          }
        } else {
          filePath = att.filename.replace(/^~/, homedir());
          if (!existsSync(filePath)) {
            console.log(`[agent] attachment not found: ${filePath}`);
            continue;
          }
        }

        try {
          const description = await describeImage(filePath, att.mimeType, trace, config.imageModel);
          imageDescriptions.push(description);
          console.log(`[agent] described image: ${att.filename}`);
          artifacts.push({
            kind: "image-description",
            label: att.filename,
            content: description,
            uri: filePath,
          });
          timeline.push(
            timelineEvent("agent", "image.described", `Described image attachment ${att.filename}`, {
              filePath,
            })
          );

          // Store in vector DB via context-mcp
          let storeResult: any;
          if (!contextMcpConnected) {
            timeline.push(
              timelineEvent(
                "tool",
                "memory_store.skipped",
                "Context MCP disabled or unavailable, so image memory was not stored."
              )
            );
            continue;
          }

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
          timeline.push(
            timelineEvent("tool", "memory_store.completed", "Stored image description in context memory", storeResult)
          );
        } catch (e: any) {
          console.error(`[agent] image processing failed: ${e?.message ?? String(e)}`);
          timeline.push(
            timelineEvent("tool", "image-processing.error", e?.message ?? "Image processing failed", String(e))
          );
        } finally {
          if (tempPath) rmSync(tempPath, { force: true });
        }
      }
    }

    // ── Run agent ─────────────────────────────────────────────────────────────
    const text = formatInput(payload, history, imageDescriptions);
    const { model, maxTurns } = config.tierModels[classification.tier] ?? { model: "gpt-5.4-nano", maxTurns: 8 };
    console.log(`[agent] model: ${model}, maxTurns: ${maxTurns}`);
    artifacts.push({
      kind: "prompt",
      label: "Compiled instructions",
      content: promptExecution.compiledInstructions,
    });
    artifacts.push({
      kind: "prompt",
      label: "Formatted agent input",
      content: text,
    });

    const agent = new Agent({
      name: "Amanda",
      model,
      instructions: promptExecution.compiledInstructions,
      mcpServers: activeMcpServers,
    });

    const agentSpan = trace.span({
      name:     "agent-run",
      input:    { model, maxTurns, tier: classification.tier },
      metadata: { tier: classification.tier },
    });
    const result = await run(agent, text, { maxTurns });
    const toolCalls = result.newItems
      .filter((i: any) => i.type === "tool_call_item")
      .map((i: any) => i.rawItem?.name ?? "unknown");

    for (const toolName of toolCalls) {
      const toolSpan = agentSpan.span({ name: `tool-call:${toolName}` });
      toolSpan.end();
      toolEvents.push({
        name: toolName,
        status: "completed",
        timestamp: new Date().toISOString(),
        summary: "Tool executed during agent run",
      });
      timeline.push(
        timelineEvent("tool", "tool.completed", `Tool ${toolName} executed`, {
          name: toolName,
        })
      );
    }
    agentSpan.end({ output: { finalOutput: result.finalOutput, toolCalls } });

    if (toolCalls.length > 0) {
      console.log(`[agent] tool calls: ${toolCalls.join(", ")}`);
    }
    console.log(`[agent] completed — ${result.finalOutput ?? "(no text output)"}`);

    const sentMessage = toolCalls.some((t) =>
      ["send_message", "send_image", "send_file"].includes(t)
    );
    const completedSilentReminder = toolCalls.includes("schedule_reminder");
    if (!sentMessage && !completedSilentReminder) {
      console.warn(`[agent] warning — completed without calling send_message`);
      timeline.push(
        timelineEvent("runtime", "reply.missing", "Run completed without an outbound send tool call")
      );
    }

    if (typingStarted && sentMessage) {
      await stopTypingIndicator("Stopped typing after outbound send");
    }

    const finishedAt = new Date().toISOString();
    return {
      id: runId,
      status: "completed",
      output: result.finalOutput ?? null,
      traceId: trace.id,
      toolEvents,
      artifacts: [
        ...artifacts,
        {
          kind: "result",
          label: "Agent final output",
          content: result.finalOutput ?? "",
        },
      ],
      startedAt,
      finishedAt,
      timeline: [
        ...timeline,
        timelineEvent("runtime", "run.completed", "Run completed successfully", {
          toolCalls,
        }),
      ],
      request: normalizedRequest,
      promptSource: promptExecution.promptSource,
      tier: classification.tier,
    };
  } catch (e: any) {
    console.error(`[agent] error: ${e?.message ?? String(e)}`);
    await stopTypingIndicator("Stopped typing after run failure");
    trace.update({ output: { error: String(e) } });
    const finishedAt = new Date().toISOString();
    return {
      id: runId,
      status: "failed",
      output: null,
      traceId: trace.id,
      toolEvents,
      artifacts,
      startedAt,
      finishedAt,
      timeline: [
        ...timeline,
        timelineEvent("runtime", "run.failed", e?.message ?? "Run failed", String(e)),
      ],
      request: normalizedRequest,
      promptSource: promptExecution.promptSource,
      error: e?.message ?? String(e),
    };
  } finally {
    await stopTypingIndicator("Stopped typing at run exit");
    await mcpServer.close().catch(() => {});
    await contextMcpServer.close().catch(() => {});
    await temporalMcpServer.close().catch(() => {});
    await browserMcpServer.close().catch(() => {});
    await langfuse.flushAsync();
    console.log(`[agent] langfuse flushed — trace: ${trace.id}`);
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
  history: Awaited<ReturnType<typeof getMessages>>,
  trace: ReturnType<Langfuse["trace"]>,
  classifyModel: string
): Promise<ClassificationResult> {
  const OPENAI_API_KEY = getOpenAIKey();
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

    const currentMsg = payload.text ?? `[${payload.message_type}]`;

    const userContent = [
      recentHistory ? `Recent context:\n${recentHistory}` : "",
      `Incoming message (type: ${payload.message_type}): ${currentMsg}`,
    ].filter(Boolean).join("\n\n");

    const triageMessages = [
      { role: "system", content: TRIAGE_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];

    const gen = trace.generation({
      name:  "triage",
      model: classifyModel,
      input: triageMessages,
      metadata: { message_type: payload.message_type },
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: classifyModel,
        messages: triageMessages,
        max_tokens: 100,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      gen.end({ output: { error: `HTTP ${response.status}` } });
      throw new Error(`Triage API error ${response.status}`);
    }

    const json = (await response.json()) as any;
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { tier?: string; holding_reply?: string };
    const usage = json.usage;

    gen.end({
      output: parsed,
      usage: {
        promptTokens:     usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens:      usage?.total_tokens,
      },
    });

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

// ── Image description ─────────────────────────────────────────────────────────

/**
 * Describe an image using the imageModel from flow config (default: gpt-4o).
 * Converts HEIC/HEIF to JPEG first since OpenAI doesn't accept them.
 */
async function describeImage(
  filePath: string,
  mimeType: string,
  trace: ReturnType<Langfuse["trace"]>,
  imageModel: string
): Promise<string> {
  const OPENAI_API_KEY = getOpenAIKey();
  let readPath = filePath;
  let actualMime = mimeType;
  let tmpDir: string | null = null;

  const gen = trace.generation({
    name:  "image-description",
    model: imageModel,
    input: { filePath, mimeType },
    metadata: { converted: mimeType === "image/heic" || mimeType === "image/heif" },
  });

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
        model: imageModel,
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
      gen.end({ output: { error: `HTTP ${response.status}` } });
      throw new Error(`OpenAI vision error ${response.status}: ${body}`);
    }

    const json = (await response.json()) as any;
    const description = json.choices?.[0]?.message?.content ?? "Image could not be described.";
    const usage = json.usage;

    gen.end({
      output: { description },
      usage: {
        promptTokens:     usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens:      usage?.total_tokens,
      },
    });

    return description;
  } finally {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Context formatting ────────────────────────────────────────────────────────

export function formatInput(
  payload: MessagePayload,
  history: Awaited<ReturnType<typeof getMessages>>,
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
    `Current time (ISO 8601): ${new Date().toISOString()}`,
    `Current time (Unix epoch ms): ${Date.now()}`,
    `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles"}`,
  ];

  if (history.length > 0) {
    lines.push("", "--- Conversation history (oldest → newest) ---");
    for (const msg of history) {
      const speaker = msg.isFromMe ? "Amanda" : (payload.sender_name ?? payload.sender);
      const time = new Date(msg.date).getTime();
      const att = msg.attachments[0];
      const body = msg.text
        ?? (att?.mimeType.startsWith("image/")
          ? `[Image sent — call memory_search with user_key and content_type="image" to get the description]`
          : `[${att?.mimeType ?? "attachment"}]`);
      lines.push(`[${time}ms] ${speaker}: ${body}`);
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

export function buildInstructions(): string {
  return compilePublishedPromptGraph("amanda-core").compiledInstructions;
}
