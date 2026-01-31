// ============================================================================
// Sync Tool
// Check for and receive updates to owned books from Telvok library
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadApiKey } from './auth.js';
import { getLibraryPath, getImportedPath } from '../library/storage.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface SyncArgs {
  slug?: string;
  options?: {
    force?: boolean;
    download?: boolean;
  };
}

interface UpdateInfo {
  slug: string;
  name: string;
  new_entries_count: number;
  modified_entries_count: number;
  sync_preference: string;
  pricing_type: string;
  can_download: boolean;
}

interface SyncedBook {
  slug: string;
  name: string;
  new_entries: number;
  modified_entries: number;
  access: 'cloud' | 'downloaded';
  version?: string;       // Human-readable version (e.g., "Jan 18, 2026")
  synced_from?: string;   // Previous version (e.g., "3 days ago")
}

interface SyncResult {
  success: boolean;
  message: string;
  synced?: SyncedBook[];
  available?: { slug: string; name: string; new_entries: number }[];
  pinned?: { slug: string; name: string }[];
  up_to_date?: number;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const syncTool = {
  name: 'sync',
  title: 'Sync Purchased Books',
  description: `Check for and receive updates to purchased books.

USE THIS TOOL WHEN:
- User asks to update/sync their purchased books
- Starting a session and marketplace content might have changed
- Checking if owned books have new entries

Subscription books sync automatically. One-time purchases sync on request.

TRIGGER PATTERNS:
- "Update my books" → sync()
- "Check for new content" → sync()
- "Sync that book" → sync({ slug: "book-slug" })
- Force sync manual books → sync({ options: { force: true } })

Examples:
- sync() - Check and sync all auto-sync books
- sync({ slug: "premium-patterns" }) - Sync specific book
- sync({ options: { force: true } }) - Include manual preference books`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Specific book slug to sync (omit for all)',
      },
      options: {
        type: 'object',
        properties: {
          force: {
            type: 'boolean',
            description: 'Include manual preference books (default: false)',
          },
          download: {
            type: 'boolean',
            description: 'Download open book updates to local library (default: false)',
          },
        },
        description: 'Sync options',
      },
    },
    required: [],
  },

  async handler(args: unknown): Promise<SyncResult> {
    const { slug, options } = (args || {}) as SyncArgs;
    const force = options?.force || false;
    const download = options?.download || false;

    // Check authentication
    const apiKey = await loadApiKey();
    if (!apiKey) {
      return {
        success: false,
        message: 'Not authenticated. Run auth({ action: "login" }) to connect your Telvok account first.',
      };
    }

    try {
      // Step 1: Check for available updates
      const checkUrl = new URL(`${TELVOK_API_URL}/api/sync`);
      if (slug) {
        checkUrl.searchParams.set('slug', slug);
      }

      const checkResponse = await fetch(checkUrl.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        return {
          success: false,
          message: checkData.error || `Failed to check for updates: HTTP ${checkResponse.status}`,
        };
      }

      // If no updates available
      const updatesAvailable = checkData.updates_available || [];
      const upToDate = checkData.up_to_date || [];
      const pinned = checkData.pinned || [];

      if (updatesAvailable.length === 0) {
        const totalBooks = upToDate.length + pinned.length;
        let message = '';
        if (totalBooks === 0) {
          message = 'No books to sync. Purchase or claim books first.';
        } else if (pinned.length > 0) {
          message = `${upToDate.length} book${upToDate.length === 1 ? ' is' : 's are'} up to date. ${pinned.length} pinned (won't sync).`;
        } else {
          message = `All ${totalBooks} book${totalBooks === 1 ? ' is' : 's are'} up to date.`;
        }
        return {
          success: true,
          message,
          pinned: pinned.length > 0 ? pinned.map((p: { slug: string; name: string }) => ({ slug: p.slug, name: p.name })) : undefined,
          up_to_date: upToDate.length,
        };
      }

      // Step 2: Perform sync
      const syncResponse = await fetch(`${TELVOK_API_URL}/api/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug,
          force,
          include_content: download,
        }),
      });

      const syncData = await syncResponse.json();

      if (!syncResponse.ok) {
        return {
          success: false,
          message: syncData.error || `Failed to sync: HTTP ${syncResponse.status}`,
        };
      }

      const synced: SyncedBook[] = [];
      const available: { slug: string; name: string; new_entries: number }[] = [];
      const pinnedBooks: { slug: string; name: string }[] = [];

      // Process synced books
      for (const book of syncData.synced || []) {
        const newCount = typeof book.new_entries === 'number' ? book.new_entries : book.new_entries?.length || 0;
        const modifiedCount = typeof book.modified_entries === 'number' ? book.modified_entries : book.modified_entries?.length || 0;

        // If download requested and content provided, save to local
        if (download && book.access_method === 'download' && Array.isArray(book.new_entries)) {
          await saveEntriesToLocal(book.slug, book.new_entries, book.modified_entries);
        }

        synced.push({
          slug: book.slug,
          name: book.name,
          new_entries: newCount,
          modified_entries: modifiedCount,
          access: download && book.pricing_type === 'open' ? 'downloaded' : 'cloud',
          version: formatVersion(book.new_version),
          synced_from: formatVersion(book.previous_version),
        });
      }

      // Process skipped books
      for (const book of syncData.skipped || []) {
        if (book.reason === 'manual_no_force') {
          const update = updatesAvailable.find((u: UpdateInfo) => u.slug === book.slug);
          if (update) {
            available.push({
              slug: book.slug,
              name: book.name,
              new_entries: update.new_entries_count,
            });
          }
        } else if (book.reason === 'pinned') {
          pinnedBooks.push({
            slug: book.slug,
            name: book.name,
          });
        }
      }

      // Build summary message
      const messageParts: string[] = [];
      const totalNewEntries = synced.reduce((sum, b) => sum + b.new_entries, 0);
      const totalModified = synced.reduce((sum, b) => sum + b.modified_entries, 0);

      if (synced.length > 0) {
        let syncMsg = `Synced ${synced.length} book${synced.length === 1 ? '' : 's'}`;
        if (totalNewEntries > 0 || totalModified > 0) {
          const parts = [];
          if (totalNewEntries > 0) parts.push(`${totalNewEntries} new`);
          if (totalModified > 0) parts.push(`${totalModified} modified`);
          syncMsg += `: ${parts.join(', ')} entries.`;
        } else {
          syncMsg += '.';
        }
        messageParts.push(syncMsg);
      }

      if (available.length > 0) {
        messageParts.push(`${available.length} book${available.length === 1 ? ' has' : 's have'} updates available (set to manual).`);
      }

      if (pinnedBooks.length > 0) {
        messageParts.push(`${pinnedBooks.length} book${pinnedBooks.length === 1 ? '' : 's'} pinned (won't sync).`);
      }

      if (messageParts.length === 0) {
        if (upToDate.length > 0) {
          messageParts.push(`All ${upToDate.length} book${upToDate.length === 1 ? ' is' : 's are'} up to date.`);
        } else {
          messageParts.push('No books to sync. Purchase or claim books first.');
        }
      }

      return {
        success: true,
        message: messageParts.join(' '),
        synced: synced.length > 0 ? synced : undefined,
        available: available.length > 0 ? available : undefined,
        pinned: pinnedBooks.length > 0 ? pinnedBooks : undefined,
        up_to_date: upToDate.length,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Sync failed: ${message}`);
    }
  },
};

// ============================================================================
// Helper: Save entries to local imported folder
// ============================================================================

async function saveEntriesToLocal(
  slug: string,
  newEntries: Array<{ title: string; content: string; intent?: string; context?: string }>,
  modifiedEntries: Array<{ title: string; content: string; intent?: string; context?: string }>
): Promise<void> {
  const libraryPath = getLibraryPath();
  const importedPath = getImportedPath(libraryPath);
  const bookPath = path.join(importedPath, slug);

  // Ensure directory exists
  await fs.mkdir(bookPath, { recursive: true });

  // Save new entries
  for (const entry of newEntries || []) {
    const filename = slugify(entry.title) + '.md';
    const content = formatEntryAsMarkdown(entry);
    await fs.writeFile(path.join(bookPath, filename), content, 'utf-8');
  }

  // Save modified entries (overwrite)
  for (const entry of modifiedEntries || []) {
    const filename = slugify(entry.title) + '.md';
    const content = formatEntryAsMarkdown(entry);
    await fs.writeFile(path.join(bookPath, filename), content, 'utf-8');
  }

  // Update .meta.json
  const metaPath = path.join(bookPath, '.meta.json');
  let meta: Record<string, unknown> = {};
  try {
    const existing = await fs.readFile(metaPath, 'utf-8');
    meta = JSON.parse(existing);
  } catch {
    // No existing meta
  }
  meta.last_synced = new Date().toISOString();
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Format a timestamp as a human-readable version string
 */
function formatVersion(isoTimestamp: string | null): string {
  if (!isoTimestamp) return 'never synced';

  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

function formatEntryAsMarkdown(entry: { title: string; content: string; intent?: string; context?: string }): string {
  let md = '';

  // Frontmatter
  if (entry.intent || entry.context) {
    md += '---\n';
    if (entry.intent) md += `intent: "${entry.intent}"\n`;
    if (entry.context) md += `context: "${entry.context}"\n`;
    md += '---\n\n';
  }

  // Title and content
  md += `# ${entry.title}\n\n`;
  md += entry.content;

  return md;
}

// ============================================================================
// Export
// ============================================================================

export default syncTool;
