#!/usr/bin/env node
/**
 * HustlyTasker MCP Server — main entry point.
 *
 * Exposes task-management tools over the Model Context Protocol
 * via stdio transport.  All console output goes to stderr so
 * stdout stays clean for the JSON-RPC wire format.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { registerTaskCrudTools } from './tools/task-crud.js'
import { registerTaskStatusTools } from './tools/task-status.js'
import { registerTaskAssignTools } from './tools/task-assign.js'
import { registerMarketplaceTools } from './tools/marketplace.js'
import { registerQueryTools } from './tools/queries.js'
import { registerBulkOpsTools } from './tools/bulk-ops.js'

// ---------------------------------------------------------------------------
// Server instance
// ---------------------------------------------------------------------------
const server = new McpServer({
    name: 'hustly-tasker',
    version: '1.0.0',
})

// ---------------------------------------------------------------------------
// Tool registration — each module calls server.tool() internally
// ---------------------------------------------------------------------------
registerTaskCrudTools(server)
registerTaskStatusTools(server)
registerTaskAssignTools(server)
registerMarketplaceTools(server)
registerQueryTools(server)
registerBulkOpsTools(server)

// ---------------------------------------------------------------------------
// Transport & startup
// ---------------------------------------------------------------------------
async function main() {
    const transport = new StdioServerTransport()

    // stderr only — stdout is reserved for MCP protocol messages
    console.error('[hustly-tasker] Starting MCP server v1.0.0 ...')
    console.error('[hustly-tasker] Profile ID :', process.env.MCP_PROFILE_ID ?? '(not set)')
    console.error('[hustly-tasker] Workspace whitelist:', process.env.MCP_WORKSPACE_IDS || '(all)')
    console.error('[hustly-tasker] Transport : stdio')

    await server.connect(transport)
    console.error('[hustly-tasker] Server connected and ready.')
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function shutdown(signal: string) {
    console.error(`[hustly-tasker] Received ${signal}, shutting down ...`)
    try {
        await server.close()
        console.error('[hustly-tasker] Server closed cleanly.')
    } catch (err) {
        console.error('[hustly-tasker] Error during shutdown:', err)
    }
    process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// Catch unhandled errors so they don't crash the server silently
process.on('uncaughtException', (err) => {
    console.error('[hustly-tasker] Uncaught exception:', err)
})
process.on('unhandledRejection', (reason) => {
    console.error('[hustly-tasker] Unhandled rejection:', reason)
})

main().catch((err) => {
    console.error('[hustly-tasker] Fatal startup error:', err)
    process.exit(1)
})
