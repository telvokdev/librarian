import * as fs from 'fs/promises';
import * as path from 'path';
import matter from 'gray-matter';
import { glob } from 'glob';
import { getLibraryPath, getLocalPath, getImportedPath, getPackagesPath } from '../library/storage.js';
import { loadIndex, semanticSearch, isIndexStale, type SemanticMatch } from '../library/vector-index.js';
import { loadApiKey } from './auth.js';

// ============================================================================
// Types
// ============================================================================

export interface BriefEntry {
  title: string;
  intent: string | null;
  context: string | null;
  preview: string;  // First 100 chars of insight - Claude reads full entry itself
  path: string;
  created: string;
  hits: number;           // How many times this entry helped
  last_hit: string | null; // When it last helped
  source?: 'local' | 'cloud' | 'packages';  // Where this entry came from
  book_name?: string;     // For cloud entries: which book this is from
  book_slug?: string;     // For cloud entries: book slug for attribution
}

export interface MarketplaceBook {
  slug: string;
  name: string;
  description: string;
  pricing: string;
  price: string;
  entries: number;
}

export interface BriefResult {
  entries: BriefEntry[];
  total: number;
  message: string;
  libraryPath: string;  // So Claude knows where to read full entries
  library?: {
    books: MarketplaceBook[];
    total: number;
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

export const briefTool = {
  name: 'brief',
  description: `Check what we already know before diving in.

We've solved problems before. Before thinking through a problem, making
decisions, or planning - brief yourself on what past-us figured out.
Searches intent, insight, context, and examples.

Examples:
- brief({ query: "stripe webhooks" })
- brief({ query: "auth token" })
- brief({}) → returns recent entries
- brief({ query: "react", include_library: true }) → also search library`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'What are we working on? Searches our library. Leave empty to see recent entries.',
      },
      limit: {
        type: 'number',
        description: 'Max entries to return',
        default: 5,
      },
      include_library: {
        type: 'boolean',
        description: 'Also search Telvok library for relevant books',
        default: false,
      },
    },
    required: [],
  },

  async handler(args: unknown): Promise<BriefResult> {
    const { query, limit = 5, include_library = false } = args as {
      query?: string;
      limit?: number;
      include_library?: boolean;
    };

    const libraryPath = getLibraryPath();
    const localPath = getLocalPath(libraryPath);
    const importedPath = getImportedPath(libraryPath);
    const packagesPath = getPackagesPath(libraryPath);

    let allEntries: BriefEntry[] = [];
    let useSemanticSearch = false;
    let semanticMatches: SemanticMatch[] = [];

    // Try semantic search if query is provided
    if (query) {
      try {
        const index = await loadIndex();

        // Only use semantic search if index has entries and isn't stale
        if (index.entries.length > 0 && !isIndexStale(index)) {
          semanticMatches = await semanticSearch(index, query, limit);
          useSemanticSearch = semanticMatches.length > 0;
        }
      } catch {
        // Semantic search unavailable, fall back to keyword search
        useSemanticSearch = false;
      }
    }

    if (useSemanticSearch && semanticMatches.length > 0) {
      // Load only the entries that matched semantically
      const matchedPaths = new Set(semanticMatches.map(m => m.path));

      for (const match of semanticMatches) {
        const fullPath = path.join(libraryPath, match.path);
        const entry = await readEntry(fullPath, libraryPath);
        if (entry) {
          allEntries.push(entry);
        }
      }

      // Sort by semantic similarity (order preserved from semanticSearch)
      // Re-order allEntries to match semanticMatches order
      const pathToEntry = new Map(allEntries.map(e => [e.path, e]));
      allEntries = semanticMatches
        .map(m => pathToEntry.get(m.path))
        .filter((e): e is BriefEntry => e !== undefined);

      const total = allEntries.length;
      const entries = allEntries.slice(0, limit);

      // Optionally fetch cloud content and library results
      let cloudResult: { entries: CloudEntry[]; total: number } | undefined;
      let libraryResult: { books: MarketplaceBook[]; total: number } | undefined;

      if (include_library && query) {
        // Fetch cloud content from owned books (in parallel with library)
        const [cloudData, libraryData] = await Promise.all([
          fetchCloudContent(query, limit),
          fetchMarketplaceResults(query, 5),
        ]);
        cloudResult = cloudData;
        libraryResult = libraryData;

        // Filter library to exclude books user already owns
        // (we got cloud results from them, so they own them)
        if (cloudResult.entries.length > 0) {
          const ownedSlugs = new Set(cloudResult.entries.map(e => e.book_slug));
          libraryResult.books = libraryResult.books.filter(b => !ownedSlugs.has(b.slug));
          libraryResult.total = libraryResult.books.length;
        }
      }

      // Convert cloud entries to BriefEntry format and merge
      let finalEntries = [...entries];
      if (cloudResult && cloudResult.entries.length > 0) {
        const cloudBriefEntries: BriefEntry[] = cloudResult.entries.map(ce => ({
          title: ce.title,
          intent: ce.intent,
          context: ce.context,
          preview: ce.insight.length > 100 ? ce.insight.slice(0, 100) + '...' : ce.insight,
          path: `cloud:${ce.book_slug}`,  // Virtual path for cloud entries
          created: new Date().toISOString(),
          hits: 0,
          last_hit: null,
          source: 'cloud' as const,
          book_name: ce.book_name,
          book_slug: ce.book_slug,
        }));
        // Interleave cloud entries with local: put cloud first (paid content priority)
        // then fill remaining slots with local entries
        const cloudCount = Math.min(cloudBriefEntries.length, Math.ceil(limit / 2));
        const localCount = limit - cloudCount;
        finalEntries = [
          ...cloudBriefEntries.slice(0, cloudCount),
          ...entries.slice(0, localCount),
        ];
      }

      let message = `Found ${total} local ${total === 1 ? 'entry' : 'entries'} for "${query}" (semantic search).`;
      if (cloudResult && cloudResult.entries.length > 0) {
        message += ` Also found ${cloudResult.total} matching entries from owned books.`;
      }
      if (libraryResult && libraryResult.books.length > 0) {
        message += ` ${libraryResult.total} book(s) available on library.`;
      }

      return {
        entries: finalEntries,
        total: finalEntries.length,
        message,
        libraryPath: localPath,
        library: libraryResult,
      };
    }

    // Fall back to keyword search
    // Read local entries
    try {
      const localFiles = await glob(path.join(localPath, '**/*.md'), { nodir: true });
      for (const filePath of localFiles) {
        const entry = await readEntry(filePath, libraryPath);
        if (entry) {
          allEntries.push(entry);
        }
      }
    } catch {
      // No local files yet
    }

    // Read imported entries (legacy - deprecated)
    try {
      const importedFiles = await glob(path.join(importedPath, '**/*.md'), { nodir: true });
      for (const filePath of importedFiles) {
        const entry = await readEntry(filePath, libraryPath);
        if (entry) {
          allEntries.push(entry);
        }
      }
    } catch {
      // No imported files
    }

    // Read packages entries (library content)
    try {
      const packagesFiles = await glob(path.join(packagesPath, '**/*.md'), { nodir: true });
      for (const filePath of packagesFiles) {
        const entry = await readEntry(filePath, libraryPath);
        if (entry) {
          allEntries.push(entry);
        }
      }
    } catch {
      // No packages files
    }

    // If no entries at all
    if (allEntries.length === 0) {
      return {
        entries: [],
        total: 0,
        message: 'No entries yet. Start recording!',
        libraryPath: localPath,
      };
    }

    // Filter by query if provided
    if (query) {
      const searchTerm = query.toLowerCase();
      allEntries = allEntries.filter(entry => matchesSearch(entry, searchTerm));
    }

    // Sort by blended score: 60% recency + 40% hits
    // Entries that helped before bubble up, but new entries still surface
    allEntries = rankEntries(allEntries);

    const total = allEntries.length;

    // Apply limit
    const entries = allEntries.slice(0, limit);

    // Optionally fetch cloud content and library results
    let cloudResult: { entries: CloudEntry[]; total: number } | undefined;
    let libraryResult: { books: MarketplaceBook[]; total: number } | undefined;

    if (include_library && query) {
      // Fetch cloud content from owned books (in parallel with library)
      const [cloudData, libraryData] = await Promise.all([
        fetchCloudContent(query, limit),
        fetchMarketplaceResults(query, 5),
      ]);
      cloudResult = cloudData;
      libraryResult = libraryData;

      // Filter library to exclude books user already owns
      if (cloudResult.entries.length > 0) {
        const ownedSlugs = new Set(cloudResult.entries.map(e => e.book_slug));
        libraryResult.books = libraryResult.books.filter(b => !ownedSlugs.has(b.slug));
        libraryResult.total = libraryResult.books.length;
      }
    }

    // Convert cloud entries to BriefEntry format and merge
    let finalEntries = [...entries];
    if (cloudResult && cloudResult.entries.length > 0) {
      const cloudBriefEntries: BriefEntry[] = cloudResult.entries.map(ce => ({
        title: ce.title,
        intent: ce.intent,
        context: ce.context,
        preview: ce.insight.length > 100 ? ce.insight.slice(0, 100) + '...' : ce.insight,
        path: `cloud:${ce.book_slug}`,  // Virtual path for cloud entries
        created: new Date().toISOString(),
        hits: 0,
        last_hit: null,
        source: 'cloud' as const,
        book_name: ce.book_name,
        book_slug: ce.book_slug,
      }));
      finalEntries = [...entries, ...cloudBriefEntries].slice(0, limit);
    }

    // Build message
    let message: string;
    if (query) {
      message = total === 0
        ? `No local entries found for "${query}".`
        : `Found ${total} local ${total === 1 ? 'entry' : 'entries'} for "${query}".`;
    } else {
      message = `${total} ${total === 1 ? 'entry' : 'entries'} in library.`;
    }

    if (cloudResult && cloudResult.entries.length > 0) {
      message += ` Also found ${cloudResult.total} matching entries from owned books.`;
    }
    if (libraryResult && libraryResult.books.length > 0) {
      message += ` ${libraryResult.total} book(s) available on library.`;
    }

    return {
      entries: finalEntries,
      total: finalEntries.length,
      message,
      libraryPath: localPath,
      library: libraryResult,
    };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

async function readEntry(filePath: string, libraryPath: string): Promise<BriefEntry | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data, content: body } = matter(content);

    // Extract title from H1 or filename
    let title = data.title;
    if (!title) {
      const headingMatch = body.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        title = headingMatch[1].trim();
      } else {
        title = path.basename(filePath, '.md').replace(/-/g, ' ');
      }
    }

    // Extract preview - first 100 chars of body content
    const bodyText = body.trim();
    const preview = bodyText.length > 100
      ? bodyText.slice(0, 100) + '...'
      : bodyText;

    return {
      title,
      intent: data.intent || null,
      context: data.context || null,
      preview,
      path: path.relative(libraryPath, filePath),
      created: data.created || new Date().toISOString(),
      hits: typeof data.hits === 'number' ? data.hits : 0,
      last_hit: data.last_hit || null,
    };
  } catch {
    return null;
  }
}

