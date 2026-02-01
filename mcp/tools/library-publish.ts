// ============================================================================
// Marketplace Publish Tool — Multi-Step Wizard
// Each call advances one step. Tool refuses to skip ahead.
// Agent relays between user and tool. User makes every decision.
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { loadApiKey } from './auth.js';
import { getLibraryPath, getLocalPath } from '../library/storage.js';
import { scanForSensitiveData } from '../library/sensitive-scanner.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Wizard State — persists between calls, expires after 10 min
// ============================================================================

interface WizardState {
  step: 'select_entries' | 'set_pricing' | 'set_details' | 'confirm';
  allEntries: CollectedEntry[];
  selectedEntries?: CollectedEntry[];
  sensitiveWarnings?: string[];
  pricing?: { type: string; price_cents?: number };
  consumption?: string;
  name?: string;
  description?: string;
  tags?: string[];
  license?: string;
  created: number;
}

const WIZARD_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
let wizardState: WizardState | null = null;

function clearExpiredWizard() {
  if (wizardState && Date.now() - wizardState.created > WIZARD_EXPIRY_MS) {
    wizardState = null;
  }
}

// ============================================================================
// Types
// ============================================================================

interface PublishArgs {
  entries?: string[];   // Step 2: selected entry filenames ("all" or list)
  pricing?: {
    type: 'open' | 'one_time' | 'subscription';
    price_cents?: number;
  };
  consumption?: string;
  name?: string;
  description?: string;
  tags?: string[];
  license?: string;
  confirm?: boolean; // Final step: user says yes
}

