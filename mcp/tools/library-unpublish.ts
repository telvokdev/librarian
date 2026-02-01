// ============================================================================
// Marketplace Unpublish Tool
// Remove a published book from Telvok library
// ============================================================================

import * as crypto from 'crypto';
import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Unpublish Token Store
// Preview generates a token. Unpublish requires it. Single-use, 5min expiry.
// ============================================================================

interface UnpublishToken {
  token: string;
  slug: string;
  created: number;
}

const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
let pendingUnpublish: UnpublishToken | null = null;

// ============================================================================
// Types
// ============================================================================

interface UnpublishArgs {
  slug: string;
  preview?: boolean;
  unpublish_token?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const libraryUnpublishTool = {
  name: 'library_unpublish',
  title: 'Unpublish Book',
  description: `Remove a published book from Telvok marketplace.

⚠️ TWO-STEP UNPUBLISH FLOW (MANDATORY):

Step 1: ALWAYS call with preview: true first. Shows what will be deleted
and returns an unpublish_token. Show the preview to the user and ASK FOR CONFIRMATION.

Step 2: ONLY after the user explicitly confirms, call again with the unpublish_token
from the preview response. Unpublishing WITHOUT a valid token will be rejected.

RESTRICTIONS:
- Cannot unpublish books with active purchases
- Deletion is PERMANENT — all entries are removed from marketplace

TRIGGER PATTERNS:
- "Unpublish my book" → library_unpublish({ slug: "...", preview: true })
- "Remove from marketplace" → library_unpublish({ slug: "...", preview: true })
- User says "yes, delete it" → library_unpublish({ slug: "...", unpublish_token: "<token>" })

Use my_books() first to see your published books and their slugs.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Book slug (from my_books output)',
      },
      preview: {
        type: 'boolean',
        description: 'If true, show what would be deleted without deleting. Returns an unpublish_token.',
      },
      unpublish_token: {
        type: 'string',
        description: 'Token from preview response. Required to actually unpublish. Single-use, expires in 5 minutes.',
      },
    },
    required: ['slug'],
  },

  async handler(args: unknown) {
    const { slug, preview, unpublish_token } = (args || {}) as UnpublishArgs;

    // Validate slug
    if (!slug || typeof slug !== 'string') {
      return { success: false, message: 'slug is required. Use my_books() to see your published books.' };
    }

    // Load API key
    const apiKey = await loadApiKey();
    if (!apiKey) {
      return {
        success: false,
        message: 'Not authenticated. Run auth({ action: "login" }) first.',
      };
    }

    // ========================================================================
    // PREVIEW MODE — show what will be deleted, generate token
    // ========================================================================
    if (preview) {
      // Fetch book details via my-books to confirm it exists and we own it
      const res = await fetch(`${TELVOK_API_URL}/api/my-books`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        return { success: false, message: `Failed to fetch books: ${res.status}` };
      }

      const data = await res.json();
      const book = data.published?.find((b: { slug: string }) => b.slug === slug);

      if (!book) {
        return {
          success: false,
          message: `No published book found with slug "${slug}". Use my_books() to see your books.`,
        };
      }

      // Generate token
      const token = crypto.randomBytes(16).toString('hex');
      pendingUnpublish = { token, slug, created: Date.now() };

      return {
        success: true,
        preview: true,
        message: `Preview of unpublish — NOT deleted yet.\n\n⚠️ Show this to the user and ask for confirmation before unpublishing.`,
        unpublish_token: token,
        book: {
          slug: book.slug,
          name: book.name,
          entries_count: book.entries_count,
          pricing: book.pricing,
          url: book.url,
        },
        next_steps: 'Show preview to user. After they confirm, call library_unpublish() again with the unpublish_token to delete.',
      };
    }

    // ========================================================================
    // EXECUTE MODE — validate token, call API to delete
    // ========================================================================

    // Token required
    if (!unpublish_token) {
      return {
        success: false,
        message: '🚫 Unpublishing requires an unpublish_token. Call with preview: true first to get one.',
      };
    }

    // Validate token
    if (!pendingUnpublish || pendingUnpublish.token !== unpublish_token) {
      return {
        success: false,
        message: '🚫 Invalid or expired unpublish_token. Run a new preview to get a fresh token.',
      };
    }

    // Check expiry
    if (Date.now() - pendingUnpublish.created > TOKEN_EXPIRY_MS) {
      pendingUnpublish = null;
      return {
        success: false,
        message: '🚫 Unpublish token expired (5 minute limit). Run a new preview.',
      };
    }

    // Check slug matches
    if (pendingUnpublish.slug !== slug) {
      return {
        success: false,
        message: `🚫 Token was generated for slug "${pendingUnpublish.slug}", not "${slug}". Run a new preview.`,
      };
    }

    // Consume token (single use)
    pendingUnpublish = null;

    // Call API
    const res = await fetch(`${TELVOK_API_URL}/api/publish`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slug }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        message: data.message || data.error || `Unpublish failed: ${res.status}`,
      };
    }

    return {
      success: true,
      message: data.message || `Unpublished "${slug}" from marketplace`,
      book: data.book,
    };
  },
};
