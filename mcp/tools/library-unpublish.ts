// ============================================================================
// Marketplace Unpublish Tool
// Two-step: preview → osascript dialog / confirmation code → delete
// ============================================================================

import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { platform } from 'os';
import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Pending State — preview stores book info + confirm code, expires 5 min
// ============================================================================

interface PendingUnpublish {
  slug: string;
  bookName: string;
  entriesCount: number;
  pricing: string;
  confirmCode: string;
  created: number;
}

const EXPIRY_MS = 5 * 60 * 1000;
let pending: PendingUnpublish | null = null;

function clearExpired() {
  if (pending && Date.now() - pending.created > EXPIRY_MS) {
    pending = null;
  }
}

// ============================================================================
// Types
// ============================================================================

interface UnpublishArgs {
  slug: string;
  confirm_code?: string;
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
On macOS, a native confirmation dialog appears — the agent CANNOT bypass it.
On other platforms, a confirmation code is returned that the user must type back.

Step 2 (non-macOS only): Call again with slug + confirm_code from the user.

RESTRICTIONS:
- Cannot unpublish books with active purchases
- Deletion is PERMANENT — all entries are removed from marketplace

Use my_books() first to see your published books and their slugs.

DO NOT decide to unpublish without the user explicitly asking.
Show the preview details and wait for user confirmation.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Book slug (from my_books output)',
      },
      confirm_code: {
        type: 'string',
        description: 'Confirmation code from preview. User must type this back. Only needed on non-macOS.',
      },
    },
    required: ['slug'],
  },

  async handler(args: unknown) {
    const { slug, confirm_code } = (args || {}) as UnpublishArgs;
    clearExpired();

    if (!slug || typeof slug !== 'string') {
      return { success: false, message: 'slug is required. Use my_books() to see your published books.' };
    }

    const apiKey = await loadApiKey();
    if (!apiKey) {
      return { success: false, message: 'Not authenticated. Run auth({ action: "login" }) first.' };
    }

    // ========================================================================
    // CONFIRM STEP — user typed back the code
    // ========================================================================
    if (confirm_code) {
      if (!pending || pending.slug !== slug) {
        return {
          success: false,
          message: 'No pending unpublish for this slug. Call library_unpublish({ slug }) first to preview.',
        };
      }

      if (confirm_code.toUpperCase() !== pending.confirmCode.toUpperCase()) {
        return {
          success: false,
          message: `Wrong code. Expected: ${pending.confirmCode}. Got: ${confirm_code}. Try again.`,
        };
      }

      pending = null;
      return await executeUnpublish(slug, apiKey);
    }

    // ========================================================================
    // PREVIEW STEP — fetch book details, show confirmation
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

    // Try native dialog on macOS
    if (platform() === 'darwin') {
      try {
        const dialogText = [
          `Permanently unpublish "${bookName}"?`,
          ``,
          `${entriesCount} entries — ${pricing}`,
          ``,
          `This removes the book from the marketplace.`,
          `This action cannot be undone.`,
        ].join('\\n');

        const result = execSync(
          `osascript -e 'display dialog "${dialogText}" buttons {"Cancel", "Delete"} default button "Cancel" with title "Telvok Unpublish" with icon caution'`,
          { encoding: 'utf-8', timeout: 120000 }
        );

        if (result.includes('Delete')) {
          return await executeUnpublish(slug, apiKey);
        }
      } catch {
        // User clicked Cancel or osascript failed
        return {
          success: false,
          message: 'Unpublish cancelled.',
        };
      }
    }

    // Fallback: confirmation code
    const confirmCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    pending = { slug, bookName, entriesCount, pricing, confirmCode, created: Date.now() };

    return {
      success: true,
      preview: true,
      message: `⚠️ UNPUBLISH PREVIEW\n\n  Book: ${bookName}\n  Slug: ${slug}\n  Entries: ${entriesCount}\n  Pricing: ${pricing}\n\n  This action is PERMANENT.\n\n🔑 Confirmation code: ${confirmCode}`,
      ask_user: `To delete this book from the marketplace, the user must type back the code: ${confirmCode}`,
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
