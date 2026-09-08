import { MINIAPP_GUIDE } from './guide'
import { READ_ONLY, type ToolModule } from './types'

export const getMiniappGuideTool: ToolModule = {
  definition: {
    name: 'get_miniapp_guide',
    description:
      'Get the Mini App development guide (v3). Call once before writing or changing code. Spacing and layout rules changed in v3: do not reuse a v2 copy from earlier in the conversation.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
    annotations: READ_ONLY,
  },

  handler: async () => {
    return MINIAPP_GUIDE
  },
}
