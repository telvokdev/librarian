#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { LibrarianError } from './library/errors.js';
import { briefTool } from './tools/brief.js';
import { recordTool } from './tools/record.js';
import { adoptTool } from './tools/adopt.js';
import { markHitTool } from './tools/mark-hit.js';
import { importMemoriesTool } from './tools/import-memories.js';
import { rebuildIndexTool } from './tools/rebuild-index.js';
import { authTool } from './tools/auth.js';
import { librarySearchTool } from './tools/library-search.js';
import { libraryBuyTool } from './tools/library-buy.js';
import { libraryDownloadTool } from './tools/library-download.js';
import { libraryPublishTool } from './tools/library-publish.js';
import { myBooksTool } from './tools/my-books.js';
import { syncTool } from './tools/sync.js';
import { sellerAnalyticsTool } from './tools/seller-analytics.js';
import { rateBookTool } from './tools/rate-book.js';
import { helpTool } from './tools/help.js';
import { feedbackTool } from './tools/feedback.js';
import { bountyCreateTool } from './tools/bounty-create.js';
import { bountyListTool } from './tools/bounty-list.js';
import { bountyClaimTool } from './tools/bounty-claim.js';
import { bountySubmitTool } from './tools/bounty-submit.js';
import { myBountiesTool } from './tools/my-bounties.js';
import { deleteTool } from './tools/delete.js';
import { unsubscribeTool } from './tools/unsubscribe.js';
import { auditTool } from './tools/audit.js';

// ---------------------------------------------------------------------------
// Tool group definitions
// ---------------------------------------------------------------------------
// core       — local knowledge management (works offline)
// marketplace — cloud features requiring auth + Telvok API
// both       — needed by both groups (e.g. auth, help, feedback)
// ---------------------------------------------------------------------------
type ToolGroup = 'core' | 'marketplace' | 'both';

interface ToolEntry {
  tool: {
    name: string;
    title?: string;
    description: string;
    inputSchema: unknown;
    outputSchema?: unknown;
    handler: (args?: unknown) => Promise<unknown>;
  };
  group: ToolGroup;
}

const allTools: ToolEntry[] = [
  // Core tools — local knowledge management
  { tool: briefTool,          group: 'core' },
  { tool: recordTool,         group: 'core' },
  { tool: adoptTool,          group: 'core' },
  { tool: markHitTool,        group: 'core' },
  { tool: importMemoriesTool, group: 'core' },
  { tool: rebuildIndexTool,   group: 'core' },
  { tool: deleteTool,         group: 'core' },
  { tool: auditTool,          group: 'core' },

  // Marketplace tools — cloud features
  { tool: librarySearchTool,   group: 'marketplace' },
  { tool: libraryBuyTool,      group: 'marketplace' },
  { tool: libraryDownloadTool, group: 'marketplace' },
  { tool: libraryPublishTool,  group: 'marketplace' },
  { tool: myBooksTool,         group: 'marketplace' },
  { tool: syncTool,            group: 'marketplace' },
  { tool: sellerAnalyticsTool, group: 'marketplace' },
  { tool: rateBookTool,        group: 'marketplace' },
  { tool: bountyCreateTool,    group: 'marketplace' },
  { tool: bountyListTool,      group: 'marketplace' },
  { tool: bountyClaimTool,     group: 'marketplace' },
  { tool: bountySubmitTool,    group: 'marketplace' },
  { tool: myBountiesTool,      group: 'marketplace' },
  { tool: unsubscribeTool,     group: 'marketplace' },

  // Both — shared across core and marketplace
  { tool: authTool,     group: 'both' },
  { tool: helpTool,     group: 'both' },
  { tool: feedbackTool, group: 'both' },
];

// ---------------------------------------------------------------------------
// Parse --server arg
// ---------------------------------------------------------------------------
type ServerMode = 'all' | 'core' | 'marketplace';

function parseServerMode(): ServerMode {
  const serverArg = process.argv.find(a => a.startsWith('--server='));
  if (!serverArg) return 'all';
  const mode = serverArg.split('=')[1];
  if (mode === 'core' || mode === 'marketplace') return mode;
  console.error(`Unknown --server mode: "${mode}". Valid: core, marketplace. Defaulting to all.`);
  return 'all';
}

const serverMode = parseServerMode();

function isToolIncluded(entry: ToolEntry): boolean {
  if (serverMode === 'all') return true;
  return entry.group === serverMode || entry.group === 'both';
}

const enabledTools = allTools.filter(isToolIncluded);

// Build lookup map for call handler
const toolMap = new Map<string, ToolEntry['tool']>();
for (const entry of enabledTools) {
  toolMap.set(entry.tool.name, entry.tool);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new Server(
  {
    name: 'librarian',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: enabledTools.map(({ tool }) => {
      const entry: Record<string, unknown> = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };
      if (tool.title) entry.title = tool.title;
      if (tool.outputSchema) entry.outputSchema = tool.outputSchema;
      return entry;
    }),
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const tool = toolMap.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await tool.handler(args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    // Handle LibrarianError with error codes
    if (error instanceof LibrarianError) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(error.toJSON()),
          },
        ],
        isError: true,
      };
    }

    // Handle generic errors
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
