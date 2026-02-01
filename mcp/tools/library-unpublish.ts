// ============================================================================
// Marketplace Unpublish Tool
// Two-step: preview → user confirms → delete
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Pending State — preview stores slug, expires 5 min
// ============================================================================

let pendingSlug: string | null = null;
let pendingCreated = 0;
const EXPIRY_MS = 5 * 60 * 1000;

function clearExpired() {
  if (pendingSlug && Date.now() - pendingCreated > EXPIRY_MS) {
    pendingSlug = null;
  }
}

// ============================================================================
// Types
// ============================================================================

interface UnpublishArgs {
  slug: string;
  confirm?: boolean;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const libraryUnpublishTool = {
  name: 'library_unpublish',
  title: 'Unpublish Book',
  description: `Remove a published book from Telvok marketplace.

TWO-STEP FLOW:

Step 1: Call with just slug. Shows book details and what will be deleted.
Step 2: Call again with slug + confirm: true ONLY after the user says yes.

DO NOT set confirm: true without the user explicitly saying yes.
Show the preview and ask "Delete this book? (yes/no)" first.

RESTRICTIONS:
- Cannot unpublish books with active purchases
- Deletion is PERMANENT — all entries are removed from marketplace

Use my_books() first to see your published books and their slugs.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Book slug (from my_books output)',
      },
      confirm: {
        type: 'boolean',
        description: 'Set to true ONLY after showing preview to user and they say yes.',
      },
    },
    required: ['slug'],
  },

  async handler(args: unknown) {
    const { slug, confirm } = (args || {}) as UnpublishArgs;
    clearExpired();

    if (!slug || typeof slug !== 'string') {
      return { success: false, message: 'slug is required. Use my_books() to see your published books.' };
    }

    const apiKey = await loadApiKey();
    if (!apiKey) {
      return { success: false, message: 'Not authenticated. Run auth({ action: "login" }) first.' };
    }

    // ========================================================================
    // CONFIRM STEP — user said yes
    // ========================================================================
    if (confirm) {
      if (pendingSlug !== slug) {
        return {
          success: false,
          message: 'No pending unpublish for this slug. Call library_unpublish({ slug }) first to preview.',
        };
      }

      pendingSlug = null;
      return await executeUnpublish(slug, apiKey);
    }

    // ========================================================================
    // PREVIEW STEP — fetch book details, show to user
    // ========================================================================

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

    const bookName = book.name || slug;
    const entriesCount = book.entries_count || book.entry_count || 0;
    const pricing = book.pricing_type || book.pricing || 'unknown';

    pendingSlug = slug;
    pendingCreated = Date.now();

    return {
      success: true,
      preview: true,
      message: `⚠️ UNPUBLISH PREVIEW\n\n  Book: ${bookName}\n  Slug: ${slug}\n  Entries: ${entriesCount}\n  Pricing: ${pricing}\n\n  This action is PERMANENT.`,
      ask_user: 'Show this to the user. Ask: "Delete this book from the marketplace? (yes/no)"',
      book: { slug, name: bookName, entries_count: entriesCount, pricing },
    };
  },
};

// ============================================================================
// Execute Unpublish — called after confirmation
// ============================================================================

async function executeUnpublish(slug: string, apiKey: string) {
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
}
