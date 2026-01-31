import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { getLibraryPath, getLocalPath, getImportedPath, getPackagesPath } from '../library/storage.js';
import { loadIndex, saveIndex, addToIndex, getIndexStats, type VectorIndex } from '../library/vector-index.js';

// ============================================================================
// Types
// ============================================================================

export interface RebuildResult {
  success: boolean;
  indexed: number;
  skipped: number;
  errors: string[];
  stats: {
    entryCount: number;
    chunkCount: number;
    modelId: string;
    rebuilt: string;
  };
  message: string;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const rebuildIndexTool = {
  name: 'rebuild_index',
  title: 'Rebuild Search Index',
  description: `Rebuild the semantic search index.

USE THIS TOOL WHEN:
- brief() returns poor or no results when entries exist
- After import_memories() to index new content
- User reports search seems broken
- Manually edited .librarian/ files outside normal workflow

Reads all .md entries and regenerates embeddings. May take a minute.

TRIGGER PATTERNS:
- brief() returning nothing when it shouldn't → rebuild_index()
- After bulk import → rebuild_index()
- "Search seems broken" → rebuild_index()

Example:
- rebuild_index()`,

  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },

  async handler(_args: unknown): Promise<RebuildResult> {
    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);
    const importedPath = getImportedPath(libraryPath);
    const packagesPath = getPackagesPath(libraryPath);

    // Create a fresh index
    const index: VectorIndex = {
      version: 1,
      rebuilt: '',
      modelId: '',
      entries: [],
    };

    let indexed = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Progress file for status checks during rebuild
    const progressFile = path.join(libraryPath, '.rebuild-progress.json');

    // Collect all .md files from all directories
    const allDirs = [localPath, importedPath, packagesPath];
    const allFiles: string[] = [];

    for (const dir of allDirs) {
      try {
        const files = await glob(path.join(dir, '**/*.md'), { nodir: true });
        allFiles.push(...files);
      } catch {
        // Directory doesn't exist, skip
      }
    }

    // Write initial progress
    await fs.writeFile(progressFile, JSON.stringify({
      status: 'processing',
      current: 0,
      total: allFiles.length,
      currentFile: '',
      percent: 0,
      startedAt: new Date().toISOString(),
    }), 'utf-8').catch(() => {});

    // Process each file
    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];

      // Update progress file
      await fs.writeFile(progressFile, JSON.stringify({
        status: 'processing',
        current: i + 1,
        total: allFiles.length,
        currentFile: path.basename(filePath),
        percent: Math.round(((i + 1) / allFiles.length) * 100),
        indexed,
        skipped,
      }), 'utf-8').catch(() => {});

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { data, content: body } = matter(content);

        // Skip empty files
        if (!body.trim()) {
          skipped++;
          continue;
        }

        // Extract title
        let title = data.title;
        if (!title) {
          const headingMatch = body.match(/^#\s+(.+)$/m);
          if (headingMatch) {
            title = headingMatch[1].trim();
          } else {
            title = path.basename(filePath, '.md').replace(/-/g, ' ');
          }
        }

        // Build full content for embedding
        const fullContent = [
          title,
          data.intent || '',
          body.trim(),
          data.context || '',
        ].filter(Boolean).join('\n\n');

        const relativePath = path.relative(libraryPath, filePath);

        await addToIndex(index, relativePath, title, fullContent);
        indexed++;
      } catch (error) {
        const relativePath = path.relative(libraryPath, filePath);
        errors.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
        skipped++;
      }
    }

    // Save the index
    await saveIndex(index);

    // Cleanup progress file
    await fs.unlink(progressFile).catch(() => {});

    const stats = getIndexStats(index);
    const message = indexed > 0
      ? `Rebuilt index with ${indexed} entries (${stats.chunkCount} chunks). ${skipped} skipped.`
      : 'No entries found to index.';

    return {
      success: indexed > 0 || allFiles.length === 0,
      indexed,
      skipped,
      errors,
      stats,
      message,
    };
  },
};
