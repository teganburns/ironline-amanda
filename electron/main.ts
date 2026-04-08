import electron from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "../src/env";
import { studioIpc } from "../src/studio/ipc";
import { getBunBinary } from "../src/studio/bun-path";

const { app, BrowserWindow, ipcMain } = electron;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

loadProjectEnv(rootDir);
const explicitStudioServerPort = process.env.STUDIO_SERVER_PORT ? Number(process.env.STUDIO_SERVER_PORT) : null;
const AUTO_START_PROCESS_IDS = ["imessage", "browser", "temporal-mcp", "temporal-worker"] as const;
let studioServer: ChildProcessWithoutNullStreams | null = null;
let studioServerPort: number | null = explicitStudioServerPort;
let studioServerReadyPromise: Promise<number> | null = null;
let shuttingDown = false;

async function allocateEphemeralPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a Studio backend port.")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.listen(0, "127.0.0.1");
  });
}

async function waitForStudioServerReady(port: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 7_500) {
    if (studioServer?.exitCode !== null && studioServer?.exitCode !== undefined) {
      throw new Error(`Studio backend exited before becoming ready (code ${studioServer.exitCode})`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/bridge-info`);
      if (response.ok) {
        return;
      }
    } catch {
      // keep retrying while the backend starts
    }

    await new Promise((resolve) => setTimeout(resolve, 125));
  }

  throw new Error(
    explicitStudioServerPort
      ? `Studio backend did not become ready on port ${port}. A stale backend may still be using that port.`
      : `Studio backend did not become ready on port ${port}.`
  );
}

function shutdownStudioServer() {
  if (!studioServer || studioServer.killed) return;
  studioServer.kill("SIGTERM");
  studioServer = null;
  studioServerReadyPromise = null;
}

async function ensureStudioServer() {
  if (studioServerReadyPromise) {
    return studioServerReadyPromise;
  }

  studioServerReadyPromise = (async () => {
    const bunBinary = getBunBinary();
    studioServerPort ??= explicitStudioServerPort ?? (await allocateEphemeralPort());

    studioServer = spawn(bunBinary, ["src/studio/server.ts"], {
      cwd: rootDir,
      env: {
        ...process.env,
        BUN_BIN: bunBinary,
        STUDIO_SERVER_PORT: String(studioServerPort),
      },
      stdio: "pipe",
    });

    studioServer.on("error", (error) => {
      console.error(`[studio-server] spawn failed: ${error.message}`);
    });
    studioServer.stdout.on("data", (chunk) => {
      console.log(`[studio-server] ${chunk.toString("utf-8").trim()}`);
    });
    studioServer.stderr.on("data", (chunk) => {
      console.error(`[studio-server] ${chunk.toString("utf-8").trim()}`);
    });
    studioServer.on("exit", (code) => {
      console.log(`[studio-server] exited with code ${code ?? 0}`);
      studioServer = null;
      studioServerReadyPromise = null;
    });

    await waitForStudioServerReady(studioServerPort);
    return studioServerPort;
  })().catch((error) => {
    studioServerReadyPromise = null;
    throw error;
  });

  return studioServerReadyPromise;
}

async function bridge(path: string, payload?: unknown) {
  const port = await ensureStudioServer();

  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: payload ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    let detail = `Bridge request failed with HTTP ${response.status}`;

    try {
      const body = await response.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        detail = body.error;
      }
    } catch {
      // ignore JSON parse failures and keep the HTTP detail
    }

    throw new Error(detail);
  }

  return response.json();
}

async function autoStartCoreProcesses() {
  for (const id of AUTO_START_PROCESS_IDS) {
    try {
      await bridge(`/processes/${id}/start`, {});
    } catch (error: any) {
      console.error(`[studio-process] auto-start failed for ${id}: ${error?.message ?? String(error)}`);
    }
  }
}

function createWindow() {
  const startupSplashMode = process.env.AMANDA_STARTUP_SPLASH_MODE?.trim();
  const startupSplashMs = process.env.AMANDA_STARTUP_SPLASH_MS?.trim();
  const query: Record<string, string> = {};

  if (startupSplashMode) {
    query.startupSplashMode = startupSplashMode;
  }

  if (startupSplashMs) {
    query.startupSplashMs = startupSplashMs;
  }

  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: "#fcf8ff",
    title: "Amanda",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexPath = join(rootDir, "dist", "studio", "index.html");
  void window.loadFile(indexPath, Object.keys(query).length ? { query } : undefined);

  window.on("close", () => {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdownStudioServer();
    app.quit();
  });
}

ipcMain.handle(studioIpc.snapshot, async () => bridge("/snapshot"));
ipcMain.handle(studioIpc.getBridgeInfo, async () => bridge("/bridge-info"));
ipcMain.handle(studioIpc.listRuns, async (_event, limit?: number) =>
  bridge(`/runs${limit ? `?limit=${limit}` : ""}`)
);
ipcMain.handle(studioIpc.getRun, async (_event, runId: string) => bridge(`/runs/${runId}`));
ipcMain.handle(studioIpc.listJobs, async (_event, limit?: number) =>
  bridge(`/jobs${limit ? `?limit=${limit}` : ""}`)
);
ipcMain.handle(studioIpc.getJob, async (_event, jobId: string) => bridge(`/jobs/${jobId}`));
ipcMain.handle(studioIpc.getStudioConfig, async () => bridge("/studio-config"));
ipcMain.handle(studioIpc.listPromptGraphVariants, async () => bridge("/prompt-graphs"));
ipcMain.handle(studioIpc.getPromptGraphVariant, async (_event, variantId: string) =>
  bridge(`/prompt-graphs/${variantId}`)
);
ipcMain.handle(studioIpc.createPromptGraphVariant, async (_event, input) => bridge("/prompt-graphs", input));
ipcMain.handle(studioIpc.updatePromptGraphVariant, async (_event, variantId: string, patch) =>
  bridge(`/prompt-graphs/${variantId}`, patch)
);
ipcMain.handle(studioIpc.deletePromptGraphVariant, async (_event, variantId: string) =>
  bridge(`/prompt-graphs/${variantId}/delete`, {})
);
ipcMain.handle(studioIpc.publishPromptGraphVariant, async (_event, variantId: string) =>
  bridge(`/prompt-graphs/${variantId}/publish`, {})
);
ipcMain.handle(studioIpc.createPromptGraphNode, async (_event, variantId: string, input) =>
  bridge(`/prompt-graphs/${variantId}/nodes`, input)
);
ipcMain.handle(studioIpc.updatePromptGraphNode, async (_event, variantId: string, nodeId: string, patch) =>
  bridge(`/prompt-graphs/${variantId}/nodes/${nodeId}`, patch)
);
ipcMain.handle(studioIpc.deletePromptGraphNode, async (_event, variantId: string, nodeId: string) =>
  bridge(`/prompt-graphs/${variantId}/nodes/${nodeId}/delete`, {})
);
ipcMain.handle(studioIpc.reorderPromptGraphNodes, async (_event, variantId: string, orderedNodeIds: string[]) =>
  bridge(`/prompt-graphs/${variantId}/nodes/reorder`, { orderedNodeIds })
);
ipcMain.handle(studioIpc.compilePromptGraphVariant, async (_event, variantId: string) =>
  bridge(`/prompt-graphs/${variantId}/compile`, {})
);
ipcMain.handle(studioIpc.runSandboxVariantTest, async (_event, request) =>
  bridge("/prompt-graphs/sandbox-run", request)
);
ipcMain.handle(studioIpc.listMcpTargets, async () => bridge("/mcp/targets"));
ipcMain.handle(studioIpc.getMcpOverview, async (_event, targetId: string) =>
  bridge(`/mcp/targets/${targetId}/overview`)
);
ipcMain.handle(studioIpc.listMcpTools, async (_event, targetId: string) =>
  bridge(`/mcp/targets/${targetId}/tools`)
);
ipcMain.handle(studioIpc.listMcpResources, async (_event, targetId: string) =>
  bridge(`/mcp/targets/${targetId}/resources`)
);
ipcMain.handle(studioIpc.readMcpResource, async (_event, targetId: string, uri: string) =>
  bridge(`/mcp/targets/${targetId}/resources/read`, { uri })
);
ipcMain.handle(studioIpc.listMcpPrompts, async (_event, targetId: string) =>
  bridge(`/mcp/targets/${targetId}/prompts`)
);
ipcMain.handle(studioIpc.getMcpPrompt, async (_event, targetId: string, name: string, args?: unknown) =>
  bridge(`/mcp/targets/${targetId}/prompts/get`, { name, args })
);
ipcMain.handle(studioIpc.invokeMcpTool, async (_event, targetId: string, name: string, args?: unknown) =>
  bridge(`/mcp/targets/${targetId}/tools/call`, { name, args })
);
ipcMain.handle(studioIpc.runAgent, async (_event, request) => bridge("/run-agent", request));
ipcMain.handle(studioIpc.replayRun, async (_event, runId: string) => bridge(`/replay-run/${runId}`, {}));
ipcMain.handle(studioIpc.scheduleCallback, async (_event, spec) => bridge("/schedule-callback", spec));
ipcMain.handle(studioIpc.listConnectors, async () => bridge("/connectors"));
ipcMain.handle(studioIpc.setApprovalMode, async (_event, rule) => bridge("/approval-rules", rule));
ipcMain.handle(studioIpc.getRunTimeline, async (_event, runId: string) => bridge(`/run-timeline/${runId}`));
ipcMain.handle(studioIpc.listProcesses, async () => bridge("/processes"));
ipcMain.handle(studioIpc.startProcess, async (_event, id: string) => bridge(`/processes/${id}/start`, {}));
ipcMain.handle(studioIpc.stopProcess, async (_event, id: string) => bridge(`/processes/${id}/stop`, {}));
ipcMain.handle(studioIpc.quitApp, () => { app.quit(); });
ipcMain.handle(studioIpc.restartApp, () => { app.relaunch(); app.quit(); });
ipcMain.handle(studioIpc.rebuildAndRestart, async () => {
  const bunBinary = getBunBinary();
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bunBinary, ["scripts/build-studio.ts"], { cwd: rootDir, stdio: "pipe" });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build failed with exit code ${code}`));
    });
    proc.on("error", reject);
  });
  app.relaunch();
  app.quit();
});
ipcMain.handle(studioIpc.listFlowGraphs, async () => bridge("/flow-graphs"));
ipcMain.handle(studioIpc.getFlowGraph, async (_event, id: string) => bridge(`/flow-graphs/${id}`));
ipcMain.handle(studioIpc.createFlowGraph, async (_event, input) => bridge("/flow-graphs", input));
ipcMain.handle(studioIpc.updateFlowGraph, async (_event, id: string, patch) => bridge(`/flow-graphs/${id}`, patch));
ipcMain.handle(studioIpc.deleteFlowGraph, async (_event, id: string) => bridge(`/flow-graphs/${id}/delete`, {}));

app.whenReady().then(() => {
  createWindow();
  void ensureStudioServer().catch((error: any) => {
    console.error(`[studio-server] bootstrap failed: ${error?.message ?? String(error)}`);
  });
  void autoStartCoreProcesses();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  shuttingDown = true;
  shutdownStudioServer();
});

app.on("window-all-closed", () => {
  shuttingDown = true;
  shutdownStudioServer();
  app.quit();
});
