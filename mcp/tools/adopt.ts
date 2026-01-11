import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { getLibraryPath, getImportedPath, getLocalPath } from '../library/storage.js';

// ============================================================================
// Types
// ============================================================================

export interface AdoptResult {
  success: boolean;
  message: string;
  path?: string;
  newId?: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const adoptTool = {
  name: 'adopt',
  description: `Adopt an entry from an imported library into your local library.

This copies the entry from imported/ to local/, giving you full ownership.
- The entry gets a new ID and timestamp
- You can now edit it freely
- Original imported entry remains unchanged

Only works for entries in imported/ (not local/ or archived/).`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      entry_id: {
        type: 'string',
        description: 'UUID of the imported entry to adopt',
        format: 'uuid',
      },
      entry: {
        type: 'string',
        description: 'Path to entry: "package/entry-name" or "imported/package/entry-name"',
      },
      library_name: {
        type: 'string',
        description: 'Name of the imported library (for reference)',
      },
    },
    // Neither required - one of entry_id or entry must be provided
  },

  async handler(args: unknown): Promise<AdoptResult> {
    const { entry_id, entry, library_name } = args as {
      entry_id?: string;
      entry?: string;
      library_name?: string;
    };

    if (!entry_id && !entry) {
      throw new Error('Either entry_id (UUID) or entry (path) is required');
    }

    const libraryPath = getLibraryPath();
    const importedPath = getImportedPath(libraryPath);
    const localPath = getLocalPath(libraryPath);

    let filePath: string;
    let foundEntry: FoundEntry | null = null;
    let packageName: string | undefined = library_name;

    if (entry) {
      // Path-based adoption
      // Normalize path: strip "imported/" prefix if present, add .md if missing
      let normalizedPath = entry;
      if (normalizedPath.startsWith('imported/')) {
        normalizedPath = normalizedPath.slice('imported/'.length);
      }
      if (!normalizedPath.endsWith('.md')) {
        normalizedPath += '.md';
      }

      filePath = path.join(importedPath, normalizedPath);

      // Extract package name from path (first segment)
      const pathParts = normalizedPath.split('/');
      if (pathParts.length >= 1) {
        packageName = pathParts[0];
      }

      // Try to read the entry
      try {
        await fs.access(filePath);
        foundEntry = await readEntryFromFile(filePath);
      } catch {
        return {
          success: false,
          message: `Entry not found at: ${entry}`,
        };
      }
    } else {
      // UUID-based adoption (legacy)
      foundEntry = await findEntryById(importedPath, entry_id!);
      if (!foundEntry) {
        return {
          success: false,
          message: `Entry not found: ${entry_id}`,
        };
      }
      filePath = foundEntry.filePath;

      // Extract package name from path
      const relativePath = path.relative(importedPath, filePath);
      const pathParts = relativePath.split(path.sep);
      if (pathParts.length >= 1) {
        packageName = pathParts[0];
      }
    }

    if (!foundEntry) {
      return {
        success: false,
        message: 'Could not read entry',
      };
    }

    // Create new entry in local/
    await fs.mkdir(localPath, { recursive: true });

    // Generate new filename
    const newId = uuidv4();
    const originalFilename = path.basename(filePath);
    let newPath = path.join(localPath, originalFilename);

    // Handle existing file
    let counter = 1;
    while (true) {
      try {
        await fs.access(newPath);
        const ext = path.extname(originalFilename);
        const base = path.basename(originalFilename, ext);
        newPath = path.join(localPath, `${base}-${counter}${ext}`);
        counter++;
      } catch {
        break;
      }
    }

    // Write adopted entry
    const frontmatter: Record<string, unknown> = {
      id: newId,
      topics: foundEntry.entry.topics,
      created: new Date().toISOString(),
      source: 'imported',
    };

    if (packageName) {
      frontmatter.imported_from = packageName;
    }

    if (entry_id || foundEntry.entry.id) {
      frontmatter.adopted_from = entry_id || foundEntry.entry.id;
    }

    const fileContent = matter.stringify(foundEntry.entry.content, frontmatter);
    await fs.writeFile(newPath, fileContent, 'utf-8');

    const relativeFinalPath = path.relative(libraryPath, newPath);

    return {
      success: true,
      message: `Adopted to ${relativeFinalPath}`,
      path: relativeFinalPath,
      newId,
    };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

interface FoundEntry {
  entry: {
    id: string;
    topics: string[];
    content: string;
    created: string;
  };
  filePath: string;
}

async function readEntryFromFile(filePath: string): Promise<FoundEntry | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data, content: body } = matter(content);

    let topics: string[];
    if (Array.isArray(data.topics)) {
      topics = data.topics;
    } else if (data.topic) {
      topics = [data.topic];
    } else {
      topics = ['general'];
    }

    return {
      entry: {
        id: data.id || uuidv4(),
        topics,
        content: body.trim(),
        created: data.created || new Date().toISOString(),
      },
      filePath,
    };
  } catch {
    return null;
  }
}

async function findEntryById(
  importedPath: string,
  entryId: string
): Promise<FoundEntry | null> {
  try {
    await fs.access(importedPath);
  } catch {
    return null;
  }

  // Recursively search imported/ for entry with matching ID
  const searchDir = async (dir: string): Promise<FoundEntry | null> => {
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        const found = await searchDir(itemPath);
        if (found) return found;
      } else if (item.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(itemPath, 'utf-8');
          const { data, content: body } = matter(content);

          if (data.id === entryId) {
            let topics: string[];
            if (Array.isArray(data.topics)) {
              topics = data.topics;
            } else if (data.topic) {
              topics = [data.topic];
            } else {
              topics = ['general'];
            }

            return {
              entry: {
                id: data.id,
                topics,
                content: body.trim(),
                created: data.created || new Date().toISOString(),
              },
              filePath: itemPath,
            };
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    return null;
  };

  return searchDir(importedPath);
}
