import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { IronlineStudioControl } from "./control";
import { MCP_TARGET_IDS } from "./mcp";
import { PromptGraphStore } from "./prompt-graphs";
import { StudioRunStore } from "./run-store";
import type { ConnectorAdapter, RunResult } from "./types";

const originalStudioHome = process.env.IRONLINE_HOME_DIR;
const originalPromptGraphRoot = process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR;

function createResult(input: string): RunResult {
  return {
    id: "result-1",
    status: "completed",
    output: `echo:${input}`,
    traceId: "trace-1",
    toolEvents: [],
    artifacts: [],
    startedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    finishedAt: new Date("2026-01-01T00:00:01.000Z").toISOString(),
    timeline: [],
    request: {
      id: "result-1",
      trigger: "manual",
      channel: "imessage",
      input,
    },
  };
}

const fakeConnector: ConnectorAdapter = {
  id: "fake",
  label: "Fake",
  capabilities: () => ["test.read"],
  async health() {
    return {
      state: "ready",
      detail: "ok",
      lastCheckedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    };
  },
  async invoke() {
    return { ok: true };
  },
};

function createReadyMcpService() {
  return {
    async getOverview(targetId: string) {
      return {
        target: {
          id: targetId,
          label: targetId === MCP_TARGET_IDS.remoteLanceDb ? "Amanda LanceDB Context MCP" : "Local iMessage MCP",
          kind: targetId === MCP_TARGET_IDS.remoteLanceDb ? "remote" : "local",
          baseUrl: "https://example.invalid/mcp",
          configured: true,
          authMode: "env_bearer",
          auth: {
            kind: "bearer",
            headerName: "Authorization",
            envVarNames: ["TEST_TOKEN"],
          },
          capabilities: [],
          requiredTools: [],
          requiredForRuntime: true,
        },
        status: {
          state: "ready",
          detail: "ok",
          lastCheckedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        },
        configured: true,
        authConfigured: true,
        availableTools: [],
        missingRequiredTools: [],
        failedStage: null,
        serverVersion: null,
        instructions: null,
        serverCapabilities: null,
      };
    },
    listTargets() {
      return [];
    },
  };
}

