import { afterEach, describe, expect, test } from "bun:test";
import { probeTemporalRuntime, scheduleTemporalJob, TemporalSchedulingError } from "./temporal";

const originalTemporalAddress = process.env.TEMPORAL_ADDRESS;
const originalTemporalNamespace = process.env.TEMPORAL_NAMESPACE;
const originalTemporalTaskQueue = process.env.TEMPORAL_TASK_QUEUE;

afterEach(() => {
  process.env.TEMPORAL_ADDRESS = originalTemporalAddress;
  process.env.TEMPORAL_NAMESPACE = originalTemporalNamespace;
  process.env.TEMPORAL_TASK_QUEUE = originalTemporalTaskQueue;
});

describe("temporal helpers", () => {
  test("reports missing Temporal configuration", async () => {
    process.env.TEMPORAL_ADDRESS = "";
    process.env.TEMPORAL_NAMESPACE = "";
    process.env.TEMPORAL_TASK_QUEUE = "";

    const probe = await probeTemporalRuntime();

    expect(probe.configured).toBe(false);
    expect(probe.reachable).toBe(false);
  });

  test("falls back to local scheduling for generic jobs when Temporal is unavailable", async () => {
    process.env.TEMPORAL_ADDRESS = "";
    process.env.TEMPORAL_NAMESPACE = "";
    process.env.TEMPORAL_TASK_QUEUE = "";

    const scheduled = await scheduleTemporalJob({
      id: "job-1",
      jobType: "agent.run",
      executeAt: "2026-04-06T12:05:00.000Z",
      payload: {
        channel: "imessage",
        input: "follow up",
      },
    });

    expect(scheduled.backend).toBe("local");
  });

  test("rejects reminder scheduling when Temporal is unavailable", async () => {
    process.env.TEMPORAL_ADDRESS = "";
    process.env.TEMPORAL_NAMESPACE = "";
    process.env.TEMPORAL_TASK_QUEUE = "";

    await expect(
      scheduleTemporalJob(
        {
          id: "job-1",
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
            },
            timezone: "America/Los_Angeles",
          },
        },
        {
          allowLocalFallback: false,
        }
      )
    ).rejects.toBeInstanceOf(TemporalSchedulingError);
  });
});
