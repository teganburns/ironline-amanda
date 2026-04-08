import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadProjectEnv } from "../env";
import {
  ReminderClarificationError,
  ReminderPastTimeError,
  scheduleReminderJob,
} from "./reminders";

loadProjectEnv();

const PORT = process.env.TEMPORAL_MCP_PORT ? Number.parseInt(process.env.TEMPORAL_MCP_PORT, 10) : 3002;
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error("AUTH_TOKEN env var is required");
  process.exit(1);
}

function requireBearer(req: any, res: any, next: any) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token !== AUTH_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string, code?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: code ? `${code}: ${message}` : message,
      },
    ],
    isError: true,
  };
}

function makeServer(): McpServer {
  const server = new McpServer({
    name: "ironline-temporal",
    version: "0.1.0",
  });

  server.tool(
    "schedule_reminder",
    "Schedule a one-time reminder to send a message later. Use this only for explicit reminder requests.",
    {
      message_text: z.string().describe("The exact reminder message that should be sent when the reminder fires."),
      requested_time: z
        .string()
        .optional()
        .describe("The natural-language time phrase from the user, like 'in 5 minutes' or 'tomorrow at 9am'."),
      execute_at: z
        .string()
        .optional()
        .describe("Optional ISO timestamp if the reminder time has already been resolved."),
      current_time: z.string().optional().describe("The current ISO timestamp used as the reference time."),
      timezone: z.string().optional().describe("The timezone the reminder should be interpreted in."),
      chat_id: z.string().describe("The chat identifier for the current conversation."),
      recipient: z
        .string()
        .optional()
        .describe("Optional explicit recipient override. Omit this to default to the current sender."),
      service: z.string().optional().describe("The messaging service for the target chat, usually iMessage."),
      sender: z.string().describe("The current sender identifier, usually their phone number."),
      sender_name: z.string().nullable().optional().describe("The current sender display name if known."),
      target_summary: z
        .string()
        .optional()
        .describe("Optional human-readable label for the reminder target."),
    },
    async ({
      message_text,
      requested_time,
      execute_at,
      current_time,
      timezone,
      chat_id,
      recipient,
      service = "iMessage",
      sender,
      sender_name,
      target_summary,
    }) => {
      try {
        const scheduled = await scheduleReminderJob({
          messageText: message_text,
          requestedTime: requested_time,
          executeAt: execute_at,
          currentTime: current_time,
          timezone,
          sourceChat: {
            chatId: chat_id,
            service,
          },
          sender: {
            identifier: sender,
            name: sender_name,
          },
          target: {
            recipient,
            chatId: chat_id,
            service,
            summary: target_summary,
          },
        });

        return ok({
          reminderId: scheduled.reminderId,
          executeAt: scheduled.executeAt,
          targetSummary: scheduled.targetSummary,
        });
      } catch (error) {
        if (error instanceof ReminderClarificationError || error instanceof ReminderPastTimeError) {
          return err(error.message, error.code);
        }

        return err(error instanceof Error ? error.message : String(error), "temporal_schedule_failed");
      }
    }
  );

  return server;
}

const app = createMcpExpressApp({
  host: "0.0.0.0",
  allowedHosts: ["localhost", "127.0.0.1"],
});

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/temporal/mcp", requireBearer, async (req: any, res: any) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };
      await makeServer().connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: missing or invalid session" },
      id: null,
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/temporal/mcp", requireBearer, async (req: any, res: any) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.delete("/temporal/mcp", requireBearer, async (req: any, res: any) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`ironline-temporal MCP server listening on port ${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/temporal/mcp`);
});

async function shutdown() {
  for (const id of Object.keys(transports)) {
    await transports[id].close().catch(() => {});
    delete transports[id];
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
