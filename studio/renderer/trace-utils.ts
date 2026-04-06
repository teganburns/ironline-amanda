import type { ArtifactRecord } from "../../src/studio/types";

export function buildLangfuseTraceUrl(baseUrl?: string | null, traceId?: string | null) {
  if (!baseUrl || !traceId) return null;
  return `${baseUrl.replace(/\/$/, "")}/trace/${traceId}`;
}

export function findArtifact(artifacts: ArtifactRecord[], label: string) {
  return artifacts.find((artifact) => artifact.label === label) ?? null;
}
