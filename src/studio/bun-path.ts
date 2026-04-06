import { homedir } from "node:os";
import { join } from "node:path";

export function getBunBinary(): string {
  return process.env.BUN_BIN ?? join(homedir(), ".bun", "bin", "bun");
}
