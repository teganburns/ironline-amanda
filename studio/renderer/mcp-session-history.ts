import type { McpInvocationResult } from "../../src/studio/types";

export interface McpSessionHistoryEntry extends McpInvocationResult {
  id: string;
  createdAt: string;
}

const sessionHistory: McpSessionHistoryEntry[] = [];

export function listMcpSessionHistory(): McpSessionHistoryEntry[] {
  return [...sessionHistory];
}

export function recordMcpSessionHistory(result: McpInvocationResult): McpSessionHistoryEntry {
  const entry: McpSessionHistoryEntry = {
    ...result,
    id: globalThis.crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  sessionHistory.unshift(entry);
  if (sessionHistory.length > 20) {
    sessionHistory.length = 20;
  }

  return entry;
}
