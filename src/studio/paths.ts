import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function getIronlineHome(): string {
  return process.env.IRONLINE_HOME_DIR ?? join(homedir(), ".ironline");
}

export function getStudioHome(): string {
  return join(getIronlineHome(), "studio");
}

export function getRunsPath(): string {
  return join(getStudioHome(), "runs.json");
}

export function getJobsPath(): string {
  return join(getStudioHome(), "jobs.json");
}

export function getApprovalsPath(): string {
  return join(getStudioHome(), "approvals.json");
}

export function ensureStudioHome(): string {
  const home = getStudioHome();
  mkdirSync(home, { recursive: true });
  return home;
}
