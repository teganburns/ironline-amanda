import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, test } from "bun:test";
import { MCP_TARGET_IDS, StudioMcpService, createDefaultMcpTargets, resolveMcpTargetRequestInit } from "./mcp";

const originalAmandaToken = process.env.AMANDA_MCP_TOKEN;
const originalAuthToken = process.env.AUTH_TOKEN;
const originalAmandaBaseUrl = process.env.AMANDA_MCP_BASE_URL;
const originalAmandaContextUrl = process.env.AMANDA_CONTEXT_MCP_URL;
const originalAmandaLanceDbMcpUrl = process.env.AMANDA_LANCEDB_MCP_URL;
const originalAmandaLanceDbContextUrl = process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL;
const originalAmandaIMessageUrl = process.env.AMANDA_IMESSAGE_MCP_URL;
const originalMcpUrl = process.env.MCP_URL;
const originalBrowserMcpUrl = process.env.BROWSER_MCP_URL;
const originalContextMcpUrl = process.env.CONTEXT_MCP_URL;
const originalLanceDbApiKey = process.env.LANCE_DB_DEFAULT_API_KEY;

afterEach(() => {
  process.env.AMANDA_MCP_TOKEN = originalAmandaToken;
  process.env.AUTH_TOKEN = originalAuthToken;
  process.env.AMANDA_MCP_BASE_URL = originalAmandaBaseUrl;
  process.env.AMANDA_CONTEXT_MCP_URL = originalAmandaContextUrl;
  process.env.AMANDA_LANCEDB_MCP_URL = originalAmandaLanceDbMcpUrl;
  process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL = originalAmandaLanceDbContextUrl;
  process.env.AMANDA_IMESSAGE_MCP_URL = originalAmandaIMessageUrl;
  process.env.MCP_URL = originalMcpUrl;
  process.env.BROWSER_MCP_URL = originalBrowserMcpUrl;
  process.env.CONTEXT_MCP_URL = originalContextMcpUrl;
  process.env.LANCE_DB_DEFAULT_API_KEY = originalLanceDbApiKey;
});

function createReadySession(toolNames: string[]) {
  return {
    async ping() {},
    async listTools() {
      return toolNames.map((name) => ({ name }));
    },
    async listResources() {
      return [];
    },
    async listPrompts() {
      return [];
    },
    async readResource() {
      return {};
    },
    async getPrompt() {
      return {};
    },
    async callTool() {
      return {};
    },
    getServerVersion() {
      return {
        name: "context-remote",
        version: "1.0.0",
      };
    },
    getInstructions() {
      return "Remote context MCP";
    },
    getServerCapabilities() {
      return {
        tools: {},
      };
    },
    async close() {},
  };
}

