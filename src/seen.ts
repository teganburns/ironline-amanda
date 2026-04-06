/**
 * Tracks which message GUIDs the poller has already processed.
 * Persisted to ~/.ironline/seen.json so restarts don't reprocess old messages.
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatJsonDocument } from "./studio/json";

const STATE_DIR = join(homedir(), ".ironline");
const STATE_FILE = join(STATE_DIR, "seen.json");
const MAX_SEEN = 10_000; // cap to avoid unbounded growth

function ensureDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function loadSeen(): Set<string> {
  ensureDir();
  try {
    const raw = readFileSync(STATE_FILE, "utf-8");
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export async function markSeen(seen: Set<string>, guids: string[]): Promise<void> {
  for (const g of guids) seen.add(g);
  // Trim oldest entries if over cap
  if (seen.size > MAX_SEEN) {
    const entries = [...seen];
    const trimmed = entries.slice(entries.length - MAX_SEEN);
    seen.clear();
    for (const e of trimmed) seen.add(e);
  }
  ensureDir();
  await writeFile(STATE_FILE, await formatJsonDocument([...seen]), "utf-8");
}
