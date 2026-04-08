import { randomUUID } from "node:crypto";
import type { JobSpec } from "./types";

export interface TemporalRuntimeConfig {
  address: string | null;
  namespace: string | null;
  taskQueue: string | null;
  configured: boolean;
}

export interface TemporalProbeResult {
  configured: boolean;
  reachable: boolean;
  detail: string;
}

export interface TemporalScheduleOptions {
  allowLocalFallback?: boolean;
}

export class TemporalSchedulingError extends Error {
  readonly code = "temporal_scheduling";

  constructor(message: string) {
    super(message);
    this.name = "TemporalSchedulingError";
  }
}

export function getTemporalRuntimeConfig(): TemporalRuntimeConfig {
  const address = process.env.TEMPORAL_ADDRESS?.trim() || null;
  const namespace = process.env.TEMPORAL_NAMESPACE?.trim() || null;
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE?.trim() || null;

  return {
    address,
    namespace,
    taskQueue,
    configured: Boolean(address && namespace && taskQueue),
  };
}

async function createTemporalClientConnection() {
  const config = getTemporalRuntimeConfig();
  if (!config.configured || !config.address || !config.namespace || !config.taskQueue) {
    throw new TemporalSchedulingError(
      "Temporal is not configured. Set TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, and TEMPORAL_TASK_QUEUE."
    );
  }

  const { Client, Connection } = await import("@temporalio/client");
  const connection = await Connection.connect({
    address: config.address,
  });
  const client = new Client({
    connection,
    namespace: config.namespace,
  });

  return {
    client,
    connection,
    config,
  };
}

async function closeConnection(connection: unknown) {
  if (!connection || typeof connection !== "object") return;
  const maybeClose = (connection as { close?: () => Promise<void> | void }).close;
  if (typeof maybeClose === "function") {
    await maybeClose.call(connection);
  }
}

export async function probeTemporalRuntime(): Promise<TemporalProbeResult> {
  const config = getTemporalRuntimeConfig();
  if (!config.configured) {
    return {
      configured: false,
      reachable: false,
      detail: "Temporal cluster config is missing. Set TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, and TEMPORAL_TASK_QUEUE.",
    };
  }

  let connection: unknown;
  try {
    const connected = await createTemporalClientConnection();
    connection = connected.connection;
    return {
      configured: true,
      reachable: true,
      detail: `Temporal cluster ${connected.config.address} is reachable on task queue ${connected.config.taskQueue}.`,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await closeConnection(connection);
  }
}

export async function scheduleTemporalJob(
  job: JobSpec,
  options: TemporalScheduleOptions = {}
): Promise<{
  backend: "temporal" | "local";
  remoteId: string;
}> {
  const allowLocalFallback = options.allowLocalFallback ?? true;
  const config = getTemporalRuntimeConfig();

  if (!config.configured) {
    if (!allowLocalFallback) {
      throw new TemporalSchedulingError(
        "Temporal is not configured. Set TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, and TEMPORAL_TASK_QUEUE."
      );
    }

    return {
      backend: "local",
      remoteId: job.id ?? randomUUID(),
    };
  }

  let connection: unknown;

  try {
    const temporal = await createTemporalClientConnection();
    connection = temporal.connection;

    const workflowId = job.id ?? `studio-job-${randomUUID()}`;
    await temporal.client.workflow.start("studioScheduledJob", {
      taskQueue: temporal.config.taskQueue!,
      workflowId,
      args: [job],
      startDelay: Math.max(0, new Date(job.executeAt).getTime() - Date.now()),
    });

    return {
      backend: "temporal",
      remoteId: workflowId,
    };
  } catch (error) {
    if (!allowLocalFallback) {
      throw new TemporalSchedulingError(
        error instanceof Error ? error.message : "Temporal scheduling failed."
      );
    }

    return {
      backend: "local",
      remoteId: job.id ?? randomUUID(),
    };
  } finally {
    await closeConnection(connection);
  }
}
