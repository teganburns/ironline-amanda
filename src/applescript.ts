import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const TIMEOUT = 30_000;

// ── Escape / exec helpers ────────────────────────────────────────────────────

export function escapeAS(str: string): string {
  return str.replace(/[\\\n\r\t"]/g, (c) => {
    if (c === "\\") return "\\\\";
    if (c === '"') return '\\"';
    if (c === "\n") return "\\n";
    if (c === "\r") return "\\r";
    if (c === "\t") return "\\t";
    return c;
  });
}

export async function execAppleScript(script: string): Promise<string> {
  try {
    // Wrap in single-quoted shell arg; escape any embedded single-quotes
    const escaped = script.replace(/'/g, "'\\''");
    const { stdout, stderr: _ } = await execAsync(`osascript -e '${escaped}'`, {
      timeout: TIMEOUT,
      encoding: "utf-8",
    });
    return stdout.trim();
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    if (err?.killed || msg.includes("timeout"))
      throw new Error(`AppleScript timed out (${TIMEOUT}ms)`);
    if (msg.includes("Can't get buddy"))
      throw new Error("Recipient not found — not in iMessage contacts");
    if (msg.includes("Can't send"))
      throw new Error(
        "Send failed — check: Messages is signed in, recipient is valid, network is up"
      );
    throw new Error(`AppleScript error: ${msg}`);
  }
}

// ── Messages.app status ──────────────────────────────────────────────────────

export async function checkMessagesRunning(): Promise<boolean> {
  try {
    await execAsync("pgrep -x Messages", { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// ── Mark chat as read ────────────────────────────────────────────────────────
// Opens the conversation in Messages.app via URL scheme, which marks all
// messages in that chat as read. The sender identifier must be a phone number
// or email (not a chat_id).

export async function markChatRead(sender: string): Promise<void> {
  const encoded = encodeURIComponent(sender);
  // Activate Messages and navigate away briefly (Cmd+]) then back to the
  // target chat. Messages only sends a read receipt when it *switches* to a
  // conversation — reopening the same one doesn't count.
  await execAppleScript(`
tell application "Messages"
  activate
end tell
tell application "System Events"
  tell process "Messages"
    keystroke "]" using command down
    delay 0.4
  end tell
end tell
do shell script "open 'imessage://${encoded}'"
delay 1
  `.trim());
}

// ── Contact lookup ───────────────────────────────────────────────────────────
// Uses JXA (JavaScript for Automation) so we can normalize phone number
// formats before comparing — Contacts may store "+13128344710" as
// "+1 (312) 834-4710" or "312-834-4710" etc.

export async function lookupContact(
  identifier: string
): Promise<string | null> {
  // Escape for embedding in a JS string literal inside the osascript call
  const safeId = identifier.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = `
(function() {
  const app = Application('Contacts');
  const id = "${safeId}";
  const digits = id.replace(/\\D/g, '');
  const last10 = digits.slice(-10);
  const isEmail = id.includes('@');

  for (const person of app.people()) {
    if (isEmail) {
      for (const em of person.emails()) {
        if (em.value() === id) return person.name();
      }
    } else {
      for (const ph of person.phones()) {
        if (ph.value().replace(/\\D/g, '').slice(-10) === last10) return person.name();
      }
    }
  }
  return '';
})()
  `.trim();

  try {
    const escaped = script.replace(/'/g, "'\\''");
    const { stdout } = await execAsync(
      `osascript -l JavaScript -e '${escaped}'`,
      { timeout: 15_000, encoding: "utf-8" }
    );
    const name = stdout.trim();
    return name || null;
  } catch {
    return null;
  }
}
