import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "../env";
import { getIMessageLocalMcpUrl } from "../mcp-endpoints";
import { IronlineStudioControl } from "./control";
import { StudioRunStore } from "./run-store";
import type { AgentRunJobPayload, JobSpec, ReminderDeliveryOutcome } from "./types";
import { isReminderPayload, summarizeReminderTarget } from "./reminders";

loadProjectEnv();

const POLL_INTERVAL_MS = 2_500;
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS;
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";
const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "ironline-studio";

export interface ScheduledJobDeps {
  runStore?: StudioRunStore;
  control?: IronlineStudioControl;
  sendReminder?: (job: JobSpec) => Promise<ReminderDeliveryOutcome>;
}

function isAgentRunPayload(payload: unknown): payload is AgentRunJobPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return typeof candidate.input === "string" && typeof candidate.channel === "string";
}

async function sendReminderThroughIMessage(job: JobSpec): Promise<ReminderDeliveryOutcome> {
  if (!isReminderPayload(job.payload)) {
    throw new Error(`Reminder job ${job.id ?? "(unknown)"} is missing its reminder payload.`);
  }

  const authToken = process.env.AUTH_TOKEN?.trim();
  if (!authToken) {
    throw new Error("AUTH_TOKEN env var is required to deliver reminder messages.");
  }

  const client = new Client(
    {
      name: "ironline-temporal-worker",
      version: "0.1.0",
    },
    {
      capabilities: {},
    }
  );
  const transport = new StreamableHTTPClientTransport(new URL(getIMessageLocalMcpUrl()), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
  });

  await client.connect(transport);

  try {
    const response = await client.callTool({
      name: "send_message",
      arguments: {
        recipient: job.payload.target.recipient,
        chat_id: job.payload.target.chatId,
        text: job.payload.messageText,
      },
    });

    if ((response as { isError?: boolean }).isError) {
      throw new Error(JSON.stringify(response));
    }

    return {
      ok: true,
      deliveredAt: new Date().toISOString(),
      targetSummary: summarizeReminderTarget(job.payload.target, job.payload.sender),
      rawResponse: response,
    };
  } finally {
    await client.close().catch(() => {});
    await transport.terminateSession().catch(() => {});
    await transport.close().catch(() => {});
  }
}

function normalizeAgentRunRequest(job: JobSpec) {
  if (isAgentRunPayload(job.payload)) {
    return {
      trigger: "scheduled" as const,
      channel: job.payload.channel,
      input: job.payload.input,
      context: job.payload.context ?? {},
      approvalMode: "autonomous" as const,
      messagePayload: job.payload.messagePayload,
    };
  }

  const payload = (job.payload ?? {}) as Record<string, unknown>;
  return {
    trigger: "scheduled" as const,
    channel: String(payload.channel ?? "system") as "system" | "imessage" | "gmail" | "web",
    input: String(payload.input ?? `Scheduled job ${job.jobType}`),
    context: (payload.context as Record<string, unknown> | undefined) ?? {},
    approvalMode: "autonomous" as const,
    messagePayload: (payload.messagePayload as Record<string, unknown> | undefined) ?? undefined,
  };
}

async function dispatchScheduledJob(job: JobSpec, deps: ScheduledJobDeps): Promise<{
  delivery?: ReminderDeliveryOutcome;
}> {
  if (job.jobType === "reminder.send") {
    const sendReminder = deps.sendReminder ?? sendReminderThroughIMessage;
    return {
      delivery: await sendReminder(job),
    };
  }

  const control = deps.control ?? new IronlineStudioControl({ runStore: deps.runStore ?? new StudioRunStore() });
  await control.runAgent(normalizeAgentRunRequest(job));
  return {};
}

export async function executeScheduledJob(job: Record<string, unknown>, deps: ScheduledJobDeps = {}): Promise<void> {
  const spec = job as unknown as JobSpec;
  const runStore = deps.runStore ?? new StudioRunStore();

  if (spec.id) {
    await runStore.updateJob(spec.id, { status: "running" });
  }

  try {
    const execution = await dispatchScheduledJob(spec, {
      ...deps,
      runStore,
      control: deps.control ?? new IronlineStudioControl({ runStore }),
    });

    if (spec.id) {
      await runStore.updateJob(spec.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        delivery: execution.delivery,
        lastError: undefined,
        failureDetail: undefined,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (spec.id) {
      await runStore.updateJob(spec.id, {
        status: "failed",
        lastError: message,
        failureDetail: message,
      });
    }
    throw error;
  }
}

async function startTemporalWorker() {
  const { NativeConnection, Worker } = await import("@temporalio/worker");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const workflowsPath = join(__dirname, "temporal-workflows.ts");

  const connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS! });
  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TEMPORAL_TASK_QUEUE,
    workflowsPath,
    activities: { executeScheduledJob },
  });

  console.log(`[temporal-worker] connected to Temporal at ${TEMPORAL_ADDRESS}, queue: ${TEMPORAL_TASK_QUEUE}`);
  await worker.run();
}

async function tick() {
  const store = new StudioRunStore();
  const dueJobs = store
    .listJobs(200)
    .filter((job) => job.status === "scheduled" && new Date(job.executeAt).getTime() <= Date.now());

  for (const job of dueJobs) {
    await executeScheduledJob(job, { runStore: store });
  }
}

function startLocalPolling() {
  setInterval(() => {
    tick().catch((error) => console.error("[temporal-worker] tick failed", error));
  }, POLL_INTERVAL_MS);
  tick().catch((error) => console.error("[temporal-worker] bootstrap failed", error));
}

if (TEMPORAL_ADDRESS) {
  startTemporalWorker().catch((error) => {
    console.error("[temporal-worker] Temporal connection failed, falling back to local polling:", error.message);
    startLocalPolling();
  });
} else {
  startLocalPolling();
}
