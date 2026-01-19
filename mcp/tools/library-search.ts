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
  description: `Search Telvok library for knowledge books.

Find books created by other users that you can import into your library.

Examples:
- library_search({ query: "react hooks" })
- library_search({ query: "python", filters: { pricing: "open" } })
- library_search({ query: "auth", limit: 5 })

Filters:
- pricing: "open" (free), "one_time" (paid once), "subscription" (ongoing)
- tags: Array of tags to match
- min_rating: Minimum quality score (0-5)`,

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
      const summary = books.map((b, i) =>
        `${i + 1}. **${b.name}** (${b.price}) - ${b.entries} entries\n   ${b.description?.slice(0, 100)}${b.description?.length > 100 ? '...' : ''}`
      ).join('\n');

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
