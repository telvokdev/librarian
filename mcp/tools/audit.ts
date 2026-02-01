// ============================================================================
// Audit Tool
// Scan local entries for sensitive data before publishing
// ============================================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { getLibraryPath, getLocalPath } from '../library/storage.js';
import { scanForSensitiveData, type SensitiveFinding } from '../library/sensitive-scanner.js';

// ============================================================================
// Types
// ============================================================================

interface AuditArgs {
  entries?: string[];
}

interface AuditResult {
  success: boolean;
  message: string;
  total_scanned: number;
  findings: SensitiveFinding[];
  clean: boolean;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const auditTool = {
  name: 'audit',
  title: 'Audit Entries',
  description: `Scan local entries for sensitive data (API keys, passwords, emails, tokens, credentials).

USE THIS TOOL WHEN:
- Before publishing a book — catches leaks before they go public
- User says "audit", "check for secrets", or "scan my entries"
- After recording entries that involved credentials or auth work
- Proactively before any library_publish() call

Returns a list of entries with sensitive data findings, or confirms all clear.

TRIGGER PATTERNS:
- Before publishing → audit()
- "Check my entries for secrets" → audit()
- Scan specific entries → audit({ entries: ["file1.md", "file2.md"] })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      entries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific entry filenames to audit (omit to scan all local/)',
      },
    },
  },

  async handler(args: unknown): Promise<AuditResult> {
    const { entries: entryFilter } = (args || {}) as AuditArgs;

    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);

    // Collect entries
    const collectedEntries: Array<{
      title: string;
      content: string;
      intent?: string;
      context?: string;
      reasoning?: string;
      example?: string;
      originalPath: string;
    }> = [];

    try {
      const files = await glob(path.join(localPath, '**/*.md'), { nodir: true });

      for (const filePath of files) {
        const filename = path.basename(filePath);

        if (entryFilter && entryFilter.length > 0) {
          const matchesFilter = entryFilter.some(f =>
            filename === f ||
            filename === f + '.md' ||
            filePath.endsWith(f) ||
            filePath.endsWith(f + '.md')
          );
          if (!matchesFilter) continue;
        }

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const { data: frontmatter, content: body } = matter(content);
          const trimmedBody = body.trim();
          if (!trimmedBody) continue;

          let title = frontmatter.title as string | undefined;
          if (!title) {
            const headingMatch = trimmedBody.match(/^#\s+(.+)$/m);
            title = headingMatch ? headingMatch[1].trim() : path.basename(filePath, '.md');
          }

          // Extract sections
          const reasoningMatch = trimmedBody.match(/##\s*Reasoning\s*\n([\s\S]*?)(?=##|$)/i);
          const exampleMatch = trimmedBody.match(/##\s*Example\s*\n([\s\S]*?)(?=##|$)/i);

          collectedEntries.push({
            title,
            content: trimmedBody,
            intent: (frontmatter.intent as string) || undefined,
            context: (frontmatter.context as string) || undefined,
            reasoning: reasoningMatch ? reasoningMatch[1].trim() : undefined,
            example: exampleMatch ? exampleMatch[1].trim() : undefined,
            originalPath: filePath,
          });
        } catch {
          // Skip unparseable files
        }
      }
    } catch {
      return {
        success: false,
        message: 'No .librarian/local/ directory found.',
        total_scanned: 0,
        findings: [],
        clean: false,
      };
    }

    if (collectedEntries.length === 0) {
      return {
        success: true,
        message: 'No entries found to audit.',
        total_scanned: 0,
        findings: [],
        clean: true,
      };
    }

    // Run scan
    const findings = scanForSensitiveData(collectedEntries);

    if (findings.length === 0) {
      return {
        success: true,
        message: `✅ All clear — scanned ${collectedEntries.length} entries, no sensitive data found.`,
        total_scanned: collectedEntries.length,
        findings: [],
        clean: true,
      };
    }

    const warnings = findings.map(f =>
      `  ⚠ ${f.entry}: ${f.matches.join(', ')}`
    ).join('\n');

    return {
      success: true,
      message: `⚠ Found sensitive data in ${findings.length} of ${collectedEntries.length} entries:\n${warnings}\n\nClean these up with record() or delete() before publishing.`,
      total_scanned: collectedEntries.length,
      findings,
      clean: false,
    };
  },
};
