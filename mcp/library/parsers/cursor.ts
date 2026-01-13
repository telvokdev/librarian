import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import type { ParsedEntry, ParseResult } from './types.js';

// ============================================================================
// Cursor Memory Bank Parser
// ============================================================================

/**
 * Parse a Cursor Memory Bank folder (.cursor-memory/).
 *
 * Cursor Memory Bank typically contains:
 * - activeContext.md - Current working context
 * - progress.md - Progress log
 * - projectBrief.md - Project overview
 * - systemPatterns.md - System patterns
 * - decisionLog.md - Decision history
 * - techStack.md - Technology stack info
 *
 * Can also contain JSON files and subdirectories.
 */
export async function parseCursorMemory(dirPath: string): Promise<ParseResult> {
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  let skipped = 0;

  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      errors.push(`${dirPath} is not a directory`);
      return { entries, skipped, errors };
    }

    // Parse markdown files
    const mdFiles = await glob(path.join(dirPath, '**/*.md'), { nodir: true });
    for (const filePath of mdFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { data, content: body } = matter(content);

        const trimmedBody = body.trim();
        if (!trimmedBody) {
          skipped++;
          continue;
        }

        // Extract title from filename (convert camelCase/snake_case to Title Case)
        const filename = path.basename(filePath, '.md');
        const title = data.title || formatFilename(filename);

        // Determine context based on filename
        const context = data.context || inferContext(filename);

        entries.push({
          title,
          content: trimmedBody,
          context,
          intent: data.intent,
          source: 'cursor',
          originalPath: filePath,
        });
      } catch (fileError) {
        errors.push(`${filePath}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
        skipped++;
      }
    }

    // Parse JSON files
    const jsonFiles = await glob(path.join(dirPath, '**/*.json'), { nodir: true });
    for (const filePath of jsonFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        // Handle different JSON structures
        if (Array.isArray(data)) {
          // Array of memory items
          for (const item of data) {
            if (typeof item === 'object' && item !== null) {
              const entry = extractFromJSON(item, filePath);
              if (entry) {
                entries.push(entry);
              } else {
                skipped++;
              }
            }
          }
        } else if (typeof data === 'object' && data !== null) {
          // Single memory object
          const entry = extractFromJSON(data, filePath);
          if (entry) {
            entries.push(entry);
          } else {
            skipped++;
          }
        }
      } catch (fileError) {
        errors.push(`${filePath}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
        skipped++;
      }
    }
  } catch (dirError) {
    errors.push(`Failed to access path: ${dirError instanceof Error ? dirError.message : String(dirError)}`);
  }

  return { entries, skipped, errors };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert filename to readable title.
 * activeContext -> Active Context
 * system_patterns -> System Patterns
 */
function formatFilename(filename: string): string {
  return filename
    // Handle camelCase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Handle snake_case
    .replace(/_/g, ' ')
    // Handle kebab-case
    .replace(/-/g, ' ')
    // Capitalize first letter of each word
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Infer context from Cursor Memory Bank filename patterns.
 */
function inferContext(filename: string): string {
  const lower = filename.toLowerCase();

  if (lower.includes('context')) return 'context';
  if (lower.includes('progress')) return 'progress';
  if (lower.includes('brief') || lower.includes('overview')) return 'project';
  if (lower.includes('pattern')) return 'patterns';
  if (lower.includes('decision')) return 'decisions';
  if (lower.includes('stack') || lower.includes('tech')) return 'technology';

  return 'cursor-memory';
}

/**
 * Extract a ParsedEntry from a JSON object.
 */
function extractFromJSON(
  obj: Record<string, unknown>,
  filePath: string
): ParsedEntry | null {
  // Try various common keys for title
  const title =
    (obj.title as string) ||
    (obj.name as string) ||
    (obj.key as string) ||
    path.basename(filePath, '.json');

  // Try various common keys for content
  const content =
    (obj.content as string) ||
    (obj.description as string) ||
    (obj.text as string) ||
    (obj.value as string) ||
    (obj.memory as string);

  if (!content) {
    return null;
  }

  return {
    title,
    content,
    context: (obj.context as string) || (obj.category as string) || (obj.type as string),
    intent: obj.intent as string,
    source: 'cursor',
    originalPath: filePath,
  };
}
