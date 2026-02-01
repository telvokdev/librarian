// ============================================================================
// Marketplace Publish Tool
// Publish local entries as a book on Telvok library
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { glob } from 'glob';
import matter from 'gray-matter';
import { loadApiKey } from './auth.js';
import { getLibraryPath, getLocalPath } from '../library/storage.js';
import { scanForSensitiveData } from '../library/sensitive-scanner.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Publish Token Store
// Preview generates a token. Publish requires it. Single-use, 5min expiry.
// This prevents agents from publishing without user-reviewed preview.
// ============================================================================

interface PublishToken {
  token: string;
  name: string;
  entries_count: number;
  created: number;
}

const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
let pendingPublish: PublishToken | null = null;

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
  consumption?: 'inline' | 'reference' | 'download';
  attestation?: {
    original_work: boolean;
    no_secrets: boolean;
    terms_accepted: boolean;
  };
  preview?: boolean;
  publish_token?: string;
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
  publish_token?: string;
  book?: {
    id?: string;
    slug: string;
    name: string;
    url: string;
  };
  entries_count?: number;
  setup_url?: string;
  preview?: boolean;
  summary?: {
    name: string;
    pricing: { type: string; display: string };
    entries_count: number;
    entries: Array<{ title: string; file: string }>;
  };
  next_steps?: string;
  options?: Record<string, string>;
  required?: Record<string, string>;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const libraryPublishTool = {
  name: 'library_publish',
  title: 'Publish Book',
  description: `Publish local entries as a book on Telvok library.

⚠️ TWO-STEP PUBLISH FLOW (MANDATORY):

Step 1: ALWAYS call with preview: true first. This shows what will be published
and returns a publish_token. Show the preview to the user and ASK FOR CONFIRMATION.

Step 2: ONLY after the user explicitly confirms, call again with the publish_token
from the preview response. Publishing WITHOUT a valid token will be rejected.

DO NOT skip the preview. DO NOT publish without user confirmation.
The tool will refuse to publish without a valid publish_token from a preview.

TRIGGER PATTERNS:
- "Publish my entries" → library_publish({ name: "...", pricing: { type: "open" }, preview: true })
- User says "yes, publish it" → library_publish({ ..., publish_token: "<token from preview>" })

Examples:
- Preview: library_publish({ name: "My Book", pricing: { type: "open" }, preview: true })
- Publish: library_publish({ name: "My Book", pricing: { type: "open" }, consumption: "download", attestation: { original_work: true, no_secrets: true, terms_accepted: true }, publish_token: "abc123" })`,

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
      consumption: {
        type: 'string',
        enum: ['inline', 'reference', 'download'],
        description: 'How buyers access content. download only for free books.',
      },
      attestation: {
        type: 'object',
        properties: {
          original_work: { type: 'boolean', description: 'Confirm this is original work' },
          no_secrets: { type: 'boolean', description: 'Confirm no secrets/credentials' },
          terms_accepted: { type: 'boolean', description: 'Accept library terms' },
        },
        required: ['original_work', 'no_secrets', 'terms_accepted'],
        description: 'Required confirmations before publishing',
      },
      preview: {
        type: 'boolean',
        description: 'If true, show what would be published without publishing. Returns a publish_token.',
      },
      publish_token: {
        type: 'string',
        description: 'Token from preview response. Required to actually publish. Single-use, expires in 5 minutes.',
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
    const { name, description, pricing, consumption, attestation, preview, publish_token, entries: entryFilter, tags, license } = args as PublishArgs;

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
    if (pricing.price_cents && pricing.price_cents > 100000) {
      throw new Error('Price cannot exceed $1000.00 (100000 cents)');
    }

    // Validate description length
    if (description && description.length > 500) {
      throw new Error('Description must be 500 characters or less');
    }

    // Validate tags count
    if (tags && tags.length > 10) {
      throw new Error('Maximum 10 tags allowed');
    }

    // Collect entries from local/ (needed for preview and publish)
    const collectedEntries = await collectLocalEntries(entryFilter);

    // Scan for sensitive data before publishing
    const sensitiveFindings = scanForSensitiveData(collectedEntries);
    if (sensitiveFindings.length > 0) {
      const warnings = sensitiveFindings.map(f =>
        `  ⚠ ${f.entry}: ${f.matches.join(', ')}`
      ).join('\n');

      if (preview) {
        // In preview mode, show warnings but continue
        return {
          success: true,
          preview: true,
          message: `⚠ SENSITIVE DATA DETECTED in ${sensitiveFindings.length} entry(s):\n${warnings}\n\nReview these entries before publishing. Remove credentials, API keys, passwords, and personal data.`,
        };
      }

      // In publish mode, block and require cleanup
      return {
        success: false,
        message: `🚫 Publish blocked — sensitive data detected in ${sensitiveFindings.length} entry(s):\n${warnings}\n\nClean up these entries with record() or delete() before publishing. Use library_publish({ preview: true }) to re-check.`,
      };
    }

    if (collectedEntries.length === 0) {
      return {
        success: false,
        message: 'No entries found in .librarian/local/. Use record() to create entries first.',
      };
    }

    // Format pricing display
    const pricingDisplay = pricing.type === 'open'
      ? 'Free'
      : `$${((pricing.price_cents || 0) / 100).toFixed(2)}`;

    // Handle preview mode - return summary with publish token
    if (preview) {
      const token = crypto.randomBytes(16).toString('hex');
      pendingPublish = {
        token,
        name: name.trim(),
        entries_count: collectedEntries.length,
        created: Date.now(),
      };

      return {
        success: true,
        preview: true,
        message: `Preview of "${name.trim()}" - NOT published yet.\n\n⚠️ Show this to the user and ask for confirmation before publishing.`,
        publish_token: token,
        summary: {
          name: name.trim(),
          pricing: { type: pricing.type, display: pricingDisplay },
          entries_count: collectedEntries.length,
          entries: collectedEntries.map(e => ({
            title: e.title,
            file: path.basename(e.originalPath),
          })),
        },
        next_steps: 'Show preview to user. After they confirm, call library_publish() again with the publish_token to publish.',
      };
    }

    // ========================================================================
    // PUBLISH TOKEN VALIDATION
    // Cannot publish without a valid token from preview
    // ========================================================================
    if (!publish_token) {
      return {
        success: false,
        message: '🚫 Publishing requires a publish_token from a preview.\n\nYou must call library_publish({ preview: true, ... }) first, show the preview to the user, get their confirmation, then call again with the publish_token.\n\nThis is a safety measure to prevent accidental publishing.',
      };
    }

    if (!pendingPublish || pendingPublish.token !== publish_token) {
      return {
        success: false,
        message: '🚫 Invalid or expired publish_token. Run a new preview first with library_publish({ preview: true, ... }).',
      };
    }

    if (Date.now() - pendingPublish.created > TOKEN_EXPIRY_MS) {
      pendingPublish = null;
      return {
        success: false,
        message: '🚫 Publish token expired (5 minute limit). Run a new preview first.',
      };
    }

    // Token is valid — consume it (single use)
    pendingPublish = null;

    // Validate consumption type (required for actual publish)
    if (!consumption) {
      return {
        success: false,
        message: 'Consumption type required. Choose how buyers access your content:',
        options: {
          inline: 'Content returned in API responses (best for small entries)',
          reference: 'README + pointers to entries (best for larger books)',
          download: 'Download to local library (only for free/open books)',
        },
      };
    }
    if (!['inline', 'reference', 'download'].includes(consumption)) {
      return {
        success: false,
        message: 'Invalid consumption type. Must be: inline, reference, or download',
      };
    }
    if (consumption === 'download' && pricing.type !== 'open') {
      return {
        success: false,
        message: 'Download is only for free books. Paid content uses inline or reference.',
        next_steps: "Use pricing.type: 'open' for download, or consumption: 'inline'/'reference' for paid.",
      };
    }

    // Validate attestation (required for actual publish)
    if (!attestation) {
      return {
        success: false,
        message: 'Attestation required. Please confirm:',
        required: {
          original_work: 'This is my original work or I have rights to publish',
          no_secrets: 'Contains no secrets, credentials, or sensitive data',
          terms_accepted: 'I accept the Telvok library terms',
        },
      };
    }
    const failedAttestations: string[] = [];
    if (!attestation.original_work) failedAttestations.push('original_work');
    if (!attestation.no_secrets) failedAttestations.push('no_secrets');
    if (!attestation.terms_accepted) failedAttestations.push('terms_accepted');
    if (failedAttestations.length > 0) {
      return {
        success: false,
        message: `All attestation fields must be true to publish. Failed: ${failedAttestations.join(', ')}`,
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
      consumption,
      entries: apiEntries,
      tags: tags || [],
      license_type: license || 'personal',
      attestation,
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

export default libraryPublishTool;
