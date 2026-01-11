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
  source: string;  // "local" or "imported/package-name"
  path: string;
  topics: string[];
  preview?: string;
}

export interface BriefResult {
  results: BriefEntry[];
  local_topics: string[];
  imported_packages: string[];
  suggestion?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const briefTool = {
  name: 'brief',
  description: `Query the library for relevant entries on a topic.

Searches both local library and imported packages.
Returns entries with source indicators (local vs imported).

WHEN TO USE:
- Before planning or entering plan mode
- Before architectural decisions
- When starting a task that might have relevant history
- When the topic feels familiar (we might have done this before)

Examples:
- brief({ topic: "deployment" }) - Get deployment guidance
- brief({ topic: "stripe" }) - Check what we know about Stripe
- brief({ topic: "api" }) - See API-related learnings`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      topic: {
        type: 'string',
        description: 'What to query (e.g., "deployment", "stripe", "api")',
      },
    },
    required: ['topic'],
  },

  async handler(args: unknown): Promise<BriefResult> {
    const { topic } = args as { topic?: string };

    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);
    const importedPath = getImportedPath(libraryPath);

    const results: BriefEntry[] = [];
    const localTopics: string[] = [];
    const importedPackages: string[] = [];

    // Scan local/ for topics
    try {
      const items = await fs.readdir(localPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          localTopics.push(item.name);
        }
      }
    } catch {
      // Local path doesn't exist yet
    }

    // Scan imported/ for packages
    try {
      const items = await fs.readdir(importedPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          importedPackages.push(item.name);
        }
      }
    } catch {
      // Imported path doesn't exist yet
    }

    // If no topic specified, return overview
    if (!topic) {
      return {
        results: [],
        local_topics: localTopics,
        imported_packages: importedPackages,
        suggestion: localTopics.length === 0 && importedPackages.length === 0
          ? 'Library is empty. Use record() to save learnings.'
          : `${localTopics.length} local topics, ${importedPackages.length} imported packages.`,
      };
    }

    const searchTerm = topic.toLowerCase();

    // Search local entries
    try {
      const localFiles = await glob(path.join(localPath, '**/*.md'), { nodir: true });
      for (const filePath of localFiles) {
        const entry = await readEntryForBrief(filePath);
        if (entry && matchesSearch(entry, searchTerm)) {
          results.push({
            title: extractTitle(entry.content) || path.basename(filePath, '.md'),
            source: 'local',
            path: path.relative(libraryPath, filePath),
            topics: entry.topics,
            preview: entry.content.slice(0, 150).trim() + (entry.content.length > 150 ? '...' : ''),
          });
        }
      }
    } catch {
      // No local files
    }

    // Search imported entries
    try {
      const importedFiles = await glob(path.join(importedPath, '**/*.md'), { nodir: true });
      for (const filePath of importedFiles) {
        const entry = await readEntryForBrief(filePath);
        if (entry && matchesSearch(entry, searchTerm)) {
          // Extract package name from path
          const relativePath = path.relative(importedPath, filePath);
          const packageName = relativePath.split(path.sep)[0];

          results.push({
            title: extractTitle(entry.content) || path.basename(filePath, '.md'),
            source: `imported/${packageName}`,
            path: path.relative(libraryPath, filePath),
            topics: entry.topics,
            preview: entry.content.slice(0, 150).trim() + (entry.content.length > 150 ? '...' : ''),
          });
        }
      }
    } catch {
      // No imported files
    }

    // Build response
    let suggestion: string | undefined;

    if (results.length === 0) {
      suggestion = `No entries found for "${topic}". Use record() to save new learnings.`;
    }

    return {
      results,
      local_topics: localTopics,
      imported_packages: importedPackages,
      suggestion,
    };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

interface ParsedEntry {
  topics: string[];
  content: string;
}

async function readEntryForBrief(filePath: string): Promise<ParsedEntry | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data, content: body } = matter(content);

    let topics: string[];
    if (Array.isArray(data.topics)) {
      topics = data.topics;
    } else if (data.topic) {
      topics = [data.topic];
    } else {
      // Infer topic from directory structure
      const parts = filePath.split(path.sep);
      const localIdx = parts.indexOf('local');
      const importedIdx = parts.indexOf('imported');
      const startIdx = Math.max(localIdx, importedIdx);

      if (startIdx >= 0 && startIdx < parts.length - 1) {
        topics = parts.slice(startIdx + 1, -1); // Exclude filename
      } else {
        topics = ['general'];
      }
    }

    return {
      topics,
      content: body.trim(),
    };
  } catch {
    return null;
  }
}

function matchesSearch(entry: ParsedEntry, searchTerm: string): boolean {
  // Check topics
  for (const topic of entry.topics) {
    if (topic.toLowerCase().includes(searchTerm)) {
      return true;
    }
  }

  // Check content
  if (entry.content.toLowerCase().includes(searchTerm)) {
    return true;
  }

  return false;
}

function extractTitle(content: string): string | null {
  // Look for first heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  // Or first non-empty line
  const firstLine = content.split('\n').find(line => line.trim().length > 0);
  if (firstLine && firstLine.length < 100) {
    return firstLine.trim();
  }

  return null;
}
