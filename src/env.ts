import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

function normalizeValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const inner = trimmed.slice(1, -1);
    return trimmed.startsWith('"') ? inner.replace(/\\n/g, "\n") : inner;
  }

  const commentIndex = trimmed.indexOf(" #");
  if (commentIndex >= 0) {
    return trimmed.slice(0, commentIndex).trim();
  }

  return trimmed;
}

export function loadProjectEnv(rootDir = join(import.meta.dir, "..")) {
  if (loaded) return;

  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) {
    loaded = true;
    return;
  }

  const source = readFileSync(envPath, "utf-8");

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    const rawValue = normalized.slice(separatorIndex + 1);
    process.env[key] = normalizeValue(rawValue);
  }

  loaded = true;
}
