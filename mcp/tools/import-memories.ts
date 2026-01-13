import * as fs from 'fs/promises';
import * as path from 'path';
import { getLibraryPath, getLocalPath } from '../library/storage.js';
import { loadIndex, saveIndex, addToIndex } from '../library/vector-index.js';
import { parseJSONL, parseMarkdown, parseCursorMemory, parseJSON, parseSQLite, type ParsedEntry } from '../library/parsers/index.js';

// ============================================================================
// Types
// ============================================================================

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  outputPath: string;
  message: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const importMemoriesTool = {
  name: 'import_memories',
  description: `Import memories from other AI tools into Librarian.

Use this when you see memory files from other AI tools (Cursor .cursor-memory/, Anthropic ~/.aim/, mcp-memory-service .db files, Obsidian vaults) or when user mentions having knowledge in other tools. Import them so past knowledge becomes searchable.

Supported formats:
- jsonl: Anthropic MCP Memory, mcp-knowledge-graph (.jsonl files)
- markdown: Basic Memory, Obsidian, any .md files
- cursor: Cursor Memory Bank (.cursor-memory/)
- json: Simple memory servers, knowledge stores (.json files)
- sqlite: mcp-memory-service, SQLite-vec (.db, .sqlite files)

Imports go to .librarian/local/[source-name]/ and are automatically indexed for semantic search.

Examples:
- import_memories({ format: "jsonl", path: "~/.aim/memory.jsonl", source_name: "anthropic-memory" })
- import_memories({ format: "markdown", path: "~/basic-memory/", source_name: "basic-memory" })
- import_memories({ format: "cursor", path: ".cursor-memory/", source_name: "cursor-memory" })
- import_memories({ format: "json", path: "~/memories.json", source_name: "json-memory" })
- import_memories({ format: "sqlite", path: "~/memory.db", source_name: "sqlite-memory" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      format: {
        type: 'string',
        enum: ['jsonl', 'markdown', 'cursor', 'json', 'sqlite'],
        description: 'Format of the source memories',
      },
      path: {
        type: 'string',
        description: 'Path to memory file or folder',
      },
      source_name: {
        type: 'string',
        description: 'Name for the import folder (e.g., "anthropic-memory"). Auto-generated if not provided.',
      },
    },
    required: ['format', 'path'],
  },

  async handler(args: unknown): Promise<ImportResult> {
    const { format, path: inputPath, source_name } = args as {
      format: 'jsonl' | 'markdown' | 'cursor' | 'json' | 'sqlite';
      path: string;
      source_name?: string;
    };

    if (!format || !inputPath) {
      throw new Error('format and path are required');
    }

    // Expand ~ to home directory
    const expandedPath = inputPath.replace(/^~/, process.env.HOME || '');

    // Generate source name if not provided
    const sourceName = source_name || generateSourceName(format, expandedPath);

    // Setup output directory
    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);
    const outputPath = path.join(localPath, sourceName);

    // Check if output directory already exists
    try {
      await fs.access(outputPath);
      // Directory exists - we'll add to it but warn about potential duplicates
    } catch {
      // Directory doesn't exist - create it
      await fs.mkdir(outputPath, { recursive: true });
    }

    // Parse the source based on format
    let parseResult: { entries: ParsedEntry[]; skipped: number; errors: string[] };

    switch (format) {
      case 'jsonl':
        parseResult = await parseJSONL(expandedPath);
        break;
      case 'markdown':
        parseResult = await parseMarkdown(expandedPath);
        break;
      case 'cursor':
        parseResult = await parseCursorMemory(expandedPath);
        break;
      case 'json':
        parseResult = await parseJSON(expandedPath);
        break;
      case 'sqlite':
        parseResult = await parseSQLite(expandedPath);
        break;
      default:
        throw new Error(`Unknown format: ${format}`);
    }

    // Convert and save entries
    const index = await loadIndex();
    let imported = 0;
    const errors = [...parseResult.errors];

    for (const entry of parseResult.entries) {
      try {
        const relativePath = await saveEntry(entry, outputPath, libraryPath);

        // Add to vector index
        const fullContent = [
          entry.title,
          entry.intent || '',
          entry.content,
          entry.reasoning || '',
          entry.example || '',
          entry.context || '',
        ].filter(Boolean).join('\n\n');

        await addToIndex(index, relativePath, entry.title, fullContent);
        imported++;
      } catch (saveError) {
        errors.push(`Failed to save "${entry.title}": ${saveError instanceof Error ? saveError.message : String(saveError)}`);
      }
    }

    // Save the updated index
    await saveIndex(index);

    const message = imported > 0
      ? `Imported ${imported} entries from ${format} format into ${sourceName}/`
      : `No entries imported. ${parseResult.skipped} skipped, ${errors.length} errors.`;

    return {
      success: imported > 0,
      imported,
      skipped: parseResult.skipped,
      errors,
      outputPath: path.relative(libraryPath, outputPath),
      message,
    };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a source name from the format and path.
 */
function generateSourceName(format: string, inputPath: string): string {
  const basename = path.basename(inputPath, path.extname(inputPath));

  switch (format) {
    case 'jsonl':
      if (basename.includes('memory')) {
        return 'imported-memory';
      }
      return `imported-${basename}`;
    case 'cursor':
      return 'cursor-memory';
    case 'markdown':
      return basename.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'imported-markdown';
    case 'json':
      return basename.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'imported-json';
    case 'sqlite':
      return basename.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'imported-sqlite';
    default:
      return `imported-${format}`;
  }
}

/**
 * Save a parsed entry to the output directory.
 * Returns the relative path from library root.
 */
async function saveEntry(
  entry: ParsedEntry,
  outputPath: string,
  libraryPath: string
): Promise<string> {
  const slug = slugify(entry.title);
  const created = new Date().toISOString();

  // Handle filename collisions
  let filename = `${slug}.md`;
  let filePath = path.join(outputPath, filename);
  let counter = 1;
  while (await fileExists(filePath)) {
    filename = `${slug}-${counter}.md`;
    filePath = path.join(outputPath, filename);
    counter++;
  }

  // Build frontmatter
  const frontmatterLines: string[] = ['---'];
  if (entry.intent) {
    frontmatterLines.push(`intent: "${escapeYaml(entry.intent)}"`);
  }
  if (entry.context) {
    frontmatterLines.push(`context: "${escapeYaml(entry.context)}"`);
  }
  frontmatterLines.push(`created: "${created}"`);
  frontmatterLines.push(`updated: "${created}"`);
  frontmatterLines.push(`source: "${entry.source}"`);
  if (entry.originalPath) {
    frontmatterLines.push(`original_path: "${escapeYaml(entry.originalPath)}"`);
  }
  frontmatterLines.push('hits: 0');
  frontmatterLines.push('last_hit: null');
  frontmatterLines.push('---');

  // Build body
  const bodyLines: string[] = [];
  bodyLines.push(`# ${entry.title}`);
  bodyLines.push('');
  bodyLines.push(entry.content);

  if (entry.reasoning) {
    bodyLines.push('');
    bodyLines.push('## Reasoning');
    bodyLines.push('');
    bodyLines.push(entry.reasoning);
  }

  if (entry.example) {
    bodyLines.push('');
    bodyLines.push('## Example');
    bodyLines.push('');
    bodyLines.push('```');
    bodyLines.push(entry.example);
    bodyLines.push('```');
  }

  // Combine and write
  const fileContent = frontmatterLines.join('\n') + '\n\n' + bodyLines.join('\n') + '\n';
  await fs.writeFile(filePath, fileContent, 'utf-8');

  return path.relative(libraryPath, filePath);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function escapeYaml(text: string): string {
  return text.replace(/"/g, '\\"').replace(/\n/g, ' ');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
