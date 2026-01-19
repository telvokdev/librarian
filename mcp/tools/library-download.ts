// ============================================================================
// Marketplace Download Tool
// Download purchased books to local library
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadApiKey } from './auth.js';
import { getLibraryPath, getPackagesPath } from '../library/storage.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface DownloadArgs {
  slug: string;
}

interface BookEntry {
  title: string;
  insight: string;
  intent: string | null;
  context: string | null;
  reasoning: string | null;
  example: string | null;
}

interface DownloadResult {
  success: boolean;
  message: string;
  book?: {
    slug: string;
    name: string;
    entries: number;
  };
  path?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const libraryDownloadTool = {
  name: 'library_download',
  description: `Download a FREE (open) book to your local library.

Downloads content from free/open books to .librarian/packages/{slug}/ for offline access.

NOTE: Paid books (one-time or subscription) cannot be downloaded - they are cloud-only
for IP protection. Use brief({ query: "...", include_library: true }) to access
content from paid books you own.

Requires authentication and ownership (purchased or free).

Examples:
- library_download({ slug: "react-best-practices" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: {
        type: 'string',
        description: 'Book slug to download',
      },
    },
    required: ['slug'],
  },

  async handler(args: unknown): Promise<DownloadResult> {
    const { slug } = args as DownloadArgs;

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
      // Fetch content from API
      const response = await fetch(`${TELVOK_API_URL}/api/content/${slug}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.error || `Download failed: HTTP ${response.status}`,
        };
      }

      // Check if book is paid - reject download for paid content
      const pricingType = data.book?.pricing_type;
      if (pricingType && pricingType !== 'open') {
        return {
          success: false,
          message: `Paid content cannot be downloaded locally. '${data.book.name}' is a ${pricingType === 'subscription' ? 'subscription' : 'paid'} book.\n\nTo access content from paid books, use:\n  brief({ query: "your search", include_library: true })`,
        };
      }

      // Save entries to packages directory
      const libraryPath = getLibraryPath();
      const packagesPath = getPackagesPath(libraryPath);
      const bookPath = path.join(packagesPath, slug);

      // Create directory
      await fs.mkdir(bookPath, { recursive: true });

      // Write each entry as a markdown file
      const entries: BookEntry[] = data.entries || [];
      for (const entry of entries) {
        const filename = slugify(entry.title) + '.md';
        const content = formatEntry(entry);
        await fs.writeFile(path.join(bookPath, filename), content, 'utf-8');
      }

      // Write metadata file
      const metadata = {
        slug: data.book.slug,
        name: data.book.name,
        description: data.book.description,
        version: data.book.version,
        downloaded_at: new Date().toISOString(),
        entry_count: entries.length,
      };
      await fs.writeFile(
        path.join(bookPath, '_metadata.json'),
        JSON.stringify(metadata, null, 2),
        'utf-8'
      );

      return {
        success: true,
        message: `Downloaded '${data.book.name}' (${entries.length} entries) to ${bookPath}`,
        book: {
          slug: data.book.slug,
          name: data.book.name,
          entries: entries.length,
        },
        path: bookPath,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Download failed: ${message}`);
    }
  },
};

// ============================================================================
// Helpers
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function formatEntry(entry: BookEntry): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  if (entry.intent) lines.push(`intent: "${entry.intent.replace(/"/g, '\\"')}"`);
  if (entry.context) lines.push(`context: "${entry.context.replace(/"/g, '\\"')}"`);
  lines.push(`created: "${new Date().toISOString()}"`);
  lines.push('source: "library"');
  lines.push('hits: 0');
  lines.push('last_hit: null');
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${entry.title}`);
  lines.push('');

  // Insight/content
  if (entry.insight) {
    lines.push(entry.insight);
    lines.push('');
  }

  // Reasoning
  if (entry.reasoning) {
    lines.push('## Reasoning');
    lines.push('');
    lines.push(entry.reasoning);
    lines.push('');
  }

  // Example
  if (entry.example) {
    lines.push('## Example');
    lines.push('');
    lines.push(entry.example);
    lines.push('');
  }

  return lines.join('\n');
}
