// ============================================================================
// Delete Tool
// Delete local entries from the library
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { getLibraryPath, getLocalPath } from '../library/storage.js';
import { loadIndex, saveIndex, removeFromIndex } from '../library/vector-index.js';

// ============================================================================
// Types
// ============================================================================

interface DeleteArgs {
  path?: string;
  query?: string;
  confirm?: boolean;
}

interface EntryInfo {
  path: string;
  title: string;
  preview: string;
  created?: string;
}

interface DeleteResult {
  success: boolean;
  message: string;
  deleted?: {
    path: string;
    title: string;
  };
  matches?: EntryInfo[];
  action_required?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const deleteTool = {
  name: 'delete',
  title: 'Delete Local Entry',
  description: `Delete entries from your local library (.librarian/local/).

USE THIS TOOL WHEN:
- User wants to remove an outdated entry
- Entry is wrong or no longer relevant
- Cleaning up test/experimental entries
- User says "delete", "remove", or "clean up" an entry

ONLY deletes from local/ (your own entries). Cannot delete:
- Imported content (use different management)
- Purchased/packages content (managed by library)

TRIGGER PATTERNS:
- "Delete that entry" → delete({ path: "local/entry-name.md" })
- "Remove the auth entry" → delete({ query: "auth" }) // Lists matches first
- After seeing matches → delete({ path: "local/exact-path.md", confirm: true })

Flow:
1. With query: Lists matching entries, asks for specific path
2. With path + confirm: Deletes the entry
3. Without confirm: Shows what will be deleted, asks for confirmation`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Exact path to delete (e.g., "local/entry-name.md")',
      },
      query: {
        type: 'string',
        description: 'Search query to find entries to delete',
      },
      confirm: {
        type: 'boolean',
        description: 'Confirm deletion (required when path is provided)',
      },
    },
    required: [],
  },

  outputSchema: {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
      deleted: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          title: { type: 'string' },
        },
      },
      matches: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            title: { type: 'string' },
            preview: { type: 'string' },
            created: { type: 'string' },
          },
        },
      },
      action_required: { type: 'string' },
    },
    required: ['success', 'message'],
  },

  async handler(args: unknown): Promise<DeleteResult> {
    const { path: entryPath, query, confirm } = (args || {}) as DeleteArgs;

    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);

    // Mode 1: Search by query - list matching entries
    if (query && !entryPath) {
      const matches = await findMatchingEntries(localPath, libraryPath, query);

      if (matches.length === 0) {
        return {
          success: false,
          message: `No entries found matching "${query}" in local library.`,
        };
      }

      if (matches.length === 1) {
        return {
          success: true,
          message: `Found 1 entry matching "${query}":`,
          matches,
          action_required: `To delete, call: delete({ path: "${matches[0].path}", confirm: true })`,
        };
      }

      return {
        success: true,
        message: `Found ${matches.length} entries matching "${query}". Specify which one to delete:`,
        matches,
        action_required: 'Call delete({ path: "local/exact-path.md", confirm: true }) with the specific path.',
      };
    }

    // Mode 2: Delete by path
    if (entryPath) {
      // Normalize path
      let normalizedPath = entryPath;
      if (!normalizedPath.startsWith('local/')) {
        normalizedPath = `local/${normalizedPath}`;
      }
      if (!normalizedPath.endsWith('.md')) {
        normalizedPath += '.md';
      }

      const fullPath = path.resolve(libraryPath, normalizedPath);

      // Prevent path traversal — only allow deleting within local/
      const localDir = path.resolve(libraryPath, 'local');
      if (!fullPath.startsWith(localDir)) {
        return {
          success: false,
          message: 'Invalid path: can only delete entries within local/',
        };
      }

      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch {
        return {
          success: false,
          message: `Entry not found: ${normalizedPath}`,
        };
      }

      // Read entry to get title for confirmation
      const content = await fs.readFile(fullPath, 'utf-8');
      const { data: frontmatter, content: body } = matter(content);

      let title = frontmatter.title as string | undefined;
      if (!title) {
        const headingMatch = body.match(/^#\s+(.+)$/m);
        if (headingMatch) {
          title = headingMatch[1].trim();
        } else {
          title = path.basename(normalizedPath, '.md').replace(/-/g, ' ');
        }
      }

      // Mode 2a: Show what will be deleted (no confirm)
      if (!confirm) {
        const preview = body.trim().split('\n').slice(0, 3).join('\n');
        return {
          success: true,
          message: `Will delete entry:`,
          matches: [{
            path: normalizedPath,
            title,
            preview: preview.slice(0, 200) + (preview.length > 200 ? '...' : ''),
            created: frontmatter.created as string | undefined,
          }],
          action_required: `Confirm by calling: delete({ path: "${normalizedPath}", confirm: true })`,
        };
      }

      // Mode 2b: Actually delete (with confirm)
      try {
        // Delete the file
        await fs.unlink(fullPath);

        // Remove from vector index
        try {
          const index = await loadIndex();
          removeFromIndex(index, normalizedPath);
          await saveIndex(index);
        } catch (indexError) {
          // Don't fail if index update fails - file is already deleted
          console.error('Failed to update index:', indexError);
        }

        return {
          success: true,
          message: `Deleted "${title}" from local library.`,
          deleted: {
            path: normalizedPath,
            title,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Failed to delete: ${message}`,
        };
      }
    }

    // No path or query provided
    return {
      success: false,
      message: 'Provide either a path or query to find entries to delete.',
      action_required: 'Use delete({ query: "search term" }) to find entries, or delete({ path: "local/entry.md", confirm: true }) to delete directly.',
    };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

async function findMatchingEntries(
  localPath: string,
  libraryPath: string,
  query: string
): Promise<EntryInfo[]> {
  const matches: EntryInfo[] = [];
  const queryLower = query.toLowerCase();

  try {
    const files = await glob(path.join(localPath, '**/*.md'), { nodir: true });

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { data: frontmatter, content: body } = matter(content);

        // Extract title
        let title = frontmatter.title as string | undefined;
        if (!title) {
          const headingMatch = body.match(/^#\s+(.+)$/m);
          if (headingMatch) {
            title = headingMatch[1].trim();
          } else {
            title = path.basename(filePath, '.md').replace(/-/g, ' ');
          }
        }

        // Check if query matches title, content, context, or filename
        const filename = path.basename(filePath, '.md');
        const context = (frontmatter.context as string | undefined) || '';

        const searchText = [title, body, context, filename].join(' ').toLowerCase();

        if (searchText.includes(queryLower)) {
          const relativePath = path.relative(libraryPath, filePath);
          const preview = body.trim().split('\n').slice(0, 2).join(' ');

          matches.push({
            path: relativePath,
            title,
            preview: preview.slice(0, 150) + (preview.length > 150 ? '...' : ''),
            created: frontmatter.created as string | undefined,
          });
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  } catch {
    // No local directory
  }

  // Sort by created date (newest first)
  return matches.sort((a, b) => {
    if (!a.created) return 1;
    if (!b.created) return -1;
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });
}

// ============================================================================
// Export
// ============================================================================

export default deleteTool;
