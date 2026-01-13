import * as fs from 'fs/promises';
import type { ParsedEntry, ParseResult } from './types.js';

// ============================================================================
// JSONL Parser - Handles multiple formats smartly
// ============================================================================

interface JSONLEntry {
  // mcp-knowledge-graph format
  type?: string;
  name?: string;
  entityType?: string;
  observations?: string[];
  // Generic formats
  title?: string;
  key?: string;
  content?: string;
  text?: string;
  description?: string;
  value?: string;
  memory?: string;
  observation?: string;
  body?: string;
  // Metadata
  context?: string;
  category?: string;
  tags?: string[];
  intent?: string;
  reasoning?: string;
  example?: string;
  timestamp?: string;
  created_at?: string;
  [key: string]: unknown;
}

/**
 * Parse a JSONL file. Supports multiple formats:
 *
 * mcp-knowledge-graph:
 * {"type":"entity","name":"Topic","observations":["fact 1","fact 2"]}
 *
 * Generic memory formats:
 * {"title":"Topic","content":"..."}
 * {"content":"...","timestamp":"..."}
 * {"text":"...","metadata":{}}
 * {"memory":"...","created_at":"..."}
 */
export async function parseJSONL(filePath: string): Promise<ParseResult> {
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  let skipped = 0;

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      try {
        const item = JSON.parse(line) as JSONLEntry;

        // Skip internal markers and relations
        if (item.type === '_aim' || item.type === 'relation') {
          skipped++;
          continue;
        }

        // Extract title (try multiple fields)
        const title = item.name || item.title || item.key || `Entry ${i + 1}`;

        // Extract content (try multiple fields)
        let entryContent: string | undefined;

        // Check observations array first (mcp-knowledge-graph)
        if (item.observations && Array.isArray(item.observations) && item.observations.length > 0) {
          entryContent = item.observations.join('\n\n');
        }

        // Fall back to common content fields
        if (!entryContent) {
          entryContent = item.content || item.text || item.description ||
                        item.value || item.memory || item.observation || item.body;
        }

        // Skip if no content found
        if (!entryContent) {
          skipped++;
          continue;
        }

        // Extract context
        let context: string | undefined;
        if (item.entityType) {
          context = item.entityType;
        } else if (item.context) {
          context = item.context;
        } else if (item.category) {
          context = item.category;
        } else if (item.type && item.type !== 'entity' && item.type !== 'memory') {
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
          source: 'jsonl',
        });
      } catch (parseError) {
        errors.push(`Line ${i + 1}: Invalid JSON - ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        skipped++;
      }
    }
  } catch (fileError) {
    errors.push(`Failed to read file: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
  }

  return { entries, skipped, errors };
}
