import * as fs from 'fs/promises';
import type { ParsedEntry, ParseResult } from './types.js';

// ============================================================================
// JSON Parser - Simple memory servers, knowledge stores
// ============================================================================

interface JSONMemoryEntry {
  title?: string;
  name?: string;
  key?: string;
  content?: string;
  text?: string;
  description?: string;
  value?: string;
  memory?: string;
  observation?: string;
  observations?: string[];
  context?: string;
  category?: string;
  type?: string;
  tags?: string[];
  intent?: string;
  reasoning?: string;
  example?: string;
  [key: string]: unknown;
}

/**
 * Parse a JSON file containing an array of memory entries.
 *
 * Supports various common structures:
 * - Array of objects with title/content
 * - Array of objects with name/description
 * - Object with entries array
 * - Object with memories array
 */
export async function parseJSON(filePath: string): Promise<ParseResult> {
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  let skipped = 0;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Handle different JSON structures
    let items: JSONMemoryEntry[] = [];

    if (Array.isArray(data)) {
      // Direct array of entries
      items = data;
    } else if (typeof data === 'object' && data !== null) {
      // Object with entries/memories/items array
      if (Array.isArray(data.entries)) {
        items = data.entries;
      } else if (Array.isArray(data.memories)) {
        items = data.memories;
      } else if (Array.isArray(data.items)) {
        items = data.items;
      } else if (Array.isArray(data.data)) {
        items = data.data;
      } else {
        // Single object - treat as one entry
        items = [data as JSONMemoryEntry];
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (typeof item !== 'object' || item === null) {
        skipped++;
        continue;
      }

      // Extract title
      const title = item.title || item.name || item.key || `Entry ${i + 1}`;

      // Extract content
      let entryContent =
        item.content ||
        item.text ||
        item.description ||
        item.value ||
        item.memory ||
        item.observation;

      // Handle observations array
      if (!entryContent && item.observations && Array.isArray(item.observations)) {
        entryContent = item.observations.join('\n\n');
      }

      if (!entryContent) {
        skipped++;
        continue;
      }

      // Extract context
      let context: string | undefined;
      if (item.context) {
        context = item.context;
      } else if (item.category) {
        context = item.category;
      } else if (item.type) {
        context = item.type;
      } else if (item.tags && Array.isArray(item.tags)) {
        context = item.tags.join(', ');
      }

      entries.push({
        title: String(title),
        content: String(entryContent),
        context,
        intent: item.intent ? String(item.intent) : undefined,
        reasoning: item.reasoning ? String(item.reasoning) : undefined,
        example: item.example ? String(item.example) : undefined,
        source: 'json' as const,
      });
    }
  } catch (error) {
    errors.push(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { entries, skipped, errors };
}
