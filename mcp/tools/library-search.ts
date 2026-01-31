// ============================================================================
// Library Search Tool
// Search for books in the Telvok library
// ============================================================================

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface BookResult {
  slug: string;
  name: string;
  description: string;
  pricing: 'open' | 'one_time' | 'subscription';
  price: string;
  entries: number;
  rating: number | null;
  tags: string[];
  total_hits: number;
}

interface SearchFilters {
  pricing?: 'open' | 'one_time' | 'subscription';
  tags?: string[];
  min_rating?: number;
}

interface SearchArgs {
  query?: string;  // Optional - empty returns all books (browse mode)
  filters?: SearchFilters;
  limit?: number;
}

interface SearchResult {
  books: BookResult[];
  total: number;
  message: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const librarySearchTool = {
  name: 'library_search',
  title: 'Search Marketplace',
  description: `Search Telvok marketplace for knowledge books.

USE THIS TOOL WHEN:
- brief() returns no results and marketplace might have relevant content
- User explicitly asks to find/search marketplace books
- Looking for domain expertise we don't have locally

DO NOT USE when brief() already found useful local entries.

TRIGGER PATTERNS:
- brief() found nothing → library_search({ query: "<same topic>" })
- "Find books about X" → library_search({ query: "X" })
- "What's in the marketplace?" → library_search({})
- "Show free books" → library_search({ filters: { pricing: "open" } })

Filters: pricing ("open"/"one_time"/"subscription"), tags, min_rating (0-5)

Examples:
- library_search({ query: "react hooks" })
- library_search({ filters: { pricing: "open" } })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search terms to find books',
      },
      filters: {
        type: 'object',
        properties: {
          pricing: {
            type: 'string',
            enum: ['open', 'one_time', 'subscription'],
            description: 'Filter by pricing type',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by tags',
          },
          min_rating: {
            type: 'number',
            description: 'Minimum quality rating (0-5)',
          },
        },
        description: 'Optional filters to narrow results',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)',
      },
    },
    required: [],  // Query is optional - empty returns all books (browse mode)
  },

  outputSchema: {
    type: 'object' as const,
    properties: {
      books: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            pricing: { type: 'string', enum: ['open', 'one_time', 'subscription'] },
            price: { type: 'string' },
            entries: { type: 'number' },
            rating: { type: 'number' },
            tags: { type: 'array', items: { type: 'string' } },
            total_hits: { type: 'number' },
          },
        },
      },
      total: { type: 'number' },
      message: { type: 'string' },
    },
    required: ['books', 'total', 'message'],
  },

  async handler(args: unknown): Promise<SearchResult> {
    const { query = '', filters, limit = 10 } = args as SearchArgs;

    try {
      const response = await fetch(`${TELVOK_API_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, filters, limit }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Search failed: HTTP ${response.status}`);
      }

      const data = await response.json();

      // Format results for agent consumption
      const books: BookResult[] = data.books || [];
      const total = data.total || 0;

      if (books.length === 0) {
        const queryMsg = query ? `for "${query}"` : 'matching your filters';
        return {
          books: [],
          total: 0,
          message: `No books found ${queryMsg}. Try different search terms or filters.`,
        };
      }

      // Build helpful summary
      const summary = books.map((b, i) => {
        const helpedText = b.total_hits > 0 ? `Helped ${b.total_hits} agent${b.total_hits === 1 ? '' : 's'}` : `${b.entries} entries`;
        return `${i + 1}. **${b.name}** (${b.price}) - ${helpedText}\n   ${b.description?.slice(0, 100)}${b.description?.length > 100 ? '...' : ''}`;
      }).join('\n');

      const queryMsg = query ? `for "${query}"` : 'in library';
      return {
        books,
        total,
        message: `Found ${total} book(s) ${queryMsg}:\n\n${summary}\n\nUse library_buy({ slug: "..." }) to purchase a book.`,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Library search failed: ${message}`);
    }
  },
};
