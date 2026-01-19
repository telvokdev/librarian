#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
    tools: [
      {
        name: briefTool.name,
        description: briefTool.description,
        inputSchema: briefTool.inputSchema,
      },
      {
        name: recordTool.name,
        description: recordTool.description,
        inputSchema: recordTool.inputSchema,
      },
      {
        name: adoptTool.name,
        description: adoptTool.description,
        inputSchema: adoptTool.inputSchema,
      },
      {
        name: markHitTool.name,
        description: markHitTool.description,
        inputSchema: markHitTool.inputSchema,
      },
      {
        name: importMemoriesTool.name,
        description: importMemoriesTool.description,
        inputSchema: importMemoriesTool.inputSchema,
      },
      {
        name: rebuildIndexTool.name,
        description: rebuildIndexTool.description,
        inputSchema: rebuildIndexTool.inputSchema,
      },
      {
        name: authTool.name,
        description: authTool.description,
        inputSchema: authTool.inputSchema,
      },
      {
        name: librarySearchTool.name,
        description: librarySearchTool.description,
        inputSchema: librarySearchTool.inputSchema,
      },
      {
        name: libraryBuyTool.name,
        description: libraryBuyTool.description,
        inputSchema: libraryBuyTool.inputSchema,
      },
      {
        name: libraryDownloadTool.name,
        description: libraryDownloadTool.description,
        inputSchema: libraryDownloadTool.inputSchema,
      },
      {
        name: libraryPublishTool.name,
        description: libraryPublishTool.description,
        inputSchema: libraryPublishTool.inputSchema,
      },
      {
        name: myBooksTool.name,
        description: myBooksTool.description,
        inputSchema: myBooksTool.inputSchema,
      },
      {
        name: syncTool.name,
        description: syncTool.description,
        inputSchema: syncTool.inputSchema,
      },
      {
        name: sellerAnalyticsTool.name,
        description: sellerAnalyticsTool.description,
        inputSchema: sellerAnalyticsTool.inputSchema,
      },
      {
        name: rateBookTool.name,
        description: rateBookTool.description,
        inputSchema: rateBookTool.inputSchema,
      },
      {
        name: helpTool.name,
        description: helpTool.description,
        inputSchema: helpTool.inputSchema,
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'brief':
        result = await briefTool.handler(args);
        break;
      case 'record':
        result = await recordTool.handler(args);
        break;
      case 'adopt':
        result = await adoptTool.handler(args);
        break;
      case 'mark_hit':
        result = await markHitTool.handler(args);
        break;
      case 'import_memories':
        result = await importMemoriesTool.handler(args);
        break;
      case 'rebuild_index':
        result = await rebuildIndexTool.handler(args);
        break;
      case 'auth':
        result = await authTool.handler(args);
        break;
      case 'library_search':
        result = await librarySearchTool.handler(args);
        break;
      case 'library_buy':
        result = await libraryBuyTool.handler(args);
        break;
      case 'library_download':
        result = await libraryDownloadTool.handler(args);
        break;
      case 'library_publish':
        result = await libraryPublishTool.handler(args);
        break;
      case 'my_books':
        result = await myBooksTool.handler(args);
        break;
      case 'sync':
        result = await syncTool.handler(args);
        break;
      case 'seller_analytics':
        result = await sellerAnalyticsTool.handler();
        break;
      case 'rate_book':
        result = await rateBookTool.handler(args);
        break;
      case 'help':
        result = await helpTool.handler(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
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
