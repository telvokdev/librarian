// ============================================================================
// Seller Analytics Tool
// View your seller analytics - revenue, downloads, hits, ratings
// ============================================================================

import { loadApiKey } from './auth.js';

const TELVOK_API_URL = process.env.TELVOK_API_URL || 'https://telvok.com';

// ============================================================================
// Types
// ============================================================================

interface LibraryStats {
  id: string;
  name: string;
  slug: string;
  revenue: number;
  downloads: number;
  hits: number;
  rating: number | null;
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
  }>;
  recent_reviews?: Array<{
    book: string;
    rating: string;
    title: string;
    reviewer: string;
  }>;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const sellerAnalyticsTool = {
  name: 'seller_analytics',
  description: `View your seller analytics - revenue, downloads, hits, and ratings for your published books.

Shows:
- Overview: Total revenue (after 15% platform fee), downloads, hits, average rating
- Per-book breakdown: Revenue, downloads, hits, rating for each book
- Recent reviews: Latest reviews on your books

Requires authentication. Run auth({ action: "login" }) first if not connected.

Examples:
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

      // Format for terminal display
      return {
        success: true,
        message: `Analytics for ${data.overview.libraryCount} book${data.overview.libraryCount === 1 ? '' : 's'}`,
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
        })),
        recent_reviews: data.recentReviews.slice(0, 5).map(r => ({
          book: r.library.name,
          rating: `${r.rating}/5`,
          title: r.title || '(no title)',
          reviewer: r.reviewer?.name || 'Anonymous',
        })),
      };

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
