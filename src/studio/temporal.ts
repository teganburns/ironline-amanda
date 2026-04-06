import { randomUUID } from "node:crypto";
import type { JobSpec } from "./types";

export async function scheduleTemporalJob(job: JobSpec): Promise<{
  backend: "temporal" | "local";
  remoteId: string;
}> {
  if (!process.env.TEMPORAL_ADDRESS || !process.env.TEMPORAL_NAMESPACE || !process.env.TEMPORAL_TASK_QUEUE) {
    return {
      backend: "local",
      remoteId: job.id ?? randomUUID(),
    };
  }

  try {
    const { Client, Connection } = await import("@temporalio/client");
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS,
    });
    const client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE,
    });

    const workflowId = job.id ?? `studio-job-${randomUUID()}`;
    await client.workflow.start("studioScheduledJob", {
      taskQueue: process.env.TEMPORAL_TASK_QUEUE,
      workflowId,
      args: [job],
      startDelay: Math.max(0, new Date(job.executeAt).getTime() - Date.now()),
    });

    return {
      backend: "temporal",
      remoteId: workflowId,
    };
  } catch {
    return {
      backend: "local",
      remoteId: job.id ?? randomUUID(),
    };
  }
}
