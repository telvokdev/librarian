import type { LibraryEntry } from './schemas.js';

// ============================================================================
// Query Utilities
// ============================================================================

/**
 * Score how well an entry matches a search term.
 */
export function scoreMatch(entry: LibraryEntry, searchTerm: string): number {
  const term = searchTerm.toLowerCase();
  let score = 0;

  // Topic matches (highest weight)
  for (const topic of entry.topics) {
    if (topic.toLowerCase() === term) {
      score += 10; // Exact match
    } else if (topic.toLowerCase().includes(term)) {
      score += 5; // Partial match
    }
  }

  // Content matches
  const contentLower = entry.content.toLowerCase();
  if (contentLower.includes(term)) {
    // Count occurrences
    const matches = contentLower.split(term).length - 1;
    score += Math.min(matches * 2, 8); // Cap at 8
  }

  return score;
}

/**
 * Detect potential conflicts between entries.
 * Returns true if entries on the same topic give contradictory advice.
 */
export function detectConflict(entries: LibraryEntry[]): boolean {
  if (entries.length < 2) return false;

  // Simple heuristic: look for negation patterns
  const negationPatterns = [
    /don't|dont|never|avoid|stop/i,
    /always|must|should/i,
  ];

  let hasNegation = false;
  let hasAffirmation = false;

  for (const entry of entries) {
    if (negationPatterns[0].test(entry.content)) {
      hasNegation = true;
    }
    if (negationPatterns[1].test(entry.content)) {
      hasAffirmation = true;
    }
  }

  // This is a very simple heuristic - could be improved with semantic analysis
  return hasNegation && hasAffirmation;
}

/**
 * Generate a conflict summary.
 */
export function generateConflictSummary(entries: LibraryEntry[]): string {
  if (entries.length < 2) return '';

  const sources = entries.map(e => {
    if (e.imported_from) {
      return `imported/${e.imported_from}`;
    }
    return e.source;
  });

  const uniqueSources = [...new Set(sources)];

  return `Found ${entries.length} entries that may conflict. Sources: ${uniqueSources.join(', ')}. Review and decide which to keep.`;
}

/**
 * Filter entries by topic.
 */
export function filterByTopic(
  entries: LibraryEntry[],
  topic: string
): LibraryEntry[] {
  const term = topic.toLowerCase();
  return entries.filter(entry =>
    entry.topics.some(t => t.toLowerCase().includes(term))
  );
}

/**
 * Sort entries by relevance to search term.
 */
export function sortByRelevance(
  entries: LibraryEntry[],
  searchTerm: string
): LibraryEntry[] {
  return [...entries].sort((a, b) => {
    const scoreA = scoreMatch(a, searchTerm);
    const scoreB = scoreMatch(b, searchTerm);
    return scoreB - scoreA;
  });
}

/**
 * Group entries by source.
 */
export function groupBySource(
  entries: LibraryEntry[]
): Record<string, LibraryEntry[]> {
  const groups: Record<string, LibraryEntry[]> = {
    local: [],
    imported: [],
    archived: [],
  };

  for (const entry of entries) {
    const key = entry.source;
    if (groups[key]) {
      groups[key].push(entry);
    } else {
      groups.local.push(entry); // Default to local
    }
  }

  return groups;
}
