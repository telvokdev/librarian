import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import type { ParsedEntry, ParseResult } from './types.js';

// ============================================================================
// Markdown Parser - Basic Memory MCP / Obsidian / generic .md files
// ============================================================================

interface MarkdownFrontmatter {
  title?: string;
  tags?: string[];
  context?: string;
  intent?: string;
  created?: string;
  [key: string]: unknown;
}

/**
 * Parse a folder of markdown files (Basic Memory MCP / Obsidian / any .md).
 *
 * Input format:
 * ---
 * title: API Rate Limits
 * tags: [api, performance]
 * ---
 *
 * # API Rate Limits
 *
 * Always implement exponential backoff...
 */
export async function parseMarkdown(dirPath: string): Promise<ParseResult> {
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  let skipped = 0;

  try {
    // Handle both single file and directory
    const stats = await fs.stat(dirPath);
    const files = stats.isDirectory()
      ? await glob(path.join(dirPath, '**/*.md'), { nodir: true })
      : [dirPath];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { data, content: body } = matter(content);
        const frontmatter = data as MarkdownFrontmatter;

        // Skip empty files
        const trimmedBody = body.trim();
        if (!trimmedBody) {
          skipped++;
          continue;
        }

        // Extract title from frontmatter, H1, or filename
        let title = frontmatter.title;
        if (!title) {
          const headingMatch = trimmedBody.match(/^#\s+(.+)$/m);
          if (headingMatch) {
            title = headingMatch[1].trim();
          } else {
            title = path.basename(filePath, '.md').replace(/-/g, ' ');
          }
        }

        // Extract context from tags or context field
        let context: string | undefined;
        if (frontmatter.context) {
          context = frontmatter.context;
        } else if (frontmatter.tags && Array.isArray(frontmatter.tags)) {
          context = frontmatter.tags.join(', ');
        }

        entries.push({
          title,
          content: trimmedBody,
          context,
          intent: frontmatter.intent,
          source: 'markdown',
          originalPath: filePath,
        });
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
