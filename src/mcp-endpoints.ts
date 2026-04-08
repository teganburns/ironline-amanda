function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveAmandaMcpUrl(pathname: string): string {
  const baseUrl = trimTrailingSlash(readEnv("AMANDA_MCP_BASE_URL") ?? "https://mcp.ironline.app");
  return new URL(pathname, `${baseUrl}/`).toString();
}

export function getAmandaMcpBaseUrl(): string {
  return readEnv("AMANDA_MCP_BASE_URL") ?? "https://mcp.ironline.app";
}

export function getTemporalLocalMcpUrl(): string {
  return readEnv("TEMPORAL_MCP_URL") ?? "http://localhost:3002/temporal/mcp";
}

export function getBrowserLocalMcpUrl(): string {
  return readEnv("BROWSER_MCP_URL") ?? "http://localhost:3003/browser/mcp";
}

export function getIMessageLocalMcpUrl(): string {
  return readEnv("IMESSAGE_MCP_URL") ?? readEnv("MCP_URL") ?? "http://localhost:3000/imessage/mcp";
}

export function getLanceDbContextLocalMcpUrl(): string {
  return (
    readEnv("LANCEDB_CONTEXT_MCP_URL") ??
    readEnv("LANCEDB_MCP_URL") ??
    readEnv("CONTEXT_MCP_URL") ??
    "http://localhost:3001/context/mcp"
  );
}

export function getAmandaIMessageMcpUrl(): string {
  return readEnv("AMANDA_IMESSAGE_MCP_URL") ?? resolveAmandaMcpUrl("/imessage/mcp");
}

export function getAmandaLanceDbContextMcpUrl(): string | null {
  return (
    readEnv("AMANDA_LANCEDB_CONTEXT_MCP_URL") ??
    readEnv("AMANDA_LANCEDB_MCP_URL") ??
    null
  );
}

export function hasExplicitAmandaLanceDbContextMcpUrl(): boolean {
  return Boolean(getAmandaLanceDbContextMcpUrl());
}

export function getAmandaMcpToken(): string | undefined {
  return readEnv("AMANDA_MCP_TOKEN") ?? readEnv("AUTH_TOKEN");
}

export function getAmandaLanceDbContextBearer(): string | undefined {
  return readEnv("LANCE_DB_DEFAULT_API_KEY");
}
