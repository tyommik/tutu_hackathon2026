const MCP_URL = process.env.TUTU_MCP_URL ?? "https://mcp.tutu.ru/mcp";

export class McpError extends Error {
  constructor(message: string, readonly tool: string) {
    super(message);
    this.name = "McpError";
  }
}

interface JsonRpcResponse {
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: { code: number; message: string };
}

/**
 * Session-less вызов инструмента Tutu MCP (streamable HTTP).
 * Сервер не требует initialize-handshake для tools/call — проверено живьём.
 */
export async function callTool<T = unknown>(
  tool: string,
  args: Record<string, unknown>,
  { timeoutMs = 90_000 }: { timeoutMs?: number } = {},
): Promise<T> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new McpError(`HTTP ${res.status}`, tool);

  const rpc = (await res.json()) as JsonRpcResponse;
  if (rpc.error) throw new McpError(rpc.error.message, tool);

  const text = rpc.result?.content?.[0]?.text ?? "";
  if (rpc.result?.isError) throw new McpError(text.slice(0, 500), tool);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new McpError(`не-JSON ответ: ${text.slice(0, 200)}`, tool);
  }
}
