import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { v4 as uuidv4 } from 'uuid';
import {
  getLibraryPath,
  getLocalPath,
  getImportedPath,
  getArchivedPath,
} from './storage.js';
import type { LibraryEntry } from './schemas.js';

// ============================================================================
// Library Manager
// ============================================================================

export class LibraryManager {
  private libraryPath: string;

  constructor() {
    this.libraryPath = getLibraryPath();
  }

  /**
   * Initialize the library directory structure.
   */
  async initialize(): Promise<void> {
    const dirs = [
      getLocalPath(this.libraryPath),
      getImportedPath(this.libraryPath),
      getArchivedPath(this.libraryPath),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Get all entries from local library.
   */
  async getLocalEntries(): Promise<LibraryEntry[]> {
    const localPath = getLocalPath(this.libraryPath);
    return this.readEntriesFromPath(localPath, 'local');
  }

  /**
   * Get all entries from imported libraries.
   */
  async getImportedEntries(): Promise<LibraryEntry[]> {
    const importedPath = getImportedPath(this.libraryPath);
    return this.readEntriesFromPath(importedPath, 'imported');
  }

  /**
   * Get all archived entries.
   */
  async getArchivedEntries(): Promise<LibraryEntry[]> {
    const archivedPath = getArchivedPath(this.libraryPath);
    return this.readEntriesFromPath(archivedPath, 'archived');
  }

  /**
   * Query entries by topic.
   */
  async queryByTopic(topic: string): Promise<LibraryEntry[]> {
    const [local, imported] = await Promise.all([
      this.getLocalEntries(),
      this.getImportedEntries(),
    ]);

    const allEntries = [...local, ...imported];
    const searchTerm = topic.toLowerCase();

    return allEntries.filter(entry =>
      entry.topics.some(t => t.toLowerCase().includes(searchTerm)) ||
      entry.content.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Record a new entry to local library.
   */
  async record(
    topics: string[],
    content: string
  ): Promise<{ entry: LibraryEntry; path: string }> {
    const localPath = getLocalPath(this.libraryPath);
    await fs.mkdir(localPath, { recursive: true });

    const id = uuidv4();
    const created = new Date().toISOString();

    const entry: LibraryEntry = {
      id,
      topics,
      content,
      created,
      source: 'local',
      origin: 'manual',
    };

    // Generate filename
    const slug = topics[0]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const timestamp = created.slice(0, 10);
    let filename = `${slug}-${timestamp}.md`;
    let filePath = path.join(localPath, filename);

    // Handle collisions
    let counter = 1;
    while (await this.fileExists(filePath)) {
      filename = `${slug}-${timestamp}-${counter}.md`;
      filePath = path.join(localPath, filename);
      counter++;
    }

    // Write file
    const frontmatter: Record<string, unknown> = {
      id,
      topics,
      created,
      source: 'manual',
    };

    const fileContent = matter.stringify(content, frontmatter);
    await fs.writeFile(filePath, fileContent, 'utf-8');

    return {
      entry,
      path: path.relative(this.libraryPath, filePath),
    };
  }

  /**
   * Archive an entry (move to archived/).
   */
  async archive(entryId: string): Promise<{ success: boolean; message: string }> {
    const localPath = getLocalPath(this.libraryPath);
    const archivedPath = getArchivedPath(this.libraryPath);

    // Find the entry
    const found = await this.findEntryById(localPath, entryId);
    if (!found) {
      return { success: false, message: `Entry not found: ${entryId}` };
    }

    await fs.mkdir(archivedPath, { recursive: true });

    const filename = path.basename(found.filePath);
    const newPath = path.join(archivedPath, filename);

    await fs.rename(found.filePath, newPath);

    return {
      success: true,
      message: `Archived to ${path.relative(this.libraryPath, newPath)}`,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async readEntriesFromPath(
    dirPath: string,
    source: 'local' | 'imported' | 'archived'
  ): Promise<LibraryEntry[]> {
    const entries: LibraryEntry[] = [];

    try {
      const files = await glob(path.join(dirPath, '**/*.md'), { nodir: true });

      for (const filePath of files) {
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

          entries.push({
            id: data.id || uuidv4(),
            topics,
            content: body.trim(),
            created: data.created || new Date().toISOString(),
            source,
            origin: data.source,
            imported_from: data.imported_from,
          });
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return entries;
  }

  private async findEntryById(
    dirPath: string,
    entryId: string
  ): Promise<{ entry: LibraryEntry; filePath: string } | null> {
    try {
      const files = await glob(path.join(dirPath, '**/*.md'), { nodir: true });

      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
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
                source: 'local',
                origin: data.source,
              },
              filePath,
            };
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return null;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
