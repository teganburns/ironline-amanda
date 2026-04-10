import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  getBrowserLocalMcpUrl,
  getAmandaIMessageMcpUrl,
  getAmandaMcpToken,
  getIMessageLocalMcpUrl,
  getLanceDbContextLocalMcpUrl,
  getTemporalLocalMcpUrl,
} from "../mcp-endpoints";
import { formatJsonDocument } from "./json";
import { probeTemporalRuntime, type TemporalProbeResult } from "./temporal";
import type {
  ConnectorState,
  ConnectorStatus,
  McpOverview,
  McpProbeStage,
  McpPromptDescriptor,
  McpResourceDescriptor,
  McpTargetDefinition,
  McpToolDescriptor,
  McpInvocationResult,
} from "./types";

export const MCP_TARGET_IDS = {
  remoteLanceDb: "amanda-lancedb",
  localBrowser: "browser-local",
  localContext: "context-local",
  localIMessage: "imessage-local",
  localTemporal: "temporal-local",
  remoteIMessage: "amanda-imessage",
} as const;

interface McpSession {
  ping(): Promise<void>;
  listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> | null }>>;
  listResources(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string }>>;
  listPrompts(): Promise<
    Array<{
      name: string;
      description?: string;
      arguments?: Array<{ name: string; description?: string; required?: boolean }>;
    }>
  >;
  readResource(uri: string): Promise<unknown>;
  getPrompt(name: string, args?: Record<string, unknown>): Promise<unknown>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  getServerVersion(): { name?: string; version?: string } | null;
  getInstructions(): string | null;
  getServerCapabilities(): Record<string, unknown> | null;
  close(): Promise<void>;
}

type McpSessionFactory = (
  target: McpTargetDefinition,
  requestInit: RequestInit
) => Promise<McpSession>;

interface BrowserProbeResult {
  connected: boolean;
  detail: string;
  lastConnectedAt: string | null;
  pendingCommandCount: number;
  lastError: string | null;
}

function status(state: ConnectorState, detail: string): ConnectorStatus {
  return {
    state,
    detail,
    lastCheckedAt: new Date().toISOString(),
  };
}

function firstPresentEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function listEnvNames(names: string[]): string {
  return names.join(" or ");
}

function getMissingConfigMessage(target: McpTargetDefinition): string {
  if (target.id === MCP_TARGET_IDS.localTemporal) {
    return "Set TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE, and TEMPORAL_TASK_QUEUE to enable the Temporal reminder lane.";
  }

  return `${target.label} is not configured.`;
}

function getMissingAuthMessage(target: McpTargetDefinition): string | null {
  if (target.auth.kind === "none") return null;
  return firstPresentEnv(target.auth.envVarNames)
    ? null
    : `Missing ${listEnvNames(target.auth.envVarNames)} for ${target.label}.`;
}

