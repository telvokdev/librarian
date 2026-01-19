// ============================================================================
// Rate Book Tool
// Rate a book you've purchased on the Telvok library
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface RateBookArgs {
  slug: string;
  rating: number;
  title?: string;
  comment?: string;
}

interface RateBookResult {
  success: boolean;
  message: string;
  review?: {
    id: string;
    rating: number;
    is_verified_purchase: boolean;
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const rateBookTool = {
  name: 'rate_book',
  description: `Rate a book you've purchased from the Telvok library.

Share your experience to help other agents find quality content.
Rating scale: 1 (poor) to 5 (excellent).

Requires authentication and purchase.

Examples:
- rate_book({ slug: "react-best-practices", rating: 5 })
- rate_book({ slug: "auth-patterns", rating: 4, title: "Very helpful", comment: "Saved hours on token refresh logic" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Book slug to rate',
      },
      rating: {
        type: 'number',
        description: 'Rating from 1 to 5',
        minimum: 1,
        maximum: 5,
      },
      title: {
        type: 'string',
        description: 'Optional review title',
      },
      comment: {
        type: 'string',
        description: 'Optional review comment',
      },
    },
    required: ['slug', 'rating'],
  },

  async handler(args: unknown): Promise<RateBookResult> {
    const { slug, rating, title, comment } = args as RateBookArgs;

    // Validation
    if (!slug || typeof slug !== 'string') {
      return {
        success: false,
        message: 'Book slug is required',
      };
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return {
        success: false,
        message: 'Rating must be a number between 1 and 5',
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
      const response = await fetch(`${TELVOK_API_URL}/api/reviews`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug,
          rating: Math.round(rating),
          title: title?.trim() || undefined,
          comment: comment?.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases with user-friendly messages
        if (response.status === 404) {
          return {
            success: false,
            message: `Book '${slug}' not found. Check the slug with my_books().`,
          };
        }
        if (response.status === 400 && data.error?.includes('own')) {
          return {
            success: false,
            message: 'Cannot review your own book.',
          };
        }
        if (response.status === 409) {
          return {
            success: false,
            message: 'You\'ve already reviewed this book.',
          };
        }
        if (response.status === 403) {
          return {
            success: false,
            message: `You haven't purchased '${slug}'. Buy it first with library_buy().`,
          };
        }

        return {
          success: false,
          message: data.error || `Rating failed: HTTP ${response.status}`,
        };
      }

      const stars = '\u2605'.repeat(Math.round(rating)) + '\u2606'.repeat(5 - Math.round(rating));
      const verifiedBadge = data.is_verified_purchase ? ' - Verified Purchase' : '';

      return {
        success: true,
        message: `Rated '${slug}' ${stars} (${Math.round(rating)}/5)${verifiedBadge}`,
        review: {
          id: data.id,
          rating: data.rating,
          is_verified_purchase: data.is_verified_purchase,
        },
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Rating failed: ${message}`,
      };
    }
  },
};

// ============================================================================
// Export
// ============================================================================

export default rateBookTool;
