import { checkMiniappTool } from './check-miniapp'
import { createMiniappTool } from './create-miniapp'
import { deleteMiniappTool } from './delete-miniapp'
import { editMiniappFileTool } from './edit-miniapp-file'
import { getMiniappTool } from './get-miniapp'
import { getMiniappGuideTool } from './get-miniapp-guide'
import { listMiniappsTool } from './list-miniapps'
import { fail } from './result'
import { toggleMiniappTool } from './toggle-miniapp'
import type { ToolModule } from './types'
import { updateMiniappTool } from './update-miniapp'
import { writeMiniappFileTool } from './write-miniapp-file'

// ─── Tool Registry ───────────────────────────────────────────────────────────

const toolModules: ToolModule[] = [
  listMiniappsTool,
  getMiniappTool,
  createMiniappTool,
  editMiniappFileTool,
  writeMiniappFileTool,
  updateMiniappTool,
  deleteMiniappTool,
  toggleMiniappTool,
  checkMiniappTool,
  getMiniappGuideTool,
]

const handlerMap = new Map(toolModules.map((t) => [t.definition.name, t.handler]))

/** All tool definitions for MCP ListTools */
export const TOOLS = toolModules.map((t) => t.definition)

/** Route a tool call to the correct handler */
export async function handleTool(name: string, args: any): Promise<string> {
  const handler = handlerMap.get(name)
  if (!handler) {
    fail(`Unknown tool: ${name}`)
  }
  return handler(args)
}
