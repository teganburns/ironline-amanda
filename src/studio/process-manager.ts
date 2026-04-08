import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { getBunBinary } from "./bun-path";

interface ManagedProcessConfig {
  id: string;
  cwd: string;
  command: string[];
  healthUrl?: string;
}

interface ManagedState {
  config: ManagedProcessConfig;
  process: ChildProcessWithoutNullStreams | null;
  logs: string[];
}

function pushLog(state: ManagedState, chunk: string) {
  state.logs.push(chunk);
  if (state.logs.length > 200) state.logs.shift();
}

export class StudioProcessManager {
  private readonly processes = new Map<string, ManagedState>();
  private readonly bunBinary = getBunBinary();

  constructor(private readonly rootDir: string) {
    const configs: ManagedProcessConfig[] = [
      {
        id: "imessage",
        cwd: join(rootDir, "..", "ironline-imessage-mcp"),
        command: [this.bunBinary, "http.ts"],
        healthUrl: "http://localhost:3000/imessage/mcp",
      },
      {
        id: "context",
        cwd: join(rootDir, "..", "ironline-context-mcp"),
        command: [this.bunBinary, "http.ts"],
        healthUrl: "http://localhost:3001/context/mcp",
      },
      {
        id: "temporal-worker",
        cwd: rootDir,
        command: [this.bunBinary, "src/studio/temporal-worker.ts"],
      },
      {
        id: "temporal-mcp",
        cwd: rootDir,
        command: [this.bunBinary, "src/studio/temporal-mcp.ts"],
        healthUrl: "http://localhost:3002/temporal/mcp",
      },
      {
        id: "browser",
        cwd: join(rootDir, "..", "ironline-browser-mcp"),
        command: [this.bunBinary, "http.ts"],
        healthUrl: "http://localhost:3003/browser/mcp",
      },
    ];

    for (const config of configs) {
      this.processes.set(config.id, {
        config,
        process: null,
        logs: [],
      });
    }
  }

  list() {
    return [...this.processes.values()].map((state) => ({
      id: state.config.id,
      running: state.process !== null && !state.process.killed,
      externallyRunning: false,
      command: state.config.command.join(" "),
      cwd: state.config.cwd,
      logs: state.logs.slice(-20),
    }));
  }

  async listWithHealth() {
    const base = this.list();
    return Promise.all(
      base.map(async (item) => {
        if (item.running) return item;
        const state = this.processes.get(item.id);
        const healthUrl = state?.config.healthUrl;
        if (!healthUrl) return item;
        try {
          await fetch(healthUrl, { signal: AbortSignal.timeout(800) });
          return { ...item, externallyRunning: true };
        } catch {
          return item;
        }
      })
    );
  }

  start(id: string) {
    const state = this.processes.get(id);
    if (!state) throw new Error(`Unknown managed process: ${id}`);
    if (state.process && !state.process.killed) return this.list().find((item) => item.id === id);

    const [command, ...args] = state.config.command;
    const child = spawn(command, args, {
      cwd: state.config.cwd,
      env: {
        ...process.env,
        BUN_BIN: this.bunBinary,
      },
      stdio: "pipe",
    });

    child.on("error", (error) => pushLog(state, `[spawn-error] ${error.message}`));
    child.stdout.on("data", (chunk) => pushLog(state, chunk.toString("utf-8")));
    child.stderr.on("data", (chunk) => pushLog(state, chunk.toString("utf-8")));
    child.on("exit", (code) => pushLog(state, `[exit] ${code ?? 0}`));

    state.process = child;
    return this.list().find((item) => item.id === id);
  }

  stopAll() {
    for (const state of this.processes.values()) {
      state.process?.kill("SIGTERM");
      state.process = null;
    }
  }

  stop(id: string) {
    const state = this.processes.get(id);
    if (!state) throw new Error(`Unknown managed process: ${id}`);
    state.process?.kill("SIGTERM");
    state.process = null;
    return this.list().find((item) => item.id === id);
  }
}