function classifyProbeError(
  error: unknown,
  target: McpTargetDefinition,
  stage: McpProbeStage
): { state: ConnectorState; detail: string; failedStage: McpProbeStage } {
  if (error instanceof StreamableHTTPError) {
    if (error.code === 401) {
      return {
        state: "degraded",
        detail: `Unauthorized for ${target.label} at ${target.baseUrl}.`,
        failedStage: "authentication",
      };
    }

    if (typeof error.code === "number") {
      return {
        state: "degraded",
        detail: `${target.label} responded with HTTP ${error.code} at ${target.baseUrl}.`,
        failedStage: stage,
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    state: "offline",
    detail: message || `Unable to reach ${target.label}.`,
    failedStage: stage,
  };
}

function resolveRemoteIMessageAuthToken(): string | undefined {
  return process.env.AMANDA_MCP_TOKEN?.trim() || getAmandaMcpToken();
}

async function probeBrowserRuntime(target: McpTargetDefinition, requestInit: RequestInit): Promise<BrowserProbeResult> {
  if (!target.baseUrl) {
    throw new Error(`${target.label} has no configured base URL.`);
  }

  const response = await fetch(new URL("/browser/status", target.baseUrl), {
    method: "GET",
    headers: requestInit.headers,
    signal: AbortSignal.timeout(1_500),
  });

  if (!response.ok) {
    throw new StreamableHTTPError(response.status, `Browser status probe failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    connected?: unknown;
    lastConnectedAt?: unknown;
    pendingCommandCount?: unknown;
    lastError?: unknown;
  };

  const connected = payload.connected === true;
  const lastError = typeof payload.lastError === "string" ? payload.lastError : null;

  return {
    connected,
    detail: connected
      ? "Chrome extension is connected to the local browser bridge."
      : lastError ?? "Chrome extension is not currently connected to the local browser bridge.",
    lastConnectedAt: typeof payload.lastConnectedAt === "string" ? payload.lastConnectedAt : null,
    pendingCommandCount:
      typeof payload.pendingCommandCount === "number" ? payload.pendingCommandCount : 0,
    lastError,
  };
}

function createSdkSessionFactory(): McpSessionFactory {
  return async (target, requestInit) => {
    if (!target.baseUrl) {
      throw new Error(`${target.label} has no configured base URL.`);
    }

    const client = new Client(
      {
        name: "ironline-studio",
        version: "0.1.0",
      },
      {
        capabilities: {},
      }
    );
    const transport = new StreamableHTTPClientTransport(new URL(target.baseUrl), {
      requestInit,
    });

    try {
      await client.connect(transport);
    } catch (error) {
      await transport.close().catch(() => {});
      throw error;
    }

    let closed = false;

    return {
      async ping() {
        await client.ping();
      },
      async listTools() {
        const response = await client.listTools();
        return response.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: (tool.inputSchema as Record<string, unknown> | undefined) ?? null,
        }));
      },
      async listResources() {
        const response = await client.listResources();
        return response.resources.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
        }));
      },
      async listPrompts() {
        const response = await client.listPrompts();
        return response.prompts.map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments?.map((argument) => ({
            name: argument.name,
            description: argument.description,
            required: argument.required,
          })),
        }));
      },
      async readResource(uri: string) {
        return client.readResource({ uri });
      },
      async getPrompt(name: string, args?: Record<string, unknown>) {
        return client.getPrompt({
          name,
          arguments: args,
        });
      },
      async callTool(name: string, args?: Record<string, unknown>) {
        return client.callTool({
          name,
          arguments: args,
        });
      },
      getServerVersion() {
        return client.getServerVersion() ?? null;
      },
      getInstructions() {
        return client.getInstructions() ?? null;
      },
      getServerCapabilities() {
        return (client.getServerCapabilities() as Record<string, unknown> | undefined) ?? null;
      },
      async close() {
        if (closed) return;
        closed = true;
        await client.close().catch(() => {});
        await transport.terminateSession().catch(() => {});
        await transport.close().catch(() => {});
      },
    };
  };
}

export function createDefaultMcpTargets(): McpTargetDefinition[] {
  return [
    {
      id: MCP_TARGET_IDS.localBrowser,
      label: "Local Browser MCP",
      kind: "local",
      baseUrl: getBrowserLocalMcpUrl(),
      configured: true,
      authMode: "auth_token",
      auth: {
        kind: "bearer",
        headerName: "Authorization",
        envVarNames: ["AUTH_TOKEN"],
      },
      capabilities: ["tools.list", "tools.call"],
      requiredTools: [
        "browser_navigate",
        "browser_screenshot",
        "browser_snapshot",
        "browser_click",
        "browser_type",
      ],
      requiredForRuntime: false,
    },
    {
      id: MCP_TARGET_IDS.localContext,
      label: "LanceDB Context MCP",
      kind: "local",
      baseUrl: getLanceDbContextLocalMcpUrl(),
      configured: true,
      authMode: "auth_token",
      auth: {
        kind: "bearer",
        headerName: "Authorization",
        envVarNames: ["AUTH_TOKEN"],
      },
      capabilities: ["tools.list", "tools.call"],
      requiredTools: ["memory_store", "memory_search", "memory_get_user", "memory_delete"],
      requiredForRuntime: true,
    },
    {
      id: MCP_TARGET_IDS.localIMessage,
      label: "Local iMessage MCP",
      kind: "local",
      baseUrl: getIMessageLocalMcpUrl(),
      configured: true,
      authMode: "auth_token",
      auth: {
        kind: "bearer",
        headerName: "Authorization",
        envVarNames: ["AUTH_TOKEN"],
      },
      capabilities: ["tools.list", "tools.call", "resources.list", "prompts.list"],
      requiredTools: ["send_message", "get_messages", "search_messages", "mark_read", "set_typing"],
      requiredForRuntime: true,
    },
    {
      id: MCP_TARGET_IDS.localTemporal,
      label: "Local Temporal Reminder MCP",
      kind: "local",
      baseUrl: getTemporalLocalMcpUrl(),
      configured: true,
      authMode: "auth_token",
      auth: {
        kind: "bearer",
        headerName: "Authorization",
        envVarNames: ["AUTH_TOKEN"],
      },
      capabilities: ["tools.list", "tools.call"],
      requiredTools: ["schedule_reminder"],
      requiredForRuntime: false,
    },
    {
      id: MCP_TARGET_IDS.remoteIMessage,
      label: "Amanda iMessage MCP",
      kind: "remote",
      baseUrl: getAmandaIMessageMcpUrl(),
      configured: true,
      authMode: "env_bearer",
      auth: {
        kind: "bearer",
        headerName: "Authorization",
        envVarNames: ["AMANDA_MCP_TOKEN", "AUTH_TOKEN"],
      },
      capabilities: ["tools.list", "tools.call", "resources.list", "prompts.list"],
      requiredTools: ["send_message", "get_messages", "search_messages", "mark_read", "set_typing"],
      requiredForRuntime: false,
    },
  ];
}

export function resolveMcpTargetRequestInit(target: McpTargetDefinition): {
  authConfigured: boolean;
  requestInit: RequestInit;
} {
  const headers: Record<string, string> = {};
  let token: string | undefined;

  if (target.id === MCP_TARGET_IDS.remoteIMessage) {
    token = resolveRemoteIMessageAuthToken();
  } else if (target.auth.kind === "bearer") {
    token = firstPresentEnv(target.auth.envVarNames);
  }

  if (token && target.auth.kind === "bearer") {
    headers[target.auth.headerName ?? "Authorization"] = `Bearer ${token}`;
  }

  return {
    authConfigured: target.auth.kind === "none" ? true : Boolean(token),
    requestInit: {
      headers,
    },
  };
}

export class StudioMcpService {
  constructor(
    private readonly targets: McpTargetDefinition[] = createDefaultMcpTargets(),
    private readonly sessionFactory: McpSessionFactory = createSdkSessionFactory(),
    private readonly temporalProbe: () => Promise<TemporalProbeResult> = probeTemporalRuntime,
    private readonly browserProbe: (
      target: McpTargetDefinition,
      requestInit: RequestInit
    ) => Promise<BrowserProbeResult> = probeBrowserRuntime
  ) {}

  listTargets(): McpTargetDefinition[] {
    return this.targets;
  }

  private getTarget(targetId: string): McpTargetDefinition {
    const target = this.targets.find((item) => item.id === targetId);
    if (!target) {
      throw new Error(`MCP target ${targetId} not found`);
    }
    return target;
  }

  private async withSession<T>(
    targetId: string,
    action: (session: McpSession, target: McpTargetDefinition) => Promise<T>
  ): Promise<T> {
    const target = this.getTarget(targetId);
    if (!target.configured || !target.baseUrl) {
      throw new Error(getMissingConfigMessage(target));
    }

    const missingAuthMessage = getMissingAuthMessage(target);
    if (missingAuthMessage) {
      throw new Error(missingAuthMessage);
    }

    const { requestInit } = resolveMcpTargetRequestInit(target);
    const session = await this.sessionFactory(target, requestInit);

    try {
      return await action(session, target);
    } finally {
      await session.close().catch(() => {});
    }
  }

  async getOverview(targetId: string): Promise<McpOverview> {
    const target = this.getTarget(targetId);
    const { authConfigured, requestInit } = resolveMcpTargetRequestInit(target);

    if (!target.configured || !target.baseUrl) {
      return {
        target,
        status: status("degraded", getMissingConfigMessage(target)),
        configured: false,
        authConfigured,
        availableTools: [],
        missingRequiredTools: target.requiredTools,
        failedStage: "configuration",
        serverVersion: null,
        instructions: null,
        serverCapabilities: null,
      };
    }

    const missingAuthMessage = getMissingAuthMessage(target);
    if (missingAuthMessage) {
      return {
        target,
        status: status("degraded", missingAuthMessage),
        configured: true,
        authConfigured: false,
        availableTools: [],
        missingRequiredTools: target.requiredTools,
        failedStage: "authentication",
        serverVersion: null,
        instructions: null,
        serverCapabilities: null,
      };
    }

    let session: McpSession | null = null;

    try {
      session = await this.sessionFactory(target, requestInit);
    } catch (error) {
      const failure = classifyProbeError(error, target, "connect");
      return {
        target,
        status: status(failure.state, failure.detail),
        configured: true,
        authConfigured,
        availableTools: [],
        missingRequiredTools: target.requiredTools,
        failedStage: failure.failedStage,
        serverVersion: null,
        instructions: null,
        serverCapabilities: null,
      };
    }

    try {
      try {
        await session.ping();
      } catch (error) {
        const failure = classifyProbeError(error, target, "ping");
        return {
          target,
          status: status(failure.state, failure.detail),
          configured: true,
          authConfigured,
          availableTools: [],
          missingRequiredTools: target.requiredTools,
          failedStage: failure.failedStage,
          serverVersion: session.getServerVersion(),
          instructions: session.getInstructions(),
          serverCapabilities: session.getServerCapabilities(),
        };
      }

      let tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> | null }>;
      try {
        tools = await session.listTools();
      } catch (error) {
        const failure = classifyProbeError(error, target, "list_tools");
        return {
          target,
          status: status(failure.state, failure.detail),
          configured: true,
          authConfigured,
          availableTools: [],
          missingRequiredTools: target.requiredTools,
          failedStage: failure.failedStage,
          serverVersion: session.getServerVersion(),
          instructions: session.getInstructions(),
          serverCapabilities: session.getServerCapabilities(),
        };
      }

      const availableTools = tools.map((tool) => tool.name);
      const missingRequiredTools = target.requiredTools.filter((tool) => !availableTools.includes(tool));
      if (missingRequiredTools.length) {
        return {
          target,
          status: status(
            "degraded",
            `${target.label} is missing required tools: ${missingRequiredTools.join(", ")}.`
          ),
          configured: true,
          authConfigured,
          availableTools,
          missingRequiredTools,
          failedStage: "required_tools",
          serverVersion: session.getServerVersion(),
          instructions: session.getInstructions(),
          serverCapabilities: session.getServerCapabilities(),
        };
      }

      if (target.id === MCP_TARGET_IDS.localBrowser) {
        let browserProbe: BrowserProbeResult;
        try {
          browserProbe = await this.browserProbe(target, requestInit);
        } catch (error) {
          const failure = classifyProbeError(error, target, "connect");
          return {
            target,
            status: status(failure.state, failure.detail),
            configured: true,
            authConfigured,
            availableTools,
            missingRequiredTools: [],
            failedStage: failure.failedStage,
            serverVersion: session.getServerVersion(),
            instructions: session.getInstructions(),
            serverCapabilities: session.getServerCapabilities(),
          };
        }

        if (!browserProbe.connected) {
          return {
            target,
            status: status("degraded", browserProbe.detail),
            configured: true,
            authConfigured,
            availableTools,
            missingRequiredTools: [],
            failedStage: "connect",
            serverVersion: session.getServerVersion(),
            instructions: session.getInstructions(),
            serverCapabilities: session.getServerCapabilities(),
          };
        }

        return {
          target,
          status: status("ready", `${target.label} is ready. ${browserProbe.detail}`),
          configured: true,
          authConfigured,
          availableTools,
          missingRequiredTools: [],
          failedStage: null,
          serverVersion: session.getServerVersion(),
          instructions: session.getInstructions(),
          serverCapabilities: session.getServerCapabilities(),
        };
      }

      if (target.id === MCP_TARGET_IDS.localTemporal) {
        const temporalProbe = await this.temporalProbe();
        if (!temporalProbe.configured) {
          return {
            target,
            status: status("degraded", temporalProbe.detail),
            configured: false,
            authConfigured,
            availableTools,
            missingRequiredTools: [],
            failedStage: "configuration",
            serverVersion: session.getServerVersion(),
            instructions: session.getInstructions(),
            serverCapabilities: session.getServerCapabilities(),
          };
        }

        if (!temporalProbe.reachable) {
          return {
            target,
            status: status("offline", temporalProbe.detail),
            configured: true,
            authConfigured,
            availableTools,
            missingRequiredTools: [],
            failedStage: "connect",
            serverVersion: session.getServerVersion(),
            instructions: session.getInstructions(),
            serverCapabilities: session.getServerCapabilities(),
          };
        }

        return {
          target,
          status: status("ready", `${target.label} is ready. ${temporalProbe.detail}`),
          configured: true,
          authConfigured,
          availableTools,
          missingRequiredTools: [],
          failedStage: null,
          serverVersion: session.getServerVersion(),
          instructions: session.getInstructions(),
          serverCapabilities: session.getServerCapabilities(),
        };
      }

      return {
        target,
        status: status("ready", `Connected to ${target.label} at ${target.baseUrl}.`),
        configured: true,
        authConfigured,
        availableTools,
        missingRequiredTools: [],
        failedStage: null,
        serverVersion: session.getServerVersion(),
        instructions: session.getInstructions(),
        serverCapabilities: session.getServerCapabilities(),
      };
    } finally {
      await session.close().catch(() => {});
    }
  }

  async listTools(targetId: string): Promise<McpToolDescriptor[]> {
    return this.withSession(targetId, async (session) => session.listTools());
  }

  async listResources(targetId: string): Promise<McpResourceDescriptor[]> {
    return this.withSession(targetId, async (session) => session.listResources());
  }

  async listPrompts(targetId: string): Promise<McpPromptDescriptor[]> {
    return this.withSession(targetId, async (session) => session.listPrompts());
  }

  private async createInvocationResult(
    targetId: string,
    actionType: McpInvocationResult["actionType"],
    rawResponse: unknown,
    summary: string
  ): Promise<McpInvocationResult> {
    return {
      targetId,
      actionType,
      ok: true,
      summary,
      rawResponse,
      formattedJson: await formatJsonDocument(rawResponse),
    };
  }

  async readResource(targetId: string, uri: string): Promise<McpInvocationResult> {
    return this.withSession(targetId, async (session) => {
      const response = await session.readResource(uri);
      return this.createInvocationResult(targetId, "resource", response, `Read resource ${uri}`);
    });
  }

  async getPrompt(targetId: string, name: string, args?: Record<string, unknown>): Promise<McpInvocationResult> {
    return this.withSession(targetId, async (session) => {
      const response = await session.getPrompt(name, args);
      return this.createInvocationResult(targetId, "prompt", response, `Fetched prompt ${name}`);
    });
  }

  async invokeTool(targetId: string, name: string, args?: Record<string, unknown>): Promise<McpInvocationResult> {
    return this.withSession(targetId, async (session) => {
      const response = await session.callTool(name, args);
      return this.createInvocationResult(targetId, "tool", response, `Invoked tool ${name}`);
    });
  }
}
