import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { getLibraryPath, getLocalPath, getImportedPath } from '../library/storage.js';

// ============================================================================
// Types
// ============================================================================

export interface BriefEntry {
  title: string;
  intent: string | null;
  context: string | null;
  preview: string;  // First 100 chars of insight - Claude reads full entry itself
  path: string;
  created: string;
}

export interface BriefResult {
  entries: BriefEntry[];
  total: number;
  message: string;
  libraryPath: string;  // So Claude knows where to read full entries
}

// ============================================================================
// Tool Definition
// ============================================================================

export const briefTool = {
  name: 'brief',
  description: `Check what we already know before diving in.

We've solved problems before. Before thinking through a problem, making
decisions, or planning - brief yourself on what past-us figured out.
Searches intent, insight, context, and examples.

Examples:
- brief({ query: "stripe webhooks" })
- brief({ query: "auth token" })
- brief({}) → returns recent entries`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'What are we working on? Searches our library. Leave empty to see recent entries.',
      },
      limit: {
        type: 'number',
        description: 'Max entries to return',
        default: 5,
      },
    },
    required: [],
  },

  async handler(args: unknown): Promise<BriefResult> {
    const { query, limit = 5 } = args as { query?: string; limit?: number };

    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);
    const importedPath = getImportedPath(libraryPath);

    let allEntries: BriefEntry[] = [];

    // Read local entries
    try {
      const localFiles = await glob(path.join(localPath, '**/*.md'), { nodir: true });
      for (const filePath of localFiles) {
        const entry = await readEntry(filePath, libraryPath);
        if (entry) {
          allEntries.push(entry);
        }
      }
    } catch {
      // No local files yet
    }

    // Read imported entries
    try {
      const importedFiles = await glob(path.join(importedPath, '**/*.md'), { nodir: true });
      for (const filePath of importedFiles) {
        const entry = await readEntry(filePath, libraryPath);
        if (entry) {
          allEntries.push(entry);
        }
      }
    } catch {
      // No imported files
    }

    // If no entries at all
    if (allEntries.length === 0) {
      return {
        entries: [],
        total: 0,
        message: 'No entries yet. Start recording!',
        libraryPath: localPath,
      };
    }

    // Filter by query if provided
    if (query) {
      const searchTerm = query.toLowerCase();
      allEntries = allEntries.filter(entry => matchesSearch(entry, searchTerm));
    }

    // Sort by created date (most recent first)
    allEntries.sort((a, b) => {
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });

    const total = allEntries.length;

    // Apply limit
    const entries = allEntries.slice(0, limit);

    // Build message
    let message: string;
    if (query) {
      message = total === 0
        ? `No entries found for "${query}".`
        : `Found ${total} ${total === 1 ? 'entry' : 'entries'} for "${query}".`;
    } else {
      message = `${total} ${total === 1 ? 'entry' : 'entries'} in library.`;
    }

    return {
      entries,
      total,
      message,
      libraryPath: localPath,
    };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

async function readEntry(filePath: string, libraryPath: string): Promise<BriefEntry | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data, content: body } = matter(content);

    // Extract title from H1 or filename
    let title = data.title;
    if (!title) {
      const headingMatch = body.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        title = headingMatch[1].trim();
      } else {
        title = path.basename(filePath, '.md').replace(/-/g, ' ');
      }
    }

    // Extract preview - first 100 chars of body content
    const bodyText = body.trim();
    const preview = bodyText.length > 100
      ? bodyText.slice(0, 100) + '...'
      : bodyText;

    return {
      title,
      intent: data.intent || null,
      context: data.context || null,
      preview,
      path: path.relative(libraryPath, filePath),
      created: data.created || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function matchesSearch(entry: BriefEntry, searchTerm: string): boolean {
  // Check title
  if (entry.title.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Check intent
  if (entry.intent && entry.intent.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Check context
  if (entry.context && entry.context.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Check preview (basic substring match - Claude does semantic filtering)
  if (entry.preview.toLowerCase().includes(searchTerm)) {
    return true;
  }

  return false;
}