interface CollectedEntry {
  title: string;
  content: string;
  intent?: string;
  context?: string;
  reasoning?: string;
  example?: string;
  originalPath: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const libraryPublishTool = {
  name: 'library_publish',
  title: 'Publish Book',
  description: `Publish local entries as a book on Telvok marketplace.

This is a GUIDED WIZARD. Call with no arguments to start.
The tool walks through each step — DO NOT try to provide all arguments at once.

FLOW:
1. library_publish() → scans entries, shows audit. Ask user which to include.
2. library_publish({ entries: ["all"] }) → shows pricing options. Ask user to choose.
3. library_publish({ pricing: { type: "open" } }) → asks for name/description.
4. library_publish({ name: "...", description: "..." }) → shows summary, requires user confirmation.

Each step REQUIRES the user's input before proceeding. DO NOT decide for the user.
DO NOT provide name, pricing, entries, or description without asking the user first.

If the user says "publish my entries" — call library_publish() with NO args to start the wizard.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      entries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Entry filenames to include. Use ["all"] for everything. Only provide after showing user the entry list.',
      },
      pricing: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['open', 'one_time', 'subscription'] },
          price_cents: { type: 'number' },
        },
        description: 'Only provide after showing user the pricing options.',
      },
      consumption: {
        type: 'string',
        enum: ['inline', 'reference', 'download'],
        description: 'How buyers access content. Only relevant for paid books.',
      },
      name: { type: 'string', description: 'Book title. Only provide after user tells you what to call it.' },
      description: { type: 'string', description: 'Book description. Only provide after user writes or approves it.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Topic tags (max 10).' },
      license: { type: 'string', enum: ['open', 'open_attributed', 'personal'] },
      confirm: { type: 'boolean', description: 'Set to true ONLY after showing the summary to the user and they say yes.' },
    },
    required: [],
  },

  async handler(args: unknown) {
    const input = (args || {}) as PublishArgs;
    clearExpiredWizard();

    // ======================================================================
    // STEP 1: No wizard state → Scan entries, show audit
    // ======================================================================
    if (!wizardState) {
      const allEntries = await collectLocalEntries();

      if (allEntries.length === 0) {
        return {
          success: false,
          message: 'No entries found in .librarian/local/. Use record() to create entries first.',
        };
      }

      // Run sensitive data scan
      const sensitiveFindings = scanForSensitiveData(allEntries);

      // Group entries by folder/topic
      const groups: Record<string, string[]> = {};
      for (const entry of allEntries) {
        const rel = path.relative(getLocalPath(getLibraryPath()), entry.originalPath);
        const folder = path.dirname(rel);
        const key = folder === '.' ? 'root' : folder;
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry.title);
      }

      // Build topic breakdown
      const topicLines = Object.entries(groups)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([folder, titles]) => `  ${folder}/ (${titles.length} entries)`)
        .join('\n');

      // Build warnings
      const warnings: string[] = [];
      if (sensitiveFindings.length > 0) {
        warnings.push(`\n⚠️ SENSITIVE DATA found in ${sensitiveFindings.length} entry(s):`);
        for (const f of sensitiveFindings) {
          warnings.push(`  ⚠ "${f.entry}": ${f.matches.join(', ')}`);
        }
        warnings.push('\nThese entries should be cleaned up before publishing.');
      }

      // Save state
      wizardState = {
        step: 'select_entries',
        allEntries,
        sensitiveWarnings: warnings.length > 0 ? warnings : undefined,
        created: Date.now(),
      };

      return {
        success: true,
        step: 'select_entries',
        message: `📚 Found ${allEntries.length} entries in your library.\n\nTopics:\n${topicLines}${warnings.length > 0 ? '\n' + warnings.join('\n') : ''}`,
        entries_count: allEntries.length,
        ask_user: 'Which entries do you want to include? Say "all" or list specific ones to exclude.',
      };
    }

    // ======================================================================
    // STEP 2: Select entries → Show pricing options
    // ======================================================================
    if (wizardState.step === 'select_entries') {
      if (!input.entries || input.entries.length === 0) {
        return {
          success: false,
          step: 'select_entries',
          message: 'Waiting for entry selection. Ask the user which entries to include.',
          ask_user: 'Which entries do you want to include? Say "all" or list specific ones.',
        };
      }

      let selected: CollectedEntry[];
      if (input.entries.length === 1 && input.entries[0].toLowerCase() === 'all') {
        selected = [...wizardState.allEntries];
      } else {
        selected = wizardState.allEntries.filter(e => {
          const filename = path.basename(e.originalPath);
          return input.entries!.some(f =>
            filename === f ||
            filename === f + '.md' ||
            e.originalPath.endsWith(f) ||
            e.originalPath.endsWith(f + '.md') ||
            e.title.toLowerCase().includes(f.toLowerCase())
          );
        });

        if (selected.length === 0) {
          return {
            success: false,
            step: 'select_entries',
            message: 'No entries matched your selection. Try again with different names or say "all".',
          };
        }
      }

      // Re-check sensitive data on selected entries only
      const sensitiveFindings = scanForSensitiveData(selected);
      if (sensitiveFindings.length > 0) {
        const warnings = sensitiveFindings.map(f =>
          `  ⚠ "${f.entry}": ${f.matches.join(', ')}`
        ).join('\n');

        return {
          success: false,
          step: 'select_entries',
          message: `🚫 Cannot proceed — sensitive data detected in selected entries:\n${warnings}\n\nClean up these entries with record() or delete() first, then start over with library_publish().`,
        };
      }

      wizardState.selectedEntries = selected;
      wizardState.step = 'set_pricing';

      return {
        success: true,
        step: 'set_pricing',
        message: `✓ ${selected.length} entries selected.\n\nChoose a pricing model:\n\n  📖 open — Free. Anyone can download to their local library.\n  💰 one_time — One-time purchase. You set the price (min $1). Cloud-only access. 20% platform fee.\n  🔄 subscription — Monthly subscription. You set the price (min $1/mo). Cloud-only, always latest. 20% platform fee.`,
        selected_count: selected.length,
        ask_user: 'Which pricing model? If paid, what price?',
      };
    }

    // ======================================================================
    // STEP 3: Set pricing → Ask for name/description
    // ======================================================================
    if (wizardState.step === 'set_pricing') {
      if (!input.pricing || !input.pricing.type) {
        return {
          success: false,
          step: 'set_pricing',
          message: 'Waiting for pricing selection. Ask the user which pricing model they want.',
          ask_user: 'Which pricing model? open (free), one_time, or subscription?',
        };
      }

      if (!['open', 'one_time', 'subscription'].includes(input.pricing.type)) {
        return {
          success: false,
          step: 'set_pricing',
          message: 'Invalid pricing type. Must be: open, one_time, or subscription.',
        };
      }

      if (input.pricing.type !== 'open') {
        if (!input.pricing.price_cents || input.pricing.price_cents < 100) {
          return {
            success: false,
            step: 'set_pricing',
            message: 'Paid books require a price of at least $1.00 (100 cents).',
            ask_user: 'What price? (in dollars, e.g. $5 = 500 cents)',
          };
        }
        if (input.pricing.price_cents > 100000) {
          return {
            success: false,
            step: 'set_pricing',
            message: 'Maximum price is $1000.00.',
          };
        }
      }

      // Set consumption based on pricing
      let consumption = input.consumption;
      if (input.pricing.type === 'open') {
        consumption = 'download';
      } else if (!consumption || !['inline', 'reference'].includes(consumption)) {
        consumption = 'inline'; // default for paid
      }

      wizardState.pricing = input.pricing;
      wizardState.consumption = consumption;
      wizardState.step = 'set_details';

      const priceDisplay = input.pricing.type === 'open'
        ? 'Free (download)'
        : `$${(input.pricing.price_cents! / 100).toFixed(2)}/${input.pricing.type === 'subscription' ? 'mo' : 'once'} (20% platform fee)`;

      return {
        success: true,
        step: 'set_details',
        message: `✓ Pricing: ${priceDisplay}\n\nNow give your book a name and description.`,
        ask_user: 'What do you want to call this book? And a short description (optional, max 500 chars)?',
      };
    }

    // ======================================================================
    // STEP 4: Set details → Final confirmation
    // ======================================================================
    if (wizardState.step === 'set_details') {
      if (!input.name || input.name.trim().length < 3) {
        return {
          success: false,
          step: 'set_details',
          message: 'Book name required (at least 3 characters).',
          ask_user: 'What do you want to call this book?',
        };
      }
      if (input.name.trim().length > 100) {
        return {
          success: false,
          step: 'set_details',
          message: 'Book name must be 100 characters or less.',
        };
      }
      if (input.description && input.description.length > 500) {
        return {
          success: false,
          step: 'set_details',
          message: 'Description must be 500 characters or less.',
        };
      }

      wizardState.name = input.name.trim();
      wizardState.description = input.description?.trim();
      wizardState.tags = input.tags;
      wizardState.license = input.license || 'personal';
      wizardState.step = 'confirm';

      const priceDisplay = wizardState.pricing!.type === 'open'
        ? 'Free (download)'
        : `$${(wizardState.pricing!.price_cents! / 100).toFixed(2)}/${wizardState.pricing!.type === 'subscription' ? 'mo' : 'once'}`;

      return {
        success: true,
        step: 'confirm',
        message: `📋 PUBLISH SUMMARY\n\n  Name: ${wizardState.name}\n  Entries: ${wizardState.selectedEntries!.length}\n  Pricing: ${priceDisplay}${wizardState.description ? `\n  Description: ${wizardState.description}` : ''}${wizardState.tags?.length ? `\n  Tags: ${wizardState.tags.join(', ')}` : ''}`,
        ask_user: 'Show this summary to the user. Ask: "Publish this? (yes/no)"',
      };
    }

    // ======================================================================
    // STEP 5: User confirms → Publish
    // ======================================================================
    if (wizardState.step === 'confirm') {
      if (!input.confirm) {
        wizardState = null;
        return {
          success: false,
          message: 'Publish cancelled. Run library_publish() to start over.',
        };
      }

      return await executePublish(wizardState);
    }

    return { success: false, message: 'Unknown state. Run library_publish() to start over.' };
  },
};

// ============================================================================
// Execute Publish — called after confirmation
// ============================================================================

async function executePublish(state: WizardState) {
  const apiKey = await loadApiKey();
  if (!apiKey) {
    wizardState = null;
    return {
      success: false,
      message: 'Not authenticated. Run auth({ action: "login" }) first.',
    };
  }

  const apiEntries = state.selectedEntries!.map(e => ({
    title: e.title,
    content: e.content,
    intent: e.intent,
    context: e.context,
    reasoning: e.reasoning,
    example: e.example,
  }));

  const requestBody = {
    name: state.name,
    description: state.description,
    pricing: state.pricing,
    consumption: state.consumption,
    entries: apiEntries,
    tags: state.tags || [],
    license_type: state.license || 'personal',
    attestation: {
      original_work: true,
      no_secrets: true,
      terms_accepted: true,
    },
  };

  try {
    const response = await fetch(`${TELVOK_API_URL}/api/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    wizardState = null; // Clear state after attempt

    if (!response.ok) {
      if (data.error === 'stripe_connect_required') {
        return {
          success: false,
          message: `Stripe Connect required to sell paid content.\n\nComplete setup at: ${data.setup_url}`,
          setup_url: data.setup_url,
        };
      }
      if (data.error === 'validation_error') {
        const details = Object.entries(data.details || {})
          .map(([k, v]) => `  - ${k}: ${v}`)
          .join('\n');
        return { success: false, message: `Validation failed:\n${details}` };
      }
      return { success: false, message: data.error || `Publish failed: HTTP ${response.status}` };
    }

    return {
      success: true,
      message: `✅ Published "${data.book?.name}" with ${data.entries_count} entries\n\n🔗 ${data.book?.url}`,
      book: data.book,
      entries_count: data.entries_count,
    };
  } catch (error) {
    wizardState = null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Publish failed: ${message}`);
  }
}

// ============================================================================
// Entry Collection
// ============================================================================

async function collectLocalEntries(filter?: string[]): Promise<CollectedEntry[]> {
  const libraryPath = getLibraryPath();
  const localPath = getLocalPath(libraryPath);
  const entries: CollectedEntry[] = [];

  try {
    const files = await glob(path.join(localPath, '**/*.md'), { nodir: true });

    for (const filePath of files) {
      const filename = path.basename(filePath);

      if (filter && filter.length > 0) {
        const matchesFilter = filter.some(f =>
          filename === f ||
          filename === f + '.md' ||
          filePath.endsWith(f) ||
          filePath.endsWith(f + '.md')
        );
        if (!matchesFilter) continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = parseEntryFile(content, filePath);
        if (parsed) {
          entries.push({ ...parsed, originalPath: filePath });
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  } catch {
    // No local directory yet
  }

  return entries;
}

function parseEntryFile(content: string, filePath: string): Omit<CollectedEntry, 'originalPath'> | null {
  const { data: frontmatter, content: body } = matter(content);
  const trimmedBody = body.trim();

  if (!trimmedBody) return null;

  let title = frontmatter.title as string | undefined;
  if (!title) {
    const headingMatch = trimmedBody.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
    } else {
      title = path.basename(filePath, '.md')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  const sections = extractSections(trimmedBody);

  return {
    title,
    content: sections.main || trimmedBody,
    intent: (frontmatter.intent as string | undefined) || undefined,
    context: (frontmatter.context as string | undefined) || undefined,
    reasoning: sections.reasoning,
    example: sections.example,
  };
}

function extractSections(body: string): { main: string; reasoning?: string; example?: string } {
  const result: { main: string; reasoning?: string; example?: string } = { main: body };

  const reasoningMatch = body.match(/##\s*Reasoning\s*\n([\s\S]*?)(?=##|$)/i);
  if (reasoningMatch) result.reasoning = reasoningMatch[1].trim();

  const exampleMatch = body.match(/##\s*Example\s*\n([\s\S]*?)(?=##|$)/i);
  if (exampleMatch) result.example = exampleMatch[1].trim();

  const mainMatch = body.match(/^#\s+.+\n\n?([\s\S]*?)(?=##|$)/);
  if (mainMatch) {
    result.main = mainMatch[1].trim();
  } else {
    const beforeSections = body.match(/^([\s\S]*?)(?=##)/);
    if (beforeSections) result.main = beforeSections[1].trim();
  }

  return result;
}

// ============================================================================
// Export
// ============================================================================

export default libraryPublishTool;
