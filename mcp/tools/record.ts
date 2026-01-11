import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLibraryPath, getLocalPath } from '../library/storage.js';

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
  description: `Capture knowledge worth keeping. We're building a library together.

Every session we learn things that evaporate by tomorrow. This catches
the good stuff - what we learned, why it matters, how it works.

Quality bar: "I wish we knew this yesterday"

Good entries:
- "Stripe retries webhooks but doesn't dedupe - always check idempotency key"
- "Clock skew between services - add 30s buffer to token validation"
- "The staging deploy must happen before prod or the migration breaks"

Not worth recording:
- Generic docs (we can search those)
- Temporary hacks
- Stuff that'll change next week

Examples:

Quick:
- record({ insight: "Stripe webhooks need idempotency checks" })

Rich:
- record({
    intent: "Add Stripe webhook handler",
    insight: "Stripe retries failed webhooks but doesn't dedupe. Always check idempotency key or you'll process payments twice.",
    reasoning: "Their retry logic assumes failures, not slow responses",
    context: "payments",
    example: "if (await isDuplicate(event.id)) return;"
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
