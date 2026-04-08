import { join } from "node:path";
import { loadProjectEnv } from "../env";
import { IronlineStudioControl } from "./control";
import { StudioProcessManager } from "./process-manager";

loadProjectEnv();

const PORT = Number(process.env.STUDIO_SERVER_PORT ?? 4318);
const control = new IronlineStudioControl();
const processManager = new StudioProcessManager(join(import.meta.dir, "..", ".."));

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function errorResponse(error: any) {
  const message = error?.message ?? String(error);
  const code = error?.code ?? "internal_error";
  const issues = Array.isArray(error?.issues) ? error.issues : undefined;
  const status = code === "runtime_readiness" ? 503 : 500;
  return json({ error: message, code, issues }, status);
}

process.on("SIGTERM", () => {
  processManager.stopAll();
  process.exit(0);
});

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/snapshot") {
        return json(await control.getSnapshot());
      }

      if (request.method === "GET" && url.pathname === "/bridge-info") {
        return json(await control.getBridgeInfo());
      }

      if (request.method === "GET" && url.pathname === "/studio-config") {
        return json(await control.getStudioConfig());
      }

      if (request.method === "GET" && url.pathname === "/mcp/targets") {
        return json(await control.listMcpTargets());
      }

      if (request.method === "GET" && url.pathname.startsWith("/mcp/targets/") && url.pathname.endsWith("/overview")) {
        const targetId = url.pathname.split("/")[3] ?? "";
        return json(await control.getMcpOverview(targetId));
      }

      if (request.method === "GET" && url.pathname.startsWith("/mcp/targets/") && url.pathname.endsWith("/tools")) {
        const targetId = url.pathname.split("/")[3] ?? "";
        return json(await control.listMcpTools(targetId));
      }

      if (request.method === "GET" && url.pathname.startsWith("/mcp/targets/") && url.pathname.endsWith("/resources")) {
        const targetId = url.pathname.split("/")[3] ?? "";
        return json(await control.listMcpResources(targetId));
      }

      if (request.method === "GET" && url.pathname.startsWith("/mcp/targets/") && url.pathname.endsWith("/prompts")) {
        const targetId = url.pathname.split("/")[3] ?? "";
        return json(await control.listMcpPrompts(targetId));
      }

      if (request.method === "GET" && url.pathname === "/flow-graphs") {
        return json(await control.listFlowGraphs());
      }

      if (request.method === "GET" && url.pathname.startsWith("/flow-graphs/")) {
        const graphId = url.pathname.split("/").at(-1) ?? "";
        return json(await control.getFlowGraph(graphId));
      }

      if (request.method === "GET" && url.pathname === "/prompt-graphs") {
        return json(await control.listPromptGraphVariants());
      }

      if (request.method === "GET" && url.pathname.startsWith("/prompt-graphs/")) {
        const variantId = url.pathname.split("/").at(-1) ?? "";
        return json(await control.getPromptGraphVariant(variantId));
      }

      if (request.method === "GET" && url.pathname === "/runs") {
        const limit = Number(url.searchParams.get("limit") ?? 25);
        return json(await control.listRuns(Number.isFinite(limit) ? limit : 25));
      }

      if (request.method === "GET" && url.pathname.startsWith("/runs/")) {
        const runId = url.pathname.split("/").at(-1) ?? "";
        return json(await control.getRun(runId));
      }

      if (request.method === "GET" && url.pathname === "/jobs") {
        const limit = Number(url.searchParams.get("limit") ?? 100);
        return json(await control.listJobs(Number.isFinite(limit) ? limit : 100));
      }

      if (request.method === "GET" && url.pathname.startsWith("/jobs/")) {
        const jobId = url.pathname.split("/").at(-1) ?? "";
        return json(await control.getJob(jobId));
      }

      if (request.method === "GET" && url.pathname === "/connectors") {
        return json(await control.listConnectors());
      }

      if (request.method === "GET" && url.pathname === "/processes") {
        return json(await processManager.listWithHealth());
      }

      if (request.method === "GET" && url.pathname.startsWith("/run-timeline/")) {
        const runId = url.pathname.split("/").at(-1) ?? "";
        return json(await control.getRunTimeline(runId));
      }

      if (request.method === "POST" && url.pathname === "/run-agent") {
        return json(await control.runAgent(await readJson(request)));
      }

      if (request.method === "POST" && url.pathname.startsWith("/replay-run/")) {
        const runId = url.pathname.split("/").at(-1) ?? "";
        return json(await control.replayRun(runId));
      }

      if (request.method === "POST" && url.pathname === "/schedule-callback") {
        return json(await control.scheduleCallback(await readJson(request)));
      }

      if (request.method === "POST" && url.pathname.startsWith("/mcp/targets/") && url.pathname.endsWith("/resources/read")) {
        const targetId = url.pathname.split("/")[3] ?? "";
        const payload = await readJson<{ uri: string }>(request);
        return json(await control.readMcpResource(targetId, payload.uri));
      }

      if (request.method === "POST" && url.pathname.startsWith("/mcp/targets/") && url.pathname.endsWith("/prompts/get")) {
        const targetId = url.pathname.split("/")[3] ?? "";
        const payload = await readJson<{ name: string; args?: Record<string, unknown> }>(request);
        return json(await control.getMcpPrompt(targetId, payload.name, payload.args));
      }

      if (request.method === "POST" && url.pathname.startsWith("/mcp/targets/") && url.pathname.endsWith("/tools/call")) {
        const targetId = url.pathname.split("/")[3] ?? "";
        const payload = await readJson<{ name: string; args?: Record<string, unknown> }>(request);
        return json(await control.invokeMcpTool(targetId, payload.name, payload.args));
      }

      if (request.method === "POST" && url.pathname === "/flow-graphs") {
        return json(await control.createFlowGraph(await readJson(request)));
      }

      if (request.method === "POST" && url.pathname.startsWith("/flow-graphs/") && url.pathname.endsWith("/delete")) {
        const graphId = url.pathname.split("/")[2] ?? "";
        return json(await control.deleteFlowGraph(graphId));
      }

      if (request.method === "POST" && url.pathname.startsWith("/flow-graphs/")) {
        const graphId = url.pathname.split("/")[2] ?? "";
        return json(await control.updateFlowGraph(graphId, await readJson(request)));
      }

      if (request.method === "POST" && url.pathname === "/prompt-graphs") {
        return json(await control.createPromptGraphVariant(await readJson(request)));
      }

      if (request.method === "POST" && url.pathname === "/prompt-graphs/sandbox-run") {
        return json(await control.runSandboxVariantTest(await readJson(request)));
      }

      if (request.method === "POST" && url.pathname.startsWith("/prompt-graphs/") && url.pathname.endsWith("/publish")) {
        const variantId = url.pathname.split("/")[2] ?? "";
        return json(await control.publishPromptGraphVariant(variantId));
      }

      if (request.method === "POST" && url.pathname.startsWith("/prompt-graphs/") && url.pathname.endsWith("/compile")) {
        const variantId = url.pathname.split("/")[2] ?? "";
        return json(await control.compilePromptGraphVariant(variantId));
      }

      if (request.method === "POST" && url.pathname.startsWith("/prompt-graphs/") && url.pathname.endsWith("/nodes/reorder")) {
        const variantId = url.pathname.split("/")[2] ?? "";
        const payload = await readJson<{ orderedNodeIds: string[] }>(request);
        return json(await control.reorderPromptGraphNodes(variantId, payload.orderedNodeIds));
      }

      if (request.method === "POST" && url.pathname.startsWith("/prompt-graphs/") && url.pathname.includes("/nodes/") && url.pathname.endsWith("/delete")) {
        const parts = url.pathname.split("/");
        const variantId = parts[2] ?? "";
        const nodeId = parts[4] ?? "";
        return json(await control.deletePromptGraphNode(variantId, nodeId));
      }

      if (request.method === "POST" && url.pathname.startsWith("/prompt-graphs/") && url.pathname.includes("/nodes/")) {
        const parts = url.pathname.split("/");
        const variantId = parts[2] ?? "";
        const nodeId = parts[4] ?? "";
        return json(await control.updatePromptGraphNode(variantId, nodeId, await readJson(request)));
      }

      if (request.method === "POST" && url.pathname.startsWith("/prompt-graphs/") && url.pathname.endsWith("/nodes")) {
        const variantId = url.pathname.split("/")[2] ?? "";
        return json(await control.createPromptGraphNode(variantId, await readJson(request)));
      }

      if (request.method === "POST" && url.pathname.startsWith("/prompt-graphs/") && url.pathname.endsWith("/delete")) {
        const variantId = url.pathname.split("/")[2] ?? "";
        return json(await control.deletePromptGraphVariant(variantId));
      }

      if (request.method === "POST" && url.pathname.startsWith("/prompt-graphs/")) {
        const variantId = url.pathname.split("/")[2] ?? "";
        return json(await control.updatePromptGraphVariant(variantId, await readJson(request)));
      }

      if (request.method === "POST" && url.pathname === "/approval-rules") {
        return json(await control.setApprovalMode(await readJson(request)));
      }

      if (request.method === "POST" && url.pathname.startsWith("/processes/") && url.pathname.endsWith("/start")) {
        const id = url.pathname.split("/")[2] ?? "";
        return json(processManager.start(id));
      }

      if (request.method === "POST" && url.pathname.startsWith("/processes/") && url.pathname.endsWith("/stop")) {
        const id = url.pathname.split("/")[2] ?? "";
        return json(processManager.stop(id));
      }

      return json({ error: "Not found" }, 404);
    } catch (error: any) {
      return errorResponse(error);
    }
  },
});

console.log(`[studio-server] listening on http://127.0.0.1:${server.port}`);
