import * as fs from 'fs/promises';
import * as path from 'path';
import { getLibraryPath } from './storage.js';
import { getEmbedding, chunkText, cosineSimilarity, EMBEDDING_MODEL_ID } from './embeddings.js';

// ============================================================================
// Types
// ============================================================================

export interface IndexEntry {
  path: string;      // Relative path to .md file
  title: string;     // Entry title
  embedding: number[]; // 384-dim vector
  chunk: number;     // Chunk index (0, 1, 2, ...)
  preview: string;   // First 100 chars of chunk
}

export interface VectorIndex {
  version: number;
  rebuilt: string;   // ISO timestamp
  modelId: string;   // For staleness detection
  entries: IndexEntry[];
}

export interface SemanticMatch {
  path: string;
  title: string;
  similarity: number;
  preview: string;
}

// ============================================================================
// Constants
// ============================================================================

const INDEX_FILENAME = 'index.json';
const CURRENT_VERSION = 1;

// ============================================================================
// Index File Operations
// ============================================================================

/**
 * Get path to the index file.
 */
function getIndexPath(): string {
  return path.join(getLibraryPath(), INDEX_FILENAME);
}

/**
 * Load the vector index from disk.
 * Returns empty index if file doesn't exist or is invalid.
 */
export async function loadIndex(): Promise<VectorIndex> {
  const indexPath = getIndexPath();

  try {
    const data = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(data) as VectorIndex;

    // Validate structure
    if (!index.version || !Array.isArray(index.entries)) {
      return createEmptyIndex();
    }

    return index;
  } catch {
    // File doesn't exist or is invalid
    return createEmptyIndex();
  }
}

/**
 * Save the vector index to disk.
 */
export async function saveIndex(index: VectorIndex): Promise<void> {
  const indexPath = getIndexPath();

  // Update metadata
  index.rebuilt = new Date().toISOString();
  index.modelId = EMBEDDING_MODEL_ID;

  // Ensure directory exists
  await fs.mkdir(path.dirname(indexPath), { recursive: true });

  // Write atomically by writing to temp file first
  const tempPath = indexPath + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(index, null, 2), 'utf-8');
  await fs.rename(tempPath, indexPath);
}

/**
 * Create an empty index.
 */
function createEmptyIndex(): VectorIndex {
  return {
    version: CURRENT_VERSION,
    rebuilt: '',
    modelId: EMBEDDING_MODEL_ID,
    entries: [],
  };
}

// ============================================================================
// Index Operations
// ============================================================================

/**
 * Add or update an entry in the index.
 * Chunks the content and generates embeddings for each chunk.
 */
export async function addToIndex(
  index: VectorIndex,
  entryPath: string,
  title: string,
  content: string
): Promise<void> {
  // Remove any existing entries for this path
  index.entries = index.entries.filter(e => e.path !== entryPath);

  // Chunk the content
  const chunks = chunkText(content);

  // Generate embeddings for each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      const embedding = await getEmbedding(chunk);

      index.entries.push({
        path: entryPath,
        title,
        embedding,
        chunk: i,
        preview: chunk.slice(0, 100) + (chunk.length > 100 ? '...' : ''),
      });
    } catch (error) {
      // Log but don't fail - entry will still be searchable via keywords
      console.error(`Failed to embed chunk ${i} for ${entryPath}:`, error);
    }
  }
}

/**
 * Remove an entry from the index.
 */
export function removeFromIndex(index: VectorIndex, entryPath: string): void {
  index.entries = index.entries.filter(e => e.path !== entryPath);
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * Search the index for entries semantically similar to the query.
 * Returns paths ranked by similarity, deduped to best chunk per entry.
 */
export async function semanticSearch(
  index: VectorIndex,
  query: string,
  limit: number = 5
): Promise<SemanticMatch[]> {
  if (index.entries.length === 0) {
    return [];
  }

  // Get query embedding
  const queryEmbedding = await getEmbedding(query);

  // Score all entries
  const scored = index.entries.map(entry => ({
    ...entry,
    similarity: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  // Dedupe by path - keep the chunk with highest similarity
  const byPath = new Map<string, typeof scored[0]>();
  for (const entry of scored) {
    const existing = byPath.get(entry.path);
    if (!existing || entry.similarity > existing.similarity) {
      byPath.set(entry.path, entry);
    }
  }

  // Sort by similarity descending and apply limit
  const results = [...byPath.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(entry => ({
      path: entry.path,
      title: entry.title,
      similarity: entry.similarity,
      preview: entry.preview,
    }));

  return results;
}

// ============================================================================
// Index Health
// ============================================================================

/**
 * Check if the index might be stale (model changed).
 */
export function isIndexStale(index: VectorIndex): boolean {
  return index.modelId !== EMBEDDING_MODEL_ID;
}

/**
 * Get index statistics.
 */
export function getIndexStats(index: VectorIndex): {
  entryCount: number;
  chunkCount: number;
  modelId: string;
  rebuilt: string;
} {
  const uniquePaths = new Set(index.entries.map(e => e.path));

  return {
    entryCount: uniquePaths.size,
    chunkCount: index.entries.length,
    modelId: index.modelId,
    rebuilt: index.rebuilt,
  };
}
