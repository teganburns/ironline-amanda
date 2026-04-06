import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { ensureStudioHome, getApprovalsPath, getJobsPath, getRunsPath } from "./paths";
import { formatJsonDocument } from "./json";
import type { ApprovalRule, JobRecord, JobSpec, RunResult, RunSummary } from "./types";

function readJsonFile<T>(path: string, fallback: T): T {
  ensureStudioHome();
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  ensureStudioHome();
  await writeFile(path, await formatJsonDocument(value), "utf-8");
}

export class StudioRunStore {
  listRuns(limit = 25): RunResult[] {
    const runs = readJsonFile<RunResult[]>(getRunsPath(), []);
    return runs
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  getRun(runId: string): RunResult | null {
    return this.listRuns(10_000).find((run) => run.id === runId) ?? null;
  }

  listRunSummaries(limit = 25): RunSummary[] {
    return this.listRuns(limit).map((run) => ({
      id: run.id,
      status: run.status,
      output: run.output,
      traceId: run.traceId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      request: run.request,
      promptSource: run.promptSource,
      tier: run.tier,
      error: run.error,
      toolEventCount: run.toolEvents.length,
      artifactCount: run.artifacts.length,
      timelineCount: run.timeline.length,
    }));
  }

  async saveRun(result: RunResult): Promise<RunResult> {
    const runs = this.listRuns(10_000).filter((run) => run.id !== result.id);
    runs.unshift(result);
    await writeJsonFile(getRunsPath(), runs.slice(0, 250));
    return result;
  }

  getRunTimeline(runId: string) {
    return this.getRun(runId)?.timeline ?? [];
  }

  listJobs(limit = 100): JobRecord[] {
    const jobs = readJsonFile<JobRecord[]>(getJobsPath(), []);
    return jobs
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  getJob(jobId: string): JobRecord | null {
    return this.listJobs(10_000).find((job) => job.id === jobId) ?? null;
  }

  async saveJob(spec: JobSpec, backend: "temporal" | "local", lastError?: string): Promise<JobRecord> {
    const now = new Date().toISOString();
    const record: JobRecord = {
      id: spec.id ?? randomUUID(),
      jobType: spec.jobType,
      executeAt: spec.executeAt,
      payload: spec.payload,
      retryPolicy: spec.retryPolicy,
      dedupeKey: spec.dedupeKey,
      status: spec.status ?? "scheduled",
      createdAt: now,
      updatedAt: now,
      backend,
      lastError,
    };

    const jobs = this.listJobs(10_000).filter((job) => job.id !== record.id);
    jobs.unshift(record);
    await writeJsonFile(getJobsPath(), jobs.slice(0, 500));
    return record;
  }

  async updateJob(jobId: string, patch: Partial<JobRecord>): Promise<JobRecord | null> {
    const jobs = this.listJobs(10_000);
    const current = jobs.find((job) => job.id === jobId);
    if (!current) return null;

    const next: JobRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    const updated = jobs.map((job) => (job.id === jobId ? next : job));
    await writeJsonFile(getJobsPath(), updated);
    return next;
  }

  listApprovalRules(): ApprovalRule[] {
    return readJsonFile<ApprovalRule[]>(getApprovalsPath(), []);
  }

  async saveApprovalRule(rule: ApprovalRule): Promise<ApprovalRule[]> {
    const next = [...this.listApprovalRules(), rule];
    await writeJsonFile(getApprovalsPath(), next);
    return next;
  }
}
