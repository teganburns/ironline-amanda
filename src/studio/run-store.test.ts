import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { getApprovalsPath, getJobsPath, getRunsPath } from "./paths";
import { StudioRunStore } from "./run-store";
import type { RunResult } from "./types";

const originalStudioHome = process.env.IRONLINE_HOME_DIR;

function sampleRun(): RunResult {
  return {
    id: "run-1",
    status: "completed",
    output: "done",
    traceId: "trace-1",
    toolEvents: [],
    artifacts: [],
    startedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    finishedAt: new Date("2026-01-01T00:01:00.000Z").toISOString(),
    timeline: [],
    request: {
      id: "run-1",
      trigger: "manual",
      channel: "imessage",
      input: "hello",
    },
  };
}

describe("StudioRunStore", () => {
  beforeEach(() => {
    process.env.IRONLINE_HOME_DIR = `/tmp/ironline-store-test-${Date.now()}`;
  });

  afterEach(() => {
    rmSync(process.env.IRONLINE_HOME_DIR!, { recursive: true, force: true });
    process.env.IRONLINE_HOME_DIR = originalStudioHome;
  });

  test("persists runs, jobs, and approval rules", async () => {
    const store = new StudioRunStore();
    await store.saveRun(sampleRun());
    const job = await store.saveJob(
      {
        id: "job-1",
        jobType: "callback",
        executeAt: new Date("2026-01-01T00:05:00.000Z").toISOString(),
        payload: { input: "follow up" },
      },
      "local"
    );
    await store.saveApprovalRule({ mode: "suggest", connectorScope: ["imessage"] });

    expect(store.listRuns()).toHaveLength(1);
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listApprovalRules()).toHaveLength(1);
    expect(store.getRun("run-1")?.request.input).toBe("hello");
    expect(store.getJob(job.id)?.jobType).toBe("callback");
    expect(Bun.file(getRunsPath()).size).toBeGreaterThan(0);
    expect(Bun.file(getJobsPath()).size).toBeGreaterThan(0);
    expect(Bun.file(getApprovalsPath()).size).toBeGreaterThan(0);
  });
});
