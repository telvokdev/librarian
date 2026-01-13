import * as fs from 'fs/promises';
import type { ParsedEntry, ParseResult } from './types.js';

// ============================================================================
// JSONL Parser - Anthropic MCP Memory / mcp-knowledge-graph format
// ============================================================================

interface KnowledgeGraphEntity {
  type: 'entity' | 'relation' | '_aim';
  name?: string;
  entityType?: string;
  observations?: string[];
  from?: string;
  to?: string;
  relationType?: string;
}

/**
 * Parse a JSONL file (Anthropic MCP Memory / mcp-knowledge-graph format).
 *
 * Input format:
 * {"type":"entity","name":"Stripe Webhooks","entityType":"concept","observations":["Need idempotency checks"]}
 * {"type":"relation","from":"Stripe Webhooks","to":"Payment Processing","relationType":"part_of"}
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
        const item = JSON.parse(line) as KnowledgeGraphEntity;

        // Skip safety markers and relations
        if (item.type === '_aim' || item.type === 'relation') {
          skipped++;
          continue;
        }

        // Only process entities
        if (item.type === 'entity' && item.name) {
          // Skip if no observations (empty content)
          if (!item.observations || item.observations.length === 0) {
            skipped++;
            continue;
          }

          entries.push({
            title: item.name,
            content: item.observations.join('\n\n'),
            context: item.entityType || undefined,
            source: 'jsonl',
          });
        } else {
          skipped++;
        }
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
