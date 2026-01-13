import Database from 'better-sqlite3';
import type { ParsedEntry, ParseResult } from './types.js';

// ============================================================================
// SQLite Parser - mcp-memory-service, SQLite-vec, custom databases
// ============================================================================

// Common table names for memory storage
const TABLE_CANDIDATES = ['memories', 'entries', 'knowledge', 'notes', 'items', 'documents'];

// Common column names for different fields
const TITLE_CANDIDATES = ['title', 'name', 'key', 'id', 'subject', 'heading'];
const CONTENT_CANDIDATES = ['content', 'text', 'value', 'memory', 'observation', 'body', 'description', 'note'];
const CONTEXT_CANDIDATES = ['context', 'category', 'type', 'tags', 'topic', 'area'];

/**
 * Parse a SQLite database file for memory entries.
 *
 * Auto-detects table and column names from common patterns.
 * Supports mcp-memory-service, SQLite-vec, and custom schemas.
 */
export async function parseSQLite(filePath: string): Promise<ParseResult> {
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  let skipped = 0;

  let db: Database.Database | null = null;

  try {
    db = new Database(filePath, { readonly: true });

    // Find a suitable table
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name.toLowerCase());
    const targetTable = TABLE_CANDIDATES.find((candidate) =>
      tableNames.includes(candidate)
    );

    if (!targetTable) {
      errors.push(
        `No memory table found. Available tables: ${tableNames.join(', ')}. ` +
        `Expected one of: ${TABLE_CANDIDATES.join(', ')}`
      );
      return { entries, skipped, errors };
    }

    // Get column info for the target table
    const columns = db.prepare(`PRAGMA table_info(${targetTable})`).all() as {
      name: string;
      type: string;
    }[];
    const columnNames = columns.map((c) => c.name.toLowerCase());

    // Find content column (required)
    const contentColumn = CONTENT_CANDIDATES.find((candidate) =>
      columnNames.includes(candidate)
    );

    if (!contentColumn) {
      errors.push(
        `No content column found in table "${targetTable}". ` +
        `Available columns: ${columnNames.join(', ')}. ` +
        `Expected one of: ${CONTENT_CANDIDATES.join(', ')}`
      );
      return { entries, skipped, errors };
    }

    // Find optional columns
    const titleColumn = TITLE_CANDIDATES.find((candidate) =>
      columnNames.includes(candidate)
    );
    const contextColumn = CONTEXT_CANDIDATES.find((candidate) =>
      columnNames.includes(candidate)
    );

    // Build and execute query
    const selectColumns = [
      contentColumn,
      titleColumn,
      contextColumn,
    ].filter(Boolean);

    const query = `SELECT ${selectColumns.join(', ')} FROM ${targetTable}`;
    const rows = db.prepare(query).all() as Record<string, unknown>[];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract content
      const content = row[contentColumn];
      if (!content || typeof content !== 'string' || !content.trim()) {
        skipped++;
        continue;
      }

      // Extract title
      let title: string;
      if (titleColumn && row[titleColumn]) {
        title = String(row[titleColumn]);
      } else {
        // Generate title from content
        title = content.slice(0, 60).replace(/\s+/g, ' ').trim();
        if (content.length > 60) title += '...';
      }

      // Extract context
      let context: string | undefined;
      if (contextColumn && row[contextColumn]) {
        const contextValue = row[contextColumn];
        if (typeof contextValue === 'string') {
          context = contextValue;
        } else if (Array.isArray(contextValue)) {
          context = contextValue.join(', ');
        }
      }

      entries.push({
        title,
        content: content.trim(),
        context,
        source: 'sqlite' as const,
        originalPath: `${filePath}:${targetTable}`,
      });
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('SQLITE_CANTOPEN')) {
        errors.push(`Cannot open database file: ${filePath}`);
      } else if (error.message.includes('file is not a database')) {
        errors.push(`File is not a valid SQLite database: ${filePath}`);
      } else {
        errors.push(`SQLite error: ${error.message}`);
      }
    } else {
      errors.push(`Unknown error: ${String(error)}`);
    }
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  return { entries, skipped, errors };
}
