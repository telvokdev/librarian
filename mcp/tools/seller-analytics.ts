// ============================================================================
// Seller Analytics Tool
// View your seller analytics - revenue, downloads, hits, ratings
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface EntryStats {
  id: string;
  title: string;
  hits: number;
  trend: string;
}

interface SearchTermStats {
  term: string;
  count: number;
}

interface LibraryStats {
  id: string;
  name: string;
  slug: string;
  revenue: number;
  downloads: number;
  hits: number;
  rating: number | null;
  topEntries?: EntryStats[];
  searchTerms?: SearchTermStats[];
}

interface GhostModeInsights {
  totalSearches: number;
  uniqueSearchTerms: number;
  zeroResultSearches: SearchTermStats[];
}

interface RecentReview {
  id: string;
  rating: number;
  title: string | null;
  content: string | null;
  created_at: string;
  library: { name: string; slug: string };
  reviewer: { name: string | null } | null;
}

interface AnalyticsResponse {
  overview: {
    revenue: number;
    downloads: number;
    hits: number;
    avgRating: number | null;
    libraryCount: number;
  };
  timeSeries: {
    dates: string[];
    revenue: number[];
  };
  byLibrary: LibraryStats[];
  recentReviews: RecentReview[];
  insights?: GhostModeInsights;
}

interface SellerAnalyticsResult {
  success: boolean;
  message: string;
  overview?: {
    revenue: string;
    downloads: number;
    hits: number;
    avgRating: string;
    libraryCount: number;
  };
  books?: Array<{
    name: string;
    revenue: string;
    downloads: number;
    hits: number;
    rating: string;
    topEntries?: Array<{ title: string; hits: number; trend: string }>;
    searchTerms?: Array<{ term: string; count: number }>;
  }>;
  recent_reviews?: Array<{
    book: string;
    rating: string;
    title: string;
    reviewer: string;
  }>;
  insights?: {
    totalSearches: number;
    uniqueSearchTerms: number;
    gapAnalysis?: Array<{ term: string; count: number }>;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatGhostModeMessage(data: AnalyticsResponse): string {
  const lines: string[] = [];

  lines.push(`Analytics for ${data.overview.libraryCount} book${data.overview.libraryCount === 1 ? '' : 's'}`);
  lines.push('');
  lines.push(`Overview:`);
  lines.push(`  Revenue: $${data.overview.revenue.toFixed(2)}`);
  lines.push(`  Downloads: ${data.overview.downloads}`);
  lines.push(`  Hits: ${data.overview.hits}`);
  if (data.overview.avgRating) {
    lines.push(`  Avg Rating: ${data.overview.avgRating}/5`);
  }

  // Per-book breakdown with Ghost Mode data
  if (data.byLibrary.length > 0) {
    lines.push('');
    lines.push('━'.repeat(40));

    for (const book of data.byLibrary) {
      lines.push('');
      lines.push(`📚 ${book.name} - $${book.revenue.toFixed(2)} - ${book.hits} hits`);

      // Top entries
      if (book.topEntries && book.topEntries.length > 0) {
        lines.push('');
        lines.push('  Top Entries:');
        book.topEntries.slice(0, 5).forEach((entry, i) => {
          lines.push(`    ${i + 1}. ${entry.title} - ${entry.hits} hits (${entry.trend})`);
        });
      }

      // Search terms
      if (book.searchTerms && book.searchTerms.length > 0) {
        lines.push('');
        lines.push('  Users searched for:');
        book.searchTerms.slice(0, 5).forEach(term => {
          lines.push(`    • "${term.term}" (${term.count} queries)`);
        });
      }
    }
  }

  // Gap analysis
  if (data.insights?.zeroResultSearches && data.insights.zeroResultSearches.length > 0) {
    lines.push('');
    lines.push('━'.repeat(40));
    lines.push('');
    lines.push('💡 Gap Analysis (searches with no results):');
    data.insights.zeroResultSearches.slice(0, 5).forEach(z => {
      lines.push(`    • "${z.term}" (${z.count} searches)`);
    });
  }

  return lines.join('\n');
}

// ============================================================================
// Tool Definition
// ============================================================================

export const sellerAnalyticsTool = {
  name: 'seller_analytics',
  title: 'View Seller Analytics',
  description: `View seller analytics for your published books.

USE THIS TOOL WHEN:
- User asks "how are my books doing" or "show my sales"
- Checking revenue, downloads, or ratings
- User wants to see which entries are most useful (Ghost Mode data)

Shows revenue, downloads, hits, ratings, top entries, and search terms.

TRIGGER PATTERNS:
- "How are my books selling?" → seller_analytics()
- "Show my revenue" → seller_analytics()
- "What are people searching for?" → seller_analytics() (shows search terms)

Example:
- seller_analytics() - View all your analytics`,

  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },

  async handler(): Promise<SellerAnalyticsResult> {
    // Check authentication
    const apiKey = await loadApiKey();
    if (!apiKey) {
      return {
        success: false,
        message: 'Not authenticated. Run auth({ action: "login" }) to connect your Telvok account first.',
      };
    }

    try {
      const response = await fetch(`${TELVOK_API_URL}/api/seller/analytics`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      const data: AnalyticsResponse = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: (data as { error?: string }).error || `Failed to fetch analytics: HTTP ${response.status}`,
        };
      }

      // Check if user has any libraries
      if (data.overview.libraryCount === 0) {
        return {
          success: true,
          message: 'You haven\'t published any books yet. Use library_publish() to publish your first book.',
          overview: {
            revenue: '$0.00',
            downloads: 0,
            hits: 0,
            avgRating: 'N/A',
            libraryCount: 0,
          },
          books: [],
          recent_reviews: [],
        };
      }

      // Format for terminal display with Ghost Mode data
      const result: SellerAnalyticsResult = {
        success: true,
        message: formatGhostModeMessage(data),
        overview: {
          revenue: `$${data.overview.revenue.toFixed(2)}`,
          downloads: data.overview.downloads,
          hits: data.overview.hits,
          avgRating: data.overview.avgRating ? `${data.overview.avgRating}/5` : 'No ratings yet',
          libraryCount: data.overview.libraryCount,
        },
        books: data.byLibrary.map(b => ({
          name: b.name,
          revenue: `$${b.revenue.toFixed(2)}`,
          downloads: b.downloads,
          hits: b.hits,
          rating: b.rating ? `${b.rating}/5` : 'No ratings',
          topEntries: b.topEntries?.slice(0, 5).map(e => ({
            title: e.title,
            hits: e.hits,
            trend: e.trend,
          })),
          searchTerms: b.searchTerms?.slice(0, 5).map(t => ({
            term: t.term,
            count: t.count,
          })),
        })),
        recent_reviews: data.recentReviews.slice(0, 5).map(r => ({
          book: r.library.name,
          rating: `${r.rating}/5`,
          title: r.title || '(no title)',
          reviewer: r.reviewer?.name || 'Anonymous',
        })),
      };

      // Add Ghost Mode insights if available
      if (data.insights) {
        result.insights = {
          totalSearches: data.insights.totalSearches,
          uniqueSearchTerms: data.insights.uniqueSearchTerms,
          gapAnalysis: data.insights.zeroResultSearches?.slice(0, 10).map(z => ({
            term: z.term,
            count: z.count,
          })),
        };
      }

      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch analytics: ${message}`);
    }
  },
};

// ============================================================================
// Export
// ============================================================================

export default sellerAnalyticsTool;
