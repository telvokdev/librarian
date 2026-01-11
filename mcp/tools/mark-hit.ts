import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { getLibraryPath, getLocalPath, getImportedPath } from '../library/storage.js';

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
  description: `Mark a library entry as helpful - call this when knowledge from the library helped solve a problem.

When an entry from brief() actually helped you complete a task or make a decision,
call mark_hit() on it. This helps the library learn which entries are most useful.

Entries with more hits bubble up in future brief() results.

Fire and forget - call it and move on.

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

    return {
      success: true,
      path: entryPath,
      hits: newHits,
    };
  },
};
