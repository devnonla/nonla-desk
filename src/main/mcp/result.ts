/** Thrown by MCP tool handlers so CallTool sets isError: true. */

export class McpToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpToolError'
  }
}

export function fail(message: string): never {
  throw new McpToolError(message)
}

export function ok(payload: unknown): string {
  if (typeof payload === 'string') return payload
  return JSON.stringify(payload, null, 2)
}
