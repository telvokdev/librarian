import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { getLibraryPath, getLocalPath } from '../library/storage.js';

// ============================================================================
// Types
// ============================================================================

export interface RecordResult {
  success: boolean;
  message: string;
  path?: string;
  id?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const recordTool = {
  name: 'record',
  description: `Save a learning to the local library.

Captures insights, decisions, patterns, and gotchas worth remembering.
Entries go to .librarian/local/ and are searchable via brief().

Quality bar: Would a senior dev say this to a new hire?
- YES: "Don't trust Stripe's retry logic, implement idempotency yourself"
- NO: "Respond in a friendly way" (too generic)

Examples:
- record({ topics: ["webhooks", "stripe"], content: "Always add idempotency..." })
- record({ topics: "deployment", content: "Staging-first on Fridays..." })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      topics: {
        oneOf: [
          { type: 'string', description: 'Single topic tag' },
          { type: 'array', items: { type: 'string' }, description: 'Array of topic tags' },
        ],
        description: 'Topic tags - string or array (e.g., "deployment" or ["stripe", "webhooks"])',
      },
      content: {
        type: 'string',
        description: 'The reasoning/insight to record',
      },
    },
    required: ['topics', 'content'],
  },

  async handler(args: unknown): Promise<RecordResult> {
    const { topics: rawTopics, content } = args as {
      topics: string | string[];
      content: string;
    };

    if (!rawTopics || !content) {
      throw new Error('Both topics and content are required');
    }

    // Normalize topics to array
    const topics = Array.isArray(rawTopics) ? rawTopics : [rawTopics];

    if (topics.length === 0) {
      throw new Error('At least one topic is required');
    }

    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);

    // Ensure local directory exists
    await fs.mkdir(localPath, { recursive: true });

    // Generate entry
    const id = uuidv4();
    const created = new Date().toISOString();

    // Create filename from first topic and timestamp
    const slug = topics[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const timestamp = created.slice(0, 10); // YYYY-MM-DD
    let filename = `${slug}-${timestamp}.md`;

    // Handle collisions
    let filePath = path.join(localPath, filename);
    let counter = 1;
    while (true) {
      try {
        await fs.access(filePath);
        filename = `${slug}-${timestamp}-${counter}.md`;
        filePath = path.join(localPath, filename);
        counter++;
      } catch {
        break;
      }
    }

    // Build frontmatter
    const frontmatter: Record<string, unknown> = {
      id,
      topics,
      created,
      source: 'manual',
    };

    // Write file
    const fileContent = matter.stringify(content, frontmatter);
    await fs.writeFile(filePath, fileContent, 'utf-8');

    const relativePath = path.relative(libraryPath, filePath);

    return {
      success: true,
      message: `Recorded to ${relativePath}`,
      path: relativePath,
      id,
    };
  },
};
