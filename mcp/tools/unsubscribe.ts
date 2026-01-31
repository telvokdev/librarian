// ============================================================================
// Unsubscribe Tool
// Cancel a subscription to a book from Telvok library
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface UnsubscribeArgs {
  slug: string;
}

interface UnsubscribeResult {
  success: boolean;
  message: string;
  book?: {
    slug: string;
    name: string;
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const unsubscribeTool = {
  name: 'unsubscribe',
  title: 'Cancel Subscription',
  description: `Cancel a subscription to a book.

USE THIS TOOL WHEN:
- User wants to stop a subscription
- User says "unsubscribe", "cancel subscription", "stop paying for X"
- User asks to cancel recurring payment for a book

Only works for subscription purchases. One-time purchases grant permanent access.

TRIGGER PATTERNS:
- "Cancel my subscription to X" → unsubscribe({ slug: "book-slug" })
- "Unsubscribe from that book" → unsubscribe({ slug: "..." })
- "Stop my subscription" → First use my_books() to find subscription slugs

Example:
- unsubscribe({ slug: "premium-patterns" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Book slug to unsubscribe from (from my_books() results)',
      },
    },
    required: ['slug'],
  },

  outputSchema: {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      book: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
    required: ['success', 'message'],
  },

  async handler(args: unknown): Promise<UnsubscribeResult> {
    const { slug } = args as UnsubscribeArgs;

    if (!slug || typeof slug !== 'string') {
      return {
        success: false,
        message: 'Book slug is required. Use my_books() to find your subscriptions.',
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
      const response = await fetch(`${TELVOK_API_URL}/api/subscription/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 404) {
          if (data.error?.includes('No active subscription')) {
            return {
              success: false,
              message: `No active subscription found for "${slug}". Use my_books() to see your current subscriptions.`,
            };
          }
          return {
            success: false,
            message: `Book "${slug}" not found.`,
          };
        }

        if (response.status === 400 && data.error?.includes('not a subscription')) {
          return {
            success: false,
            message: data.message || 'This is a one-time purchase. You retain permanent access - no subscription to cancel.',
          };
        }

        return {
          success: false,
          message: data.error || `Failed to unsubscribe: HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        message: data.message || `Subscription to "${data.book?.name || slug}" has been cancelled.`,
        book: data.book,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to unsubscribe: ${message}`);
    }
  },
};

// ============================================================================
// Export
// ============================================================================

export default unsubscribeTool;
