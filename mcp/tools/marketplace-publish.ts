// ============================================================================
// Marketplace Publish Tool
// Publish local entries as a book on Telvok marketplace
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { loadApiKey } from './auth.js';
import { getLibraryPath, getLocalPath } from '../library/storage.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface PublishArgs {
  name: string;
  description?: string;
  pricing: {
    type: 'open' | 'one_time' | 'subscription';
    price_cents?: number;
  };
  entries?: string[];
  tags?: string[];
  license?: 'open' | 'open_attributed' | 'personal';
}

interface CollectedEntry {
  title: string;
  content: string;
  intent?: string;
  context?: string;
  reasoning?: string;
  example?: string;
  originalPath: string;
}

interface PublishResult {
  success: boolean;
  message: string;
  book?: {
    id?: string;
    slug: string;
    name: string;
    url: string;
  };
  entries_count?: number;
  setup_url?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const marketplacePublishTool = {
  name: 'marketplace_publish',
  description: `Publish local entries as a book on Telvok marketplace.

Collects entries from .librarian/local/ and publishes them as a book.
Users can browse and purchase your book on telvok.com.

Requirements:
- Must be authenticated (run auth({ action: "login" }) first)
- For paid books: Stripe Connect account required (setup via web)

Pricing types:
- "open": Free, downloadable by anyone
- "one_time": Pay once, cloud-only access
- "subscription": Monthly payment, cloud-only access

Examples:
- marketplace_publish({ name: "React Best Practices", pricing: { type: "open" } })
- marketplace_publish({ name: "Auth Patterns", pricing: { type: "one_time", price_cents: 999 }, tags: ["auth", "security"] })
- marketplace_publish({ name: "My Insights", pricing: { type: "open" }, entries: ["stripe-webhooks.md", "token-validation.md"] })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Book title (3-100 characters)',
      },
      description: {
        type: 'string',
        description: 'Short description of the book (optional, max 500 chars)',
      },
      pricing: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['open', 'one_time', 'subscription'],
            description: 'Pricing model',
          },
          price_cents: {
            type: 'number',
            description: 'Price in cents (required for paid, min 100 = $1.00)',
          },
        },
        required: ['type'],
        description: 'Pricing configuration',
      },
      entries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific entry filenames to include (omit for all local/)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Category/topic tags (max 10)',
      },
      license: {
        type: 'string',
        enum: ['open', 'open_attributed', 'personal'],
        description: 'License type (default: personal)',
      },
    },
    required: ['name', 'pricing'],
  },

  async handler(args: unknown): Promise<PublishResult> {
    const { name, description, pricing, entries: entryFilter, tags, license } = args as PublishArgs;

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      throw new Error('Book name is required (minimum 3 characters)');
    }
    if (name.trim().length > 100) {
      throw new Error('Book name must be 100 characters or less');
    }

    // Validate pricing
    if (!pricing || !pricing.type) {
      throw new Error('Pricing type is required');
    }
    if (!['open', 'one_time', 'subscription'].includes(pricing.type)) {
      throw new Error('Pricing type must be: open, one_time, or subscription');
    }
    if (pricing.type !== 'open' && (!pricing.price_cents || pricing.price_cents < 100)) {
      throw new Error('Paid books require price_cents >= 100 ($1.00)');
    }

    // Check authentication
    const apiKey = await loadApiKey();
    if (!apiKey) {
      return {
        success: false,
        message: 'Not authenticated. Run auth({ action: "login" }) to connect your Telvok account first.',
      };
    }

    // Collect entries from local/
    const collectedEntries = await collectLocalEntries(entryFilter);

    if (collectedEntries.length === 0) {
      return {
        success: false,
        message: 'No entries found in .librarian/local/. Use record() to create entries first.',
      };
    }

    // Format entries for API
    const apiEntries = collectedEntries.map(e => ({
      title: e.title,
      content: e.content,
      intent: e.intent,
      context: e.context,
      reasoning: e.reasoning,
      example: e.example,
    }));

    // Build request body
    const requestBody = {
      name: name.trim(),
      description: description?.trim(),
      pricing,
      entries: apiEntries,
      tags: tags || [],
      license_type: license || 'personal',
      attestation: {
        original_work: true,
        no_secrets: true,
        terms_accepted: true,
      },
    };

    try {
      const response = await fetch(`${TELVOK_API_URL}/api/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle Stripe Connect requirement
        if (data.error === 'stripe_connect_required') {
          return {
            success: false,
            message: `Stripe Connect required to sell paid content.\n\nComplete setup at: ${data.setup_url}`,
            setup_url: data.setup_url,
          };
        }

        // Handle validation errors
        if (data.error === 'validation_error') {
          const details = Object.entries(data.details || {})
            .map(([k, v]) => `  - ${k}: ${v}`)
            .join('\n');
          return {
            success: false,
            message: `Validation failed:\n${details}`,
          };
        }

        return {
          success: false,
          message: data.error || `Publish failed: HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        message: data.message || `Published "${data.book?.name}" with ${data.entries_count} entries`,
        book: data.book,
        entries_count: data.entries_count,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Publish failed: ${message}`);
    }
  },
};

