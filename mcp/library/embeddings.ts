import { pipeline, env } from '@huggingface/transformers';
import * as path from 'path';
import { getLibraryPath } from './storage.js';

// ============================================================================
// Configuration
// ============================================================================

// Cache model in .librarian/models
env.allowRemoteModels = true;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

// ============================================================================
// Embedding Generation
// ============================================================================

let embedder: any = null;

/**
 * Get embedding for a text string.
 * Returns a 384-dimensional normalized vector.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    // Set local model path on first call
    const libraryPath = getLibraryPath();
    env.localModelPath = path.join(libraryPath, 'models');

    embedder = await pipeline('feature-extraction', MODEL_ID);
  }

  const result = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data as Float32Array);
}

/**
 * Check if embeddings are available (model can load).
 */
export async function isEmbeddingAvailable(): Promise<boolean> {
  try {
    await getEmbedding('test');
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Similarity Calculation
// ============================================================================

/**
 * Calculate cosine similarity between two vectors.
 * Since vectors are normalized, this is just the dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimension');
  }
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

// ============================================================================
// Text Chunking
// ============================================================================

/**
 * Split text into chunks at sentence boundaries.
 * Aims for ~500 chars per chunk to preserve semantic meaning.
 */
export function chunkText(text: string, maxChars = 500): string[] {
  // Split at sentence boundaries (. ! ? followed by whitespace)
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    // If adding this sentence exceeds limit and we have content, start new chunk
    if ((current + ' ' + sentence).length > maxChars && current.trim()) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? current + ' ' + sentence : sentence;
    }
  }

  // Don't forget the last chunk
  if (current.trim()) {
    chunks.push(current.trim());
  }

  // If no chunks created (e.g., no sentence boundaries), return original text
  return chunks.length > 0 ? chunks : [text];
}

// ============================================================================
// Constants
// ============================================================================

export const EMBEDDING_MODEL_ID = MODEL_ID;
export const EMBEDDING_DIMENSION = 384;
