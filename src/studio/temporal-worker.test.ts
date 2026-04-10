import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { StudioRunStore } from "./run-store";
import { executeScheduledJob } from "./temporal-worker";
import type { RunResult } from "./types";

const originalStudioHome = process.env.IRONLINE_HOME_DIR;

function createResult(input: string): RunResult {
  return {
    id: "scheduled-run",
    status: "completed",
    output: `echo:${input}`,
    traceId: "trace-1",
    toolEvents: [],
    artifacts: [],
    startedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    finishedAt: new Date("2026-01-01T00:00:01.000Z").toISOString(),
    timeline: [],
    request: {
      id: "scheduled-run",
      trigger: "scheduled",
      channel: "imessage",
      input,
    },
  };
}

describe("temporal worker job execution", () => {
  beforeEach(() => {
    process.env.IRONLINE_HOME_DIR = `/tmp/ironline-temporal-worker-test-${Date.now()}`;
  });

  afterEach(() => {
    rmSync(process.env.IRONLINE_HOME_DIR!, { recursive: true, force: true });
    process.env.IRONLINE_HOME_DIR = originalStudioHome;
  });

  test("completes reminder jobs with a delivery outcome", async () => {
    const runStore = new StudioRunStore();
    const saved = await runStore.saveJob(
      {
        id: "reminder-job-1",
        jobType: "reminder.send",
        executeAt: "2026-04-06T12:05:00.000Z",
        payload: {
          messageText: "Reminder: stretch.",
          requestedTime: "in 5 minutes",
          sourceChat: {
            chatId: "any;-;+13128344710",
            service: "iMessage",
          },
          sender: {
            identifier: "+13128344710",
            name: "Tegan Burns",
          },
          target: {
            recipient: "+13128344710",
            chatId: "any;-;+13128344710",
            service: "iMessage",
            summary: "Tegan Burns",
          },
          timezone: "America/Los_Angeles",
        },
      },
      "temporal"
    );

    await executeScheduledJob(saved, {
      runStore,
      async sendReminder() {
        return {
          ok: true,
          deliveredAt: "2026-04-06T12:05:00.000Z",
          targetSummary: "Tegan Burns",
        };
      },
    });

    const completed = runStore.getJob(saved.id)!;
    expect(completed.status).toBe("completed");
    expect(completed.delivery?.ok).toBe(true);
    expect(completed.completedAt).toBeTruthy();
  });

  test("re-enters Amanda for scheduled agent runs", async () => {
    const runStore = new StudioRunStore();
    const saved = await runStore.saveJob(
      {
        id: "agent-job-1",
        jobType: "agent.run",
        executeAt: "2026-04-06T12:05:00.000Z",
        payload: {
          channel: "imessage",
          input: "follow up later",
        },
      },
      "temporal"
    );

    let receivedInput: string | null = null;
    await executeScheduledJob(saved, {
      runStore,
      control: {
        async runAgent(request) {
          receivedInput = request.input;
          return createResult(request.input);
        },
      } as any,
    });

    const completed = runStore.getJob(saved.id)!;
    expect(receivedInput).toBe("follow up later");
    expect(completed.status).toBe("completed");
  });
});
