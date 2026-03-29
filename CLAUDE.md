# ironline-amanda — Project Context

## What This Is
Amanda's agent core and iMessage poller. Connects to `ironline-imessage-mcp` (and future MCPs) via HTTP to read/send iMessages and manage memory.

## Related Repos
- **ironline-imessage-mcp** — iMessage MCP server (tools, db, applescript). Must be running for agent to work.
- **ironline-gmail-mcp** — Gmail channel (not yet built)
- **ironline-context-mcp** — Vector/memory layer (not yet built)

## File Structure
```
poller.ts          — iMessage polling loop (5s, GUID dedup, iMessage-only)
src/agent.ts       — OpenAI Agents SDK (gpt-5.4-nano), history, image vision
src/seen.ts        — GUID deduplication (~/.ironline/seen.json)
src/db.ts          — chat.db SQLite (shared copy — agent reads history directly)
src/applescript.ts — macOS automation (shared copy — fallback send + read receipts)
context.md         — Ironline ground-truth facts injected into every agent prompt
launchagents/      — poller LaunchAgent only
```

## Running
```bash
# Install LaunchAgent (auto-start + bun --watch hot reload)
bash launchagents/install.sh

# Manual
bun --watch poller.ts

# Logs
tail -f ~/Library/Logs/ironline/poller.log
tail -f ~/Library/Logs/ironline/poller.error.log
```

## Environment Variables
- `AUTH_TOKEN` — bearer token for iMessage MCP server
- `OPENAI_API_KEY_AMANDA_IRONLINE_AGENT` — OpenAI key (loaded from ~/.bashrc by install.sh)
- `MCP_URL` — iMessage MCP endpoint (default: http://localhost:3000/imessage/mcp)

## Key Design Decisions
- **Time-window polling** — polls last 10s of messages, not `is_read`. Catches all messages regardless of read state.
- **iMessage only** — SMS filtered out in poller (AppleScript SMS relay unreliable, see ironline-imessage-mcp#1)
- **History in context** — last 50 messages injected into agent prompt on every call
- **Image support** — HEIC converted to JPEG via `sips`, base64 encoded into `input_image` context
- **Fallback send** — if agent produces `finalOutput` without calling `send_message`, auto-sends it
- **Read receipts** — opens chat via `imessage://` URL + Cmd+] navigation to force receipt
- **Memory** — agent reads/writes `~/.ironline/memory/<key>.md` via MCP tools in ironline-imessage-mcp
- **Context** — `context.md` loaded fresh on every agent call (edit without restart)

## Amanda's Persona
Amanda is an AI operations agent for Ironline — not a chatbot. She classifies → gathers context → decides → acts. She uses `send_message` (never text output) to reply. Privacy: sender-scoped only, no cross-contact data leakage.

## Ironline / Amanda Context
- **Ironline**: https://ironline.app
- **Amanda**: AI operations agent (this repo)
- Currently powered by OpenAI (gpt-5.4-nano)

## Dev Notes
- `bun --watch` restarts poller on any file change — no manual reloads needed
- `context.md` is the editable ground-truth for Ironline facts Amanda can state
- Shared files (`src/db.ts`, `src/applescript.ts`) are duplicated from ironline-imessage-mcp intentionally — owned separately per repo