// ============================================================================
// Entry Collection
// ============================================================================

async function collectLocalEntries(filter?: string[]): Promise<CollectedEntry[]> {
  const libraryPath = getLibraryPath();
  const localPath = getLocalPath(libraryPath);
  const entries: CollectedEntry[] = [];

  try {
    const files = await glob(path.join(localPath, '**/*.md'), { nodir: true });

    for (const filePath of files) {
      const filename = path.basename(filePath);

      // If filter specified, only include matching files
      if (filter && filter.length > 0) {
        const matchesFilter = filter.some(f =>
          filename === f ||
          filename === f + '.md' ||
          filePath.endsWith(f) ||
          filePath.endsWith(f + '.md')
        );
        if (!matchesFilter) continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = parseEntryFile(content, filePath);
        if (parsed) {
          entries.push({
            ...parsed,
            originalPath: filePath,
          });
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  } catch {
    // No local directory yet
  }

  return entries;
}

function parseEntryFile(content: string, filePath: string): Omit<CollectedEntry, 'originalPath'> | null {
  const { data: frontmatter, content: body } = matter(content);
  const trimmedBody = body.trim();

  if (!trimmedBody) return null;

  // Extract title from frontmatter, H1, or filename
  let title = frontmatter.title as string | undefined;
  if (!title) {
    const headingMatch = trimmedBody.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
    } else {
      // Use filename as title, converting hyphens to spaces
      title = path.basename(filePath, '.md')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  // Extract sections from body
  const sections = extractSections(trimmedBody);

  return {
    title,
    content: sections.main || trimmedBody,
    intent: (frontmatter.intent as string | undefined) || undefined,
    context: (frontmatter.context as string | undefined) || undefined,
    reasoning: sections.reasoning,
    example: sections.example,
  };
}

function extractSections(body: string): { main: string; reasoning?: string; example?: string } {
  const result: { main: string; reasoning?: string; example?: string } = {
    main: body,
  };

  // Find ## Reasoning section
  const reasoningMatch = body.match(/##\s*Reasoning\s*\n([\s\S]*?)(?=##|$)/i);
  if (reasoningMatch) {
    result.reasoning = reasoningMatch[1].trim();
  }

  // Find ## Example section
  const exampleMatch = body.match(/##\s*Example\s*\n([\s\S]*?)(?=##|$)/i);
  if (exampleMatch) {
    result.example = exampleMatch[1].trim();
  }

  // Main content is everything after title until first ## section
  const mainMatch = body.match(/^#\s+.+\n\n?([\s\S]*?)(?=##|$)/);
  if (mainMatch) {
    result.main = mainMatch[1].trim();
  } else {
    // If no H1 header, take content before first ## section
    const beforeSections = body.match(/^([\s\S]*?)(?=##)/);
    if (beforeSections) {
      result.main = beforeSections[1].trim();
    }
  }

  return result;
}

// ============================================================================
// Export
// ============================================================================

export default marketplacePublishTool;
