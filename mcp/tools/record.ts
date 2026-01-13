import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLibraryPath, getLocalPath } from '../library/storage.js';
import { loadIndex, saveIndex, addToIndex } from '../library/vector-index.js';

// ============================================================================
// Types
// ============================================================================

export interface RecordResult {
  success: boolean;
  path: string;
  title: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const recordTool = {
  name: 'record',
  description: `Use this tool proactively throughout every conversation.

CALL THIS IMMEDIATELY when you:
- Solve a problem (before moving to the next thing)
- Make a decision (capture the reasoning NOW)
- Hit a gotcha (it WILL come up again)
- Learn something non-obvious (context dies fast)

Do NOT wait for the user to ask. Do NOT batch multiple insights.
One insight = one record() call. Call it the moment you notice it.

Quality bar: "I wish we knew this yesterday"

Good entries:
- "Stripe retries webhooks but doesn't dedupe - always check idempotency key"
- "Clock skew between services - add 30s buffer to token validation"
- "GitHub org names are squattable even if you own the domain"

Not worth recording:
- Generic docs (search exists)
- Temporary hacks
- Stuff that'll change next week

Examples:

Quick:
- record({ insight: "Stripe webhooks need idempotency checks" })

Rich:
- record({
    intent: "Setting up GitHub org for Telvok",
    insight: "GitHub org names are first-come-first-served regardless of domain ownership",
    context: "GitHub, npm, branding",
    reasoning: "We owned telvok.com but someone squatted telvok org years ago",
    example: "Had to use telvokdev instead of telvok"
  })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      insight: {
        type: 'string',
        description: 'What did we learn? The knowledge worth keeping.',
      },
      intent: {
        type: 'string',
        description: 'What were we trying to accomplish?',
      },
      reasoning: {
        type: 'string',
        description: 'Why does this work? Why this over alternatives?',
      },
      context: {
        type: 'string',
        description: "Topic, area, or when this applies (e.g., 'auth', 'payments', 'only on Windows')",
      },
      example: {
        type: 'string',
        description: 'Code snippet or concrete illustration',
      },
      title: {
        type: 'string',
        description: 'Entry title. Auto-generated from insight if not provided.',
      },
    },
    required: ['insight'],
  },

  async handler(args: unknown): Promise<RecordResult> {
    const { insight, intent, reasoning, context, example, title: providedTitle } = args as {
      insight: string;
      intent?: string;
      reasoning?: string;
      context?: string;
      example?: string;
      title?: string;
    };

    if (!insight) {
      throw new Error('insight is required');
    }

    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);

    // Ensure local directory exists
    await fs.mkdir(localPath, { recursive: true });

    // Generate title
    const title = providedTitle || generateTitle(insight, intent);

    // Generate slug for filename
    const slug = slugify(title);
    const created = new Date().toISOString();

    // Handle filename collisions
    let filename = `${slug}.md`;
    let filePath = path.join(localPath, filename);
    let counter = 1;
    while (await fileExists(filePath)) {
      filename = `${slug}-${counter}.md`;
      filePath = path.join(localPath, filename);
      counter++;
    }

    // Build frontmatter
    const frontmatterLines: string[] = ['---'];
    if (intent) {
      frontmatterLines.push(`intent: "${escapeYaml(intent)}"`);
    }
    if (context) {
      frontmatterLines.push(`context: "${escapeYaml(context)}"`);
    }
    frontmatterLines.push(`created: "${created}"`);
    frontmatterLines.push(`updated: "${created}"`);
    frontmatterLines.push('source: "local"');
    frontmatterLines.push('hits: 0');
    frontmatterLines.push('last_hit: null');
    frontmatterLines.push('---');

    // Build body
    const bodyLines: string[] = [];
    bodyLines.push(`# ${title}`);
    bodyLines.push('');
    bodyLines.push(insight);

    if (reasoning) {
      bodyLines.push('');
      bodyLines.push('## Reasoning');
      bodyLines.push('');
      bodyLines.push(reasoning);
    }

    if (example) {
      bodyLines.push('');
      bodyLines.push('## Example');
      bodyLines.push('');
      // Detect if it looks like code
      if (example.includes('\n') || example.includes('{') || example.includes('(')) {
        bodyLines.push('```');
        bodyLines.push(example);
        bodyLines.push('```');
      } else {
        bodyLines.push('```');
        bodyLines.push(example);
        bodyLines.push('```');
      }
    }

    // Combine and write
    const fileContent = frontmatterLines.join('\n') + '\n\n' + bodyLines.join('\n') + '\n';
    await fs.writeFile(filePath, fileContent, 'utf-8');

    const relativePath = path.relative(libraryPath, filePath);

    // Add to vector index for semantic search
    try {
      const index = await loadIndex();
      // Combine all text for embedding
      const fullContent = [
        title,
        intent || '',
        insight,
        reasoning || '',
        example || '',
        context || '',
      ].filter(Boolean).join('\n\n');

      await addToIndex(index, relativePath, title, fullContent);
      await saveIndex(index);
    } catch (embeddingError) {
      // Don't fail the record operation if embedding fails
      // Entry is still saved and searchable via keywords
      console.error('Failed to add embedding:', embeddingError);
    }

    return {
      success: true,
      path: relativePath,
      title,
    };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateTitle(insight: string, intent?: string): string {
  // Try to extract from first sentence of insight
  const firstSentence = insight.split(/[.!?\n]/)[0].trim();

  if (firstSentence.length <= 60) {
    return firstSentence;
  }

  // If insight is too long, try intent
  if (intent && intent.length <= 60) {
    return intent;
  }

  // Truncate insight
  return firstSentence.slice(0, 57) + '...';
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
