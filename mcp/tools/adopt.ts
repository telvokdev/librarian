import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { getLibraryPath, getImportedPath, getLocalPath, getPackagesPath } from '../library/storage.js';

// ============================================================================
// Types
// ============================================================================

export interface AdoptResult {
  success: boolean;
  from: string;
  to: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const adoptTool = {
  name: 'adopt',
  description: `Make imported knowledge ours.

When an entry from an imported package proves useful, adopt it into our
local library. It graduates from "their knowledge" to "our knowledge" -
now we can edit and evolve it.

Examples:
- adopt({ path: "imported/stripe-patterns/webhook-idempotency" })
- adopt({ path: "imported/auth-patterns/token-refresh", title: "Our token refresh" })`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: "Path to entry to adopt (e.g., 'imported/package-name/entry-name')",
      },
      title: {
        type: 'string',
        description: 'New title for adopted entry. Keeps original if not provided.',
      },
    },
    required: ['path'],
  },

  async handler(args: unknown): Promise<AdoptResult> {
    const { path: entryPath, title: newTitle } = args as {
      path: string;
      title?: string;
    };

    if (!entryPath) {
      throw new Error('path is required');
    }

    const libraryPath = getLibraryPath();
    const importedPath = getImportedPath(libraryPath);
    const packagesPath = getPackagesPath(libraryPath);
    const localPath = getLocalPath(libraryPath);

    // Normalize path: strip "imported/" or "packages/" prefix if present, add .md if missing
    let normalizedPath = entryPath;
    if (normalizedPath.startsWith('imported/')) {
      normalizedPath = normalizedPath.slice('imported/'.length);
    } else if (normalizedPath.startsWith('packages/')) {
      normalizedPath = normalizedPath.slice('packages/'.length);
    }
    if (!normalizedPath.endsWith('.md')) {
      normalizedPath += '.md';
    }

    // Try both imported/ and packages/ paths
    let sourcePath = path.join(importedPath, normalizedPath);
    try {
      await fs.access(sourcePath);
    } catch {
      // Try packages path (for library downloads)
      sourcePath = path.join(packagesPath, normalizedPath);
      try {
        await fs.access(sourcePath);
      } catch {
        throw new Error(`Entry not found: ${entryPath}`);
      }
    }

    // Read source file
    const content = await fs.readFile(sourcePath, 'utf-8');
    const { data, content: body } = matter(content);

    // Extract package name from path
    const pathParts = normalizedPath.split('/');
    const packageName = pathParts[0];

    // Determine title
    let title = newTitle;
    if (!title) {
      // Try to extract from frontmatter or H1
      title = data.title;
      if (!title) {
        const headingMatch = body.match(/^#\s+(.+)$/m);
        if (headingMatch) {
          title = headingMatch[1].trim();
        } else {
          title = path.basename(sourcePath, '.md').replace(/-/g, ' ');
        }
      }
    }

    // Generate slug for new filename
    const slug = slugify(title);
    const now = new Date().toISOString();

    // Ensure local directory exists
    await fs.mkdir(localPath, { recursive: true });

    // Handle filename collisions
    let filename = `${slug}.md`;
    let destPath = path.join(localPath, filename);
    let counter = 1;
    while (await fileExists(destPath)) {
      filename = `${slug}-${counter}.md`;
      destPath = path.join(localPath, filename);
      counter++;
    }

    // Build new frontmatter
    const newFrontmatter: Record<string, unknown> = {
      ...data,
      updated: now,
      source: `adopted from ${packageName}`,
    };

    // Update title in frontmatter if changed
    if (newTitle) {
      newFrontmatter.title = newTitle;
    }

    // Update body if title changed
    let newBody = body;
    if (newTitle) {
      // Replace first H1 if exists
      const headingMatch = body.match(/^#\s+.+$/m);
      if (headingMatch) {
        newBody = body.replace(/^#\s+.+$/m, `# ${newTitle}`);
      } else {
        // Prepend title
        newBody = `# ${newTitle}\n\n${body}`;
      }
    }

    // Write adopted file
    const fileContent = matter.stringify(newBody, newFrontmatter);
    await fs.writeFile(destPath, fileContent, 'utf-8');

    return {
      success: true,
      from: path.relative(libraryPath, sourcePath),
      to: path.relative(libraryPath, destPath),
    };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