function matchesSearch(entry: BriefEntry, searchTerm: string): boolean {
  // Check title
  if (entry.title.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Check intent
  if (entry.intent && entry.intent.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Check context
  if (entry.context && entry.context.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Check preview (basic substring match - Claude does semantic filtering)
  if (entry.preview.toLowerCase().includes(searchTerm)) {
    return true;
  }

  return false;
}

// ============================================================================
// Smart Ranking
// ============================================================================

const RECENCY_WEIGHT = 0.6;
const HITS_WEIGHT = 0.4;
const RECENCY_DECAY_DAYS = 30; // Entries older than this get minimal recency score

function rankEntries(entries: BriefEntry[]): BriefEntry[] {
  if (entries.length === 0) return entries;

  const now = Date.now();

  // Find max hits for normalization (avoid divide by zero)
  const maxHits = Math.max(1, ...entries.map(e => e.hits));

  // Calculate scores
  const scored = entries.map(entry => {
    // Recency score: 1.0 for today, decays over RECENCY_DECAY_DAYS
    const ageMs = now - new Date(entry.created).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - (ageDays / RECENCY_DECAY_DAYS));

    // Hits score: normalized 0-1 against max hits in library
    const hitsScore = entry.hits / maxHits;

    // Blended score
    const score = (RECENCY_WEIGHT * recencyScore) + (HITS_WEIGHT * hitsScore);

    return { entry, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.map(s => s.entry);
}

// ============================================================================
// Cloud Content Query (for paid books user owns)
// ============================================================================

interface CloudEntry {
  title: string;
  insight: string;
  intent: string | null;
  context: string | null;
  book_slug: string;
  book_name: string;
  pricing_type: string;
}

async function fetchCloudContent(
  query: string,
  limit: number
): Promise<{ entries: CloudEntry[]; total: number }> {
  try {
    // Check if authenticated
    const apiKey = await loadApiKey();
    if (!apiKey) {
      return { entries: [], total: 0 };
    }

    const response = await fetch(`${TELVOK_API_URL}/api/library/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      // Don't fail if cloud query fails
      return { entries: [], total: 0 };
    }

    const data = await response.json();
    return {
      entries: data.entries || [],
      total: data.total || 0,
    };
  } catch {
    // Network error - silently return empty results
    return { entries: [], total: 0 };
  }
}

// ============================================================================
// Marketplace Search
// ============================================================================

async function fetchMarketplaceResults(
  query: string,
  limit: number
): Promise<{ books: MarketplaceBook[]; total: number }> {
  try {
    const response = await fetch(`${TELVOK_API_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      // Don't fail the whole brief() if library is down
      return { books: [], total: 0 };
    }

    const data = await response.json();

    const books: MarketplaceBook[] = (data.books || []).map((b: {
      slug: string;
      name: string;
      description: string;
      pricing: string;
      price: string;
      entries: number;
    }) => ({
      slug: b.slug,
      name: b.name,
      description: b.description,
      pricing: b.pricing,
      price: b.price,
      entries: b.entries,
    }));

    return {
      books,
      total: data.total || 0,
    };
  } catch {
    // Network error - silently return empty results
    return { books: [], total: 0 };
  }
}