describe("IronlineStudioControl", () => {
  beforeEach(() => {
    process.env.IRONLINE_HOME_DIR = `/tmp/ironline-control-test-${Date.now()}`;
    process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR = `/tmp/ironline-control-prompts-${Date.now()}`;
  });

  afterEach(() => {
    rmSync(process.env.IRONLINE_HOME_DIR!, { recursive: true, force: true });
    rmSync(process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR!, { recursive: true, force: true });
    process.env.IRONLINE_HOME_DIR = originalStudioHome;
    process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR = originalPromptGraphRoot;
  });

  test("runs agent through injected executor and stores result", async () => {
    const control = new IronlineStudioControl({
      runStore: new StudioRunStore(),
      connectors: [fakeConnector],
      mcpService: createReadyMcpService() as any,
      agentExecutor: async (_payload, request) => ({
        ...createResult(request.input),
        id: request.id!,
        request: request as RunResult["request"],
      }),
    });

    const result = await control.runAgent({
      trigger: "manual",
      channel: "imessage",
      input: "ping",
    });

    expect(result.output).toBe("echo:ping");
    expect(result.request.approvalMode).toBe("autonomous");
  });

  test("lists connectors with health", async () => {
    const control = new IronlineStudioControl({
      connectors: [fakeConnector],
      mcpService: createReadyMcpService() as any,
    });

    const connectors = await control.listConnectors();
    expect(connectors).toEqual([
      {
        id: "fake",
        label: "Fake",
        capabilities: ["test.read"],
        status: {
          state: "ready",
          detail: "ok",
          lastCheckedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        },
      },
    ]);
  });

  test("exposes page-oriented reads for runs, jobs, and studio config", async () => {
    const control = new IronlineStudioControl({
      runStore: new StudioRunStore(),
      connectors: [fakeConnector],
      mcpService: createReadyMcpService() as any,
      agentExecutor: async (_payload, request) => ({
        ...createResult(request.input),
        id: request.id!,
        request: request as RunResult["request"],
      }),
    });

    const result = await control.runAgent({
      trigger: "manual",
      channel: "imessage",
      input: "detail me",
    });

    const job = await control.scheduleCallback({
      id: "job-1",
      jobType: "follow-up",
      executeAt: new Date("2026-01-01T00:05:00.000Z").toISOString(),
      payload: { input: "later" },
    });

    const config = await control.getStudioConfig();

    expect((await control.listRuns(10)).some((run) => run.id === result.id)).toBe(true);
    expect((await control.getRun(result.id))?.output).toBe("echo:detail me");
    expect((await control.listJobs(10)).some((item) => item.id === job.id)).toBe(true);
    expect((await control.getJob(job.id))?.jobType).toBe("follow-up");
    expect(config.agents[0]?.id).toBeTruthy();
    expect(Array.isArray(config.approvalRules)).toBe(true);
  });

  test("runs sandbox variants without replacing the published live variant", async () => {
    const promptGraphStore = new PromptGraphStore("amanda-core");
    const sandboxVariant = await promptGraphStore.createVariant({
      name: "Sandbox Variant",
      nodes: [
        {
          type: "core",
          title: "Sandbox Core",
          content: "Use the sandbox instructions for testing.",
          enabled: true,
        },
      ],
    });
    const capturedInstructions: string[] = [];

    const control = new IronlineStudioControl({
      runStore: new StudioRunStore(),
      promptGraphStore,
      connectors: [fakeConnector],
      mcpService: createReadyMcpService() as any,
      agentExecutor: async (_payload, request, promptExecution) => {
        capturedInstructions.push(promptExecution?.compiledInstructions ?? "");
        return {
          ...createResult(request.input),
          id: request.id!,
          request: request as RunResult["request"],
          promptSource: promptExecution?.promptSource,
          artifacts: [
            {
              kind: "prompt",
              label: "Compiled instructions",
              content: promptExecution?.compiledInstructions ?? "",
            },
          ],
        };
      },
    });

    const sandbox = await control.runSandboxVariantTest({
      variantId: sandboxVariant.id,
      runRequest: {
        trigger: "manual",
        channel: "imessage",
        input: "sandbox run",
      },
    });
    const live = await control.runAgent({
      trigger: "manual",
      channel: "imessage",
      input: "published run",
    });

    expect(sandbox.promptSource?.variantId).toBe(sandboxVariant.id);
    expect(sandbox.promptSource?.sourceMode).toBe("sandbox");
    expect(live.promptSource?.sourceMode).toBe("published");
    expect(live.promptSource?.variantId).not.toBe(sandboxVariant.id);
    expect(capturedInstructions[0]).toContain("sandbox instructions");
    expect(capturedInstructions[1]).toContain("You are Amanda");
  });

  test("blocks manual runs when the remote LanceDB MCP is not ready", async () => {
    const control = new IronlineStudioControl({
      runStore: new StudioRunStore(),
      connectors: [fakeConnector],
      mcpService: {
        async getOverview(targetId: string) {
          return {
            target: {
              id: targetId,
              label: "Amanda LanceDB Context MCP",
              kind: "remote",
              baseUrl: null,
              configured: false,
              authMode: "env_bearer",
              auth: {
                kind: "bearer",
                headerName: "Authorization",
                envVarNames: ["LANCE_DB_DEFAULT_API_KEY"],
              },
              capabilities: [],
              requiredTools: ["memory_store"],
              requiredForRuntime: true,
            },
            status: {
              state: "degraded",
              detail: "Set AMANDA_LANCEDB_CONTEXT_MCP_URL to enable the remote LanceDB Context MCP.",
              lastCheckedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
            },
            configured: false,
            authConfigured: false,
            availableTools: [],
            missingRequiredTools: ["memory_store"],
            failedStage: "configuration",
            serverVersion: null,
            instructions: null,
            serverCapabilities: null,
          };
        },
        listTargets() {
          return [];
        },
      } as any,
      agentExecutor: async () => {
        throw new Error("should not execute");
      },
    });

    await expect(
      control.runAgent({
        trigger: "manual",
        channel: "imessage",
        input: "ping",
      })
    ).rejects.toThrow("Amanda cannot start because required MCPs are not ready");
  });

  test("blocks live iMessage runs when the local iMessage MCP is not ready", async () => {
    const control = new IronlineStudioControl({
      runStore: new StudioRunStore(),
      connectors: [fakeConnector],
      mcpService: {
        async getOverview(targetId: string) {
          const failedLocalIMessage = targetId === MCP_TARGET_IDS.localIMessage;
          return {
            target: {
              id: targetId,
              label: failedLocalIMessage ? "Local iMessage MCP" : "Amanda LanceDB Context MCP",
              kind: failedLocalIMessage ? "local" : "remote",
              baseUrl: "https://example.invalid/mcp",
              configured: true,
              authMode: "env_bearer",
              auth: {
                kind: "bearer",
                headerName: "Authorization",
                envVarNames: ["TEST_TOKEN"],
              },
              capabilities: [],
              requiredTools: [],
              requiredForRuntime: true,
            },
            status: {
              state: failedLocalIMessage ? "offline" : "ready",
              detail: failedLocalIMessage ? "Connection refused" : "ok",
              lastCheckedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
            },
            configured: true,
            authConfigured: true,
            availableTools: [],
            missingRequiredTools: [],
            failedStage: failedLocalIMessage ? "connect" : null,
            serverVersion: null,
            instructions: null,
            serverCapabilities: null,
          };
        },
        listTargets() {
          return [];
        },
      } as any,
      agentExecutor: async () => {
        throw new Error("should not execute");
      },
    });

    await expect(
      control.runAgent({
        trigger: "imessage",
        channel: "imessage",
        input: "ping",
      })
    ).rejects.toThrow("Local iMessage MCP");
  });
});
