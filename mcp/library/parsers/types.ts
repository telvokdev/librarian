// ============================================================================
// Shared Types for Memory Parsers
// ============================================================================

/**
 * A parsed memory entry ready to be converted to Librarian format.
 */
export interface ParsedEntry {
  title: string;
  content: string;
  context?: string;
  intent?: string;
  reasoning?: string;
  example?: string;
  source: 'jsonl' | 'markdown' | 'cursor' | 'json' | 'sqlite';
  originalPath?: string;
}

/**
 * Result of a parse operation.
 */
export interface ParseResult {
  entries: ParsedEntry[];
  skipped: number;
  errors: string[];
}
