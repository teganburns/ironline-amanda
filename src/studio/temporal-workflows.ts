/**
 * Temporal workflow definitions for ironline-studio.
 *
 * IMPORTANT: This file runs inside a Temporal V8 sandbox. It may ONLY import
 * from @temporalio/workflow — no Node built-ins, no local files, no native modules.
 */
import { proxyActivities } from "@temporalio/workflow";

const { executeScheduledJob } = proxyActivities<{
  executeScheduledJob(job: Record<string, unknown>): Promise<void>;
}>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "5s",
    backoffCoefficient: 2,
  },
});

export async function studioScheduledJob(job: Record<string, unknown>): Promise<void> {
  await executeScheduledJob(job);
}
