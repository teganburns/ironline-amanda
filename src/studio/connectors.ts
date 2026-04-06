import type { ConnectorAdapter, ConnectorInvocation, ConnectorStatus } from "./types";
import { MCP_TARGET_IDS, StudioMcpService } from "./mcp";

function status(state: ConnectorStatus["state"], detail: string): ConnectorStatus {
  return {
    state,
    detail,
    lastCheckedAt: new Date().toISOString(),
  };
}

function createMcpBackedConnector(
  id: string,
  label: string,
  targetId: string,
  capabilities: string[],
  mcpService: StudioMcpService
): ConnectorAdapter {
  return {
    id,
    label,
    capabilities: () => capabilities,
    async health() {
      const overview = await mcpService.getOverview(targetId);
      return overview.status;
    },
    async invoke(invocation: ConnectorInvocation) {
      return {
        connector: id,
        accepted: false,
        reason: `Direct invoke for ${invocation.action} is not implemented in v1`,
      };
    },
  };
}

function createPlaceholderConnector(id: string, label: string, detail: string, capabilities: string[]): ConnectorAdapter {
  return {
    id,
    label,
    capabilities: () => capabilities,
    async health() {
      return status("placeholder", detail);
    },
    async invoke() {
      return {
        connector: id,
        accepted: false,
        reason: detail,
      };
    },
  };
}

export function createDefaultConnectors(mcpService: StudioMcpService): ConnectorAdapter[] {
  return [
    createMcpBackedConnector(
      "imessage",
      "iMessage MCP",
      MCP_TARGET_IDS.localIMessage,
      ["messages.read", "messages.send", "contacts.lookup"],
      mcpService
    ),
    createMcpBackedConnector(
      "context",
      "LanceDB Context MCP",
      MCP_TARGET_IDS.remoteLanceDb,
      ["memory.search", "memory.store", "memory.delete"],
      mcpService
    ),
    createPlaceholderConnector(
      "temporal",
      "Temporal",
      process.env.TEMPORAL_ADDRESS
        ? `Configured for ${process.env.TEMPORAL_ADDRESS}`
        : "Temporal config not present yet; jobs will fall back to local scheduling metadata.",
      ["jobs.schedule", "jobs.retry", "jobs.resume"]
    ),
    createPlaceholderConnector(
      "gmail",
      "Gmail",
      "Gmail integration is intentionally stubbed for a later phase.",
      ["mail.read", "mail.send"]
    ),
    createPlaceholderConnector(
      "web-search",
      "Web Search",
      "Web search integration is intentionally stubbed for a later phase.",
      ["search.query"]
    ),
  ];
}
