// ============================================================================
// Marketplace Buy Tool
// Purchase or claim books from the Telvok library
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface BuyArgs {
  slug: string;
}

interface BuyResult {
  success: boolean;
  message: string;
  checkout_url?: string;
  already_owned?: boolean;
  free_access?: boolean;
  book?: {
    slug: string;
    name: string;
    entries?: number;
    price?: string;
    pricing_type?: string;
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const libraryBuyTool = {
  name: 'library_buy',
  description: `Purchase or claim a book from the Telvok library.

For free (open) books: Instantly adds the book to your library.
For paid books: Returns a checkout URL to complete payment.

Requires authentication. Run auth({ action: "login" }) first if not connected.

Examples:
- library_buy({ slug: "react-best-practices" })
- library_buy({ slug: "premium-patterns" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Book slug from library_search results',
      },
    },
    required: ['slug'],
  },

  async handler(args: unknown): Promise<BuyResult> {
    const { slug } = args as BuyArgs;

    if (!slug || typeof slug !== 'string') {
      throw new Error('Book slug is required');
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
      const response = await fetch(`${TELVOK_API_URL}/api/purchase`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || `Purchase failed: HTTP ${response.status}`,
        };
      }

      // Handle different response types
      if (data.already_owned) {
        return {
          success: true,
          already_owned: true,
          message: data.message || `You already own '${data.book?.name || slug}'`,
          book: data.book,
        };
      }

      if (data.free_access) {
        return {
          success: true,
          free_access: true,
          message: data.message || `'${data.book?.name || slug}' added to your library (${data.book?.entries || 0} entries)`,
          book: data.book,
        };
      }

      if (data.checkout_url) {
        return {
          success: true,
          checkout_url: data.checkout_url,
          message: `Complete your purchase:\n\n${data.checkout_url}\n\nBook: ${data.book?.name || slug} (${data.book?.price || 'paid'})`,
          book: data.book,
        };
      }

      // Unexpected response
      return {
        success: false,
        message: 'Unexpected response from purchase API',
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Purchase failed: ${message}`);
    }
  },
};