describe("studio mcp helpers", () => {
  test("always includes the remote LanceDB target and marks it unconfigured by default", () => {
    process.env.AMANDA_CONTEXT_MCP_URL = "";
    process.env.AMANDA_LANCEDB_MCP_URL = "";
    process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL = "";
    const targets = createDefaultMcpTargets();
    const remoteTarget = targets.find((target) => target.id === MCP_TARGET_IDS.remoteLanceDb)!;

    expect(remoteTarget).toBeTruthy();
    expect(remoteTarget.configured).toBe(false);
    expect(remoteTarget.baseUrl).toBeNull();
  });

  test("injects remote LanceDB auth from LANCE_DB_DEFAULT_API_KEY", () => {
    process.env.LANCE_DB_DEFAULT_API_KEY = "lancedb-secret";
    process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL = "https://memory.ironline.app/context/mcp";
    const remoteTarget = createDefaultMcpTargets().find((target) => target.id === MCP_TARGET_IDS.remoteLanceDb)!;

    const resolved = resolveMcpTargetRequestInit(remoteTarget);

    expect(resolved.authConfigured).toBe(true);
    expect((resolved.requestInit.headers as Record<string, string>).Authorization).toBe("Bearer lancedb-secret");
  });

  test("reuses AUTH_TOKEN for local iMessage MCP targets", () => {
    process.env.AUTH_TOKEN = "local-secret";
    const localTarget = createDefaultMcpTargets().find((target) => target.id === MCP_TARGET_IDS.localIMessage)!;

    const resolved = resolveMcpTargetRequestInit(localTarget);

    expect(resolved.authConfigured).toBe(true);
    expect((resolved.requestInit.headers as Record<string, string>).Authorization).toBe("Bearer local-secret");
  });

  test("reports missing remote LanceDB configuration before any MCP probe", async () => {
    process.env.AMANDA_CONTEXT_MCP_URL = "";
    process.env.AMANDA_LANCEDB_MCP_URL = "";
    process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL = "";
    process.env.LANCE_DB_DEFAULT_API_KEY = "lancedb-secret";
    const service = new StudioMcpService(createDefaultMcpTargets(), async () => {
      throw new Error("should not connect");
    });

    const overview = await service.getOverview(MCP_TARGET_IDS.remoteLanceDb);

    expect(overview.status.state).toBe("degraded");
    expect(overview.failedStage).toBe("configuration");
    expect(overview.configured).toBe(false);
  });

  test("reports missing remote LanceDB auth before any MCP probe", async () => {
    process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL = "https://memory.ironline.app/context/mcp";
    process.env.LANCE_DB_DEFAULT_API_KEY = "";
    const service = new StudioMcpService(createDefaultMcpTargets(), async () => {
      throw new Error("should not connect");
    });

    const overview = await service.getOverview(MCP_TARGET_IDS.remoteLanceDb);

    expect(overview.status.state).toBe("degraded");
    expect(overview.failedStage).toBe("authentication");
    expect(overview.authConfigured).toBe(false);
  });

  test("reports unauthorized remote LanceDB probes honestly", async () => {
    process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL = "https://memory.ironline.app/context/mcp";
    process.env.LANCE_DB_DEFAULT_API_KEY = "bad-secret";
    const service = new StudioMcpService(
      createDefaultMcpTargets(),
      async () => Promise.reject(new StreamableHTTPError(401, "Unauthorized"))
    );

    const overview = await service.getOverview(MCP_TARGET_IDS.remoteLanceDb);

    expect(overview.status.state).toBe("degraded");
    expect(overview.failedStage).toBe("authentication");
  });

  test("marks remote LanceDB ready only when strict probe and required tools succeed", async () => {
    process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL = "https://memory.ironline.app/context/mcp";
    process.env.LANCE_DB_DEFAULT_API_KEY = "good-secret";
    const service = new StudioMcpService(
      createDefaultMcpTargets(),
      async () => createReadySession(["memory_store", "memory_search", "memory_get_user", "memory_delete"])
    );

    const overview = await service.getOverview(MCP_TARGET_IDS.remoteLanceDb);

    expect(overview.status.state).toBe("ready");
    expect(overview.failedStage).toBeNull();
    expect(overview.missingRequiredTools).toEqual([]);
    expect(overview.availableTools).toEqual([
      "memory_store",
      "memory_search",
      "memory_get_user",
      "memory_delete",
    ]);
  });

  test("marks remote LanceDB degraded when a required tool is missing", async () => {
    process.env.AMANDA_LANCEDB_CONTEXT_MCP_URL = "https://memory.ironline.app/context/mcp";
    process.env.LANCE_DB_DEFAULT_API_KEY = "good-secret";
    const service = new StudioMcpService(
      createDefaultMcpTargets(),
      async () => createReadySession(["memory_store", "memory_search", "memory_get_user"])
    );

    const overview = await service.getOverview(MCP_TARGET_IDS.remoteLanceDb);

    expect(overview.status.state).toBe("degraded");
    expect(overview.failedStage).toBe("required_tools");
    expect(overview.missingRequiredTools).toEqual(["memory_delete"]);
  });

  test("includes the local Temporal MCP target", () => {
    const targets = createDefaultMcpTargets();
    const temporalTarget = targets.find((target) => target.id === MCP_TARGET_IDS.localTemporal);

    expect(temporalTarget?.label).toBe("Local Temporal Reminder MCP");
    expect(temporalTarget?.requiredTools).toEqual(["schedule_reminder"]);
  });

  test("marks the Temporal MCP offline when the cluster is unreachable", async () => {
    process.env.AUTH_TOKEN = "local-secret";
    const service = new StudioMcpService(
      createDefaultMcpTargets(),
      async () => createReadySession(["schedule_reminder"]),
      async () => ({
        configured: true,
        reachable: false,
        detail: "Temporal cluster is unavailable.",
      })
    );

    const overview = await service.getOverview(MCP_TARGET_IDS.localTemporal);

    expect(overview.status.state).toBe("offline");
    expect(overview.failedStage).toBe("connect");
  });

  test("includes the local Browser MCP target", () => {
    const targets = createDefaultMcpTargets();
    const browserTarget = targets.find((target) => target.id === MCP_TARGET_IDS.localBrowser);

    expect(browserTarget?.label).toBe("Local Browser MCP");
    expect(browserTarget?.requiredTools).toEqual([
      "browser_navigate",
      "browser_screenshot",
      "browser_snapshot",
      "browser_click",
      "browser_type",
    ]);
  });

  test("marks the Browser MCP degraded when the extension is disconnected", async () => {
    process.env.AUTH_TOKEN = "local-secret";
    process.env.BROWSER_MCP_URL = "http://localhost:3003/browser/mcp";
    const service = new StudioMcpService(
      createDefaultMcpTargets(),
      async () =>
        createReadySession([
          "browser_navigate",
          "browser_screenshot",
          "browser_snapshot",
          "browser_click",
          "browser_type",
        ]),
      async () => ({
        configured: true,
        reachable: true,
        detail: "Temporal cluster is ready.",
      }),
      async () => ({
        connected: false,
        detail: "Chrome extension is not currently connected to the local browser bridge.",
        lastConnectedAt: null,
        pendingCommandCount: 0,
        lastError: null,
      })
    );

    const overview = await service.getOverview(MCP_TARGET_IDS.localBrowser);

    expect(overview.status.state).toBe("degraded");
    expect(overview.failedStage).toBe("connect");
  });

  test("marks the Browser MCP ready when the extension is connected", async () => {
    process.env.AUTH_TOKEN = "local-secret";
    process.env.BROWSER_MCP_URL = "http://localhost:3003/browser/mcp";
    const service = new StudioMcpService(
      createDefaultMcpTargets(),
      async () =>
        createReadySession([
          "browser_navigate",
          "browser_screenshot",
          "browser_snapshot",
          "browser_click",
          "browser_type",
        ]),
      async () => ({
        configured: true,
        reachable: true,
        detail: "Temporal cluster is ready.",
      }),
      async () => ({
        connected: true,
        detail: "Chrome extension is connected to the local browser bridge.",
        lastConnectedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        pendingCommandCount: 0,
        lastError: null,
      })
    );

    const overview = await service.getOverview(MCP_TARGET_IDS.localBrowser);

    expect(overview.status.state).toBe("ready");
    expect(overview.failedStage).toBeNull();
  });
});
