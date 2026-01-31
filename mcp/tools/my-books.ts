// ============================================================================
// My Books Tool
// View published and purchased books from Telvok library
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface MyBooksArgs {
  filter?: 'all' | 'published' | 'purchased';
}

interface PublishedBook {
  slug: string;
  name: string;
  entries_count: number;
  pricing: { type: string; display: string };
  created_at: string;
  url: string;
}

interface PurchasedBook {
  slug: string;
  name: string;
  author: string;
  entries_count: number;
  pricing: { type: string; display: string };
  purchased_at: string;
  status: string;
}

interface MyBooksResult {
  success: boolean;
  message: string;
  published?: PublishedBook[];
  purchased?: PurchasedBook[];
  summary?: {
    published_count: number;
    purchased_count: number;
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const myBooksTool = {
  name: 'my_books',
  title: 'View My Books',
  description: `View your published and purchased books.

USE THIS TOOL WHEN:
- User asks "what books do I have" or "show my library"
- Need to find a book slug for sync(), rate_book(), or other operations
- Checking what content user owns

Shows published (created) and purchased (bought/claimed) books.

TRIGGER PATTERNS:
- "Show my books" → my_books()
- "What have I published?" → my_books({ filter: "published" })
- "What books did I buy?" → my_books({ filter: "purchased" })
- Need book slugs → my_books()

Examples:
- my_books() - Show all your books
- my_books({ filter: "published" }) - Only your published books
- my_books({ filter: "purchased" }) - Only books you've bought`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      filter: {
        type: 'string',
        enum: ['all', 'published', 'purchased'],
        description: 'Filter results (default: all)',
      },
    },
    required: [],
  },

  async handler(args: unknown): Promise<MyBooksResult> {
    const { filter = 'all' } = (args || {}) as MyBooksArgs;

    // Validate filter
    if (filter && !['all', 'published', 'purchased'].includes(filter)) {
      return {
        success: false,
        message: 'Invalid filter. Must be: all, published, or purchased',
      };
    }

    // Check authentication
    const apiKey = await loadApiKey();
    if (!apiKey) {
      return {
        success: false,
        message: 'Not authenticated. Run auth({ action: "login" }) to connect your Telvok account first.',
      };
    }

    try {
      const url = new URL(`${TELVOK_API_URL}/api/my-books`);
      if (filter && filter !== 'all') {
        url.searchParams.set('filter', filter);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || `Failed to fetch books: HTTP ${response.status}`,
        };
      }

      // Format output message
      const publishedCount = data.published?.length || 0;
      const purchasedCount = data.purchased?.length || 0;

      let message = '';
      if (filter === 'published') {
        message = publishedCount === 0
          ? 'You haven\'t published any books yet.'
          : `You have ${publishedCount} published book${publishedCount === 1 ? '' : 's'}.`;
      } else if (filter === 'purchased') {
        message = purchasedCount === 0
          ? 'You haven\'t purchased any books yet.'
          : `You have ${purchasedCount} purchased book${purchasedCount === 1 ? '' : 's'}.`;
      } else {
        const total = publishedCount + purchasedCount;
        message = total === 0
          ? 'No books yet. Publish with library_publish() or browse with library_search().'
          : `${publishedCount} published, ${purchasedCount} purchased.`;
      }

      return {
        success: true,
        message,
        published: data.published,
        purchased: data.purchased,
        summary: data.summary,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch books: ${message}`);
    }
  },
};

// ============================================================================
// Export
// ============================================================================

export default myBooksTool;
