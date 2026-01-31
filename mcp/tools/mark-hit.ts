import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { getLibraryPath, getLocalPath, getImportedPath } from '../library/storage.js';
import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

export interface MarkHitResult {
  success: boolean;
  path: string;
  hits: number;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const markHitTool = {
  name: 'mark_hit',
  title: 'Mark Entry as Helpful',
  description: `CALL THIS when an entry from brief() actually helped. Fire and forget.

USE THIS TOOL WHEN:
- A brief() result helped you solve the problem
- You used information from an entry to make a decision
- An entry saved you from making a mistake

DO NOT SKIP - this is how the library learns what's useful.
Entries with more hits rank higher in future searches.

TRIGGER PATTERNS:
- Used entry from brief() → mark_hit({ path: "<path from brief result>" })
- Entry prevented a mistake → mark_hit({ path: "..." })

Example:
- mark_hit({ path: "local/stripe-webhooks-need-idempotency.md" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the entry that helped (from brief() results)',
      },
    },
    required: ['path'],
  },

  async handler(args: unknown): Promise<MarkHitResult> {
    const { path: entryPath } = args as { path: string };

    if (!entryPath) {
      throw new Error('path is required');
    }

    // Handle cloud entries (from purchased books via brief())
    // These have paths like "cloud:book-slug"
    if (entryPath.startsWith('cloud:')) {
      const bookSlug = entryPath.slice(6); // Remove "cloud:" prefix

      if (!bookSlug) {
        throw new Error('Invalid cloud entry path');
      }

      // Get API key for authenticated request
      const apiKey = await loadApiKey();
      if (!apiKey) {
        // Can't track hit without auth, but don't fail - fire and forget
        return {
          success: true,
          path: entryPath,
          hits: 1, // We don't know actual count for cloud entries
        };
      }

      // POST hit to server with auth
      try {
        await fetch(`${TELVOK_API_URL}/api/hits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            hits: [{
              slug: bookSlug,
              timestamp: new Date().toISOString(),
            }],
          }),
        });
      } catch {
        // Silently ignore server errors - fire and forget
      }

      return {
        success: true,
        path: entryPath,
        hits: 1, // We don't track local count for cloud entries
      };
    }

    const libraryPath = getLibraryPath();

    // Resolve the full path
    let fullPath: string;
    if (path.isAbsolute(entryPath)) {
      fullPath = entryPath;
    } else {
      fullPath = path.join(libraryPath, entryPath);
    }

    // Read existing file
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch {
      throw new Error(`Entry not found: ${entryPath}`);
    }

    // Parse frontmatter
    const { data, content: body } = matter(content);

    // Increment hits
    const currentHits = typeof data.hits === 'number' ? data.hits : 0;
    const newHits = currentHits + 1;

    // Update frontmatter
    data.hits = newHits;
    data.last_hit = new Date().toISOString();

    // Rebuild file content
    const updatedContent = matter.stringify(body, data);

    // Write back
    await fs.writeFile(fullPath, updatedContent, 'utf-8');

    // Sync to server if this is an imported/packages entry
    const normalizedPath = entryPath.replace(/\\/g, '/');
    if (normalizedPath.startsWith('packages/') || normalizedPath.includes('/packages/')) {
      try {
        // Extract library slug from path: packages/{slug}/entry.md
        const parts = normalizedPath.split('/');
        const packagesIndex = parts.indexOf('packages');
        if (packagesIndex !== -1 && parts.length > packagesIndex + 1) {
          const librarySlug = parts[packagesIndex + 1];

          // POST to server - fire and forget
          fetch(`${TELVOK_API_URL}/api/hits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hits: [{
                slug: librarySlug,
                timestamp: new Date().toISOString(),
              }],
            }),
          }).catch(() => {
            // Silently ignore server sync errors - local update already succeeded
          });
        }
      } catch {
        // Ignore errors - local update already succeeded
      }
    }

    return {
      success: true,
      path: entryPath,
      hits: newHits,
    };
  },
};
